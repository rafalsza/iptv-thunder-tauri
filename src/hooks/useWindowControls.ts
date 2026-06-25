import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

interface WindowControls {
  isMaximized: boolean;
  handleMaximize: () => Promise<void>;
  handleMinimize: () => Promise<void>;
  handleClose: () => Promise<void>;
}

export const useWindowControls = (): WindowControls => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMaximizedRef = useRef(false);
  const unlistenResizeRef = useRef<(() => void) | null>(null);
  const unlistenMoveRef = useRef<(() => void) | null>(null);
  const windowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  windowRef.current ??= getCurrentWindow();

  useEffect(() => {
    let isMounted = true;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const syncMaximized = async () => {
      try {
        const maximized = await windowRef.current!.isMaximized();
        if (isMounted && maximized !== isMaximizedRef.current) {
          isMaximizedRef.current = maximized;
          setIsMaximized(maximized);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[useWindowControls] Failed to sync isMaximized:', e);
      }
    };

    const throttledSync = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        syncMaximized();
      }, 100);
    };

    const setupListeners = async () => {
      try {
        const unlistenResize = await listen('tauri://resize', throttledSync);
        if (isMounted) {
          unlistenResizeRef.current = unlistenResize;
        } else {
          unlistenResize();
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[useWindowControls] Failed to setup resize listener:', e);
      }

      try {
        const unlistenMove = await listen('tauri://move', throttledSync);
        if (isMounted) {
          unlistenMoveRef.current = unlistenMove;
        } else {
          unlistenMove();
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[useWindowControls] Failed to setup move listener:', e);
      }
    };

    void Promise.all([syncMaximized(), setupListeners()]);

    return () => {
      isMounted = false;
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      if (unlistenResizeRef.current) {
        unlistenResizeRef.current();
        unlistenResizeRef.current = null;
      }
      if (unlistenMoveRef.current) {
        unlistenMoveRef.current();
        unlistenMoveRef.current = null;
      }
    };
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      if (isMaximizedRef.current) {
        await windowRef.current!.unmaximize();
      } else {
        await windowRef.current!.maximize();
      }
      // State will be synced via tauri://resize / tauri://move listener
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[useWindowControls] handleMaximize failed:', e);
    }
  }, []);

  const handleMinimize = useCallback(async () => {
    try {
      await windowRef.current!.minimize();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[useWindowControls] handleMinimize failed:', e);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await windowRef.current!.close();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[useWindowControls] handleClose failed:', e);
    }
  }, []);

  return {
    isMaximized,
    handleMaximize,
    handleMinimize,
    handleClose,
  };
};
