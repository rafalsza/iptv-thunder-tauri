import { useEffect, useRef, useCallback } from 'react';

interface TVNavigationOptions {
  selector?: string;
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const { selector = '[data-tv-focusable]', onBack, onEnter } = options;
  const focusableElementsRef = useRef<HTMLElement[]>([]);
  const currentIndexRef = useRef<number>(-1);

  const getFocusableElements = useCallback(() => {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  }, [selector]);

  const focusElement = useCallback((index: number) => {
    const elements = focusableElementsRef.current;
    if (index >= 0 && index < elements.length) {
      elements[index].focus();
      elements[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      currentIndexRef.current = index;
    }
  }, []);

  const findNextIndex = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const elements = focusableElementsRef.current;
    const current = elements[currentIndexRef.current];
    if (!current) return 0;

    const currentRect = current.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let bestIndex = -1;
    let bestDistance = Infinity;

    elements.forEach((el, index) => {
      if (index === currentIndexRef.current) return;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let isValid = false;
      let distance = 0;

      switch (direction) {
        case 'right':
          isValid = centerX > currentCenterX && Math.abs(centerY - currentCenterY) < currentRect.height;
          distance = Math.abs(centerX - currentCenterX) + Math.abs(centerY - currentCenterY) * 2;
          break;
        case 'left':
          isValid = centerX < currentCenterX && Math.abs(centerY - currentCenterY) < currentRect.height;
          distance = Math.abs(currentCenterX - centerX) + Math.abs(centerY - currentCenterY) * 2;
          break;
        case 'down':
          isValid = centerY > currentCenterY && Math.abs(centerX - currentCenterX) < currentRect.width;
          distance = Math.abs(centerY - currentCenterY) + Math.abs(centerX - currentCenterX) * 2;
          break;
        case 'up':
          isValid = centerY < currentCenterY && Math.abs(centerX - currentCenterX) < currentRect.width;
          distance = Math.abs(currentCenterY - centerY) + Math.abs(centerX - currentCenterX) * 2;
          break;
      }

      if (isValid && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex >= 0 ? bestIndex : currentIndexRef.current;
  }, []);

  useEffect(() => {
    focusableElementsRef.current = getFocusableElements();

    // Auto-focus first element on mount
    if (focusableElementsRef.current.length > 0 && currentIndexRef.current === -1) {
      focusElement(0);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Update focusable elements list
      focusableElementsRef.current = getFocusableElements();

      switch (e.key) {
        case 'ArrowRight':
        case 'Right':
          e.preventDefault();
          focusElement(findNextIndex('right'));
          break;
        case 'ArrowLeft':
        case 'Left':
          e.preventDefault();
          focusElement(findNextIndex('left'));
          break;
        case 'ArrowDown':
        case 'Down':
          e.preventDefault();
          focusElement(findNextIndex('down'));
          break;
        case 'ArrowUp':
        case 'Up':
          e.preventDefault();
          focusElement(findNextIndex('up'));
          break;
        case 'Enter':
        case 'OK':
        case 'Select':
          e.preventDefault();
          const current = focusableElementsRef.current[currentIndexRef.current];
          if (current) {
            onEnter?.(current);
            current.click();
          }
          break;
        case 'Backspace':
        case 'Escape':
        case 'Back':
          e.preventDefault();
          onBack?.();
          break;
      }
    };

    // Handle focus changes from mouse/touch
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const index = focusableElementsRef.current.indexOf(target);
      if (index >= 0) {
        currentIndexRef.current = index;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [getFocusableElements, findNextIndex, focusElement, onBack, onEnter]);

  return { focusElement };
}
