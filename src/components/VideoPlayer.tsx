import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface VideoPlayerProps {
  src: string;
  title?: string;
  onClose: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, title, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const options = {
      autoplay: true,
      controls: true,
      fluid: true,
      sources: [{
        src: src,
        type: 'application/x-mpegURL' // HLS stream
      }],
      html5: {
        vhs: {
          overrideNative: true,
          limitRenditionByPlayerDimensions: true,
          useDevicePixelRatio: true
        }
      }
    };

    try {
      playerRef.current = videojs(videoRef.current, options, () => {
        console.log('Video player ready');
      });

      playerRef.current.on('error', (e: any) => {
        console.error('Video error:', e);
        setError('Failed to load stream. The format may not be supported.');
      });
    } catch (err) {
      console.error('Failed to initialize video player:', err);
      setError('Failed to initialize player');
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [src]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white">
        <span className="font-medium">{title || 'Playing'}</span>
        <button 
          onClick={onClose}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          Close
        </button>
      </div>
      
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <p className="text-sm text-gray-400">Try using external MPV player instead</p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered vjs-fluid w-full h-full"
          />
        )}
      </div>
    </div>
  );
};
