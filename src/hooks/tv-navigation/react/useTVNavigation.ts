// REACT HOOK - UI Layer
// Thin wrapper that connects engine to React

import { useEffect, useRef, useCallback } from 'react';
import { findNextNode, Direction, NavigationState } from '../core/engine';
import { buildNavigationState, findElementById, filterVisibleElements, isVisible } from '../adapters/domAdapter';
import { gridPlugin, containerPlugin, wrapPlugin, spatialPlugin } from '../plugins';

interface TVNavigationOptions {
  selector?: string;
  elements?: HTMLElement[];
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
  onTVFocus?: (element: HTMLElement) => void;
  plugins?: any[];
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const { 
    selector = '[data-tv-focusable]', 
    elements: externalElements, 
    onBack, 
    onEnter, 
    onTVFocus,
    plugins: customPlugins = []
  } = options;

  // Use refs for callbacks to avoid re-registering listeners
  const onBackRef = useRef(onBack);
  const onEnterRef = useRef(onEnter);
  const onTVFocusRef = useRef(onTVFocus);

  // Update refs when props change
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  useEffect(() => { onTVFocusRef.current = onTVFocus; }, [onTVFocus]);

  const elementsRef = useRef<HTMLElement[]>([]);
  const stateRef = useRef<NavigationState>();
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastFocusedByContainer = useRef<Map<string, HTMLElement>>(new Map());
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Combine default plugins with custom plugins
  const allPlugins = [containerPlugin, gridPlugin, wrapPlugin, spatialPlugin, ...customPlugins];

  const getFocusableElements = useCallback(() => {
    if (externalElements) {
      const elements = externalElements;
      if (activeContainerRef.current) {
        return elements.filter(el => activeContainerRef.current?.contains(el));
      }
      return elements;
    }

    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (activeContainerRef.current) {
      return elements.filter(el => activeContainerRef.current?.contains(el));
    }

    return elements;
  }, [selector, externalElements]);

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
    if (currentElementRef.current === el) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    onTVFocusRef.current?.(el);

    // Save last focused element per container
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      lastFocusedByContainer.current.set(container.id, el);
    }
  }, []);

  const setActiveContainer = useCallback((container: HTMLElement | null) => {
    activeContainerRef.current = container;
  }, []);

  const updateState = useCallback(() => {
    const elements = getFocusableElements();
    const visibleElements = filterVisibleElements(elements);
    elementsRef.current = visibleElements;

    const currentId = currentElementRef.current 
      ? (currentElementRef.current.dataset.tvId ?? currentElementRef.current.id)
      : null;

    stateRef.current = buildNavigationState(visibleElements, currentId);
  }, [getFocusableElements]);

  const move = useCallback((direction: Direction) => {
    if (!stateRef.current) return;

    const nextId = findNextNode(stateRef.current, direction, allPlugins);
    if (!nextId) return;

    const el = findElementById(elementsRef.current, nextId);
    if (el) {
      focusElement(el);
    }
  }, [allPlugins, focusElement]);

  useEffect(() => {
    let scheduled = false;

    const update = () => {
      if (scheduled) return;
      scheduled = true;

      requestAnimationFrame(() => {
        updateState();
        scheduled = false;
      });
    };

    update();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    let mutationScheduled = false;
    const observer = new MutationObserver(() => {
      if (mutationScheduled) return;
      mutationScheduled = true;

      requestAnimationFrame(() => {
        update();
        mutationScheduled = false;
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer.disconnect();
      if (scrollTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, [updateState]);

  useEffect(() => {
    const focusTimeout = setTimeout(() => {
      const elements = getFocusableElements();
      elementsRef.current = elements;

      if (elements.length > 0 && !currentElementRef.current) {
        const visibleContainer = Array.from(document.querySelectorAll('[data-tv-container]'))
          .find(c => {
            const rect = c.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
          }) as HTMLElement;

        if (visibleContainer?.id) {
          const lastFocused = lastFocusedByContainer.current.get(visibleContainer.id);
          if (lastFocused && elements.includes(lastFocused)) {
            focusElement(lastFocused);
            return;
          }
        }

        const preferred = elements.find(el => el.dataset.tvInitial !== undefined);
        focusElement(preferred ?? elements[0] ?? null);
      }
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, () => void> = {
        ArrowRight: () => move('right'),
        Right: () => move('right'),
        ArrowLeft: () => {
          const current = currentElementRef.current;
          const isInSidebar = current?.closest('[data-tv-container="navigation"]') !== null;
          if (!isInSidebar) {
            move('left');
          }
        },
        Left: () => {
          const current = currentElementRef.current;
          const isInSidebar = current?.closest('[data-tv-container="navigation"]') !== null;
          if (!isInSidebar) {
            move('left');
          }
        },
        ArrowDown: () => move('down'),
        Down: () => move('down'),
        ArrowUp: () => {
          const current = currentElementRef.current;
          const isOnSearchInput = current?.dataset.tvSearch !== undefined;
          if (!isOnSearchInput) {
            move('up');
          }
        },
        Up: () => {
          const current = currentElementRef.current;
          const isOnSearchInput = current?.dataset.tvSearch !== undefined;
          if (!isOnSearchInput) {
            move('up');
          }
        },
        Enter: () => {
          const current = currentElementRef.current;
          if (current) {
            onEnterRef.current?.(current);
            current.click();
          }
        },
        OK: () => {
          const current = currentElementRef.current;
          if (current) {
            onEnterRef.current?.(current);
            current.click();
          }
        },
        Select: () => {
          const current = currentElementRef.current;
          if (current) {
            onEnterRef.current?.(current);
            current.click();
          }
        },
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

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (elementsRef.current.includes(target)) {
        currentElementRef.current = target;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);

    return () => {
      clearTimeout(focusTimeout);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [getFocusableElements, move, focusElement]);

  return { focusElement, setActiveContainer, move };
}
