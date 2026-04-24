// PLUGIN - Auto Focus
// Automatically focuses initial element when new containers appear
// and restores focus when modals are closed

interface AutoFocusState {
  lastContainerIds: Set<string>;
  lastFocusedElement: HTMLElement | null;
}

const state: AutoFocusState = {
  lastContainerIds: new Set(),
  lastFocusedElement: null,
};

function getContainerId(container: HTMLElement): string {
  return container.id || container.dataset.tvContainer || '';
}

function findInitialElement(container: HTMLElement): HTMLElement | null {
  const initialElement = container.querySelector('[data-tv-initial]') as HTMLElement;
  if (initialElement) {
    return initialElement;
  }
  return container.querySelector('[data-tv-focusable]') as HTMLElement;
}

function focusInitialInContainer(container: HTMLElement): void {
  const initialElement = findInitialElement(container);
  if (initialElement) {
    setTimeout(() => {
      initialElement.focus({ preventScroll: true });
    }, 50);
  }
}

/**
 * Initialize auto-focus monitoring
 * Returns cleanup function to stop observing
 */
export function initAutoFocus(): () => void {
  let lastContainerIds = new Set<string>();
  let modalWasOpen = false;

  const isModalContainer = (id: string): boolean => {
    return id !== 'main' && id !== 'navigation' && id !== '';
  };

  const checkContainers = () => {
    const containers = Array.from(document.querySelectorAll('[data-tv-container]')) as HTMLElement[];
    const currentIds = new Set(containers.map(getContainerId).filter(Boolean));

    // Initial focus on app start - if no element has focus yet
    // Priority: navigation sidebar > main content
    const activeElement = document.activeElement as HTMLElement;
    if (!activeElement || activeElement === document.body) {
      const navContainer = containers.find(c => getContainerId(c) === 'navigation');
      const mainContainer = containers.find(c => getContainerId(c) === 'main');
      const targetContainer = navContainer || mainContainer || containers[0];
      if (targetContainer) {
        focusInitialInContainer(targetContainer);
      }
    }

    // Check for new content in main container that needs initial focus
    const mainContainer = containers.find(c => getContainerId(c) === 'main');
    if (mainContainer) {
      const movieElements = mainContainer.querySelectorAll('[data-tv-group="movies"][data-tv-initial="true"]');
      const seriesElements = mainContainer.querySelectorAll('[data-tv-group="series"][data-tv-initial="true"]');
      const movieDetailsElements = mainContainer.querySelectorAll('[data-tv-group="movie-actions"][data-tv-initial="true"]');
      
      // Check if MovieDetails is opening - save current focus only if it's on a movie/series
      if (movieDetailsElements.length > 0 && activeElement?.matches('[data-tv-group="movies"], [data-tv-group="series"]')) {
        state.lastFocusedElement = activeElement;
        modalWasOpen = true; // Reuse this flag for MovieDetails
      } else if (movieDetailsElements.length > 0) {
        modalWasOpen = true; // Still set flag so we know MovieDetails was open
      }
      
      // Check if MovieDetails was closed and we need to restore focus
      const hadMovieDetails = Array.from(lastContainerIds).some(id => {
        const prevContainer = containers.find(c => getContainerId(c) === id);
        return prevContainer?.querySelector('[data-tv-group="movie-actions"][data-tv-initial="true"]');
      });
      const hasMovieDetailsNow = movieDetailsElements.length > 0;

      
      if (hadMovieDetails && !hasMovieDetailsNow && modalWasOpen && state.lastFocusedElement) {
        const el = state.lastFocusedElement;
        if (el && document.contains(el)) {
          setTimeout(() => {
            if (el.tabIndex === -1) {
              el.tabIndex = 0;
            }
            el.focus({ preventScroll: true });
          }, 150);
        }
        modalWasOpen = false;
        state.lastFocusedElement = null;
      } else if (hadMovieDetails && !hasMovieDetailsNow && modalWasOpen) {
        modalWasOpen = false;
      }
      
      // Check if we have new movie/series content and focus should be on it
      if (movieElements.length > 0 || seriesElements.length > 0) {
        const hasMovieContent = movieElements.length > 0;
        const hasSeriesContent = seriesElements.length > 0;
        
        // Focus on movies/series if:
        // 1. Focus is on categories, OR
        // 2. Focus is on navbar and we have content (user navigated from categories)
        // But NOT if focus is already on movie details or initial movie/series element
        const shouldFocus = (activeElement?.matches('[data-tv-group="movie-categories"], [data-tv-group="series-categories"]') ||
                           (activeElement?.matches('[data-tv-group="navbar"]') && (hasMovieContent || hasSeriesContent))) &&
                           !activeElement?.matches('[data-tv-group="movie-details"]') &&
                           !(activeElement?.matches('[data-tv-group="movies"], [data-tv-group="series"]') && activeElement?.dataset.tvInitial === 'true');
        
        if (shouldFocus) {
          
          if (hasMovieContent) {
            const firstMovie = movieElements[0] as HTMLElement;
            setTimeout(() => {
              firstMovie.focus({ preventScroll: true });
            }, 100);
          } else if (hasSeriesContent) {
            const firstSeries = seriesElements[0] as HTMLElement;
            setTimeout(() => {
              firstSeries.focus({ preventScroll: true });
            }, 100);
          }
        }
      }
    }

    const modalContainers = containers.filter(c => {
      const id = getContainerId(c);
      return id && isModalContainer(id);
    });

    const newModalContainers = modalContainers.filter(c => {
      const id = getContainerId(c);
      return id && !lastContainerIds.has(id);
    });

    if (newModalContainers.length > 0) {
      // Modal is opening - save current focus
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement?.matches('[data-tv-focusable]')) {
        state.lastFocusedElement = activeElement;
      }
      modalWasOpen = true;

      const sortedNew = newModalContainers.slice().sort((a, b) => {
        const zIndexA = Number.parseInt(globalThis.getComputedStyle(a).zIndex) || 0;
        const zIndexB = Number.parseInt(globalThis.getComputedStyle(b).zIndex) || 0;
        return zIndexB - zIndexA;
      });

      const topContainer = sortedNew[0];
      focusInitialInContainer(topContainer);
    }

    // Check if modal was closed
    const hadModalContainers = Array.from(lastContainerIds).some(id => isModalContainer(id));
    const hasModalContainersNow = modalContainers.length > 0;

    if (hadModalContainers && !hasModalContainersNow && modalWasOpen) {
      // Modal closed - restore focus to last focused element
      if (state.lastFocusedElement && document.contains(state.lastFocusedElement)) {
        const el = state.lastFocusedElement;
        setTimeout(() => {
          // Force tabIndex to 0 if it's -1 (React may not have updated DOM yet)
          if (el.tabIndex === -1) {
            el.tabIndex = 0;
          }
          el.focus({ preventScroll: true });
        }, 150);
      }
      modalWasOpen = false;
      state.lastFocusedElement = null;
    }

    lastContainerIds = currentIds;
    state.lastContainerIds = currentIds;
  };

  checkContainers();

  const observer = new MutationObserver(() => {
    requestAnimationFrame(checkContainers);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
