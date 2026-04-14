// PLUGIN - Grid Navigation
// Handles index-based grid navigation

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

const GRID_GROUPS = [
  'favorite-categories', 'favorite-channels',
  'tv-categories', 'tv-channels',
  'movie-categories', 'favorite-movie-categories', 'favorite-movies',
  'series-categories', 'favorite-series-categories', 'favorite-series'
];

export const gridPlugin: NavigationPlugin = {
  name: 'grid',
  findNext: (state: NavigationState, direction: Direction) => {
    console.log('[GridPlugin] checking direction:', direction);
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      console.log('[GridPlugin] no current node');
      return null;
    }

    // Check if we should use grid navigation
    if (!shouldUseGridNavigation(current, state, direction)) {
      console.log('[GridPlugin] shouldUseGridNavigation returned false');
      return null;
    }

    const result = findGridNext(current, state, direction);
    console.log('[GridPlugin] result:', result);
    return result;
  },
};

function shouldUseGridNavigation(
  current: { index?: number; groupId?: string; containerId?: string },
  state: NavigationState,
  direction: Direction
): boolean {
  console.log('[GridPlugin] shouldUseGridNavigation check:', current.groupId, 'index:', current.index);
  if (current.index === undefined) {
    console.log('[GridPlugin] no index');
    return false;
  }
  if (!current.groupId) {
    console.log('[GridPlugin] no groupId');
    return false;
  }
  if (!GRID_GROUPS.includes(current.groupId)) {
    console.log('[GridPlugin] group not in GRID_GROUPS');
    return false;
  }

  // Check for cross-container candidates
  const hasCrossContainerCandidates = state.nodes.some(node =>
    node.index !== undefined && node.containerId !== current.containerId
  );

  if (hasCrossContainerCandidates) {
    console.log('[GridPlugin] has cross-container candidates, skipping grid');
    return false;
  }

  // Allow horizontal moves in grid groups
  const isGridGroup = GRID_GROUPS.includes(current.groupId || '');
  if ((direction === 'right' || direction === 'left') && !isGridGroup) {
    console.log('[GridPlugin] horizontal move but not grid group');
    return false;
  }

  console.log('[GridPlugin] shouldUseGridNavigation returned true');
  return true;
}

function findGridNext(
  current: { index: number; rect: DOMRect; containerId?: string },
  state: NavigationState,
  direction: Direction
): string | null {
  const currentIndex = current.index;

  // Calculate column count from row grouping
  const rowGroups = new Map<number, typeof state.nodes>();
  for (const node of state.nodes) {
    if (node.index === undefined) continue;
    const rowKey = Math.round(node.rect.top / 50);
    const group = rowGroups.get(rowKey) || [];
    group.push(node);
    rowGroups.set(rowKey, group);
  }

  let maxElementsInRow = 1;
  for (const [, elements] of rowGroups) {
    maxElementsInRow = Math.max(maxElementsInRow, elements.length);
  }

  const columnCount = Math.max(1, maxElementsInRow);

  // Calculate target index
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
    const searchNode = state.nodes.find(n => n.isSearch);
    if (searchNode && !searchNode.disabled) return searchNode.id;
  }

  // Find element at target index
  if (targetIndex !== null && targetIndex >= 0) {
    const targetNode = state.nodes.find(n =>
      n.index === targetIndex && !n.disabled
    );
    if (targetNode) return targetNode.id;
  }

  return null;
}
