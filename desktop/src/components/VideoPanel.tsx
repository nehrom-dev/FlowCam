import { useEffect, useRef } from 'react'

interface VideoPanelProps {
	stream: MediaStream | null
}

export function VideoPanel({ stream }: VideoPanelProps) {
	const ref = useRef<HTMLVideoElement | null>(null)

	useEffect(() => {
		if (!ref.current) return
		ref.current.srcObject = stream
	}, [stream])

	return (
		<div className='video-shell'>
			{stream ? (
				<video
					ref={ref}
					autoPlay
					playsInline
					muted={false}
					className='video'
				/>
			) : (
				<div className='video-empty'>
					<div className='video-empty-title'>Waiting for phone stream</div>
					<div className='video-empty-subtitle'>
						Open FlowCam on Android, scan the QR code and start streaming.
					</div>
				</div>
			)}
		</div>
	)
}
