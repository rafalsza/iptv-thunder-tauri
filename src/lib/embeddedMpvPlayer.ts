import { invoke } from '@tauri-apps/api/core';

export class EmbeddedMpvPlayer {
  private static isPlaying = false;

  static async play(url: string, title?: string): Promise<void> {
    if (this.isPlaying) {
      await this.stop();
    }

    try {
      await invoke('play_embedded', { url, title });
      this.isPlaying = true;
      console.log('[EmbeddedMpvPlayer] Started playing:', title || url);
    } catch (error) {
      console.error('[EmbeddedMpvPlayer] Error:', error);
      throw error;
    }
  }

  static async stop(): Promise<void> {
    try {
      await invoke('stop_embedded');
      this.isPlaying = false;
      console.log('[EmbeddedMpvPlayer] Stopped');
    } catch (error) {
      console.error('[EmbeddedMpvPlayer] Stop error:', error);
    }
  }

  static getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
