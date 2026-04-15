// PLUGIN - Container Navigation
// Handles container switching and last focus restore
// NOTE: All state lives in PluginContext.container (instance-scoped, NOT global)

import { NavigationState, Direction, NavigationPlugin, PluginContext } from '../core/types';
import { GRID_GROUPS } from './gridPlugin';

type Handler = (state: NavigationState, current: NavigationState['nodes'][0]) => string | null;

interface Rule {
  match: (direction: Direction, current: NavigationState['nodes'][0]) => boolean;
  handler: Handler;
  log: string;
}

const rules: Rule[] = [
  { match: (d, c) => d === 'down' && !!c.isSearch, handler: findMainInitial, log: 'down from search' },
  { match: (d, c) => d === 'left' && !!c.isSearch, handler: findNavigationActive, log: 'left from search' },
  { match: (d, c) => d === 'right' && c.containerId === 'navigation', handler: findMainInitial, log: 'right from navigation' },
  { match: (d, c) => d === 'left' && c.containerId === 'main' && !GRID_GROUPS.has(c.groupId || ''), handler: findNavigationActive, log: 'left from main (non-grid)' },
  { match: (d, c) => d === 'back' && c.groupId === 'portal-actions', handler: findPortalsContentActive, log: 'back from portal-actions' },
];

function getTargetContainer(
  state: NavigationState,
  current: NavigationState['nodes'][0],
  direction: Direction,
  context?: PluginContext
): { targetId: string | null; newContainerId: string | null } {
  for (const rule of rules) {
    if (rule.match(direction, current)) {
      const targetId = rule.handler(state, current);
      if (targetId) {
        const targetNode = state.nodes.find(n => n.id === targetId);
        return { targetId, newContainerId: targetNode?.containerId ?? null };
      }
    }
  }

  if (context && (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down')) {
    // Auto-container switching will be handled by spatial plugin result
  }

  return { targetId: null, newContainerId: null };
}

// Restore last focus when entering a container (via context)
function restoreLastFocus(context: PluginContext | undefined, containerId: string, state: NavigationState): string | null {
  const lastElementId = context?.container.lastFocusedByContainer.get(containerId);
  if (!lastElementId) return null;

  const element = state.nodes.find(n => n.id === lastElementId);
  if (element && !element.disabled) {
    return element.id;
  }
  return null;
}

// Save focus for a container (via context)
function saveContainerFocus(context: PluginContext | undefined, containerId: string | undefined, elementId: string): void {
  if (containerId && context) {
    context.container.lastFocusedByContainer.set(containerId, elementId);
  }
}

// Get last focused element ID for a container (via context)
function getLastFocus(context: PluginContext | undefined, containerId: string): string | null {
  return context?.container.lastFocusedByContainer.get(containerId) ?? null;
}

// Get active container ID (via context)
function getActiveContainerId(context: PluginContext | undefined): string | null {
  return context?.container.activeContainerId ?? null;
}

// Set active container ID (via context)
function setActiveContainerId(context: PluginContext | undefined, containerId: string | null): void {
  if (context) {
    context.container.activeContainerId = containerId;
  }
}

export const containerPlugin: NavigationPlugin = {
  name: 'container',
  findNext: (state: NavigationState, direction: Direction, context?: PluginContext) => {
    console.log('[ContainerPlugin] checking direction:', direction);
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      console.log('[ContainerPlugin] no current node');
      return null;
    }
    console.log('[ContainerPlugin] current:', current.id, 'container:', current.containerId, 'isSearch:', current.isSearch);

    // Single source of truth for all container navigation
    const { targetId, newContainerId } = getTargetContainer(state, current, direction, context);
    if (targetId && targetId !== current.id) {
      // Only save current focus when actually navigating away
      saveContainerFocus(context, current.containerId, current.id);

      // Update active container if changed
      const activeId = getActiveContainerId(context);
      if (newContainerId && newContainerId !== activeId) {
        setActiveContainerId(context, newContainerId);
        // Try to restore last focus in new container, but only if group hasn't changed
        // (when moving to a different group, use the explicit target instead)
        const targetNode = state.nodes.find(n => n.id === targetId);
        if (targetNode?.groupId === current.groupId) {
          const restoredId = restoreLastFocus(context, newContainerId, state);
          if (restoredId && restoredId !== targetId) {
            console.log('[ContainerPlugin] restored last focus:', restoredId);
            return restoredId;
          }
        }
      }
      return targetId;
    }

    console.log('[ContainerPlugin] no match found');
    return null;
  },
  onContainerChange: (container: HTMLElement | null, context: PluginContext) => {
    const newContainerId = container?.id ?? null;
    const activeId = getActiveContainerId(context);
    if (newContainerId !== activeId) {
      console.log('[ContainerPlugin] container changed:', activeId, '->', newContainerId);
      setActiveContainerId(context, newContainerId);
    }
  },
};

// Export container management API for use by hook (context-aware versions)
export { getActiveContainerId, setActiveContainerId, saveContainerFocus, getLastFocus, restoreLastFocus };

function findMainInitial(state: NavigationState): string | null {
  console.log('[ContainerPlugin] findMainInitial, main elements:', state.nodes.filter(n => n.containerId === 'main').length);
  const mainElements = state.nodes.filter(n => n.containerId === 'main');
  const initialElement = mainElements.find(n => n.isInitial);
  const result = initialElement?.id ?? mainElements[0]?.id ?? null;
  console.log('[ContainerPlugin] findMainInitial result:', result);
  return result;
}

function findNavigationActive(state: NavigationState): string | null {
  console.log('[ContainerPlugin] findNavigationActive, nav elements:', state.nodes.filter(n => n.containerId === 'navigation').length);
  const navElements = state.nodes.filter(n => n.containerId === 'navigation');
  const activeElement = navElements.find(n => n.isActive);
  const result = activeElement?.id ?? navElements[0]?.id ?? null;
  console.log('[ContainerPlugin] findNavigationActive result:', result);
  return result;
}

function findPortalsContentActive(state: NavigationState): string | null {
  const contentElements = state.nodes.filter(n => n.groupId === 'portals-content');
  const activeElement = contentElements.find(n => n.isActive);
  return activeElement?.id ?? contentElements.find(n => n.isInitial)?.id ?? null;
}
