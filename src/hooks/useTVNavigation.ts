import { useEffect, useRef, useCallback } from 'react';

interface TVNavigationOptions {
  selector?: string;
  elements?: HTMLElement[];
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
  onTVFocus?: (element: HTMLElement) => void;
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const { selector = '[data-tv-focusable]', elements: externalElements, onBack, onEnter, onTVFocus } = options;
  const focusableElementsRef = useRef<HTMLElement[]>([]);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastFocusedByContainer = useRef<Map<string, HTMLElement>>(new Map());
  const rectCache = useRef<Map<HTMLElement, DOMRect>>(new Map());
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastPositionByAxis = useRef({ x: 0, y: 0 });
  const lastXByRow = useRef<Map<number, number>>(new Map()); // ROW MEMORY: store X position per row

  const getFocusableElements = useCallback(() => {
    // Use external elements if provided (more efficient than DOM query)
    if (externalElements) {
      const elements = externalElements;
      // Filter by active container if set (focus trap for modals, sidebars, etc.)
      if (activeContainerRef.current) {
        return elements.filter(el => activeContainerRef.current?.contains(el));
      }
      return elements;
    }

    // Fallback to DOM query
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

    // Filter by active container if set (focus trap for modals, sidebars, etc.)
    if (activeContainerRef.current) {
      return elements.filter(el => activeContainerRef.current?.contains(el));
    }

    return elements;
  }, [selector, externalElements]);

  const isVisible = (el: HTMLElement) => {
    const style = window.getComputedStyle(el);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const scrollToElement = (el: HTMLElement) => {
    if (scrollTimeoutRef.current !== null) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      scrollTimeoutRef.current = null;
    });
  };

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    // Call onTVFocus for side effects (preload, analytics, etc.)
    onTVFocus?.(el);

    // Save last focused element per container
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      lastFocusedByContainer.current.set(container.id, el);
    }
  }, [onTVFocus]);

  const setActiveContainer = useCallback((container: HTMLElement | null) => {
    activeContainerRef.current = container;
  }, []);

  const findNextElement = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    let elements = focusableElementsRef.current;

    // Filter by active container if set (focus trap for modals, sidebars, etc.)
    if (activeContainerRef.current) {
      elements = elements.filter(el => activeContainerRef.current?.contains(el));
    }

    const current = currentElementRef.current;

    // Fallback if current element was removed from DOM
    if (!current || !document.contains(current)) {
      const fallbackElement = elements[0] ?? null;
      currentElementRef.current = fallbackElement;
      return fallbackElement;
    }

    const currentContainer = current.closest('[data-tv-container]');

    // Prefer same container: first search within current container
    const scopedElements = elements.filter(
      el => el.closest('[data-tv-container]') === currentContainer
    );

    const searchInElements = (searchElements: HTMLElement[]) => {
      const currentRect = rectCache.current.get(current) || current.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      // ROW MEMORY: Store X position for the current row when moving horizontally
      const currentRow = Math.round(currentCenterY / currentRect.height);
      if (direction === 'right' || direction === 'left') {
        lastXByRow.current.set(currentRow, currentCenterX);
      }

      // Store current position before moving (for directional memory)
      if (direction === 'down') {
        lastPositionByAxis.current.x = currentCenterX;
      } else if (direction === 'right') {
        lastPositionByAxis.current.y = currentCenterY;
      }

      let bestElement: HTMLElement | null = null;
      let bestDistance = Infinity;

      searchElements.forEach((el) => {
        if (el === current) return;
        if (!isVisible(el)) return;
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;

        const rect = rectCache.current.get(el);
        if (!rect) return;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = centerX - currentCenterX;
        const deltaY = centerY - currentCenterY;

        // Grid-aware: detect if element is in same row/column
        const sameRow = Math.abs(deltaY) < currentRect.height * 0.5;
        const sameColumn = Math.abs(deltaX) < currentRect.width * 0.5;

        const overlapsVertically =
          rect.top < currentRect.bottom &&
          rect.bottom > currentRect.top;

        let isValid = false;
        let distance = 0;
        let priority = 0;

        switch (direction) {
          case 'right':
            isValid = deltaX > 0;
            distance = deltaX + Math.abs(deltaY) * 5; // Heavy penalty for vertical deviation
            if (sameRow) priority += 3000; // Strong preference for same row
            if (overlapsVertically) priority += 2000;
            break;
          case 'left':
            isValid = deltaX < 0;
            distance = Math.abs(deltaX) + Math.abs(deltaY) * 5;
            if (sameRow) priority += 3000;
            if (overlapsVertically) priority += 2000;
            // Prefer elements close to stored Y position (directional memory)
            const yDistanceFromMemory = Math.abs(centerY - lastPositionByAxis.current.y);
            priority -= yDistanceFromMemory * 10;
            break;
          case 'down':
            isValid = deltaY > 0;
            distance = deltaY + Math.abs(deltaX) * 5;
            if (sameColumn) priority += 3000; // Strong preference for same column
            // ROW MEMORY: Prefer elements close to stored X position for target row
            const targetRowDown = Math.round(centerY / currentRect.height);
            const rememberedXDown = lastXByRow.current.get(targetRowDown) || lastPositionByAxis.current.x;
            const xDistanceFromMemoryDown = Math.abs(centerX - rememberedXDown);
            priority -= xDistanceFromMemoryDown * 20; // Stronger preference for ROW MEMORY
            break;
          case 'up':
            isValid = deltaY < 0;
            distance = Math.abs(deltaY) + Math.abs(deltaX) * 5;
            if (sameColumn) priority += 3000;
            // ROW MEMORY: Prefer elements close to stored X position for target row
            const targetRowUp = Math.round(centerY / currentRect.height);
            const rememberedXUp = lastXByRow.current.get(targetRowUp) || lastPositionByAxis.current.x;
            const xDistanceFromMemoryUp = Math.abs(centerX - rememberedXUp);
            priority -= xDistanceFromMemoryUp * 20; // Stronger preference for ROW MEMORY
            break;
        }

        distance = distance - priority;

        if (isValid && distance < bestDistance) {
          bestDistance = distance;
          bestElement = el;
        }
      });

      return bestElement;
    };

    // First try to find element in the same container
    let bestElement = searchInElements(scopedElements);

    // If no element found in same container, try all elements
    if (!bestElement && scopedElements.length < elements.length) {
      bestElement = searchInElements(elements);
    }

    // Wrap-around navigation per container (Netflix/YouTube TV style)
    if (!bestElement && currentContainer) {
      const sameContainerElements = elements.filter(
        el => el.closest('[data-tv-container]') === currentContainer
      );

      if (sameContainerElements.length > 0) {
        if (direction === 'right' || direction === 'down') {
          return sameContainerElements[0];
        }
        if (direction === 'left' || direction === 'up') {
          return sameContainerElements.at(-1) ?? null;
        }
      }
    }

    return bestElement ?? current;
  }, []);

  useEffect(() => {
    let scheduled = false;

    const update = () => {
      if (scheduled) return;
      scheduled = true;

      requestAnimationFrame(() => {
        const elements = getFocusableElements();
        focusableElementsRef.current = elements;

        const newCache = new Map<HTMLElement, DOMRect>();
        elements.forEach(el => {
          if (isVisible(el)) {
            newCache.set(el, el.getBoundingClientRect());
          }
        });
        rectCache.current = newCache;

        scheduled = false;
      });
    };

    update();

    // Only listen to resize and scroll, not DOM mutations
    // Components should pass updated elements list via props
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [getFocusableElements]);

  useEffect(() => {
    // Auto-focus first element on mount, or restore last focused per container
    if (focusableElementsRef.current.length > 0 && !currentElementRef.current) {
      // Try to restore last focused element for visible container
      const visibleContainer = Array.from(document.querySelectorAll('[data-tv-container]'))
        .find(c => {
          const rect = c.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        }) as HTMLElement;
      
      if (visibleContainer?.id) {
        const lastFocused = lastFocusedByContainer.current.get(visibleContainer.id);
        if (lastFocused && focusableElementsRef.current.includes(lastFocused)) {
          focusElement(lastFocused);
          return;
        }
      }
      
      // Prefer element with data-tv-initial attribute for initial focus
      const preferred = focusableElementsRef.current.find(el => el.hasAttribute('data-tv-initial'));
      focusElement(preferred ?? focusableElementsRef.current[0] ?? null);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'Right':
          e.preventDefault();
          focusElement(findNextElement('right'));
          break;
        case 'ArrowLeft':
        case 'Left':
          e.preventDefault();
          focusElement(findNextElement('left'));
          break;
        case 'ArrowDown':
        case 'Down':
          e.preventDefault();
          focusElement(findNextElement('down'));
          break;
        case 'ArrowUp':
        case 'Up':
          e.preventDefault();
          focusElement(findNextElement('up'));
          break;
        case 'Enter':
        case 'OK':
        case 'Select': {
          e.preventDefault();
          const current = currentElementRef.current;
          if (current) {
            onEnter?.(current);
            current.click();
          }
          break;
        }
        case 'Backspace':
        case 'Escape':
        case 'Back': {
          // Don't intercept backspace if user is typing in an input field
          const isTyping =
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            (e.target as HTMLElement).isContentEditable;

          if (e.key === 'Backspace' && isTyping) return;
          e.preventDefault();
          onBack?.();
          break;
        }
      }
    };

    // Handle focus changes from mouse/touch
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (focusableElementsRef.current.includes(target)) {
        currentElementRef.current = target;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [getFocusableElements, findNextElement, focusElement, onBack, onEnter]);

  return { focusElement, setActiveContainer };
}
