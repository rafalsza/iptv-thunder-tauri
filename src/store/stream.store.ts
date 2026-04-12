import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_STREAMS = 200;
const STORAGE_KEY = 'stream-ranking';

// Clear storage on init if quota exceeded
try {
  const test = localStorage.getItem(STORAGE_KEY);
  if (test) {
    // Try to parse and check size
    const parsed = JSON.parse(test);
    const size = new Blob([JSON.stringify(parsed)]).size;
    // If larger than 2MB, clear it
    if (size > 2 * 1024 * 1024) {
      console.warn('Stream store too large, clearing:', size, 'bytes');
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch (err) {
  console.error('Error checking stream store size:', err);
  localStorage.removeItem(STORAGE_KEY);
}

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
  cleanup: () => void;
  clear: () => void;
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

        // Cleanup BEFORE set to prevent quota errors
        const streams = get().streams;
        const entries = Object.entries(streams);
        if (entries.length > MAX_STREAMS) {
          const sorted = entries.sort((a, b) => {
            const aTime = a[1].lastSuccess || 0;
            const bTime = b[1].lastSuccess || 0;
            return bTime - aTime;
          });
          const trimmed = sorted.slice(0, MAX_STREAMS);
          const newStreams: Record<string, StreamStats> = {};
          for (const [u, stats] of trimmed) {
            newStreams[u] = stats;
          }
          // Add/update current URL before setting
          newStreams[url] = {
            ...s,
            successes,
            successRate: successes / total,
            lastSuccess: Date.now(),
          };
          set({ streams: newStreams });
        } else {
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
        }
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

      cleanup: () => {
        const streams = get().streams;
        const entries = Object.entries(streams);

        if (entries.length <= MAX_STREAMS) return;

        // Sort by lastSuccess (most recent first), keep top MAX_STREAMS
        const sorted = entries.sort((a, b) => {
          const aTime = a[1].lastSuccess || 0;
          const bTime = b[1].lastSuccess || 0;
          return bTime - aTime;
        });

        const trimmed = sorted.slice(0, MAX_STREAMS);
        const newStreams: Record<string, StreamStats> = {};
        for (const [url, stats] of trimmed) {
          newStreams[url] = stats;
        }

        set({ streams: newStreams });
      },

      clear: () => {
        set({ streams: {} });
      },
    }),
    { name: STORAGE_KEY }
  )
);
