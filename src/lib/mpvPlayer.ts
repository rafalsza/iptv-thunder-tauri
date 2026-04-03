import { invoke } from '@tauri-apps/api/core';

export interface PlayerConfig {
  url: string;
  title?: string;
  noBorder?: boolean;
  forceWindow?: boolean;
  keepAspect?: boolean;
  hwdec?: string;
}

export class MPVPlayer {
  private static instance: MPVPlayer;
  private isAvailable: boolean | null = null;

  private constructor() {}

  static getInstance(): MPVPlayer {
    if (!MPVPlayer.instance) {
      MPVPlayer.instance = new MPVPlayer();
    }
    return MPVPlayer.instance;
  }

  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      this.isAvailable = await invoke<boolean>('check_mpv_available');
      return this.isAvailable;
    } catch (error) {
      console.error('Failed to check MPV availability:', error);
      this.isAvailable = false;
      return false;
    }
  }

  async play(config: PlayerConfig): Promise<void> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new Error('MPV player is not available on this system');
    }

    const playerConfig = {
      url: config.url,
      title: config.title || undefined,
      noBorder: config.noBorder ?? true,
      forceWindow: config.forceWindow ?? true,
      keepAspect: config.keepAspect ?? true,
      hwdec: config.hwdec || 'auto',
    };

    try {
      await invoke<string>('play_with_mpv', { config: playerConfig });
    } catch (error) {
      throw new Error(`Failed to play with MPV: ${error}`);
    }
  }

  async playStream(url: string, title?: string): Promise<void> {
    await this.play({
      url,
      title,
      noBorder: true,
      forceWindow: true,
      keepAspect: true,
      hwdec: 'auto',
    });
  }

  async playChannel(channelName: string, streamUrl: string): Promise<void> {
    await this.play({
      url: streamUrl,
      title: channelName,
      noBorder: true,
      forceWindow: true,
      keepAspect: true,
      hwdec: 'auto',
    });
  }

  async playVOD(movieName: string, streamUrl: string): Promise<void> {
    await this.play({
      url: streamUrl,
      title: movieName,
      noBorder: false,
      forceWindow: true,
      keepAspect: true,
      hwdec: 'auto',
    });
  }
}

export const mpvPlayer = MPVPlayer.getInstance();
