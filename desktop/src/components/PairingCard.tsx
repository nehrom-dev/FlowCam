import { QRCodeSVG } from 'qrcode.react'

interface PairingCardProps {
	sessionId: string
	qrPayload: string
	host: string
	port: number
}

export function PairingCard({
	sessionId,
	qrPayload,
	host,
	port
}: PairingCardProps) {
	return (
		<section className='card pairing-card'>
			<div className='card-title-row'>
				<h2>Pair phone</h2>
			</div>

			<div className='qr-wrap'>
				<QRCodeSVG
					value={qrPayload}
					size={220}
					includeMargin
				/>
			</div>

			<div className='pairing-grid'>
				<div>
					<div className='meta-label'>Session</div>
					<div className='meta-value mono'>{sessionId}</div>
				</div>

				<div>
					<div className='meta-label'>LAN endpoint</div>
					<div className='meta-value mono'>
						ws://{host}:{port}
					</div>
				</div>
			</div>

			<div className='pairing-hint'>
				QR payload uses the format <span className='mono'>flowcam://pair</span>{' '}
				with host, port and session id.
			</div>
		</section>
	)
}
