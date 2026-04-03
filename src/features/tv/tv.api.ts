// =========================
// 🔌 TV API (Simplified)
// =========================
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerGenre } from '@/types';

export const getChannelCategories = async (client: StalkerClient): Promise<StalkerGenre[]> => {
  return client.getGenres();
};
