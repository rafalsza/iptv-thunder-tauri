import { useEffect, useRef, useCallback, useMemo } from 'react';
import { findNextNode, gridPlugin, containerPlugin, wrapPlugin, spatialPlugin, Direction, NavigationState, buildNavigationState, findElementById, filterVisibleElements, type NavigationPlugin } from './tv-navigation';

// Ownership tracking for active container across all hook instances
let globalActiveContainer: HTMLElement | null = null;
let ownerId: symbol | null = null;

interface TVNavigationOptions {
  selector?: string;
  elements?: HTMLElement[];
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
  onTVFocus?: (element: HTMLElement) => void;
  plugins?: NavigationPlugin[];
  rootElement?: HTMLElement; // Custom root for MutationObserver
  scrollBehavior?: (el: HTMLElement) => void; // Custom scroll handler
  onKeyDown?: (e: KeyboardEvent, api: { move: (dir: Direction) => void }) => boolean | void; // Return true to stop default
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const {
    selector = '[data-tv-focusable]',
    elements: externalElements,
    onBack,
    onEnter,
    onTVFocus,
    plugins: customPlugins = [],
    rootElement,
    scrollBehavior,
    onKeyDown
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
  const stateRef = useRef<NavigationState | undefined>(undefined);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastFocusedByContainer = useRef<Map<string, HTMLElement>>(new Map());
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Combine default plugins with custom plugins
  // Order: grid -> container (transitions/wrap) -> spatial (same container fallback)
  const allPlugins = useMemo(
    () => [gridPlugin, containerPlugin, spatialPlugin, wrapPlugin, ...customPlugins],
    [customPlugins]
  );

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

  const scrollToElement = useCallback((el: HTMLElement) => {
    if (scrollTimeoutRef.current !== null) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = requestAnimationFrame(() => {
      if (scrollBehavior) {
        // Custom scroll behavior (e.g., for virtualized lists)
        scrollBehavior(el);
      } else {
        // Default: native scrollIntoView
        el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      }
      scrollTimeoutRef.current = null;
    });
  }, [scrollBehavior]);

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (currentElementRef.current === el) return;

    // Verify element is visible before focusing
    if (!el.offsetParent) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    onTVFocusRef.current?.(el);

    // Save last focused element per container
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      lastFocusedByContainer.current.set(container.id, el);
    }
  }, [scrollToElement]);

  // Instance ID for ownership tracking
  const instanceId = useRef(Symbol());

  const setActiveContainer = useCallback((container: HTMLElement | null) => {
    // Ownership-based tracking: prevents race conditions
    if (container) {
      globalActiveContainer = container;
      ownerId = instanceId.current;
      activeContainerRef.current = container;
    } else if (ownerId === instanceId.current) {
      // Only clear if WE are the owner
      globalActiveContainer = null;
      ownerId = null;
      activeContainerRef.current = null;
    }
  }, []);

  // Cleanup on unmount to prevent globalActiveContainer from getting stuck
  useEffect(() => {
    return () => {
      if (ownerId === instanceId.current) {
        globalActiveContainer = null;
        ownerId = null;
      }
      if (scrollTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, []);

  const updateState = useCallback(() => {
    const elements = getFocusableElements();
    const visibleElements = filterVisibleElements(elements);
    elementsRef.current = visibleElements;

    // Clear stale reference if current element is no longer visible/available
    if (currentElementRef.current && !visibleElements.includes(currentElementRef.current)) {
      currentElementRef.current = null;
    }

    console.log('[TVNav] updateState, elements found:', visibleElements.length);
    console.log('[TVNav] elements:', visibleElements.map(el => ({
      id: el.dataset.tvId ?? el.id,
      container: (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer,
      group: (el.closest('[data-tv-group]') as HTMLElement | null)?.dataset.tvGroup
    })));

    const currentId = currentElementRef.current
      ? (currentElementRef.current.dataset.tvId || currentElementRef.current.id || null)
      : null;
    console.log('[TVNav] updateState currentId:', currentId, 'currentElement:', currentElementRef.current?.tagName);

    stateRef.current = buildNavigationState(visibleElements, currentId);
    console.log('[TVNav] state built, nodes:', stateRef.current?.nodes.map(n => ({id: n.id, containerId: n.containerId})));
  }, [getFocusableElements]);

  const move = useCallback((direction: Direction) => {
    console.log('[TVNav] move called:', direction);
    console.log('[TVNav] state:', stateRef.current);
    console.log('[TVNav] elements count:', elementsRef.current.length);
    console.log('[TVNav] current element:', currentElementRef.current?.id);

    if (!stateRef.current) {
      console.log('[TVNav] no state, aborting');
      return;
    }

    const nextId = findNextNode(stateRef.current, direction, allPlugins);
    console.log('[TVNav] nextId from engine:', nextId);

    if (!nextId) {
      console.log('[TVNav] no nextId found');
      return;
    }

    const el = findElementById(elementsRef.current, nextId);
    console.log('[TVNav] found element:', el?.id);
    // Safety: verify element is still in DOM before focusing
    if (el && document.contains(el)) {
      // Update state currentId before focusing
      if (stateRef.current) {
        stateRef.current = {
          ...stateRef.current,
          currentId: nextId,
        };
      }
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

    // Separate throttled scroll handler for performance
    let scrollTimeout: number | null = null;
    const throttledScroll = () => {
      if (scrollTimeout !== null) return;
      scrollTimeout = globalThis.setTimeout(() => {
        update();
        scrollTimeout = null;
      }, 50);
    };
    window.addEventListener('scroll', throttledScroll, true);

    let mutationScheduled = false;
    const observer = new MutationObserver(() => {
      if (mutationScheduled) return;
      mutationScheduled = true;

      requestAnimationFrame(() => {
        update();
        mutationScheduled = false;
      });
    });
    // Scope to custom root, active container, or document.body
    const root = rootElement ?? activeContainerRef.current ?? document.body;
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', throttledScroll, true);
      if (scrollTimeout !== null) {
        clearTimeout(scrollTimeout);
      }
      observer.disconnect();
    };
  }, [updateState]);

  useEffect(() => {
    // Use layout timing instead of setTimeout for deterministic behavior
    const initFocus = () => {
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
    };

    // Double rAF ensures layout is complete
    let rafId: number;
    const scheduleFocus = () => {
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(initFocus);
      });
    };
    scheduleFocus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // If another instance manages an active container, skip handling
      if (globalActiveContainer && globalActiveContainer !== activeContainerRef.current) {
        return;
      }

      // Custom key handler - return true to stop default
      if (onKeyDown) {
        const shouldStop = onKeyDown(e, { move });
        if (shouldStop) {
          e.preventDefault();
          return;
        }
      }

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

    globalThis.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocus);

    return () => {
      cancelAnimationFrame(rafId);
      globalThis.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [getFocusableElements, move, focusElement]);

  return { focusElement, setActiveContainer, move };
}
