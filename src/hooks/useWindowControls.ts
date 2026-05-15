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
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const maximized = await currentWindow.isMaximized();
        if (isMounted) {
          setIsMaximized(maximized);
        }
      } catch {
        // Silent fail - component will use default state
      }
    };

    const setupWindowListener = async () => {
      try {
        const unlisten = await listen('tauri://resize', async () => {
          try {
            const currentWindow = getCurrentWindow();
            const maximized = await currentWindow.isMaximized();
            if (isMounted) {
              setIsMaximized(maximized);
            }
          } catch {
            // Silent fail - component will continue with current state
          }
        });
        if (isMounted) {
          unlistenRef.current = unlisten;
        }
      } catch {
        // Silent fail - component will not sync window state
      }
    };

    init();
    setupWindowListener();

    return () => {
      isMounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handleMaximize = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow();
      if (isMaximized) {
        await currentWindow.unmaximize();
      } else {
        await currentWindow.maximize();
      }
    } catch {
      // Silent fail - user can try again
    }
  }, [isMaximized]);

  const handleMinimize = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.minimize();
    } catch {
      // Silent fail - user can try again
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch {
      // Silent fail - user can try again
    }
  }, []);

  return {
    isMaximized,
    handleMaximize,
    handleMinimize,
    handleClose,
  };
};
