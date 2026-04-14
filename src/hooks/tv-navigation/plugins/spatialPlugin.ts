// PLUGIN - Spatial Navigation
// Fallback geometric navigation based on distance and heuristics

import { NavigationState, Direction, NavigationPlugin, NavNode } from '../core/types';
import { getCenter, getDistance, isSameRow, isSameColumn, overlapsVertically, isInDirection, getRowKey } from '../utils/geometry';

export const spatialPlugin: NavigationPlugin = {
  name: 'spatial',
  findNext: (state: NavigationState, direction: Direction) => {
    console.log('[SpatialPlugin] checking direction:', direction);
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      console.log('[SpatialPlugin] no current node');
      return null;
    }
    console.log('[SpatialPlugin] current node id:', JSON.stringify(current.id), 'container:', current.containerId);

    // Phase 1: Search in same container only
    let best = findBestInContainer(current, state.nodes, direction, state, current.containerId);

    // Phase 2: If no result and current has container, search globally but penalize other containers
    if (!best && current.containerId) {
      console.log('[SpatialPlugin] no result in same container, searching globally');
      best = findBestGlobally(current, state.nodes, direction, state);
    }

    console.log('[SpatialPlugin] best:', best?.id ?? 'none');
    return best?.id ?? null;
  },
};

function findBestInContainer(
  current: NavNode,
  nodes: NavNode[],
  direction: Direction,
  state: NavigationState,
  containerId?: string
): NavNode | null {
  let best: NavNode | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (node.id === current.id || node.disabled) continue;
    if (containerId && node.containerId !== containerId) continue;
    if (!isInDirection(current.rect, node.rect, direction)) continue;

    const score = calculateScore(current, node, direction, state);
    console.log('[SpatialPlugin] [same container] checking:', node.id, 'container:', node.containerId, 'score:', score);
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

function findBestGlobally(
  current: NavNode,
  nodes: NavNode[],
  direction: Direction,
  state: NavigationState
): NavNode | null {
  let best: NavNode | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (node.id === current.id || node.disabled) continue;
    if (!isInDirection(current.rect, node.rect, direction)) continue;

    let score = calculateScore(current, node, direction, state);
    // Penalty for different container
    if (node.containerId !== current.containerId) {
      score += 50000;
      console.log('[SpatialPlugin] [global] penalty for different container:', node.id);
    }

    console.log('[SpatialPlugin] [global] checking:', node.id, 'container:', node.containerId, 'score:', score);
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

function calculateScore(
  current: NavNode,
  target: NavNode,
  direction: Direction,
  state: NavigationState
): number {
  const { dx, dy } = getDistance(current.rect, target.rect);
  const targetCenter = getCenter(target.rect);

  const sameRow = isSameRow(current.rect, target.rect);
  const sameColumn = isSameColumn(current.rect, target.rect);
  const overlaps = overlapsVertically(current.rect, target.rect);
  const sameContainer = current.containerId && target.containerId && current.containerId === target.containerId;
  const sameGroup = current.groupId && target.groupId && current.groupId === target.groupId;

  let distance = 0;
  let priority = 0;

  // Big bonus for staying in same container
  if (sameContainer) {
    priority += 10000;
    console.log('[SpatialPlugin] sameContainer bonus for', target.containerId);
  }

  // Even bigger bonus for staying in same group (handles submenus)
  if (sameGroup) {
    priority += 20000;
    console.log('[SpatialPlugin] sameGroup bonus for', target.groupId);
  }

  switch (direction) {
    case 'right':
      distance = dx + Math.abs(dy) * 2;
      if (sameRow) priority += 1000;
      if (overlaps) priority += 500;
      break;
    case 'left': {
      distance = Math.abs(dx) + Math.abs(dy) * 2;
      if (sameRow) priority += 1000;
      if (overlaps) priority += 500;
      // Directional memory for Y position
      const yDistanceFromMemory = Math.abs(targetCenter.y - (state.lastPositionByAxis?.y ?? 0));
      priority -= yDistanceFromMemory * 50;
      break;
    }
    case 'down': {
      distance = dy + Math.abs(dx) * 5;
      if (sameColumn) priority += 5000;
      // Row memory: prefer elements close to stored X position
      const targetRowDown = getRowKey(target.rect);
      const rememberedXDown = state.lastXByRow?.get(targetRowDown) ?? state.lastPositionByAxis?.x ?? 0;
      const xDistanceFromMemoryDown = Math.abs(targetCenter.x - rememberedXDown);
      priority -= xDistanceFromMemoryDown * 20;
      break;
    }
    case 'up': {
      distance = Math.abs(dy) + Math.abs(dx) * 5;
      if (sameColumn) priority += 3000;
      // Row memory: prefer elements close to stored X position
      const targetRowUp = getRowKey(target.rect);
      const rememberedXUp = state.lastXByRow?.get(targetRowUp) ?? state.lastPositionByAxis?.x ?? 0;
      const xDistanceFromMemoryUp = Math.abs(targetCenter.x - rememberedXUp);
      priority -= xDistanceFromMemoryUp * 20;
      break;
    }
  }

  return distance - priority;
}
