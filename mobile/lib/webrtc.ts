import { PermissionsAndroid, Platform } from 'react-native'
import {
	mediaDevices,
	RTCIceCandidate,
	RTCPeerConnection,
	RTCSessionDescription
} from 'react-native-webrtc'
import { buildSocketUrl, type PairingPayload } from './pairing'
import { safeParseSignalMessage } from './protocol'

export type PublisherState =
	| 'connecting'
	| 'socket-open'
	| 'negotiating'
	| 'streaming'
	| 'disconnected'
	| 'error'

type FacingMode = 'user' | 'environment'

type StartPhonePublisherOptions = {
	pairing: PairingPayload
	facingMode: FacingMode
	onState?: (state: PublisherState) => void
	onError?: (message: string) => void
}

export type PhonePublisherSession = {
	stop: () => void
}

type RtcIceEvent = {
	candidate: {
		toJSON: () => {
			candidate: string
			sdpMid?: string | null
			sdpMLineIndex?: number | null
			usernameFragment?: string | null
		}
	} | null
}

type PeerConnectionWithEvents = RTCPeerConnection & {
	addEventListener: (type: string, listener: (event: any) => void) => void
}

type MediaDeviceLike = {
	deviceId: string
	kind: string
	label?: string
	facing?: string
}

async function ensureAndroidCameraPermission() {
	if (Platform.OS !== 'android') return

	const granted = await PermissionsAndroid.request(
		PermissionsAndroid.PERMISSIONS.CAMERA,
		{
			title: 'FlowCam camera permission',
			message: 'FlowCam needs camera access to stream video to your PC.',
			buttonPositive: 'Allow',
			buttonNegative: 'Deny'
		}
	)

	if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
		throw new Error(`Camera permission denied on Android: ${granted}`)
	}
}

function scoreVideoDevice(
	device: MediaDeviceLike,
	facingMode: FacingMode
): number {
	const label = (device.label ?? '').toLowerCase()
	const facing = (device.facing ?? '').toLowerCase()

	let score = 0

	if (device.kind !== 'videoinput') return -1

	if (facingMode === 'environment') {
		if (
			label.includes('back') ||
			label.includes('rear') ||
			label.includes('environment') ||
			facing.includes('environment') ||
			facing.includes('back')
		) {
			score += 100
		}

		if (
			label.includes('front') ||
			label.includes('user') ||
			facing.includes('user') ||
			facing.includes('front')
		) {
			score -= 50
		}
	} else {
		if (
			label.includes('front') ||
			label.includes('user') ||
			facing.includes('user') ||
			facing.includes('front')
		) {
			score += 100
		}

		if (
			label.includes('back') ||
			label.includes('rear') ||
			label.includes('environment') ||
			facing.includes('environment') ||
			facing.includes('back')
		) {
			score -= 50
		}
	}

	return score
}

async function pickVideoDeviceId(
	facingMode: FacingMode
): Promise<string | undefined> {
	try {
		const rawDevices =
			(await mediaDevices.enumerateDevices()) as MediaDeviceLike[]

		const videoDevices = rawDevices.filter(
			device => device.kind === 'videoinput'
		)

		console.log('[FlowCam] enumerateDevices count:', rawDevices.length)
		console.log(
			'[FlowCam] video devices:',
			videoDevices.map(device => ({
				deviceId: device.deviceId,
				label: device.label,
				facing: device.facing
			}))
		)

		if (videoDevices.length === 0) {
			return undefined
		}

		const ranked = [...videoDevices]
			.map(device => ({
				device,
				score: scoreVideoDevice(device, facingMode)
			}))
			.sort((a, b) => b.score - a.score)

		const selected = ranked[0]?.device

		console.log('[FlowCam] selected video device:', selected)

		return selected?.deviceId
	} catch (error) {
		console.log('[FlowCam] enumerateDevices failed:', error)
		return undefined
	}
}

export async function startPhonePublisher(
	options: StartPhonePublisherOptions
): Promise<PhonePublisherSession> {
	const { pairing, facingMode, onState, onError } = options

	onState?.('connecting')
	await ensureAndroidCameraPermission()

	const selectedDeviceId = await pickVideoDeviceId(facingMode)

	const localStream = await mediaDevices.getUserMedia({
		audio: false,
		video: selectedDeviceId
			? {
					deviceId: selectedDeviceId,
					frameRate: 30,
					width: 1280,
					height: 720
				}
			: {
					frameRate: 30,
					facingMode,
					width: 1280,
					height: 720
				}
	})

	console.log('[FlowCam] getUserMedia success')
	console.log('[FlowCam] video tracks:', localStream.getVideoTracks().length)
	console.log('[FlowCam] using facingMode:', facingMode)
	console.log(
		'[FlowCam] using deviceId:',
		selectedDeviceId ?? 'fallback-facingMode'
	)

	const peer = new RTCPeerConnection({
		iceServers: [],
		bundlePolicy: 'balanced'
	}) as PeerConnectionWithEvents

	localStream.getTracks().forEach(track => {
		peer.addTrack(track, localStream)
	})

	const pendingCandidates: {
		candidate: string
		sdpMid?: string | null
		sdpMLineIndex?: number | null
		usernameFragment?: string | null
	}[] = []

	const socket = new WebSocket(buildSocketUrl(pairing))
	let stopped = false

	async function flushPendingCandidates() {
		if (!peer.remoteDescription) return

		while (pendingCandidates.length > 0) {
			const candidate = pendingCandidates.shift()
			if (!candidate) continue
			await peer.addIceCandidate(new RTCIceCandidate(candidate))
		}
	}

	function stop() {
		if (stopped) return
		stopped = true

		try {
			socket.close()
		} catch {}

		try {
			peer.close()
		} catch {}

		localStream.getTracks().forEach(track => {
			try {
				track.stop()
			} catch {}
		})
	}

	peer.addEventListener('icecandidate', (event: RtcIceEvent) => {
		if (!event.candidate) return
		if (socket.readyState !== WebSocket.OPEN) return

		socket.send(
			JSON.stringify({
				type: 'ice-candidate',
				sessionId: pairing.sessionId,
				candidate: event.candidate.toJSON()
			})
		)
	})

	peer.addEventListener('connectionstatechange', () => {
		const state = peer.connectionState
		console.log('[FlowCam] peer connection state:', state)

		if (state === 'connected') {
			onState?.('streaming')
			return
		}

		if (state === 'failed' || state === 'disconnected' || state === 'closed') {
			onState?.('disconnected')
		}
	})

	socket.onopen = async () => {
		try {
			if (stopped) return

			console.log('[FlowCam] signaling socket open')

			socket.send(
				JSON.stringify({
					type: 'hello',
					role: 'phone',
					sessionId: pairing.sessionId
				})
			)

			onState?.('socket-open')

			const offer = await peer.createOffer()
			await peer.setLocalDescription(offer)

			socket.send(
				JSON.stringify({
					type: 'offer',
					sessionId: pairing.sessionId,
					sdp: {
						type: offer.type,
						sdp: offer.sdp ?? ''
					}
				})
			)

			onState?.('negotiating')
		} catch (error) {
			onState?.('error')
			onError?.(error instanceof Error ? error.message : String(error))
		}
	}

	socket.onmessage = event => {
		;(async () => {
			try {
				const message = safeParseSignalMessage(String(event.data))
				if (!message) return
				if (message.sessionId !== pairing.sessionId) return

				switch (message.type) {
					case 'answer': {
						await peer.setRemoteDescription(
							new RTCSessionDescription({
								type: message.sdp.type,
								sdp: message.sdp.sdp
							})
						)
						await flushPendingCandidates()
						return
					}

					case 'ice-candidate': {
						if (!peer.remoteDescription) {
							pendingCandidates.push(message.candidate)
							return
						}

						await peer.addIceCandidate(new RTCIceCandidate(message.candidate))
						return
					}

					case 'peer-left':
					case 'reset': {
						onState?.('disconnected')
						return
					}

					default:
						return
				}
			} catch (error) {
				onState?.('error')
				onError?.(error instanceof Error ? error.message : String(error))
			}
		})()
	}

	socket.onerror = () => {
		if (!stopped) {
			onError?.('WebSocket signaling failed.')
		}
	}

	socket.onclose = () => {
		if (!stopped) {
			onState?.('disconnected')
		}
	}

	return {
		stop
	}
}
