// ADAPTER - DOM → Engine
// Converts DOM elements to NavigationState

import { NavigationState } from '../core/types';

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
    disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
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

  return {
    currentId: resolvedCurrentId ?? null,
    nodes: nodes.map(({ el, ...node }) => node),
    lastXByRow: lastXByRow ?? new Map(),
    lastPositionByAxis: lastPositionByAxis ?? { x: 0, y: 0 },
  };
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
