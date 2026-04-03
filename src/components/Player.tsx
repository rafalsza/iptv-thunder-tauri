import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePortalStore } from '@/store/usePortalStore';

interface PlayerProps {
  streamUrl: string;
  channelName: string;
  onClose: () => void;
}

export const Player: React.FC<PlayerProps> = ({ streamUrl, channelName, onClose }) => {
  const [isReady, setIsReady] = useState(false);
  const { activeAccount } = usePortalStore();

  useEffect(() => {
    if (!streamUrl) return;
    
    const startVLC = async () => {
      try {
        console.log('[Player] Starting VLC with stream:', streamUrl);
        await invoke('play_with_vlc', {
          config: { 
            url: streamUrl, 
            title: channelName,
            noBorder: true,
            forceWindow: true,
            keepAspect: true,
            hwdec: null
          }
        });
        setIsReady(true);
      } catch (err) {
        console.error('VLC error:', err);
      }
    };
    
    startVLC();
  }, [streamUrl, channelName]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="bg-zinc-950 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-3xl hover:text-red-500">✕</button>
          <div>
            <div className="font-semibold text-xl">{channelName}</div>
            <div className="text-sm text-zinc-400">{activeAccount?.name} - VLC Player</div>
          </div>
        </div>
        <button 
          onClick={() => window.open(streamUrl, '_blank')}
          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg"
        >
          Odtwórz w przeglądarce
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/70 text-center">
          <div className="text-6xl mb-4">📺</div>
          <div className="text-xl mb-2">VLC Player</div>
          <div className="text-sm">Odtwarzanie w zewnętrznym oknie VLC</div>
          {isReady && <div className="text-green-400 mt-2">✅ VLC uruchomione</div>}
        </div>
      </div>
    </div>
  );
};
