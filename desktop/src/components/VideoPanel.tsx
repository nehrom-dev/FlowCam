import { useEffect, useRef } from 'react'

interface VideoPanelProps {
	stream: MediaStream | null
}

export function VideoPanel({ stream }: VideoPanelProps) {
	const ref = useRef<HTMLVideoElement | null>(null)

	useEffect(() => {
		const video = ref.current
		if (!video) return

		video.srcObject = null

		if (!stream) {
			return
		}

		console.log('[FlowCam Desktop] attaching stream')
		console.log(
			'[FlowCam Desktop] video tracks:',
			stream.getVideoTracks().length
		)
		console.log(
			'[FlowCam Desktop] audio tracks:',
			stream.getAudioTracks().length
		)

		video.srcObject = stream
		video.muted = true
		video.autoplay = true
		video.playsInline = true

		const tryPlay = async () => {
			try {
				await video.play()
				console.log('[FlowCam Desktop] video.play() success')
			} catch (error) {
				console.error('[FlowCam Desktop] video.play() failed:', error)
			}
		}

		video.onloadedmetadata = () => {
			console.log('[FlowCam Desktop] loadedmetadata', {
				width: video.videoWidth,
				height: video.videoHeight
			})
			void tryPlay()
		}

		video.oncanplay = () => {
			console.log('[FlowCam Desktop] canplay')
			void tryPlay()
		}

		void tryPlay()

		return () => {
			video.onloadedmetadata = null
			video.oncanplay = null
			video.srcObject = null
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
						Open FlowCam on Android and start streaming.
					</div>
				</div>
			)}
		</div>
	)
}
