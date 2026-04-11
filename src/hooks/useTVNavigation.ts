import { useEffect, useRef, useCallback } from 'react';

interface TVNavigationOptions {
  selector?: string;
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const { selector = '[data-tv-focusable]', onBack, onEnter } = options;
  const focusableElementsRef = useRef<HTMLElement[]>([]);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastFocusedByContainer = useRef<Map<string, HTMLElement>>(new Map());
  const rectCache = useRef<Map<HTMLElement, DOMRect>>(new Map());
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastPositionByAxis = useRef({ x: 0, y: 0 });

  const getFocusableElements = useCallback(() => {
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

    // Filter by active container if set (focus trap for modals, sidebars, etc.)
    if (activeContainerRef.current) {
      return elements.filter(el => activeContainerRef.current?.contains(el));
    }

    return elements;
  }, [selector]);

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
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      scrollTimeoutRef.current = null;
    });
  };

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    // Save last focused element per container
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      lastFocusedByContainer.current.set(container.id, el);
    }
  }, []);

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

        const isHorizontallyAligned = Math.abs(deltaY) < currentRect.height * 0.6;
        const isVerticallyAligned = Math.abs(deltaX) < currentRect.width * 0.6;

        const overlapsVertically =
          rect.top < currentRect.bottom &&
          rect.bottom > currentRect.top;

        let isValid = false;
        let distance = 0;
        let priority = 0;

        switch (direction) {
          case 'right':
            isValid = deltaX > 0 && isHorizontallyAligned;
            distance = deltaX + Math.abs(deltaY) * 2;
            if (isHorizontallyAligned) priority += 1000;
            if (overlapsVertically) priority += 2000;
            break;
          case 'left':
            isValid = deltaX < 0 && isHorizontallyAligned;
            distance = Math.abs(deltaX) + Math.abs(deltaY) * 2;
            if (isHorizontallyAligned) priority += 1000;
            if (overlapsVertically) priority += 2000;
            // Prefer elements close to stored Y position (directional memory)
            const yDistanceFromMemory = Math.abs(centerY - lastPositionByAxis.current.y);
            priority -= yDistanceFromMemory * 0.5;
            break;
          case 'down':
            isValid = deltaY > 0 && isVerticallyAligned;
            distance = deltaY + Math.abs(deltaX) * 2;
            if (isVerticallyAligned) priority += 1000;
            break;
          case 'up':
            isValid = deltaY < 0 && isVerticallyAligned;
            distance = Math.abs(deltaY) + Math.abs(deltaX) * 2;
            if (isVerticallyAligned) priority += 1000;
            // Prefer elements close to stored X position (directional memory)
            const xDistanceFromMemory = Math.abs(centerX - lastPositionByAxis.current.x);
            priority -= xDistanceFromMemory * 0.5;
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

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      observer.disconnect();
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
