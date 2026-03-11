import { useEffect, useRef } from 'react'

interface VideoPanelProps {
	stream: MediaStream | null
}

export function VideoPanel({ stream }: VideoPanelProps) {
	const ref = useRef<HTMLVideoElement | null>(null)

	useEffect(() => {
		const video = ref.current
		if (!video) return

		video.srcObject = stream

		if (stream) {
			video.play().catch(error => {
				console.error('Video play failed:', error)
			})
		}
	}, [stream])

	return (
		<div className='video-shell'>
			{stream ? (
				<video
					ref={ref}
					autoPlay
					playsInline
					muted
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
