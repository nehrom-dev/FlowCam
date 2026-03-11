import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PairingCard } from './components/PairingCard'
import { StatusBadge } from './components/StatusBadge'
import { VideoPanel } from './components/VideoPanel'
import { safeParseSignalMessage, type SignalMessage } from './lib/protocol'

type PairingInfo = {
	sessionId: string
	localIp: string
	port: number
	qrPayload: string
}

type UiStatus = 'idle' | 'waiting-phone' | 'negotiating' | 'streaming' | 'error'

const LOCAL_SIGNALING_URL = 'ws://127.0.0.1:31337'

export default function App() {
	const [pairing, setPairing] = useState<PairingInfo | null>(null)
	const [status, setStatus] = useState<UiStatus>('idle')
	const [lastError, setLastError] = useState('')
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

	const wsRef = useRef<WebSocket | null>(null)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const inboundStreamRef = useRef<MediaStream | null>(null)

	const loadPairing = useCallback(async () => {
		setLastError('')
		setRemoteStream(null)
		setStatus('idle')
		inboundStreamRef.current = null

		pcRef.current?.close()
		pcRef.current = null
		wsRef.current?.close()

		const next = await invoke<PairingInfo>('reset_session')
		setPairing(next)
	}, [])

	const ensurePeerConnection = useCallback(
		(sessionId: string, socket: WebSocket) => {
			if (pcRef.current) {
				return pcRef.current
			}

			const pc = new RTCPeerConnection({
				iceServers: [],
				bundlePolicy: 'balanced',
				rtcpMuxPolicy: 'require'
			})

			pc.onicecandidate = event => {
				if (!event.candidate) return

				socket.send(
					JSON.stringify({
						type: 'ice-candidate',
						sessionId,
						candidate: event.candidate.toJSON()
					})
				)
			}

			pc.onconnectionstatechange = () => {
				const state = pc.connectionState

				if (state === 'connected') {
					setStatus('streaming')
				}

				if (
					state === 'failed' ||
					state === 'disconnected' ||
					state === 'closed'
				) {
					setStatus('waiting-phone')
				}
			}

			pc.ontrack = event => {
				if (event.streams && event.streams[0]) {
					setRemoteStream(event.streams[0])
					setStatus('streaming')
					return
				}

				if (!inboundStreamRef.current) {
					inboundStreamRef.current = new MediaStream()
				}

				inboundStreamRef.current.addTrack(event.track)
				setRemoteStream(inboundStreamRef.current)
				setStatus('streaming')
			}

			pcRef.current = pc
			return pc
		},
		[]
	)

	const handleSignal = useCallback(
		async (message: SignalMessage, socket: WebSocket, sessionId: string) => {
			switch (message.type) {
				case 'peer-joined': {
					if (message.role === 'phone') {
						setStatus('negotiating')
					}
					return
				}

				case 'peer-left': {
					if (message.role === 'phone') {
						setRemoteStream(null)
						inboundStreamRef.current = null
						setStatus('waiting-phone')
						pcRef.current?.close()
						pcRef.current = null
					}
					return
				}

				case 'offer': {
					const pc = ensurePeerConnection(sessionId, socket)

					await pc.setRemoteDescription(
						new RTCSessionDescription({
							type: message.sdp.type,
							sdp: message.sdp.sdp
						})
					)

					const answer = await pc.createAnswer()
					await pc.setLocalDescription(answer)

					socket.send(
						JSON.stringify({
							type: 'answer',
							sessionId,
							sdp: {
								type: answer.type,
								sdp: answer.sdp ?? ''
							}
						})
					)

					setStatus('negotiating')
					return
				}

				case 'ice-candidate': {
					const pc = pcRef.current
					if (!pc) return

					await pc.addIceCandidate(new RTCIceCandidate(message.candidate))
					return
				}

				case 'reset': {
					pcRef.current?.close()
					pcRef.current = null
					inboundStreamRef.current = null
					setRemoteStream(null)
					setStatus('waiting-phone')
					return
				}

				case 'answer':
				case 'hello':
				default:
					return
			}
		},
		[ensurePeerConnection]
	)

	useEffect(() => {
		invoke<PairingInfo>('get_pairing_info')
			.then(info => {
				setPairing(info)
				setStatus('waiting-phone')
			})
			.catch(error => {
				console.error(error)
				setStatus('error')
				setLastError(String(error))
			})

		return () => {
			wsRef.current?.close()
			pcRef.current?.close()
			pcRef.current = null
			inboundStreamRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!pairing) return

		const socket = new WebSocket(LOCAL_SIGNALING_URL)
		wsRef.current = socket

		socket.onopen = () => {
			socket.send(
				JSON.stringify({
					type: 'hello',
					role: 'desktop',
					sessionId: pairing.sessionId
				})
			)
			setStatus('waiting-phone')
		}

		socket.onmessage = event => {
			const message = safeParseSignalMessage(String(event.data))
			if (!message) return

			handleSignal(message, socket, pairing.sessionId).catch(error => {
				console.error(error)
				setStatus('error')
				setLastError(error instanceof Error ? error.message : String(error))
			})
		}

		socket.onerror = () => {
			setStatus('error')
			setLastError('Failed to connect to local signaling server.')
		}

		socket.onclose = () => {
			setStatus(current => (current === 'error' ? current : 'idle'))
		}

		return () => {
			socket.close()
		}
	}, [handleSignal, pairing])

	const statusTone = useMemo(() => {
		switch (status) {
			case 'streaming':
				return 'success' as const
			case 'error':
				return 'warning' as const
			default:
				return 'neutral' as const
		}
	}, [status])

	return (
		<main className='app-shell'>
			<section className='hero card'>
				<div>
					<div className='eyebrow'>FlowCam Receiver</div>
					<h1>Desktop companion for phone → PC camera streaming</h1>
					<p className='hero-copy'>
						This app starts a local signaling server, shows a pairing QR and
						receives the remote WebRTC video track from the Android app.
					</p>
				</div>

				<div className='hero-actions'>
					<StatusBadge
						status={status.replace('-', ' ')}
						tone={statusTone}
					/>
					<button
						className='primary-button'
						onClick={loadPairing}
					>
						New pairing session
					</button>
				</div>
			</section>

			<section className='content-grid'>
				<div className='left-column'>
					{pairing ? (
						<PairingCard
							sessionId={pairing.sessionId}
							qrPayload={pairing.qrPayload}
							host={pairing.localIp}
							port={pairing.port}
						/>
					) : (
						<section className='card pairing-card'>
							<h2>Loading pairing data…</h2>
						</section>
					)}

					<section className='card diagnostics-card'>
						<h2>Diagnostics</h2>

						<div className='diag-row'>
							<span>Local signaling</span>
							<span className='mono'>{LOCAL_SIGNALING_URL}</span>
						</div>

						<div className='diag-row'>
							<span>Phone endpoint</span>
							<span className='mono'>
								{pairing ? `ws://${pairing.localIp}:${pairing.port}` : '—'}
							</span>
						</div>

						{lastError ? <div className='error-box'>{lastError}</div> : null}
					</section>
				</div>

				<section className='right-column'>
					<VideoPanel stream={remoteStream} />
				</section>
			</section>
		</main>
	)
}
