export type PairingPayload = {
	host: string
	port: number
	sessionId: string
	raw: string
}

const FLOWCAM_PREFIX = 'flowcam://pair?'

export function parsePairingPayload(rawInput: string): PairingPayload | null {
	const raw = rawInput.trim()

	if (!raw) return null
	if (!raw.startsWith(FLOWCAM_PREFIX)) return null

	const query = raw.slice(FLOWCAM_PREFIX.length)
	const params = new URLSearchParams(query)

	const host = params.get('host')?.trim() || ''
	const portValue = params.get('port')?.trim() || ''
	const sessionId = params.get('session')?.trim() || ''

	const port = Number(portValue)

	if (!host || !sessionId) return null
	if (!Number.isInteger(port) || port < 1 || port > 65535) return null

	return {
		host,
		port,
		sessionId,
		raw
	}
}

export function pairingToRouteParams(pairing: PairingPayload) {
	return {
		host: pairing.host,
		port: String(pairing.port),
		session: pairing.sessionId
	}
}

export function buildSocketUrl(pairing: PairingPayload) {
	return `ws://${pairing.host}:${pairing.port}`
}
