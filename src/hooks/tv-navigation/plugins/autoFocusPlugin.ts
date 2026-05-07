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

function focusInitialInContainer(container: HTMLElement, onFocused?: (el: HTMLElement) => void): void {
  const initialElement = findInitialElement(container);
  if (initialElement) {
    setTimeout(() => {
      initialElement.focus({ preventScroll: true });
      onFocused?.(initialElement);
    }, 50);
  }
}

function shouldApplyInitialFocus(activeElement: HTMLElement | null): boolean {
  return !activeElement || activeElement === document.body;
}

function applyInitialFocus(containers: HTMLElement[]): HTMLElement | null {
  const navContainer = containers.find(c => getContainerId(c) === 'navigation');
  const mainContainer = containers.find(c => getContainerId(c) === 'main');
  const targetContainer = navContainer || mainContainer || containers[0];
  
  if (targetContainer) {
    let focusedElement: HTMLElement | null = null;
    focusInitialInContainer(targetContainer, (el) => {
      focusedElement = el;
    });
    return focusedElement;
  }
  return null;
}

interface MovieDetailsContext {
  movieDetailsElements: NodeListOf<HTMLElement>;
  activeElement: HTMLElement | null;
  hadMovieDetails: boolean;
  hasMovieDetailsNow: boolean;
  modalWasOpen: boolean;
}

function handleMovieDetailsOpening(ctx: MovieDetailsContext): boolean {
  const { movieDetailsElements, activeElement } = ctx;
  
  if (movieDetailsElements.length > 0 && activeElement?.matches('[data-tv-group="movies"], [data-tv-group="series"]')) {
    state.lastFocusedElement = activeElement;
    return true;
  }
  
  if (movieDetailsElements.length > 0) {
    return true;
  }
  
  return false;
}

function handleMovieDetailsClosing(ctx: MovieDetailsContext): boolean {
  const { hadMovieDetails, hasMovieDetailsNow, modalWasOpen } = ctx;
  
  if (!hadMovieDetails || hasMovieDetailsNow || !modalWasOpen) {
    return false;
  }
  
  if (state.lastFocusedElement && document.contains(state.lastFocusedElement)) {
    const el = state.lastFocusedElement;
    setTimeout(() => {
      if (el.tabIndex === -1) {
        el.tabIndex = 0;
      }
      el.focus({ preventScroll: true });
    }, 150);
  }
  
  state.lastFocusedElement = null;
  return true;
}

function hadMovieDetailsPreviously(lastContainerIds: Set<string>, containers: HTMLElement[]): boolean {
  return Array.from(lastContainerIds).some(id => {
    const prevContainer = containers.find(c => getContainerId(c) === id);
    return prevContainer?.querySelector('[data-tv-group="movie-actions"][data-tv-initial="true"]');
  });
}

interface ContentElements {
  movieElements: NodeListOf<HTMLElement>;
  seriesElements: NodeListOf<HTMLElement>;
  favoriteMovieElements: NodeListOf<HTMLElement>;
  favoriteSeriesElements: NodeListOf<HTMLElement>;
  categoryCardsElements: NodeListOf<HTMLElement>;
  tvChannelElements: NodeListOf<HTMLElement>;
}

function getContentElements(mainContainer: HTMLElement): ContentElements {
  return {
    movieElements: mainContainer.querySelectorAll('[data-tv-group="movies"][data-tv-initial="true"]'),
    seriesElements: mainContainer.querySelectorAll('[data-tv-group="series"][data-tv-initial="true"]'),
    favoriteMovieElements: mainContainer.querySelectorAll('[data-tv-group="favorite-movies"][data-tv-initial="true"]'),
    favoriteSeriesElements: mainContainer.querySelectorAll('[data-tv-group="favorite-series"][data-tv-initial="true"]'),
    categoryCardsElements: mainContainer.querySelectorAll('[data-tv-group="category-cards"][data-tv-initial="true"]'),
    tvChannelElements: mainContainer.querySelectorAll('[data-tv-group="tv-channels"][data-tv-initial="true"]'),
  };
}

function hasAnyContent(elements: ContentElements): boolean {
  return elements.movieElements.length > 0 ||
         elements.seriesElements.length > 0 ||
         elements.favoriteMovieElements.length > 0 ||
         elements.favoriteSeriesElements.length > 0 ||
         elements.categoryCardsElements.length > 0 ||
         elements.tvChannelElements.length > 0;
}

function shouldFocusOnContent(activeElement: HTMLElement | null, initialFocusElement: HTMLElement | null, initialFocusApplied: boolean): boolean {
  const categoryGroups = '[data-tv-group="movie-categories"], [data-tv-group="series-categories"], [data-tv-group="favorite-movie-categories"], [data-tv-group="favorite-series-categories"], [data-tv-group="category-cards"]';
  const contentGroups = '[data-tv-group="movies"], [data-tv-group="series"], [data-tv-group="favorite-movies"], [data-tv-group="favorite-series"], [data-tv-group="tv-channels"]';

  const isInNavigation = activeElement?.closest('[data-tv-container="navigation"]') !== null;
  const isOnInitialFocus = initialFocusElement !== null && activeElement === initialFocusElement;
  const isFocusLost = initialFocusApplied && (!activeElement || activeElement === document.body);

  const shouldFocus = (activeElement?.matches(categoryGroups) ||
                       (isInNavigation && !isOnInitialFocus) ||
                       isFocusLost ||
                       (activeElement?.matches('[data-tv-group="navbar"]'))) &&
                       !activeElement?.matches('[data-tv-group="movie-details"]') &&
                       !(activeElement?.matches(contentGroups) && activeElement?.dataset.tvInitial === 'true');

  return shouldFocus;
}

function focusContentElement(elements: ContentElements): void {
  if (elements.categoryCardsElements.length > 0) {
    const firstCard = elements.categoryCardsElements[0];
    setTimeout(() => firstCard.focus({ preventScroll: true }), 100);
  } else if (elements.favoriteSeriesElements.length > 0) {
    const firstSeries = elements.favoriteSeriesElements[0];
    setTimeout(() => firstSeries.focus({ preventScroll: true }), 100);
  } else if (elements.favoriteMovieElements.length > 0) {
    const firstMovie = elements.favoriteMovieElements[0];
    setTimeout(() => firstMovie.focus({ preventScroll: true }), 100);
  } else if (elements.movieElements.length > 0) {
    const firstMovie = elements.movieElements[0];
    setTimeout(() => firstMovie.focus({ preventScroll: true }), 100);
  } else if (elements.seriesElements.length > 0) {
    const firstSeries = elements.seriesElements[0];
    setTimeout(() => firstSeries.focus({ preventScroll: true }), 100);
  } else if (elements.tvChannelElements.length > 0) {
    const firstChannel = elements.tvChannelElements[0];
    setTimeout(() => firstChannel.focus({ preventScroll: true }), 100);
  }
}

function getModalContainers(containers: HTMLElement[], isModalContainer: (id: string) => boolean): HTMLElement[] {
  return containers.filter(c => {
    const id = getContainerId(c);
    return id && isModalContainer(id);
  });
}

function getNewModalContainers(modalContainers: HTMLElement[], lastContainerIds: Set<string>): HTMLElement[] {
  return modalContainers.filter(c => {
    const id = getContainerId(c);
    return id && !lastContainerIds.has(id);
  });
}

function handleModalOpening(newModalContainers: HTMLElement[]): void {
  const activeElement = document.activeElement as HTMLElement;
  if (activeElement?.matches('[data-tv-focusable]')) {
    state.lastFocusedElement = activeElement;
  }

  const sortedNew = newModalContainers.slice().sort((a, b) => {
    const zIndexA = Number.parseInt(globalThis.getComputedStyle(a).zIndex) || 0;
    const zIndexB = Number.parseInt(globalThis.getComputedStyle(b).zIndex) || 0;
    return zIndexB - zIndexA;
  });

  const topContainer = sortedNew[0];
  focusInitialInContainer(topContainer);
}

function handleModalClosing(modalWasOpen: boolean): boolean {
  if (!modalWasOpen) {
    return false;
  }

  if (state.lastFocusedElement && document.contains(state.lastFocusedElement)) {
    const el = state.lastFocusedElement;
    setTimeout(() => {
      if (el.tabIndex === -1) {
        el.tabIndex = 0;
      }
      el.focus({ preventScroll: true });
    }, 150);
  }

  state.lastFocusedElement = null;
  return true;
}

/**
 * Initialize auto-focus monitoring
 * Returns cleanup function to stop observing
 */
export function initAutoFocus(): () => void {
  let lastContainerIds = new Set<string>();
  let modalWasOpen = false;
  let initialFocusApplied = false;
  // Element that received the initial sidebar focus on app start.
  // While focus stays on this element we keep it on the sidebar (don't steal
  // to main content). Once the user moves focus, normal behaviour resumes.
  let initialFocusElement: HTMLElement | null = null;

  const isModalContainer = (id: string): boolean => {
    return id !== 'main' && id !== 'navigation' && id !== '';
  };

  const handleInitialFocus = (containers: HTMLElement[], activeElement: HTMLElement): void => {
    if (!initialFocusApplied && shouldApplyInitialFocus(activeElement)) {
      initialFocusElement = applyInitialFocus(containers);
      initialFocusApplied = true;
    }
  };

  const handleMainContainer = (containers: HTMLElement[], activeElement: HTMLElement): void => {
    const mainContainer = containers.find(c => getContainerId(c) === 'main');
    if (!mainContainer) return;

    const contentElements = getContentElements(mainContainer);
    const movieDetailsElements = mainContainer.querySelectorAll('[data-tv-group="movie-actions"][data-tv-initial="true"]') as NodeListOf<HTMLElement>;

    const hadMovieDetails = hadMovieDetailsPreviously(lastContainerIds, containers);
    const hasMovieDetailsNow = movieDetailsElements.length > 0;
    
    const movieDetailsCtx: MovieDetailsContext = {
      movieDetailsElements,
      activeElement,
      hadMovieDetails,
      hasMovieDetailsNow,
      modalWasOpen,
    };

    if (handleMovieDetailsOpening(movieDetailsCtx)) {
      modalWasOpen = true;
    }

    if (handleMovieDetailsClosing(movieDetailsCtx)) {
      modalWasOpen = false;
    }

    if (hasAnyContent(contentElements) && shouldFocusOnContent(activeElement, initialFocusElement, initialFocusApplied)) {
      focusContentElement(contentElements);
    }
  };

  const handleModalContainers = (containers: HTMLElement[]): void => {
    const modalContainers = getModalContainers(containers, isModalContainer);
    const newModalContainers = getNewModalContainers(modalContainers, lastContainerIds);

    if (newModalContainers.length > 0) {
      handleModalOpening(newModalContainers);
      modalWasOpen = true;
    }

    const hadModalContainers = Array.from(lastContainerIds).some(id => isModalContainer(id));
    const hasModalContainersNow = modalContainers.length > 0;

    if (hadModalContainers && !hasModalContainersNow && modalWasOpen) {
      if (handleModalClosing(modalWasOpen)) {
        modalWasOpen = false;
      }
    }
  };

  const checkContainers = () => {
    const containers = Array.from(document.querySelectorAll('[data-tv-container]')) as HTMLElement[];
    const currentIds = new Set(containers.map(getContainerId).filter(Boolean));
    const activeElement = document.activeElement as HTMLElement;

    handleInitialFocus(containers, activeElement);
    handleMainContainer(containers, activeElement);
    handleModalContainers(containers);

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
