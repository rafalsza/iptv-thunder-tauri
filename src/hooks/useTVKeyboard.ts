import { useRef, useEffect } from 'react';

interface TVKeyboardOptions {
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
  onFocusNext?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  getCurrentElement?: () => HTMLElement | null;
  getGlobalActiveContainer?: () => HTMLElement | null;
  getLocalActiveContainer?: () => HTMLElement | null;
}

export function useTVKeyboard(options: TVKeyboardOptions = {}) {
  const { 
    onBack, 
    onEnter, 
    onFocusNext,
    getCurrentElement,
    getGlobalActiveContainer,
    getLocalActiveContainer
  } = options;
  
  const onBackRef = useRef(onBack);
  const onEnterRef = useRef(onEnter);
  const onFocusNextRef = useRef(onFocusNext);
  
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  useEffect(() => { onFocusNextRef.current = onFocusNext; }, [onFocusNext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const globalActiveContainer = getGlobalActiveContainer?.();
      const localActiveContainer = getLocalActiveContainer?.();
      
      if (globalActiveContainer && globalActiveContainer !== localActiveContainer) {
        return;
      }

      const handleNavigation = (direction: 'up' | 'down' | 'left' | 'right') => {
        if (direction === 'up') {
          const current = getCurrentElement?.();
          const isOnSearchInput = current?.dataset.tvSearch !== undefined;
          if (!isOnSearchInput) {
            onFocusNextRef.current?.(direction);
          }
        } else if (direction === 'left') {
          const current = getCurrentElement?.();
          const isInSidebar = current?.closest('[data-tv-container="navigation"]') !== null;
          if (!isInSidebar) {
            onFocusNextRef.current?.(direction);
          }
        } else {
          onFocusNextRef.current?.(direction);
        }
      };

      const handleEnter = () => {
        const current = getCurrentElement?.();
        if (current) {
          onEnterRef.current?.(current);
          current.click();
        }
      };

      const keyMap: Record<string, () => void> = {
        Right: () => handleNavigation('right'),
        Left: () => handleNavigation('left'),
        Down: () => handleNavigation('down'),
        Up: () => handleNavigation('up'),
        Enter: handleEnter,
        OK: handleEnter,
        Select: handleEnter,
        // eslint-disable-next-line @typescript-eslint/no-unused-property
        Backspace: () => {
          const isTyping =
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            (e.target as HTMLElement).isContentEditable;
          if (!isTyping) {
            onBackRef.current?.();
          }
        },
        Escape: () => onBackRef.current?.(),
        Back: () => onBackRef.current?.(),
      };

      const handler = keyMap[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getCurrentElement, getGlobalActiveContainer, getLocalActiveContainer]);

  return {};
}
