import { useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { parsePairingPayload, type PairingPayload } from '../lib/pairing'
import {
	startPhonePublisher,
	type PhonePublisherSession,
	type PublisherState
} from '../lib/webrtc'

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
	const [status, setStatus] = useState<PublisherState>('connecting')
	const [error, setError] = useState('')
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
				setStatus('connecting')

				const nextSession = await startPhonePublisher({
					pairing,
					facingMode: 'environment',
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
		}
	}, [permission?.granted, pairing, restartKey])

	function handleReconnect() {
		sessionRef.current?.stop()
		sessionRef.current = null
		setRestartKey(value => value + 1)
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
			</View>
		)
	}

	return (
		<View style={styles.screen}>
			<View style={styles.centered}>
				<Text style={styles.infoTitle}>FlowCam</Text>
				<Text style={styles.infoText}>Status: {status}</Text>
				<Text style={styles.infoText}>Camera: main</Text>
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
	screen: { flex: 1, backgroundColor: '#0e1117' },
	centered: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24
	},
	infoTitle: {
		color: '#fff',
		fontSize: 28,
		fontWeight: '800',
		marginBottom: 10
	},
	infoText: {
		color: '#c7d0df',
		fontSize: 16,
		textAlign: 'center',
		marginBottom: 12
	},
	errorText: { color: '#fecaca', textAlign: 'center', marginBottom: 12 },
	actions: { gap: 10, width: '100%', maxWidth: 320, marginTop: 12 },
	primaryButton: {
		height: 48,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#6d7cff'
	},
	primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
	secondaryButton: {
		height: 48,
		borderRadius: 999,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(31,41,55,0.88)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	secondaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 }
})
