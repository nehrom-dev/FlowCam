import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View
} from 'react-native'
import { pairingToRouteParams, parsePairingPayload } from '../lib/pairing'

export default function HomeScreen() {
	const router = useRouter()
	const [pairingCode, setPairingCode] = useState('')
	const [error, setError] = useState('')

	function connectFromCode() {
		const parsed = parsePairingPayload(pairingCode)

		if (!parsed) {
			setError('Invalid FlowCam pairing code.')
			return
		}

		setError('')
		router.push({
			pathname: '/stream',
			params: pairingToRouteParams(parsed)
		})
	}

	return (
		<KeyboardAvoidingView
			style={styles.screen}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.heroCard}>
					<Text style={styles.eyebrow}>FlowCam</Text>
					<Text style={styles.title}>Turn your phone into a PC camera</Text>
					<Text style={styles.subtitle}>
						Scan the QR from the desktop app or paste the pairing string
						manually.
					</Text>
				</View>

				<View style={styles.card}>
					<Text style={styles.label}>Pairing code</Text>

					<TextInput
						value={pairingCode}
						onChangeText={text => {
							setPairingCode(text)
							if (error) setError('')
						}}
						autoCapitalize='none'
						autoCorrect={false}
						placeholder='flowcam://pair?host=192.168.1.10&port=31337&session=...'
						placeholderTextColor='#6b7280'
						multiline
						style={styles.input}
					/>

					{error ? <Text style={styles.errorText}>{error}</Text> : null}

					<View style={styles.buttonColumn}>
						<Pressable
							style={styles.primaryButton}
							onPress={connectFromCode}
						>
							<Text style={styles.primaryButtonText}>Connect from code</Text>
						</Pressable>

						<Pressable
							style={styles.secondaryButton}
							onPress={() => router.push('/scan')}
						>
							<Text style={styles.secondaryButtonText}>Scan QR code</Text>
						</Pressable>
					</View>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: '#0e1117'
	},
	content: {
		flexGrow: 1,
		padding: 20,
		justifyContent: 'center',
		gap: 20
	},
	heroCard: {
		backgroundColor: '#151a24',
		borderRadius: 24,
		padding: 22,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	eyebrow: {
		color: '#8ea2ff',
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 1.6,
		textTransform: 'uppercase',
		marginBottom: 10
	},
	title: {
		color: '#f8fafc',
		fontSize: 30,
		fontWeight: '800',
		lineHeight: 36
	},
	subtitle: {
		color: '#aeb8ca',
		fontSize: 15,
		lineHeight: 22,
		marginTop: 12
	},
	card: {
		backgroundColor: '#151a24',
		borderRadius: 24,
		padding: 20,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	label: {
		color: '#f8fafc',
		fontSize: 15,
		fontWeight: '700',
		marginBottom: 10
	},
	input: {
		minHeight: 110,
		borderRadius: 18,
		backgroundColor: '#0b0f16',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		color: '#f8fafc',
		padding: 14,
		textAlignVertical: 'top'
	},
	buttonColumn: {
		gap: 12,
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
		backgroundColor: '#202735',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)'
	},
	secondaryButtonText: {
		color: '#edf2ff',
		fontWeight: '700',
		fontSize: 15
	},
	errorText: {
		color: '#fda4af',
		marginTop: 10,
		fontSize: 13
	}
})
