export type PeerRole = 'desktop' | 'phone'

export type WireSessionDescription = {
	type: 'offer' | 'answer' | 'pranswer' | 'rollback'
	sdp: string
}

export type WireIceCandidate = {
	candidate: string
	sdpMid?: string | null
	sdpMLineIndex?: number | null
	usernameFragment?: string | null
}

export type HelloMessage = {
	type: 'hello'
	role: PeerRole
	sessionId: string
}

export type OfferMessage = {
	type: 'offer'
	sessionId: string
	sdp: WireSessionDescription
}

export type AnswerMessage = {
	type: 'answer'
	sessionId: string
	sdp: WireSessionDescription
}

export type IceCandidateMessage = {
	type: 'ice-candidate'
	sessionId: string
	candidate: WireIceCandidate
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
