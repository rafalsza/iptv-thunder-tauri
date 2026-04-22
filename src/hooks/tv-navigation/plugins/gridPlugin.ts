// PLUGIN - Grid Navigation
// Handles index-based grid navigation

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

type NavigationTarget = { id: string; disabled?: boolean } | string | null;

export const GRID_GROUPS = new Set([
  'favorite-categories', 'favorite-channels',
  'tv-categories', 'tv-channels',
  'movie-categories', 'favorite-movie-categories', 'favorite-movies', 'movies',
  'series-categories', 'favorite-series-categories', 'favorite-series', 'series',
  'portals-content', 'portal-actions',
  // ForYou carousel groups - horizontal grid navigation
  'for-you-live', 'for-you-movies', 'for-you-series',
  // Episodes grid - vertical list navigation
  'series-episodes'
]);

export const gridPlugin: NavigationPlugin = {
  name: 'grid',
  findNext: (state: NavigationState, direction: Direction) => {
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      return null;
    }

    // Check if we should use grid navigation
    if (!shouldUseGridNavigation(current)) {
      return null;
    }

    return findGridNext({ ...current, index: current.index! }, state, direction);
  },
};

function shouldUseGridNavigation(
  current: { index?: number; groupId?: string; containerId?: string }
): boolean {
  if (current.index === undefined) {
    return false;
  }
  if (!current.groupId) {
    return false;
  }
  return GRID_GROUPS.has(current.groupId);
}

const CAROUSEL_ORDER = ['for-you-live', 'for-you-movies', 'for-you-series'] as const;

function getCarouselGroupNodes(
  state: NavigationState,
  groupId: string,
  containerId: string | undefined
) {
  return state.nodes.filter(
    n => n.groupId === groupId && n.containerId === containerId && !n.disabled
  );
}

function navigateCarouselDown(
  state: NavigationState,
  currentGroupId: string | undefined,
  containerId: string | undefined,
  col: number,
  currentId: string | undefined
): string | null {
  const currentGroupIndex = CAROUSEL_ORDER.indexOf(currentGroupId as any);
  if (currentGroupIndex < 0) return null;

  if (currentGroupIndex < CAROUSEL_ORDER.length - 1) {
    const nextGroupId = CAROUSEL_ORDER[currentGroupIndex + 1];
    const nextGroupNodes = getCarouselGroupNodes(state, nextGroupId, containerId);
    const targetCol = Math.min(col, nextGroupNodes.length - 1);
    const nextGroupTarget = nextGroupNodes[targetCol] ?? nextGroupNodes[0];
    return nextGroupTarget?.id ?? null;
  }

  return currentId ?? null;
}

function navigateCarouselUp(
  state: NavigationState,
  currentGroupId: string | undefined,
  containerId: string | undefined,
  col: number
): string | null {
  const currentGroupIndex = CAROUSEL_ORDER.indexOf(currentGroupId as any);
  if (currentGroupIndex < 0) return null;

  if (currentGroupIndex > 0) {
    const prevGroupId = CAROUSEL_ORDER[currentGroupIndex - 1];
    const prevGroupNodes = getCarouselGroupNodes(state, prevGroupId, containerId);
    const targetCol = Math.min(col, prevGroupNodes.length - 1);
    const prevGroupTarget = prevGroupNodes[targetCol] ?? prevGroupNodes[0];
    return prevGroupTarget?.id ?? null;
  }

  const searchNode = state.nodes.find(n => n.isSearch);
  return searchNode && !searchNode.disabled ? searchNode.id : null;
}

function getSearchNode(state: NavigationState): string | null {
  const searchNode = state.nodes.find(n => n.isSearch);
  return searchNode && !searchNode.disabled ? searchNode.id : null;
}

function getActiveSidebarElement(state: NavigationState): string | null {
  const activeSidebarElement = state.nodes.find(
    n => n.containerId === 'navigation' && n.isActive && !n.disabled && !n.isSearch
  );
  if (activeSidebarElement) return activeSidebarElement.id;

  const sidebarElement = state.nodes.find(
    n => n.containerId === 'navigation' && !n.disabled && !n.isSearch
  );
  return sidebarElement?.id ?? null;
}

function navigateDown(
  grid: any,
  row: number,
  col: number,
  state: NavigationState,
  currentGroupId: string | undefined,
  containerId: string | undefined,
  currentId: string | undefined
): NavigationTarget {
  const carouselResult = navigateCarouselDown(state, currentGroupId, containerId, col, currentId);
  if (carouselResult !== null) return carouselResult;

  const nextRow = grid.rows[row + 1];
  if (nextRow) {
    const targetCol = Math.min(col, nextRow.length - 1);
    return nextRow[targetCol];
  }

  if (currentGroupId === 'series-episodes' && row === grid.rows.length - 1) {
    return null;
  }

  return null;
}

function navigateUp(
  grid: any,
  row: number,
  col: number,
  state: NavigationState,
  currentGroupId: string | undefined
): NavigationTarget {
  const carouselResult = navigateCarouselUp(state, currentGroupId, grid.rows[0]?.[0]?.containerId, col);
  if (carouselResult !== null) return carouselResult;

  if (row === 0) return getSearchNode(state);

  const prevRow = grid.rows[row - 1];
  if (prevRow) {
    const targetCol = Math.min(col, prevRow.length - 1);
    return prevRow[targetCol];
  }

  return null;
}

function navigateLeft(
  grid: any,
  row: number,
  col: number,
  state: NavigationState,
  currentGroupId: string | undefined,
  currentId: string | undefined
): NavigationTarget {
  const currentRow = grid.rows[row];
  if (currentRow && col - 1 >= 0) {
    return currentRow[col - 1];
  }

  if (col !== 0) return null;

  const currentGroupIndex = CAROUSEL_ORDER.indexOf(currentGroupId as any);
  if (currentGroupIndex >= 0) {
    const groupElements = state.nodes.filter(n => n.groupId === currentGroupId && !n.disabled);
    const currentIndex = groupElements.findIndex(n => n.id === currentId);
    if (currentIndex > 0) {
      return groupElements[currentIndex - 1].id;
    }
  }

  return getActiveSidebarElement(state);
}

function findGridNext(
  current: { index: number; rect: DOMRect; id?: string; containerId?: string; groupId?: string; gridPosition?: { row: number; col: number } },
  state: NavigationState,
  direction: Direction
): string | null {
  const gridKey = `${current.groupId}|${current.containerId}`;
  const grid = state.grid?.get(gridKey);
  if (!grid || !current.gridPosition) {
    return null;
  }

  const { row, col } = current.gridPosition;
  let targetNode: NavigationTarget = null;

  switch (direction) {
    case 'down':
      targetNode = navigateDown(grid, row, col, state, current.groupId, current.containerId, current.id);
      break;
    case 'up':
      targetNode = navigateUp(grid, row, col, state, current.groupId);
      break;
    case 'right': {
      const currentRow = grid.rows[row];
      if (currentRow && col + 1 < currentRow.length) {
        targetNode = currentRow[col + 1];
      }
      break;
    }
    case 'left':
      targetNode = navigateLeft(grid, row, col, state, current.groupId, current.id);
      break;
  }

  if (typeof targetNode === 'string') return targetNode;
  if (targetNode && !targetNode.disabled) return targetNode.id;

  return null;
}
