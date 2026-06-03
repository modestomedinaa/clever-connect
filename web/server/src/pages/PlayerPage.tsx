import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { FiArrowLeft, FiPlay, FiCpu, FiClock, FiVideo, FiActivity } from 'react-icons/fi';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export const PlayerPage: React.FC = () => {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { token } = useAuthStore();
	
	const filePath = searchParams.get('path') || '';
	const fileName = filePath.split('/').pop() || 'Video Stream';

	// Player Streaming Modes: 
	// - 'native': Direct HTTP byte-range (206 partial content) stream
	// - 'hls': MediaMTX HLS stream (on-demand FFmpeg RTSP demux)
	// - 'webrtc': MediaMTX WebRTC (WHEP) stream (ultra-low latency)
	const [streamMode, setStreamMode] = useState<'native' | 'hls' | 'webrtc'>('native');

	const videojsContainerRef = useRef<HTMLDivElement | null>(null);
	const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
	
	const videojsPlayerRef = useRef<any>(null);
	const webrtcPeerRef = useRef<RTCPeerConnection | null>(null);

	// Cleanup WebRTC connection
	const cleanWebRTC = () => {
		if (webrtcPeerRef.current) {
			webrtcPeerRef.current.close();
			webrtcPeerRef.current = null;
		}
		if (nativeVideoRef.current) {
			nativeVideoRef.current.srcObject = null;
		}
	};

	// Cleanup VideoJS player
	const cleanVideoJS = () => {
		if (videojsPlayerRef.current) {
			videojsPlayerRef.current.dispose();
			videojsPlayerRef.current = null;
		}
		if (videojsContainerRef.current) {
			videojsContainerRef.current.innerHTML = '';
		}
	};

	// Initialize VideoJS (For Native Range & HLS stream modes)
	const initVideoJS = (srcUrl: string, type: string) => {
		cleanVideoJS();
		cleanWebRTC();

		if (!videojsContainerRef.current) return;

		const videoEl = document.createElement('video-js');
		videoEl.className = 'vjs-big-play-centered vjs-theme-vod';
		videoEl.style.width = '100%';
		videoEl.style.height = '100%';
		videojsContainerRef.current.appendChild(videoEl);

		const options = {
			autoplay: true,
			controls: true,
			fluid: false,
			responsive: true,
			playbackRates: [0.5, 1, 1.25, 1.5, 2],
			sources: [{ src: srcUrl, type }],
			controlBar: {
				children: [
					'playToggle',
					'volumePanel',
					'currentTimeDisplay',
					'timeDivider',
					'durationDisplay',
					'progressControl',
					'playbackRateMenuButton',
					'fullscreenToggle'
				]
			}
		};

		const player = videojsPlayerRef.current = videojs(videoEl, options, () => {
			console.log('Video.js player loaded');
		});

		// Apply custom keyboard hotkeys
		player.on('keydown', (e: any) => {
			// VideoJS handles some keyboard events itself, but let's bind them globally
		});
	};

	// Initialize native WebRTC stream (For MediaMTX ultra-low latency)
	const initWebRTC = async () => {
		cleanVideoJS();
		cleanWebRTC();

		if (!nativeVideoRef.current) return;
		const videoElement = nativeVideoRef.current;

		// WHEP server endpoint proxied through nginx
		const whepUrl = `${window.location.origin}/webrtc/vod/${encodeURIComponent(filePath)}/whep`;

		try {
			const pc = new RTCPeerConnection({
				iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
			});
			webrtcPeerRef.current = pc;

			pc.ontrack = (event) => {
				if (videoElement.srcObject !== event.streams[0]) {
					videoElement.srcObject = event.streams[0];
				}
			};

			pc.addTransceiver('video', { direction: 'recvonly' });
			pc.addTransceiver('audio', { direction: 'recvonly' });

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			const response = await fetch(whepUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: offer.sdp
			});

			if (!response.ok) {
				throw new Error('Failed to negotiate WebRTC with WHEP server');
			}

			const answerSdp = await response.text();
			await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
		} catch (err) {
			console.error('WebRTC initialization failed:', err);
		}
	};

	// Synchronize player mount on mode changes
	useEffect(() => {
		if (!filePath) return;

		if (streamMode === 'native') {
			// Direct range stream (206 partial content)
			const streamUrl = `/api/files/stream?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`;
			initVideoJS(streamUrl, 'video/mp4');
		} else if (streamMode === 'hls') {
			// HLS streaming via MediaMTX
			const hlsUrl = `/hls/vod/${encodeURIComponent(filePath)}/index.m3u8`;
			initVideoJS(hlsUrl, 'application/x-mpegURL');
		} else if (streamMode === 'webrtc') {
			// WebRTC streaming via MediaMTX
			initWebRTC();
		}

		return () => {
			cleanVideoJS();
			cleanWebRTC();
		};
	}, [filePath, streamMode]);

	// Register global hotkeys for keyboard controls
	useEffect(() => {
		const handleGlobalKeys = (e: KeyboardEvent) => {
			const activeTag = document.activeElement?.tagName.toLowerCase();
			if (activeTag === 'input' || activeTag === 'textarea') return;

			// Handle play/pause, seek, volume, and fullscreen
			if (videojsPlayerRef.current) {
				const player = videojsPlayerRef.current;
				if (e.code === 'Space') {
					e.preventDefault();
					player.paused() ? player.play() : player.pause();
				} else if (e.code === 'ArrowRight') {
					e.preventDefault();
					player.currentTime(player.currentTime() + 10);
				} else if (e.code === 'ArrowLeft') {
					e.preventDefault();
					player.currentTime(Math.max(0, player.currentTime() - 10));
				} else if (e.code === 'ArrowUp') {
					e.preventDefault();
					player.volume(Math.min(1, player.volume() + 0.1));
				} else if (e.code === 'ArrowDown') {
					e.preventDefault();
					player.volume(Math.max(0, player.volume() - 0.1));
				} else if (e.code === 'KeyF') {
					e.preventDefault();
					player.isFullscreen() ? player.exitFullscreen() : player.requestFullscreen();
				}
			} else if (nativeVideoRef.current && streamMode === 'webrtc') {
				const video = nativeVideoRef.current;
				if (e.code === 'Space') {
					e.preventDefault();
					video.paused ? video.play() : video.pause();
				} else if (e.code === 'ArrowUp') {
					e.preventDefault();
					video.volume = Math.min(1, video.volume + 0.1);
				} else if (e.code === 'ArrowDown') {
					e.preventDefault();
					video.volume = Math.max(0, video.volume - 0.1);
				} else if (e.code === 'KeyF') {
					e.preventDefault();
					if (document.fullscreenElement) {
						document.exitFullscreen();
					} else {
						video.requestFullscreen();
					}
				}
			}
		};

		window.addEventListener('keydown', handleGlobalKeys);
		return () => window.removeEventListener('keydown', handleGlobalKeys);
	}, [streamMode]);

	const goBack = () => {
		navigate('/files');
	};

	return (
		<div style={{
			width: '100vw',
			height: '100vh',
			background: '#09090b',
			color: '#fafafa',
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
			fontFamily: 'sans-serif'
		}}>
			{/* Custom styling variables to style Video.js player like Netflix VOD */}
			<style>{`
				.vjs-theme-vod.video-js {
					font-family: inherit;
					color: #ffffff;
				}
				.vjs-theme-vod .vjs-big-play-button {
					background-color: rgba(239, 68, 68, 0.9) !important;
					border: none !important;
					border-radius: 50% !important;
					width: 2.2em !important;
					height: 2.2em !important;
					line-height: 2.2em !important;
					margin-top: -1.1em !important;
					margin-left: -1.1em !important;
					box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4) !important;
					transition: all 0.2s ease !important;
				}
				.vjs-theme-vod .vjs-big-play-button:hover {
					transform: scale(1.1);
					background-color: #ef4444 !important;
				}
				.vjs-theme-vod .vjs-control-bar {
					background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 70%, rgba(0,0,0,0) 100%) !important;
					height: 4.5em !important;
					padding-top: 1em;
				}
				.vjs-theme-vod .vjs-play-progress {
					background-color: #ef4444 !important;
				}
				.vjs-theme-vod .vjs-slider {
					background-color: rgba(255, 255, 255, 0.2) !important;
				}
				.vjs-theme-vod .vjs-load-progress {
					background-color: rgba(255, 255, 255, 0.4) !important;
				}
				.vjs-theme-vod .vjs-playback-rate {
					display: flex;
					align-items: center;
				}
			`}</style>

			{/* VOD Top Header controls */}
			<div style={{
				height: 60,
				background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 24px',
				zIndex: 20
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<button 
						onClick={goBack}
						style={{
							background: 'rgba(255,255,255,0.08)',
							border: '1px solid rgba(255,255,255,0.15)',
							borderRadius: '50%',
							width: 36,
							height: 36,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: '#fff',
							cursor: 'pointer',
							transition: 'background 0.2s'
						}}
						onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
						onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
					>
						<FiArrowLeft size={18} />
					</button>
					<div>
						<div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.2px' }}>{fileName}</div>
						<div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
							<FiVideo size={10} /> VOD Cinema Mode
						</div>
					</div>
				</div>

				{/* Stream Mode Selection Panel */}
				<div style={{
					display: 'flex',
					background: 'rgba(255,255,255,0.06)',
					border: '1px solid rgba(255,255,255,0.1)',
					padding: 3,
					borderRadius: 8
				}}>
					<button
						onClick={() => setStreamMode('native')}
						style={{
							padding: '6px 12px',
							fontSize: 12,
							fontWeight: 600,
							borderRadius: 6,
							border: 'none',
							background: streamMode === 'native' ? '#ef4444' : 'transparent',
							color: streamMode === 'native' ? '#fff' : '#a1a1aa',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							transition: 'all 0.2s'
						}}
					>
						<FiPlay size={12} /> Direct Range
					</button>
					<button
						onClick={() => setStreamMode('hls')}
						style={{
							padding: '6px 12px',
							fontSize: 12,
							fontWeight: 600,
							borderRadius: 6,
							border: 'none',
							background: streamMode === 'hls' ? '#ef4444' : 'transparent',
							color: streamMode === 'hls' ? '#fff' : '#a1a1aa',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							transition: 'all 0.2s'
						}}
					>
						<FiCpu size={12} /> MediaMTX HLS
					</button>
					<button
						onClick={() => setStreamMode('webrtc')}
						style={{
							padding: '6px 12px',
							fontSize: 12,
							fontWeight: 600,
							borderRadius: 6,
							border: 'none',
							background: streamMode === 'webrtc' ? '#ef4444' : 'transparent',
							color: streamMode === 'webrtc' ? '#fff' : '#a1a1aa',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							transition: 'all 0.2s'
						}}
					>
						<FiActivity size={12} /> MediaMTX WebRTC
					</button>
				</div>
			</div>

			{/* Main Video Screen Container */}
			<div style={{
				flex: 1,
				position: 'relative',
				background: '#000',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center'
			}}>
				{/* VideoJS Container (Native & HLS modes) */}
				{(streamMode === 'native' || streamMode === 'hls') && (
					<div 
						ref={videojsContainerRef} 
						style={{ width: '100%', height: '100%' }} 
					/>
				)}

				{/* WebRTC WHEP Container */}
				{streamMode === 'webrtc' && (
					<video
						ref={nativeVideoRef}
						controls
						autoPlay
						playsInline
						style={{ width: '100%', height: '100%', outline: 'none' }}
					/>
				)}
			</div>
		</div>
	);
};
