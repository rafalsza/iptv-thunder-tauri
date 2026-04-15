// PLUGIN - Grid Navigation
// Handles index-based grid navigation

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

export const GRID_GROUPS = new Set([
  'favorite-categories', 'favorite-channels',
  'tv-categories', 'tv-channels',
  'movie-categories', 'favorite-movie-categories', 'favorite-movies', 'movies',
  'series-categories', 'favorite-series-categories', 'favorite-series',
  'portals-content', 'portal-actions'
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

function findGridNext(
  current: { index: number; rect: DOMRect; containerId?: string; groupId?: string; gridPosition?: { row: number; col: number } },
  state: NavigationState,
  direction: Direction
): string | null {
  // Use precomputed grid data for O(1) navigation
  // Grid is keyed by groupId|containerId to handle multiple containers with same groupId
  const gridKey = `${current.groupId}|${current.containerId}`;
  const grid = state.grid?.get(gridKey);
  if (!grid || !current.gridPosition) {
    return null;
  }

  const { row, col } = current.gridPosition;
  let targetNode: { id: string; disabled?: boolean } | undefined;

  // Navigate using row/col position instead of raw index arithmetic
  if (direction === 'down') {
    const nextRow = grid.rows[row + 1];
    if (nextRow) {
      // Clamp column to the next row's length
      const targetCol = Math.min(col, nextRow.length - 1);
      targetNode = nextRow[targetCol];
    }
  } else if (direction === 'up') {
    if (row === 0) {
      // Special case: going up from first row should focus search input
      const searchNode = state.nodes.find(n => n.isSearch);
      if (searchNode && !searchNode.disabled) return searchNode.id;
    } else {
      const prevRow = grid.rows[row - 1];
      if (prevRow) {
        // Clamp column to the previous row's length
        const targetCol = Math.min(col, prevRow.length - 1);
        targetNode = prevRow[targetCol];
      }
    }
  } else if (direction === 'right') {
    const currentRow = grid.rows[row];
    if (currentRow && col + 1 < currentRow.length) {
      targetNode = currentRow[col + 1];
    }
  } else if (direction === 'left') {
    const currentRow = grid.rows[row];
    if (currentRow && col - 1 >= 0) {
      targetNode = currentRow[col - 1];
    } else if (col === 0) {
      // At first column - return to active sidebar element (channels/categories)
      const activeSidebarElement = state.nodes.find(n =>
        n.containerId === 'navigation' &&
        n.isActive &&
        !n.disabled
      );
      if (activeSidebarElement) {
        return activeSidebarElement.id;
      }
      // Fallback to first sidebar element if no active one found
      const sidebarElement = state.nodes.find(n =>
        n.containerId === 'navigation' &&
        !n.disabled
      );
      if (sidebarElement) {
        return sidebarElement.id;
      }
    }
  }

  if (targetNode && !targetNode.disabled) {
    return targetNode.id;
  }

  return null;
}
