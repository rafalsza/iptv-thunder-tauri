import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type WatchStatus = 'not_started' | 'in_progress' | 'watched';

interface MovieProgress {
  position: number; // time in seconds
  duration: number; // total duration in seconds
  status: WatchStatus;
  lastWatched: number; // timestamp
  percentage: number; // 0-100
}

interface ResumeState {
  positions: Record<string, number>; // movieId -> time in seconds (legacy)
  movies: Record<string, MovieProgress>; // movieId -> full progress data
  setPosition: (movieId: string, time: number, duration?: number) => void;
  getPosition: (movieId: string) => number;
  getProgress: (movieId: string) => MovieProgress | undefined;
  clearPosition: (movieId: string) => void;
  markAsWatched: (movieId: string, duration: number) => void;
  getWatchStatus: (movieId: string) => WatchStatus;
  getInProgressMovies: () => { movieId: string; progress: MovieProgress }[];
  getWatchedMovies: () => { movieId: string; progress: MovieProgress }[];
}

const WATCHED_THRESHOLD = 90; // 90% ukończenia = obejrzane
const MIN_WATCH_TIME = 30; // Minimum 30 sekund aby zapisać

export const useResumeStore = create<ResumeState>()(
  persist(
    (set, get) => ({
      positions: {},
      movies: {},

      setPosition: (movieId, time, duration = 0) => {
        if (time < MIN_WATCH_TIME && time > 0) return; // Don't save if less than 30 seconds

        const percentage = duration > 0 ? Math.round((time / duration) * 100) : 0;

        // Determine status
        let status: WatchStatus = 'not_started';
        if (percentage >= WATCHED_THRESHOLD) {
          status = 'watched';
        } else if (time >= MIN_WATCH_TIME) {
          status = 'in_progress';
        }

        // If time is 0, clear the progress
        if (time === 0) {
          set((state) => {
            const { [movieId]: _, ...restMovies } = state.movies;
            const { [movieId]: __, ...restPositions } = state.positions;
            return { movies: restMovies, positions: restPositions };
          });
          return;
        }

        const progress: MovieProgress = {
          position: time,
          duration,
          status,
          lastWatched: Date.now(),
          percentage,
        };

        set((state) => ({
          positions: { ...state.positions, [movieId]: time },
          movies: { ...state.movies, [movieId]: progress },
        }));
      },

      getPosition: (movieId) => {
        return get().movies[movieId]?.position || get().positions[movieId] || 0;
      },

      getProgress: (movieId) => {
        return get().movies[movieId];
      },

      clearPosition: (movieId) => {
        set((state) => {
          const { [movieId]: _, ...restMovies } = state.movies;
          const { [movieId]: __, ...restPositions } = state.positions;
          return { movies: restMovies, positions: restPositions };
        });
      },

      markAsWatched: (movieId, duration) => {
        const progress: MovieProgress = {
          position: duration,
          duration,
          status: 'watched',
          lastWatched: Date.now(),
          percentage: 100,
        };

        set((state) => ({
          positions: { ...state.positions, [movieId]: duration },
          movies: { ...state.movies, [movieId]: progress },
        }));
      },

      getWatchStatus: (movieId) => {
        return get().movies[movieId]?.status || 'not_started';
      },

      getInProgressMovies: () => {
        const state = get();
        return Object.entries(state.movies)
          .filter(([_, progress]) => progress.status === 'in_progress')
          .sort((a, b) => b[1].lastWatched - a[1].lastWatched)
          .map(([movieId, progress]) => ({ movieId, progress }));
      },

      getWatchedMovies: () => {
        const state = get();
        return Object.entries(state.movies)
          .filter(([_, progress]) => progress.status === 'watched')
          .sort((a, b) => b[1].lastWatched - a[1].lastWatched)
          .map(([movieId, progress]) => ({ movieId, progress }));
      },
    }),
    {
      name: 'iptv-resume-positions',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
