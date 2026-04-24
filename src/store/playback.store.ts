// =========================
// 🎬 PLAYBACK STORE (Zustand v5 + Immer)
// =========================
// Single player manager to avoid side-effect conflicts from multiple player instances

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface PlayerMedia {
  url: string;
  name: string;
  channelId?: number;
  isVod?: boolean;
  movieId?: string;
  resumePosition?: number;
  portalUrl?: string;
  mac?: string;
  token?: string;
}

interface PlaybackState {
  // Current media
  current: PlayerMedia | null;
  buffering: boolean;

  // Content type tracking
  contentType: 'tv' | 'movies' | 'series' | null;

  // Actions
  setMedia: (media: PlayerMedia | null) => void;
  setBuffering: (value: boolean) => void;
  setContentType: (type: 'tv' | 'movies' | 'series' | null) => void;
  close: () => void;
}

export const usePlaybackStore = create<PlaybackState>()(
  immer((set) => ({
    current: null,
    buffering: false,
    contentType: null,

    setMedia: (media) => {
      set((state) => {
        state.current = media;
      });
    },

    setBuffering: (value) => {
      set((state) => {
        state.buffering = value;
      });
    },

    setContentType: (type) => {
      set((state) => {
        state.contentType = type;
      });
    },

    close: () => {
      set((state) => {
        state.current = null;
        state.buffering = false;
        state.contentType = null;
      });
    },
  }))
);
