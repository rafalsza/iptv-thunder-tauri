// ADAPTER - DOM → Engine
// Converts DOM elements to NavigationState

import { NavigationState, GridData, NavNode } from '../core/types';

export function buildNavigationState(
  elements: HTMLElement[],
  currentId: string | null = null,
  lastXByRow?: Map<number, number>,
  lastPositionByAxis?: { x: number; y: number }
): NavigationState {
  // Generate IDs for all elements first to ensure consistency
  const nodes = elements.map(el => ({
    id: el.dataset.tvId || el.id || generateId(el),
    el,
    rect: el.getBoundingClientRect(),
    disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.dataset.tvDisabled !== undefined,
    containerId: (el.closest('[data-tv-container]') as HTMLElement | null)?.dataset.tvContainer,
    groupId: (el.closest('[data-tv-group]') as HTMLElement | null)?.dataset.tvGroup,
    index: el.dataset.tvIndex ? Number.parseInt(el.dataset.tvIndex) : undefined,
    isSearch: el.dataset.tvSearch !== undefined,
    isInitial: el.dataset.tvInitial !== undefined,
    isActive: el.dataset.tvActive === 'true',
  }));

  // Determine currentId: use provided, fallback to active element's generated ID
  let resolvedCurrentId = currentId;
  if (!resolvedCurrentId && document.activeElement) {
    const activeNode = nodes.find(n => n.el === document.activeElement);
    resolvedCurrentId = activeNode?.id ?? document.activeElement.id ?? null;
  }

  const nodesWithoutEl = nodes.map(({ el, ...node }) => node);

  return {
    currentId: resolvedCurrentId ?? null,
    nodes: nodesWithoutEl,
    lastXByRow: lastXByRow ?? new Map(),
    lastPositionByAxis: lastPositionByAxis ?? { x: 0, y: 0 },
    grid: computeGridData(nodesWithoutEl),
  };
}

function clusterNodesIntoRows(sortedNodes: NavNode[], threshold: number): NavNode[][] {
  const rowGroups: NavNode[][] = [];
  let currentRow: NavNode[] = [];

  for (const node of sortedNodes) {
    if (currentRow.length === 0) {
      currentRow.push(node);
    } else {
      const lastTop = currentRow.at(-1)!.rect.top;
      const topDiff = Math.abs(node.rect.top - lastTop);
      if (topDiff < threshold) {
        currentRow.push(node);
      } else {
        rowGroups.push(currentRow);
        currentRow = [node];
      }
    }
  }
  if (currentRow.length > 0) {
    rowGroups.push(currentRow);
  }

  return rowGroups;
}

function assignGridPositions(rowGroups: NavNode[][]): void {
  for (let rowIdx = 0; rowIdx < rowGroups.length; rowIdx++) {
    rowGroups[rowIdx].sort((a, b) => a.rect.left - b.rect.left);
    for (let colIdx = 0; colIdx < rowGroups[rowIdx].length; colIdx++) {
      rowGroups[rowIdx][colIdx].gridPosition = { row: rowIdx, col: colIdx };
    }
  }
}

function calculateColumnCount(rowGroups: NavNode[][]): number {
  let maxElementsInRow = 1;
  for (const elements of rowGroups) {
    maxElementsInRow = Math.max(maxElementsInRow, elements.length);
  }
  return Math.max(1, maxElementsInRow);
}

function buildIndexMap(groupNodes: NavNode[]): Map<number, NavNode> {
  const indexMap = new Map<number, NavNode>();
  for (const node of groupNodes) {
    if (node.index !== undefined) {
      indexMap.set(node.index, node);
    }
  }
  return indexMap;
}

function computeGridData(nodes: NavNode[]): Map<string, GridData> {
  const gridMap = new Map<string, GridData>();
  const ROW_THRESHOLD = 20; // pixels - elements within this distance are considered same row

  // Group nodes by groupId and containerId
  const groupKeys = new Set<string>();
  for (const node of nodes) {
    if (node.groupId && node.containerId && node.index !== undefined) {
      groupKeys.add(`${node.groupId}|${node.containerId}`);
    }
  }

  for (const groupKey of groupKeys) {
    const [groupId, containerId] = groupKey.split('|');
    
    // Filter nodes for this group
    const groupNodes = nodes.filter(n =>
      n.index !== undefined &&
      n.groupId === groupId &&
      n.containerId === containerId
    );

    if (groupNodes.length === 0) continue;

    // Sort by top position
    const sortedNodes = [...groupNodes].sort((a, b) => a.rect.top - b.rect.top);

    // Check if this is a vertical list (all elements at same top position, like episodes)
    // or a horizontal grid (elements at different tops)
    const uniqueTops = new Set(sortedNodes.map(n => Math.round(n.rect.top)));
    const isVerticalList = uniqueTops.size === 1 && sortedNodes.length > 1;

    let rowGroups: NavNode[][];
    if (isVerticalList) {
      // For vertical lists (like episodes), create one row per element based on index
      rowGroups = sortedNodes.map(node => [node]);
    } else {
      // For horizontal grids, cluster by position
      rowGroups = clusterNodesIntoRows(sortedNodes, ROW_THRESHOLD);
    }

    // Sort each row by left position and assign row/col positions
    assignGridPositions(rowGroups);

    // Calculate column count
    const columnCount = calculateColumnCount(rowGroups);

    // Build index map for O(1) lookup
    const indexMap = buildIndexMap(groupNodes);

    gridMap.set(groupKey, {
      rows: rowGroups,
      columnCount,
      indexMap,
    });
  }

  return gridMap;
}

const idCache = new WeakMap<HTMLElement, string>();

function generateId(el: HTMLElement): string {
  if (!idCache.has(el)) {
    idCache.set(el, `tv-${Math.random().toString(36).substring(2, 11)}`);
  }
  return idCache.get(el)!;
}

export function findElementById(elements: HTMLElement[], id: string): HTMLElement | undefined {
  return elements.find(el => {
    const elId = el.dataset.tvId || el.id || idCache.get(el);
    return elId === id;
  });
}

export { isVisible } from '../utils/visibility';
export { filterVisibleElements } from '../utils/visibility';
