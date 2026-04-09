import { invoke } from '@tauri-apps/api/core';

/**
 * ExoPlayer (Media3) service for Android TV
 * 
 * This service provides a simple interface to control the native Android ExoPlayer
 * via Tauri mobile plugin. ExoPlayer is optimized for Android TV with:
 * - Hardware decoding support
 * - Excellent live stream (HLS/DASH) support
 * - DRM support
 * - Fast channel zapping
 */

export interface ExoPlayerConfig {
  url: string;
  title?: string;
  headers?: Record<string, string>;
}

export interface ExoPlayerPosition {
  position: number;
  duration: number;
  isPlaying: boolean;
}

class ExoPlayerService {
  private static instance: ExoPlayerService;
  private isAvailable: boolean | null = null;

  private constructor() {}

  static getInstance(): ExoPlayerService {
    if (!ExoPlayerService.instance) {
      ExoPlayerService.instance = new ExoPlayerService();
    }
    return ExoPlayerService.instance;
  }

  /**
   * Check if running on Android (ExoPlayer is available)
   */
  async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    try {
      // Check if we're on Android by looking at user agent or trying an Android-only command
      const userAgent = navigator.userAgent.toLowerCase();
      this.isAvailable = userAgent.includes('android');
      return this.isAvailable;
    } catch (error) {
      console.error('Failed to check ExoPlayer availability:', error);
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Play a video/stream URL
   */
  async play(config: ExoPlayerConfig): Promise<void> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new Error('ExoPlayer is only available on Android');
    }

    try {
      await invoke('exoplayer_play', { 
        url: config.url,
        headers: config.headers || {}
      });
    } catch (error) {
      throw new Error(`Failed to play with ExoPlayer: ${error}`);
    }
  }

  /**
   * Simple play URL helper
   */
  async playUrl(url: string, title?: string): Promise<void> {
    await this.play({ url, title });
  }

  /**
   * Play an IPTV channel (live stream)
   */
  async playChannel(channelName: string, streamUrl: string): Promise<void> {
    await this.play({
      url: streamUrl,
      title: channelName,
    });
  }

  /**
   * Play a VOD movie
   */
  async playVOD(movieName: string, streamUrl: string): Promise<void> {
    await this.play({
      url: streamUrl,
      title: movieName,
    });
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    try {
      await invoke('exoplayer_pause');
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    try {
      await invoke('exoplayer_resume');
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  }

  /**
   * Stop playback and clear media
   */
  async stop(): Promise<void> {
    try {
      await invoke('exoplayer_stop');
    } catch (error) {
      console.error('Failed to stop:', error);
    }
  }

  /**
   * Seek to position (in milliseconds)
   */
  async seek(positionMs: number): Promise<void> {
    try {
      await invoke('exoplayer_seek', { position: positionMs });
    } catch (error) {
      console.error('Failed to seek:', error);
    }
  }

  /**
   * Set playback speed (1.0 = normal)
   */
  async setSpeed(speed: number): Promise<void> {
    try {
      await invoke('exoplayer_set_speed', { speed });
    } catch (error) {
      console.error('Failed to set speed:', error);
    }
  }

  /**
   * Get current playback position
   */
  async getPosition(): Promise<ExoPlayerPosition> {
    try {
      const result = await invoke<{
        position: number;
        duration: number;
        is_playing: boolean;
      }>('exoplayer_get_position');
      
      return {
        position: result.position,
        duration: result.duration,
        isPlaying: result.is_playing,
      };
    } catch (error) {
      console.error('Failed to get position:', error);
      return { position: 0, duration: 0, isPlaying: false };
    }
  }

  /**
   * Check if currently playing
   */
  async isPlaying(): Promise<boolean> {
    try {
      const result = await invoke<{ is_playing: boolean }>('exoplayer_is_playing');
      return result.is_playing;
    } catch (error) {
      console.error('Failed to check playing state:', error);
      return false;
    }
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    const isCurrentlyPlaying = await this.isPlaying();
    if (isCurrentlyPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }
}

export const exoPlayer = ExoPlayerService.getInstance();
export default exoPlayer;
