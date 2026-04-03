// =========================
// 🎬 MOVIES API (Simplified)
// =========================
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerVOD, StalkerGenre } from '@/types';

export const getMovieCategories = async (client: StalkerClient): Promise<StalkerGenre[]> => {
  return client.getVODCategories();
};

export const getMovieDetails = async (client: StalkerClient, movieId: string): Promise<StalkerVOD> => {
  return client.getVODDetails(movieId);
};

export const getMovieStream = async (client: StalkerClient, cmd: string): Promise<string> => {
  return client.getVODUrl(cmd);
};
