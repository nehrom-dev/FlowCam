export type PeerRole = 'desktop' | 'phone'

export type HelloMessage = {
	type: 'hello'
	role: PeerRole
	sessionId: string
}

export type OfferMessage = {
	type: 'offer'
	sessionId: string
	sdp: RTCSessionDescriptionInit
}

export type AnswerMessage = {
	type: 'answer'
	sessionId: string
	sdp: RTCSessionDescriptionInit
}

export type IceCandidateMessage = {
	type: 'ice-candidate'
	sessionId: string
	candidate: RTCIceCandidateInit
}

export type PeerJoinedMessage = {
	type: 'peer-joined'
	sessionId: string
	role: PeerRole
}

export type PeerLeftMessage = {
	type: 'peer-left'
	sessionId: string
	role: PeerRole
}

export type ResetMessage = {
	type: 'reset'
	sessionId: string
}

export type SignalMessage =
	| HelloMessage
	| OfferMessage
	| AnswerMessage
	| IceCandidateMessage
	| PeerJoinedMessage
	| PeerLeftMessage
	| ResetMessage

export function safeParseSignalMessage(raw: string): SignalMessage | null {
	try {
		return JSON.parse(raw) as SignalMessage
	} catch {
		return null
	}
}
