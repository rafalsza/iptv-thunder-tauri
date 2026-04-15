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

    // Cluster into rows and assign grid positions
    const rowGroups: NavNode[][] = [];
    let currentRow: NavNode[] = [];

    for (const node of sortedNodes) {
      if (currentRow.length === 0) {
        currentRow.push(node);
      } else {
        const lastTop = currentRow.at(-1)!.rect.top;
        const topDiff = Math.abs(node.rect.top - lastTop);
        if (topDiff < ROW_THRESHOLD) {
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

    // Sort each row by left position and assign row/col positions
    for (let rowIdx = 0; rowIdx < rowGroups.length; rowIdx++) {
      // Sort by left position within each row
      rowGroups[rowIdx].sort((a, b) => a.rect.left - b.rect.left);
      for (let colIdx = 0; colIdx < rowGroups[rowIdx].length; colIdx++) {
        rowGroups[rowIdx][colIdx].gridPosition = { row: rowIdx, col: colIdx };
      }
    }

    // Calculate max elements in row
    let maxElementsInRow = 1;
    for (const elements of rowGroups) {
      maxElementsInRow = Math.max(maxElementsInRow, elements.length);
    }

    const columnCount = Math.max(1, maxElementsInRow);

    // Build index map for O(1) lookup
    const indexMap = new Map<number, NavNode>();
    for (const node of groupNodes) {
      if (node.index !== undefined) {
        indexMap.set(node.index, node);
      }
    }

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
    idCache.set(el, `tv-${Math.random().toString(36).substr(2, 9)}`);
  }
  return idCache.get(el)!;
}

export function findElementById(elements: HTMLElement[], id: string): HTMLElement | undefined {
  console.log('[domAdapter] findElementById looking for:', id, 'in', elements.length, 'elements');
  const found = elements.find(el => {
    const elId = el.dataset.tvId || el.id || idCache.get(el);
    const match = elId === id;
    if (match) {
      console.log('[domAdapter] found match:', elId, 'for element:', el.tagName);
    }
    return match;
  });
  if (!found) {
    console.log('[domAdapter] element not found, checking cache for each element:');
    elements.forEach((el, i) => {
      const cachedId = idCache.get(el);
      const dataId = el.dataset.tvId;
      const elId = el.id;
      console.log(`[domAdapter] element ${i}:`, { dataId, elId, cachedId, cacheHas: idCache.has(el) });
    });
  }
  return found;
}

export { isVisible } from '../utils/visibility';
export { filterVisibleElements } from '../utils/visibility';
