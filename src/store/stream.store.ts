import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type StreamStats = {
  url: string;
  successRate: number;
  successes: number;
  fails: number;
  lastSuccess?: number;
};

type Store = {
  streams: Record<string, StreamStats>;
  success: (url: string) => void;
  fail: (url: string) => void;
};

export const useStreamStore = create<Store>()(
  persist(
    (set, get) => ({
      streams: {},

      success: (url) => {
        const s = get().streams[url] || {
          url,
          successRate: 0.5,
          successes: 0,
          fails: 0,
        };

        const successes = s.successes + 1;
        const total = successes + s.fails;

        set({
          streams: {
            ...get().streams,
            [url]: {
              ...s,
              successes,
              successRate: successes / total,
              lastSuccess: Date.now(),
            }
          }
        });
      },

      fail: (url) => {
        const s = get().streams[url] || {
          url,
          successRate: 0.5,
          successes: 0,
          fails: 0,
        };

        const fails = s.fails + 1;
        const total = fails + s.successes;

        set({
          streams: {
            ...get().streams,
            [url]: {
              ...s,
              fails,
              successRate: s.successes / total,
            }
          }
        });
      },
    }),
    { name: 'stream-ranking' }
  )
);