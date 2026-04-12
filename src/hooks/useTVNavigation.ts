import { useEffect, useRef, useCallback } from 'react';

// Reference counting for active container across all hook instances
let globalActiveContainer: HTMLElement | null = null;
let activeContainerRefCount = 0;

interface TVNavigationOptions {
  selector?: string;
  elements?: HTMLElement[];
  onBack?: () => void;
  onEnter?: (element: HTMLElement) => void;
  onTVFocus?: (element: HTMLElement) => void;
}

export function useTVNavigation(options: TVNavigationOptions = {}) {
  const { selector = '[data-tv-focusable]', elements: externalElements, onBack, onEnter, onTVFocus } = options;
  
  // Use refs for callbacks to avoid re-registering listeners on every render
  const onBackRef = useRef(onBack);
  const onEnterRef = useRef(onEnter);
  const onTVFocusRef = useRef(onTVFocus);
  
  // Update refs when props change
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  useEffect(() => { onTVFocusRef.current = onTVFocus; }, [onTVFocus]);
  
  const focusableElementsRef = useRef<HTMLElement[]>([]);
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastFocusedByContainer = useRef<Map<string, HTMLElement>>(new Map());
  const rectCache = useRef<Map<HTMLElement, DOMRect>>(new Map());
  const activeContainerRef = useRef<HTMLElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastPositionByAxis = useRef({ x: 0, y: 0 });
  const lastXByRow = useRef<Map<number, number>>(new Map()); // ROW MEMORY: store X position per row
  const isRectCacheInvalidRef = useRef(false); // Lazy invalidation on scroll

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
      Number(style.opacity) < 0.1
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

  // Cleanup requestAnimationFrame on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, []);

  const focusElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (currentElementRef.current === el) return;

    el.focus({ preventScroll: true });
    scrollToElement(el);
    currentElementRef.current = el;

    // Call onTVFocus for side effects (preload, analytics, etc.)
    onTVFocusRef.current?.(el);

    // Save last focused element per container
    const container = el.closest('[data-tv-container]');
    if (container?.id) {
      lastFocusedByContainer.current.set(container.id, el);
    }
  }, []);

  const setActiveContainer = useCallback((container: HTMLElement | null) => {
    // Reference counting: only clear global if WE were the owner
    if (container) {
      activeContainerRef.current = container;
      globalActiveContainer = container;
      activeContainerRefCount++;
    } else if (activeContainerRef.current === globalActiveContainer) {
      activeContainerRef.current = null;
      activeContainerRefCount--;
      if (activeContainerRefCount <= 0) {
        globalActiveContainer = null;
        activeContainerRefCount = 0;
      }
    }
  }, []);

  // Cleanup on unmount to prevent globalActiveContainer from getting stuck
  useEffect(() => {
    return () => {
      if (activeContainerRef.current === globalActiveContainer) {
        activeContainerRefCount--;
        if (activeContainerRefCount <= 0) {
          globalActiveContainer = null;
          activeContainerRefCount = 0;
        }
      }
    };
  }, []);

  const findNextElement = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    // Lazy update: if cache invalidated by scroll, batch update now (avoid O(n) forced layouts during scroll)
    if (isRectCacheInvalidRef.current) {
      const newCache = new Map<HTMLElement, DOMRect>();
      const elements = focusableElementsRef.current;
      for (const el of elements) {
        if (isVisible(el)) {
          newCache.set(el, el.getBoundingClientRect());
        }
      }
      rectCache.current = newCache;
      isRectCacheInvalidRef.current = false;
    }

    let elements = focusableElementsRef.current;

    // Filter by active container if set (focus trap for modals, sidebars, etc.)
    if (activeContainerRef.current) {
      elements = elements.filter(el => activeContainerRef.current?.contains(el));
    }

    const current = currentElementRef.current;
    
    // Fallback if current element was removed from DOM
    if (!current || !document.contains(current)) {
      const fallbackElement = elements.find(isVisible) ?? null;
      currentElementRef.current = fallbackElement;
      return fallbackElement;
    }

    const currentContainer = current.closest('[data-tv-container]') as HTMLElement | null;
    const currentGroup = current.closest('[data-tv-group]') as HTMLElement | null;

    // Special case: going down from search input should focus first grid element
    if (direction === 'down' && current.dataset.tvSearch !== undefined) {
      // Find the first element in the main container with data-tv-initial
      const mainElements = elements.filter(el =>
        (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'main'
      );
      const initialElement = mainElements.find(el => el.dataset.tvInitial !== undefined);
      if (initialElement) {
        return initialElement;
      }
      // Fallback to first focusable element in main container
      if (mainElements.length > 0) {
        return mainElements[0];
      }
    }

    // Special case: going left from search input should focus navbar
    if (direction === 'left' && current.dataset.tvSearch !== undefined) {
      const navbarElements = elements.filter(el =>
        (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'navigation'
      );
      // Find the active navbar item
      const activeNavbarItem = navbarElements.find(el => el.dataset.tvActive === 'true');
      if (activeNavbarItem) {
        return activeNavbarItem;
      }
      // Fallback to first navbar element
      if (navbarElements.length > 0) {
        return navbarElements[0];
      }
    }

    // Prefer same container: first search within current container
    const scopedElements = elements.filter(
      el => el.closest('[data-tv-container]') === currentContainer
    );

    // Prefer same group within container
    const groupScopedElements = elements.filter(
      el => el.closest('[data-tv-group]') === currentGroup
    );
    
    const searchInElements = (searchElements: HTMLElement[]) => {
      const currentRect = rectCache.current.get(current);
      if (!currentRect) {
        isRectCacheInvalidRef.current = true;
        return current;
      }
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      // Check if elements have data-tv-index for deterministic ordering
      const hasIndexElements = searchElements.filter(el => el.dataset.tvIndex !== undefined);
      // Find next/previous element by index
      let bestElement: HTMLElement | null = null;
      let bestIndexDiff = Infinity;
      
      // Skip index-based navigation when moving between containers or horizontal moves
      const currentContainerCheck = current.closest('[data-tv-container]');
      const currentGroupCheck = current.closest('[data-tv-group]');
      
      const isCrossContainerMove = (targetEl: HTMLElement) => 
        targetEl.closest('[data-tv-container]') !== currentContainerCheck;
      
      // Check if any candidate element is in different container
      const hasCrossContainerCandidates = hasIndexElements.some(el => isCrossContainerMove(el));
      
      // Check if we're in sidebar
      const isInNavigation = (currentContainerCheck as HTMLElement | null)?.dataset.tvContainer === 'navigation';
      
      // Use index nav only if:
      // 1. Current element has index
      // 2. Current element has a group (to avoid mixing navbar with main content)
      // 3. No cross-container candidates
      // 4. Not horizontal direction UNLESS in a grid group (for proper grid navigation)
      const currentGroupName = (currentGroupCheck as HTMLElement | null)?.dataset.tvGroup;
      const isGridGroup = currentGroupName && [
        'favorite-categories', 'favorite-channels',
        'tv-categories', 'tv-channels',
        'movie-categories', 'favorite-movie-categories', 'favorite-movies',
        'series-categories', 'favorite-series-categories', 'favorite-series'
      ].includes(currentGroupName);
      const useIndexNavigation = current.dataset.tvIndex !== undefined &&
                                 currentGroupCheck &&  // Must have a group defined
                                 !hasCrossContainerCandidates &&
                                 (!(direction === 'right' || direction === 'left') || isGridGroup);
      
      // Special case: when in sidebar and going down/up, check for submenu items
      // by looking at ALL elements in navigation container (not just same group)
      if (useIndexNavigation && isInNavigation && (direction === 'down' || direction === 'up')) {
        const currentIdx = Number.parseInt(current.dataset.tvIndex || '0');
        const navElements = elements.filter(el => 
          (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'navigation'
        );
        
        let bestNavElement: HTMLElement | null = null;
        let bestNavDiff = Infinity;
        
        for (const el of navElements) {
          if (el === current) continue;
          if (!isVisible(el)) continue;
          if (el.hasAttribute('disabled')) continue;
          
          const elIdx = Number.parseInt(el.dataset.tvIndex || '0');
          const idxDiff = elIdx - currentIdx;
          
          if (direction === 'down' && idxDiff > 0 && idxDiff < bestNavDiff) {
            bestNavDiff = idxDiff;
            bestNavElement = el;
          } else if (direction === 'up' && idxDiff < 0 && Math.abs(idxDiff) < bestNavDiff) {
            bestNavDiff = Math.abs(idxDiff);
            bestNavElement = el;
          }
        }
        
        if (bestNavElement) {
          return bestNavElement;
        }
      }
      
      if (hasIndexElements.length > 0 && useIndexNavigation) {
        const currentIndex = Number.parseInt(current.dataset.tvIndex || '0');

        // GRID NAVIGATION: Calculate columns based on element positions
        // Elements in same row have similar Y positions
        const currentRect = rectCache.current.get(current);
        if (!currentRect) {
          isRectCacheInvalidRef.current = true;
          return current;
        }

        // Group elements by rows (similar Y positions)
        const rowGroups = new Map<number, HTMLElement[]>();
        for (const el of hasIndexElements) {
          const rect = rectCache.current.get(el);
          if (!rect) continue;
          const rowKey = Math.round(rect.top / 50); // Constant bucket for stable UX during scroll
          const group = rowGroups.get(rowKey) || [];
          group.push(el);
          rowGroups.set(rowKey, group);
        }

        // Find the row with maximum elements (full row) to determine column count
        let maxElementsInRow = 1;
        for (const [, elements] of rowGroups) {
          maxElementsInRow = Math.max(maxElementsInRow, elements.length);
        }

        // Calculate column count from the full row (row with most items)
        const columnCount = Math.max(1, maxElementsInRow);

        // Calculate target index based on direction and grid columns
        let targetIndex: number | null = null;
        if (direction === 'down') {
          targetIndex = currentIndex + columnCount;
        } else if (direction === 'up') {
          targetIndex = currentIndex - columnCount;
        } else if (direction === 'right') {
          targetIndex = currentIndex + 1;
        } else if (direction === 'left') {
          targetIndex = currentIndex - 1;
        }

        // Special case: going up from first row should focus search input
        if (direction === 'up' && targetIndex !== null && targetIndex < 0) {
          const searchInput = elements.find(el => el.dataset.tvSearch !== undefined);
          if (searchInput && isVisible(searchInput)) {
            return searchInput;
          }
        }

        // Try to find element at target index (grid-based navigation)
        if (targetIndex !== null && targetIndex >= 0) {
          const targetElement = hasIndexElements.find(el => {
            const elIdx = Number.parseInt(el.dataset.tvIndex || '0');
            return elIdx === targetIndex && isVisible(el) && !el.hasAttribute('disabled');
          });
          if (targetElement) {
            return targetElement;
          }
        }

        // Special case: LEFT from first column - detect by position (left edge of container)
        const containerRect = currentContainer?.getBoundingClientRect();
        const isLeftFromFirstCol = direction === 'left' && containerRect &&
          Math.abs(currentRect.left - containerRect.left) < currentRect.width * 0.5;

        if (!isLeftFromFirstCol) {
          // FALLBACK: Simple sequential navigation if grid nav fails
          for (const el of hasIndexElements) {
            if (el === current) continue;
            if (!isVisible(el)) continue;
            if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue;

            const elIndex = Number.parseInt(el.dataset.tvIndex || '0');
            let indexDiff = elIndex - currentIndex;

            // For down, look for next higher index (smallest positive diff)
            // For up, look for next lower index (smallest negative diff)
            const isPositiveDirection = direction === 'down';

            if (isPositiveDirection && indexDiff > 0 && indexDiff < bestIndexDiff) {
              bestIndexDiff = indexDiff;
              bestElement = el;
            } else if (!isPositiveDirection && indexDiff < 0 && Math.abs(indexDiff) < bestIndexDiff) {
              bestIndexDiff = Math.abs(indexDiff);
              bestElement = el;
            }
          }

          if (bestElement) return bestElement;
        }
      }

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

      bestElement = null;
      let bestDistance = Infinity;

      searchElements.forEach((el) => {
        if (el === current) return;
        if (!isVisible(el)) return;
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;

        let rect = rectCache.current.get(el);
        if (!rect) {
          // Skip element if not in cache - will trigger batch refresh
          isRectCacheInvalidRef.current = true;
          return;
        }
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
            distance = deltaX + Math.abs(deltaY) * 2; // Moderate penalty for vertical deviation
            if (sameRow) priority += 1000; // Preference for same row
            if (overlapsVertically) priority += 500;
            break;
          case 'left': {
            isValid = deltaX < 0;
            distance = Math.abs(deltaX) + Math.abs(deltaY) * 2;
            if (sameRow) priority += 1000;
            if (overlapsVertically) priority += 500;
            // Strong preference for elements close to stored Y position (directional memory)
            // Higher weight (50) for cross-container navigation back to sidebar
            const yDistanceFromMemory = Math.abs(centerY - lastPositionByAxis.current.y);
            priority -= yDistanceFromMemory * 50;
            break;
          }
          case 'down': {
            isValid = deltaY > 0;
            distance = deltaY + Math.abs(deltaX) * 5;
            if (sameColumn) priority += 5000; // Stronger preference for same column
            // ROW MEMORY: Prefer elements close to stored X position for target row
            const targetRowDown = Math.round(centerY / 50) * 50; // 50px bucket for mixed sizes
            const rememberedXDown = lastXByRow.current.get(targetRowDown) || lastPositionByAxis.current.x;
            const xDistanceFromMemoryDown = Math.abs(centerX - rememberedXDown);
            priority -= xDistanceFromMemoryDown * 20; // Stronger preference for ROW MEMORY
            break;
          }
          case 'up': {
            isValid = deltaY < 0;
            distance = Math.abs(deltaY) + Math.abs(deltaX) * 5;
            if (sameColumn) priority += 3000;
            // ROW MEMORY: Prefer elements close to stored X position for target row
            const targetRowUp = Math.round(centerY / 50) * 50; // 50px bucket for mixed sizes
            const rememberedXUp = lastXByRow.current.get(targetRowUp) || lastPositionByAxis.current.x;
            const xDistanceFromMemoryUp = Math.abs(centerX - rememberedXUp);
            priority -= xDistanceFromMemoryUp * 20; // Stronger preference for ROW MEMORY
            break;
          }
        }

        distance = distance - priority;

        if (isValid && distance < bestDistance) {
          bestDistance = distance;
          bestElement = el;
        }
      });

      return bestElement;
    };

    // Check if we're in sidebar or main content
    const isInNavigation = currentContainer?.dataset.tvContainer === 'navigation';
    const isInMainContent = currentContainer?.dataset.tvContainer === 'main';
    const isMovingToMainContent = (direction === 'down' || direction === 'right') && isInNavigation;
    // First try to find element in the same group
    let bestElement = searchInElements(groupScopedElements);

    // If no element found in same group, try same container
    // Skip container-scoped search when moving from sidebar to main content
    if (!bestElement && !isMovingToMainContent && groupScopedElements.length < scopedElements.length) {
      bestElement = searchInElements(scopedElements);
    }

    // If no element found in same container, try all elements
    if (!bestElement && scopedElements.length < elements.length) {
      // Special case: when going right from navbar, find element with data-tv-initial in main
      if (direction === 'right' && isInNavigation) {
        // First try to find in main container
        const mainElements = elements.filter(el => 
          (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'main'
        );
        const initialElement = mainElements.find(el => el.dataset.tvInitial !== undefined);
        if (initialElement) {
          bestElement = initialElement;
        }
        
        // If not found, try tv-categories group (for TV channels view)
        if (!bestElement) {
          const categoryElements = elements.filter(el =>
            (el.closest('[data-tv-group]') as HTMLElement | null)?.dataset.tvGroup === 'tv-categories'
          );
          const categoryInitial = categoryElements.find(el => el.dataset.tvInitial !== undefined);
          if (categoryInitial) {
            bestElement = categoryInitial;
          }
        }
      }

      // Special case: when going right from settings tabs, find element with data-tv-initial in settings content
      const currentGroup = (current?.closest('[data-tv-group]') as HTMLElement | null)?.dataset.tvGroup;
      if (direction === 'right' && currentGroup === 'settings-tabs') {
        const contentElements = elements.filter(el =>
          (el.closest('[data-tv-group]') as HTMLElement | null)?.dataset.tvGroup === 'settings-content'
        );
        const initialElement = contentElements.find(el => el.dataset.tvInitial !== undefined);
        if (initialElement) {
          bestElement = initialElement;
        }
      }

      // Special case: when going right from favorite-categories, focus on portals navbar item
      if (direction === 'right' && currentGroup === 'favorite-categories') {
        const navbarElements = elements.filter(el =>
          (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'navigation'
        );
        // Find the portals navbar item (first item)
        const portalsNavItem = navbarElements.find(el =>
          el.closest('[data-tv-group="navbar"]') !== null &&
          el.getAttribute('data-tv-initial') !== undefined
        );
        if (portalsNavItem) {
          bestElement = portalsNavItem;
        }
      }
      
      // Special case: when going left from main content, find the active navbar item
      if (!bestElement && direction === 'left' && isInMainContent) {
        const navbarElements = elements.filter(el =>
          (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer === 'navigation'
        );
        // First try to find the active navbar item (the one corresponding to current view)
        const activeNavbarItem = navbarElements.find(el => el.dataset.tvActive === 'true');
        if (activeNavbarItem) {
          bestElement = activeNavbarItem;
        } else {
          // Fall back to geometric search if no active item found
          bestElement = searchInElements(navbarElements);
        }
      }
      
      // If still no element, try all
      bestElement ??= searchInElements(elements);
    }

    // Wrap-around navigation per container (Netflix/YouTube TV style)
    if (!bestElement && currentContainer) {
      const sameContainerElements = elements.filter(
        el => el.closest('[data-tv-container]') === currentContainer
      );

      // Guard: skip wrap-around if only 1 element to avoid unnecessary re-focus
      if (sameContainerElements.length > 1) {
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

    // Listen to resize, scroll, and DOM mutations
    window.addEventListener('resize', update);
    // Scroll: lazy invalidate (avoid forced layouts during rapid scroll)
    const handleScroll = () => {
      isRectCacheInvalidRef.current = true;
    };
    window.addEventListener('scroll', handleScroll, true);

    // MutationObserver to detect new focusable elements (for lazy-loaded components)
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
      window.removeEventListener('scroll', handleScroll, true);
      observer.disconnect();
    };
  }, [getFocusableElements]);

  useEffect(() => {
    // Auto-focus first element on mount, or restore last focused per container
    // Use setTimeout to ensure DOM is fully rendered
    const focusTimeout = setTimeout(() => {
      // Refresh elements list
      const elements = getFocusableElements();
      focusableElementsRef.current = elements;
      
      if (elements.length > 0 && !currentElementRef.current) {
        // Try to restore last focused element for visible container
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
        
        // Prefer element with data-tv-initial attribute for initial focus
        const preferred = elements.find(el => el.dataset.tvInitial !== undefined);
        focusElement(preferred ?? elements[0] ?? null);
      }
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      // If another instance manages an active container, skip handling
      if (globalActiveContainer && globalActiveContainer !== activeContainerRef.current) {
        return;
      }

      const keyMap: Record<string, () => void> = {
        ArrowRight: () => focusElement(findNextElement('right')),
        Right: () => focusElement(findNextElement('right')),
        ArrowLeft: () => {
          // Disable LEFT when in sidebar (navigation) - nowhere to go left
          const current = currentElementRef.current;
          const isInSidebar = current?.closest('[data-tv-container="navigation"]') !== null;
          if (!isInSidebar) {
            focusElement(findNextElement('left'));
          }
        },
        Left: () => {
          const current = currentElementRef.current;
          const isInSidebar = current?.closest('[data-tv-container="navigation"]') !== null;
          if (!isInSidebar) {
            focusElement(findNextElement('left'));
          }
        },
        ArrowDown: () => focusElement(findNextElement('down')),
        Down: () => focusElement(findNextElement('down')),
        ArrowUp: () => {
          // Disable UP when on search input - nowhere to go up
          const current = currentElementRef.current;
          const isOnSearchInput = current?.dataset.tvSearch !== undefined;
          if (!isOnSearchInput) {
            focusElement(findNextElement('up'));
          }
        },
        Up: () => {
          const current = currentElementRef.current;
          const isOnSearchInput = current?.dataset.tvSearch !== undefined;
          if (!isOnSearchInput) {
            focusElement(findNextElement('up'));
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
          // Don't intercept backspace if user is typing in an input field
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
      clearTimeout(focusTimeout);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [getFocusableElements, findNextElement, focusElement]);

  return { focusElement, setActiveContainer };
}
