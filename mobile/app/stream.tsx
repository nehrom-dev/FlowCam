import { useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { RTCView, type MediaStream } from 'react-native-webrtc'
import { parsePairingPayload, type PairingPayload } from '../lib/pairing'
import {
	startPhonePublisher,
	type PhonePublisherSession,
	type PublisherState
} from '../lib/webrtc'

type CameraFacing = 'front' | 'back'

function buildPairingFromParams(
	host?: string,
	port?: string,
	session?: string
): PairingPayload | null {
	if (!host || !port || !session) return null

	return parsePairingPayload(
		`flowcam://pair?host=${encodeURIComponent(host)}&port=${encodeURIComponent(
			port
		)}&session=${encodeURIComponent(session)}`
	)
}

export default function StreamScreen() {
	const router = useRouter()
	const params = useLocalSearchParams<{
		host?: string
		port?: string
		session?: string
	}>()

	const pairing = useMemo(
		() => buildPairingFromParams(params.host, params.port, params.session),
		[params.host, params.port, params.session]
	)

	const [permission, requestPermission] = useCameraPermissions()
	const [localStream, setLocalStream] = useState<MediaStream | null>(null)
	const [status, setStatus] = useState<PublisherState>('connecting')
	const [error, setError] = useState('')
	const [cameraFacing, setCameraFacing] = useState<CameraFacing>('back')
	const [restartKey, setRestartKey] = useState(0)

	const sessionRef = useRef<PhonePublisherSession | null>(null)

	useEffect(() => {
		if (!permission?.granted) return
		if (!pairing) {
			setStatus('error')
			setError('Missing or invalid pairing data.')
			return
		}

		let cancelled = false

		;(async () => {
			try {
				setError('')
				setLocalStream(null)
				setStatus('connecting')

				const nextSession = await startPhonePublisher({
					pairing,
					facingMode: cameraFacing === 'front' ? 'user' : 'environment',
					onLocalStream: stream => {
						if (!cancelled) {
							console.log('[FlowCam] local stream received')
							setLocalStream(stream)
						}
					},
					onState: nextState => {
						if (!cancelled) {
							console.log('[FlowCam] state ->', nextState)
							setStatus(nextState)
						}
					},
					onError: message => {
						if (!cancelled) {
							console.log('[FlowCam] error ->', message)
							setError(message)
							setStatus('error')
						}
					}
				})

				if (cancelled) {
					nextSession.stop()
					return
				}

				sessionRef.current = nextSession
			} catch (err) {
				if (!cancelled) {
					setStatus('error')
					setError(err instanceof Error ? err.message : String(err))
				}
			}
		})()

		return () => {
			cancelled = true
			sessionRef.current?.stop()
			sessionRef.current = null
			setLocalStream(null)
		}
	}, [permission?.granted, pairing, cameraFacing, restartKey])

	function handleReconnect() {
		sessionRef.current?.stop()
		sessionRef.current = null
		setRestartKey(value => value + 1)
	}

	function handleFlipCamera() {
		setCameraFacing(current => (current === 'back' ? 'front' : 'back'))
	}

	function handleStop() {
		sessionRef.current?.stop()
		sessionRef.current = null
		router.replace('/')
	}

	if (!permission) {
		return (
			<View style={styles.centered}>
				<Text style={styles.infoText}>Checking camera permissions…</Text>
			</View>
		)
	}

	if (!permission.granted) {
		return (
			<View style={styles.centered}>
				<Text style={styles.infoTitle}>Camera permission required</Text>
				<Text style={styles.infoText}>
					FlowCam needs camera access to capture video and send it to your
					desktop app.
				</Text>

				<Pressable
					style={styles.primaryButton}
					onPress={requestPermission}
				>
					<Text style={styles.primaryButtonText}>Grant permission</Text>
				</Pressable>

				<Pressable
					style={styles.secondaryButton}
					onPress={() => router.replace('/')}
				>
					<Text style={styles.secondaryButtonText}>Back</Text>
				</Pressable>
			</View>
		)
	}

	return (
		<View style={styles.screen}>
			<View style={styles.previewWrap}>
				{localStream ? (
					<RTCView
						streamURL={localStream.toURL()}
						style={StyleSheet.absoluteFill}
						objectFit='cover'
						mirror={cameraFacing === 'front'}
					/>
				) : (
					<View style={styles.previewFallback}>
						<Text style={styles.previewTitle}>Starting camera…</Text>
						<Text style={styles.previewSubtitle}>Current state: {status}</Text>
						{error ? <Text style={styles.errorText}>{error}</Text> : null}
					</View>
				)}
			</View>

			<View style={styles.topOverlay}>
				<Text style={styles.brand}>FlowCam</Text>
				<View style={styles.statusPill}>
					<Text style={styles.statusText}>{status}</Text>
				</View>
			</View>

			<View style={styles.bottomSheet}>
				<Text style={styles.sheetTitle}>Streaming to desktop</Text>
				<Text style={styles.metaText}>
					{pairing ? `${pairing.host}:${pairing.port}` : 'No pairing endpoint'}
				</Text>

				{error ? <Text style={styles.errorText}>{error}</Text> : null}

				<View style={styles.actions}>
					<Pressable
						style={styles.primaryButton}
						onPress={handleReconnect}
					>
						<Text style={styles.primaryButtonText}>Reconnect</Text>
					</Pressable>

					<Pressable
						style={styles.secondaryButton}
						onPress={handleFlipCamera}
					>
						<Text style={styles.secondaryButtonText}>Flip camera</Text>
					</Pressable>

					<Pressable
						style={styles.secondaryButton}
						onPress={handleStop}
					>
						<Text style={styles.secondaryButtonText}>Stop</Text>
					</Pressable>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: '#000'
	},
	previewWrap: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: '#05070c'
	},
	previewFallback: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24
	},
	previewTitle: {
		color: '#fff',
		fontSize: 26,
		fontWeight: '800',
		marginBottom: 8
	},
	previewSubtitle: {
		color: '#c7d0df',
		fontSize: 15,
		lineHeight: 22,
		textAlign: 'center',
		maxWidth: 320
	},
	topOverlay: {
		position: 'absolute',
		top: 22,
		left: 18,
		right: 18,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between'
	},
	brand: {
		color: '#fff',
		fontSize: 22,
		fontWeight: '900'
	},
	statusPill: {
		height: 34,
		paddingHorizontal: 14,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(17,24,39,0.78)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)'
	},
	statusText: {
		color: '#edf2ff',
		textTransform: 'capitalize',
		fontWeight: '700'
	},
	bottomSheet: {
		position: 'absolute',
		left: 16,
		right: 16,
		bottom: 16,
		borderRadius: 24,
		padding: 18,
		backgroundColor: 'rgba(11,15,22,0.82)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	sheetTitle: {
		color: '#fff',
		fontSize: 20,
		fontWeight: '800'
	},
	metaText: {
		color: '#b4bfd2',
		marginTop: 8,
		fontSize: 14
	},
	actions: {
		gap: 10,
		marginTop: 16
	},
	primaryButton: {
		height: 48,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#6d7cff'
	},
	primaryButtonText: {
		color: '#fff',
		fontWeight: '800',
		fontSize: 15
	},
	secondaryButton: {
		height: 48,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(31,41,55,0.88)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	secondaryButtonText: {
		color: '#fff',
		fontWeight: '700',
		fontSize: 15
	},
	centered: {
		flex: 1,
		backgroundColor: '#0e1117',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24
	},
	infoTitle: {
		color: '#fff',
		fontSize: 26,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 10
	},
	infoText: {
		color: '#c7d0df',
		fontSize: 15,
		lineHeight: 22,
		textAlign: 'center',
		marginBottom: 18
	},
	errorText: {
		color: '#fecaca',
		marginTop: 10,
		textAlign: 'center'
	}
})
