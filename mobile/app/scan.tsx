import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { pairingToRouteParams, parsePairingPayload } from '../lib/pairing'

export default function ScanScreen() {
	const router = useRouter()
	const [permission, requestPermission] = useCameraPermissions()
	const [locked, setLocked] = useState(false)
	const [error, setError] = useState('')

	function handleBarcode(data: string) {
		if (locked) return

		const parsed = parsePairingPayload(data)

		if (!parsed) {
			setLocked(true)
			setError('This QR is not a valid FlowCam pairing code.')
			return
		}

		setLocked(true)
		setError('')

		router.replace({
			pathname: '/stream',
			params: pairingToRouteParams(parsed)
		})
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
					FlowCam needs camera access to scan the QR code shown in the desktop
					app.
				</Text>

				<Pressable
					style={styles.primaryButton}
					onPress={requestPermission}
				>
					<Text style={styles.primaryButtonText}>Grant permission</Text>
				</Pressable>

				<Pressable
					style={styles.secondaryButton}
					onPress={() => router.back()}
				>
					<Text style={styles.secondaryButtonText}>Back</Text>
				</Pressable>
			</View>
		)
	}

	return (
		<View style={styles.screen}>
			<CameraView
				style={StyleSheet.absoluteFill}
				facing='back'
				barcodeScannerSettings={{
					barcodeTypes: ['qr']
				}}
				onBarcodeScanned={
					locked
						? undefined
						: ({ data }) => {
								handleBarcode(data)
							}
				}
			/>

			<View style={styles.overlay}>
				<Text style={styles.overlayTitle}>Scan desktop QR</Text>
				<Text style={styles.overlayText}>
					Point your camera at the FlowCam Receiver pairing code.
				</Text>

				<View style={styles.frame} />

				{error ? <Text style={styles.errorText}>{error}</Text> : null}

				<View style={styles.actions}>
					{locked ? (
						<Pressable
							style={styles.primaryButton}
							onPress={() => {
								setLocked(false)
								setError('')
							}}
						>
							<Text style={styles.primaryButtonText}>Scan again</Text>
						</Pressable>
					) : null}

					<Pressable
						style={styles.secondaryButton}
						onPress={() => router.back()}
					>
						<Text style={styles.secondaryButtonText}>Cancel</Text>
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
	overlay: {
		flex: 1,
		justifyContent: 'flex-end',
		padding: 20,
		backgroundColor: 'rgba(0,0,0,0.28)'
	},
	overlayTitle: {
		color: '#fff',
		fontSize: 30,
		fontWeight: '800'
	},
	overlayText: {
		color: '#d7deec',
		marginTop: 8,
		marginBottom: 20,
		fontSize: 15,
		lineHeight: 22
	},
	frame: {
		alignSelf: 'center',
		width: 260,
		height: 260,
		borderRadius: 24,
		borderWidth: 2,
		borderColor: 'rgba(255,255,255,0.95)',
		marginBottom: 24
	},
	actions: {
		gap: 12,
		marginBottom: 12
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
		backgroundColor: 'rgba(17,24,39,0.86)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)'
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
		textAlign: 'center',
		marginBottom: 12
	}
})
