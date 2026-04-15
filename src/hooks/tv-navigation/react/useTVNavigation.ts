// REACT HOOK - UI Layer
// Thin wrapper that connects engine to React

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { findNextNode } from '../core/engine';
import { Direction, NavigationState, PluginContext, ContainerState } from '../core/types';
import { buildNavigationState, findElementById, filterVisibleElements } from '..';
import { gridPlugin, containerPlugin, wrapPlugin, spatialPlugin, initAutoFocus, navbarPlugin, trapFocusPlugin, settingsPlugin, movieDetailsPlugin } from '../plugins';
import { setActiveContainerId, saveContainerFocus, getLastFocus } from '../plugins/containerPlugin';

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
  const stateRef = useRef<NavigationState | undefined>(undefined);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Instance-scoped container state (prevents cross-instance bugs)
  const containerStateRef = useRef<ContainerState>({
    lastFocusedByContainer: new Map(),
    activeContainerId: null,
  });

  // Stable handler refs to avoid re-binding listeners
  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | undefined>(undefined);
  const handleFocusRef = useRef<((e: FocusEvent) => void) | undefined>(undefined);

  // Combine default plugins with custom plugins
  // Order: specific plugins first, then general plugins as fallback
  const allPlugins = useMemo(
    () => [settingsPlugin, trapFocusPlugin, navbarPlugin, movieDetailsPlugin, containerPlugin, gridPlugin, wrapPlugin, spatialPlugin, ...customPlugins],
    [customPlugins]
  );

  // Plugin context for unified container management (instance-scoped)
  const pluginContext = useMemo<PluginContext>(() => {
    // Create context object that captures containerStateRef
    const ctx: PluginContext = {
      setActiveContainer: (container) => {
        activeContainerRef.current = container;
        // Update instance-scoped state
        const newId = container?.id ?? null;
        setActiveContainerId(ctx, newId);
      },
      getActiveContainer: () => activeContainerRef.current,
      saveLastFocus: (containerId, element) => {
        saveContainerFocus(ctx, containerId, element.id);
      },
      getLastFocus: (containerId) => {
        const lastId = getLastFocus(ctx, containerId);
        if (!lastId) return null;
        return document.getElementById(lastId) || document.querySelector(`[data-tv-id="${lastId}"]`) as HTMLElement | null;
      },
      container: containerStateRef.current,
    };
    return ctx;
  }, []);

  const getFocusableElements = useCallback(() => {
    // Use container plugin's active container ID for filtering
    const activeContainer = activeContainerRef.current;

    if (externalElements) {
      const elements = externalElements;
      if (activeContainer) {
        return elements.filter(el => activeContainer.contains(el));
      }
      return elements;
    }

    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    // Filter out disabled elements
    const enabledElements = elements.filter(el =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-disabled') !== 'true' &&
      el.dataset.tvDisabled === undefined
    );

    if (activeContainer) {
      return enabledElements.filter(el => activeContainer.contains(el));
    }

    return enabledElements;
  }, [selector, externalElements]);

  const scrollToElement = (el: HTMLElement) => {
    if (scrollTimeoutRef.current !== null) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = requestAnimationFrame(() => {
      // Find the nearest scrollable ancestor (prefer the sidebar nav if inside it)
      const scrollableContainer = el.closest('[data-tv-container="navigation"] nav') ||
                                  el.closest('.overflow-y-auto') ||
                                  el.closest('[data-tv-container]') ||
                                  document.documentElement;

      if (scrollableContainer && scrollableContainer !== document.documentElement) {
        // Calculate scroll position to center the element
        const containerRect = scrollableContainer.getBoundingClientRect();
        const elementRect = el.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;
        const scrollTop = scrollableContainer.scrollTop + relativeTop - (containerRect.height / 2) + (elementRect.height / 2);

        scrollableContainer.scrollTo({
          top: scrollTop,
          behavior: 'auto'
        });
      } else {
        // Fallback to default scrollIntoView if no scrollable container found
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      scrollTimeoutRef.current = null;
    });
  };

  const updateState = useCallback(() => {
    const elements = getFocusableElements();
    const visibleElements = filterVisibleElements(elements);
    elementsRef.current = visibleElements;

    // Clear current element if detached from DOM
    if (currentElementRef.current && !document.contains(currentElementRef.current)) {
      currentElementRef.current = null;
    }

    const currentId = currentElementRef.current
      ? (currentElementRef.current.dataset.tvId ?? currentElementRef.current.id)
      : null;

    stateRef.current = buildNavigationState(visibleElements, currentId);
  }, [getFocusableElements]);

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (currentElementRef.current === el) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    onTVFocusRef.current?.(el);

    // Save last focused element per container (via plugin context)
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      saveContainerFocus(pluginContext, container.id, el.id || el.dataset.tvId || '');
    }

    // Update state with new currentId
    updateState();
  }, [updateState, pluginContext]);


  const setActiveContainer = useCallback((container: HTMLElement | null) => {
    pluginContext.setActiveContainer(container);
    // Notify container plugin
    if (containerPlugin.onContainerChange) {
      containerPlugin.onContainerChange(container, pluginContext);
    }
  }, [pluginContext]);

  const move = useCallback((direction: Direction) => {
    if (!stateRef.current) return;

    const result = findNextNode(stateRef.current, direction, allPlugins, pluginContext);
    if (!result) return;

    // Handle action intents (e.g., BACK)
    if (result.action === 'BACK') {
      onBackRef.current?.();
      return;
    }

    // Handle targetId navigation
    if (result.targetId) {
      const el = findElementById(elementsRef.current, result.targetId);
      if (el) {
        focusElement(el);
      }
    }
  }, [allPlugins, focusElement, pluginContext]);

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
    const observer = new MutationObserver((mutations) => {
      // Only process mutations that add or remove nodes
      if (!mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        return;
      }
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

  // Auto-focus initial element when new containers appear (e.g., modals)
  // Auto-focus initial element handled by initAutoFocus plugin
  useEffect(() => {
    return initAutoFocus();
  }, []);

  // Update handler refs when dependencies change
  useEffect(() => {
    handleKeyDownRef.current = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const isTyping =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable;

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
          if (!isTyping) {
            const current = currentElementRef.current;
            const isInPortalActions = current?.closest('[data-tv-container="portal-actions"]') !== null;
            if (isInPortalActions) {
              move('back');
            } else {
              onBackRef.current?.();
            }
          }
        },
        Escape: () => {
          const current = currentElementRef.current;
          const isInPortalActions = current?.closest('[data-tv-container="portal-actions"]') !== null;
          if (isInPortalActions) {
            move('back');
          } else {
            onBackRef.current?.();
          }
        },
        Back: () => {
          const current = currentElementRef.current;
          const isInPortalActions = current?.closest('[data-tv-container="portal-actions"]') !== null;
          if (isInPortalActions) {
            move('back');
          } else {
            onBackRef.current?.();
          }
        },
      };

      const handler = keyMap[e.key];
      if (handler) {
        // Don't prevent default if user is typing and pressed Backspace
        if (!(isTyping && e.key === 'Backspace')) {
          e.preventDefault();
        }
        handler();
      }
    };
  }, [move]);

  useEffect(() => {
    handleFocusRef.current = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('[data-tv-focusable]') || target.closest('[data-tv-focusable]')) {
        currentElementRef.current = target;
        updateState();
      }
    };
  }, [updateState]);

  // Stable event listeners - never re-bind
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    const focusHandler = (e: FocusEvent) => handleFocusRef.current?.(e);

    globalThis.addEventListener('keydown', keyHandler);
    document.addEventListener('focusin', focusHandler);

    return () => {
      globalThis.removeEventListener('keydown', keyHandler);
      document.removeEventListener('focusin', focusHandler);
    };
  }, []);

  return { focusElement, setActiveContainer, move };
}
