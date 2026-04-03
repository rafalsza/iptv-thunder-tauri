import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ResumeState {
  positions: Record<string, number>; // movieId -> time in seconds
  setPosition: (movieId: string, time: number) => void;
  getPosition: (movieId: string) => number;
  clearPosition: (movieId: string) => void;
}

export const useResumeStore = create<ResumeState>()(
  persist(
    (set, get) => ({
      positions: {},
      setPosition: (movieId, time) => {
        if (time < 30) return; // Don't save if less than 30 seconds
        set((state) => ({
          positions: { ...state.positions, [movieId]: time },
        }));
      },
      getPosition: (movieId) => {
        return get().positions[movieId] || 0;
      },
      clearPosition: (movieId) => {
        set((state) => {
          const { [movieId]: _, ...rest } = state.positions;
          return { positions: rest };
        });
      },
    }),
    {
      name: 'iptv-resume-positions',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
