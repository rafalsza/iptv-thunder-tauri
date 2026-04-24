// REACT HOOK - UI Layer
// Thin wrapper that connects engine to React

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { findNextNode } from '../core/engine';
import { Direction, NavigationState, PluginContext, ContainerState } from '../core/types';
import { buildNavigationState, findElementById, filterVisibleElements } from '..';
import { gridPlugin, containerPlugin, wrapPlugin, spatialPlugin, initAutoFocus, navbarPlugin, trapFocusPlugin, settingsPlugin, movieDetailsPlugin, modalTrapPlugin } from '../plugins';
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
    () => [settingsPlugin, modalTrapPlugin, trapFocusPlugin, navbarPlugin, movieDetailsPlugin, containerPlugin, gridPlugin, wrapPlugin, spatialPlugin, ...customPlugins],
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

    // Use more specific selector to limit elements processed
    const specificSelector = activeContainer 
      ? `${selector} [data-tv-container="${activeContainer.dataset.tvContainer}"], ${selector}[data-tv-container="${activeContainer.dataset.tvContainer}"]`
      : selector;
    
    const elements = Array.from(document.querySelectorAll(specificSelector)) as HTMLElement[];
    
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
                                  el.closest('.overflow-x-auto') ||
                                  el.closest('[data-tv-container]') ||
                                  document.documentElement;

      if (scrollableContainer && scrollableContainer !== document.documentElement) {
        const containerRect = (scrollableContainer as HTMLElement).getBoundingClientRect();
        const elementRect = el.getBoundingClientRect();
        const isHorizontal = scrollableContainer.classList.contains('overflow-x-auto') ||
                             (scrollableContainer as HTMLElement).style.overflowX === 'auto' ||
                             (scrollableContainer as HTMLElement).style.overflowX === 'scroll';

        if (isHorizontal) {
          // Horizontal carousel - center element horizontally
          const relativeLeft = elementRect.left - containerRect.left;
          const scrollLeft = scrollableContainer.scrollLeft + relativeLeft - (containerRect.width / 2) + (elementRect.width / 2);

          scrollableContainer.scrollTo({
            left: scrollLeft,
            behavior: 'auto'
          });
        } else {
          // Vertical scroll - center element vertically
          const relativeTop = elementRect.top - containerRect.top;
          const scrollTop = scrollableContainer.scrollTop + relativeTop - (containerRect.height / 2) + (elementRect.height / 2);

          scrollableContainer.scrollTo({
            top: scrollTop,
            behavior: 'auto'
          });
        }
      } else {
        // Fallback to default scrollIntoView if no scrollable container found
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
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
    console.log('[useTVNavigation] focusElement called:', el?.dataset?.tvId ?? el?.id, 'currentElementRef:', currentElementRef.current?.dataset?.tvId ?? currentElementRef.current?.id, 'document.activeElement:', (document.activeElement as HTMLElement | null)?.dataset?.tvId ?? document.activeElement?.id);
    if (!el) return;
    if (currentElementRef.current === el) {
      console.log('[useTVNavigation] focusElement: same element, skipping');
      return;
    }

    // Remove .tv-focused from previous element
    if (currentElementRef.current) {
      currentElementRef.current.classList.remove('tv-focused');
    }

    el.focus({ preventScroll: true });
    el.classList.add('tv-focused');
    console.log('[useTVNavigation] focusElement: el.focus() called, new activeElement:', (document.activeElement as HTMLElement | null)?.dataset?.tvId ?? document.activeElement?.id);

    // Special case: reset scroll to top when focusing first element of for-you-live
    const isFirstForYouLive = el.dataset.tvGroup === 'for-you-live' && el.dataset.tvIndex === '0';
    if (isFirstForYouLive) {
      // Use requestAnimationFrame to ensure it happens after all layout/focus changes
      requestAnimationFrame(() => {
        // Find and reset ALL scrollable elements
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll' || (el as HTMLElement).scrollTop > 0) {
            (el as HTMLElement).scrollTo({ top: 0, behavior: 'auto' });
          }
        });
        window.scrollTo({ top: 0, behavior: 'auto' });
        // Update state after scroll reset completes
        updateState();
      });
    } else {
      scrollToElement(el);
    }

    currentElementRef.current = el;

    onTVFocusRef.current?.(el);

    // Save last focused element per container (via plugin context)
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      saveContainerFocus(pluginContext, container.id, el.id || el.dataset.tvId || '');
    }

    // Update state with new currentId - defer to RAF to ensure scroll completes first
    // (unless already handled in the for-you-live case above)
    if (!isFirstForYouLive) {
      requestAnimationFrame(() => {
        updateState();
      });
    }
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

    const resizeListener = () => update();
    
    // Throttled scroll listener to prevent excessive updates during fast scrolling
    let scrollTimeout: number | null = null;
    const scrollListener = () => {
      if (scrollTimeout) return;
      scrollTimeout = window.setTimeout(() => {
        update();
        scrollTimeout = null;
      }, 16); // ~60fps throttling
    };
    
    window.addEventListener('resize', resizeListener);
    window.addEventListener('scroll', scrollListener, true);

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
      window.removeEventListener('resize', resizeListener);
      window.removeEventListener('scroll', scrollListener, true);
      observer.disconnect();
      if (scrollTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
      if (scrollTimeout !== null) {
        clearTimeout(scrollTimeout);
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
      // Check if document.activeElement matches our tracked current element
      // If not, sync our state to match the actual DOM focus
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && activeEl !== currentElementRef.current) {
        if (activeEl.matches('[data-tv-focusable]') || activeEl.closest('[data-tv-focusable]')) {
          currentElementRef.current = activeEl;
          updateState();
        }
      }

      // Check if Radix Select/Dropdown is open - let Radix handle navigation
      const isSelectOpen = document.querySelector('[data-radix-select-viewport]') !== null ||
                           document.querySelector('[data-radix-popper-content-wrapper]') !== null ||
                           document.querySelector('[data-state="open"][role="combobox"]') !== null ||
                           document.querySelector('[data-state="open"][data-radix-menu-content]') !== null;
      if (isSelectOpen) {
        return; // Let Radix handle all keys when dropdown is open
      }

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
            // Special handling for select elements
            if (current instanceof HTMLSelectElement) {
              // Try to open select dropdown by dispatching mousedown event
              const mousedown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              current.dispatchEvent(mousedown);
              current.focus();
            } else {
              current.click();
            }
          }
        },
        OK: () => {
          const current = currentElementRef.current;
          if (current) {
            onEnterRef.current?.(current);
            if (current instanceof HTMLSelectElement) {
              const mousedown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              current.dispatchEvent(mousedown);
              current.focus();
            } else {
              current.click();
            }
          }
        },
        Select: () => {
          const current = currentElementRef.current;
          if (current) {
            onEnterRef.current?.(current);
            if (current instanceof HTMLSelectElement) {
              const mousedown = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              current.dispatchEvent(mousedown);
              current.focus();
            } else {
              current.click();
            }
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
  }, [move, updateState]);

  // Track last focused element before Radix dropdown opened
  const lastFocusBeforeDropdownRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    handleFocusRef.current = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      // Check if Radix dropdown is currently open
      const isRadixOpen = document.querySelector('[data-radix-select-viewport]') !== null ||
                          document.querySelector('[data-radix-popper-content-wrapper]') !== null ||
                          document.querySelector('[data-radix-menu-content]') !== null;

      // If focus is moving into a Radix dropdown, save the current element
      if (isRadixOpen && target?.closest('[data-radix-popper-content-wrapper], [data-radix-menu-content]')) {
        // Focus moved inside dropdown - don't update
        return;
      }

      // If dropdown was open and now closed, restore focus to last element
      if (!isRadixOpen && lastFocusBeforeDropdownRef.current) {
        const savedElement = lastFocusBeforeDropdownRef.current;
        lastFocusBeforeDropdownRef.current = null;
        
        // Use multiple attempts to restore focus - Radix may move focus multiple times
        let attempts = 0;
        const maxAttempts = 5;
        const tryRestore = () => {
          const currentActive = document.activeElement as HTMLElement | null;
          const currentTvId = currentActive?.dataset?.tvId;
          const savedTvId = savedElement?.dataset?.tvId;
          
          // Restore if: body, no tv-id, or different element than saved
          // No tv-id means sidebar or other untracked element
          if (currentActive === document.body || 
              !currentTvId ||
              currentTvId !== savedTvId) {
            savedElement?.focus();
            
            // Try again if focus didn't stick
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryRestore, 50);
            }
          }
        };
        
        // Start restoration attempts
        setTimeout(tryRestore, 50);
      }

      // Check if this is a TV focusable element
      if (target.matches('[data-tv-focusable]') || target.closest('[data-tv-focusable]')) {
        const focusableEl = target.matches('[data-tv-focusable]') ? target : target.closest('[data-tv-focusable]');

        // If Radix is opening, save this element
        if (isRadixOpen && !lastFocusBeforeDropdownRef.current) {
          lastFocusBeforeDropdownRef.current = focusableEl as HTMLElement;
        }

        currentElementRef.current = focusableEl as HTMLElement;
        updateState();
      }
    };
  }, [updateState]);

  // Stable event listeners - never re-bind
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement;
      
      // Check if Radix dropdown is open - let it handle navigation naturally
      const isRadixOpen = document.querySelector('[data-radix-select-viewport]') !== null ||
                          document.querySelector('[data-radix-popper-content-wrapper]') !== null ||
                          document.querySelector('[data-radix-menu-content]') !== null;
      if (isRadixOpen) {
        // Don't block - let Radix handle the event
        return;
      }
      
      // If Enter is pressed on a Radix Select trigger, save focus before dropdown opens
      if (e.key === 'Enter' && targetEl?.dataset?.tvId === 'series-season-select') {
        lastFocusBeforeDropdownRef.current = targetEl;
      }

      // Block browser default navigation immediately for arrow keys
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Up', 'Down', 'Left', 'Right'];
      if (arrowKeys.includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      handleKeyDownRef.current?.(e);
    };
    const focusHandler = (e: FocusEvent) => handleFocusRef.current?.(e);

    // Use capturing phase to intercept before browser default navigation
    globalThis.addEventListener('keydown', keyHandler, true);
    document.addEventListener('focusin', focusHandler);

    return () => {
      globalThis.removeEventListener('keydown', keyHandler, true);
      document.removeEventListener('focusin', focusHandler);
    };
  }, []);

  return { focusElement, setActiveContainer, move };
}
