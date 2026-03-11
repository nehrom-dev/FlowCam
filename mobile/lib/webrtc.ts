import { PermissionsAndroid, Platform } from 'react-native'
import {
	mediaDevices,
	RTCIceCandidate,
	RTCPeerConnection,
	RTCSessionDescription,
	type MediaStream
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
	onLocalStream?: (stream: MediaStream) => void
	onState?: (state: PublisherState) => void
	onError?: (message: string) => void
}

export type PhonePublisherSession = {
	localStream: MediaStream
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
		throw new Error('Camera permission denied on Android.')
	}
}

export async function startPhonePublisher(
	options: StartPhonePublisherOptions
): Promise<PhonePublisherSession> {
	const { pairing, onLocalStream, onState, onError } = options

	onState?.('connecting')

	await ensureAndroidCameraPermission()

	let localStream: MediaStream

	try {
		localStream = await mediaDevices.getUserMedia({
			audio: false,
			video: true
		})

		console.log('[FlowCam] getUserMedia success')
		console.log('[FlowCam] video tracks:', localStream.getVideoTracks().length)

		onLocalStream?.(localStream)
	} catch (error) {
		console.error('[FlowCam] getUserMedia failed:', error)
		onState?.('error')
		onError?.(
			`getUserMedia failed: ${error instanceof Error ? error.message : String(error)}`
		)
		throw error
	}

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

	socket.onopen = () => {
		;(async () => {
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
				console.error('[FlowCam] socket/onopen failed:', error)
				onState?.('error')
				onError?.(error instanceof Error ? error.message : String(error))
			}
		})()
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

					case 'peer-left': {
						if (message.role === 'desktop') {
							onState?.('disconnected')
						}
						return
					}

					case 'reset': {
						onState?.('disconnected')
						return
					}

					default:
						return
				}
			} catch (error) {
				console.error('[FlowCam] socket/onmessage failed:', error)
				onState?.('error')
				onError?.(error instanceof Error ? error.message : String(error))
			}
		})()
	}

	socket.onerror = error => {
		console.error('[FlowCam] websocket error:', error)
		onState?.('error')
		onError?.('WebSocket signaling failed.')
	}

	socket.onclose = () => {
		if (!stopped) {
			onState?.('disconnected')
		}
	}

	return {
		localStream,
		stop
	}
}
