// PLUGIN - Container Navigation
// Handles container switching and last focus restore
// NOTE: All state lives in PluginContext.container (instance-scoped, NOT global)

import { NavigationState, Direction, NavigationPlugin, PluginContext } from '../core/types';
import { GRID_GROUPS } from './gridPlugin';

type Handler = (state: NavigationState, current: NavigationState['nodes'][0]) => string | null;

interface Rule {
  match: (direction: Direction, current: NavigationState['nodes'][0], state: NavigationState) => boolean;
  handler: Handler;
  log: string;
}

const rules: Rule[] = [
  { match: (d, c, _) => d === 'down' && !!c.isSearch, handler: findMainInitial, log: 'down from search' },
  { match: (d, c, _) => d === 'left' && !!c.isSearch, handler: findNavigationActive, log: 'left from search' },
  { match: (d, c, _) => d === 'right' && c.containerId === 'navigation', handler: findMainInitial, log: 'right from navigation' },
  // SeriesDetails navigation - LEFT/RIGHT within series-actions (PRIORITY before left from main)
  { match: (d, c, _) => d === 'right' && c.groupId === 'series-actions', handler: findNextInSeriesActions, log: 'right within series-actions' },
  { match: (d, c, _) => d === 'left' && c.groupId === 'series-actions', handler: findPrevInSeriesActions, log: 'left within series-actions' },
  // General navigation rules
  { match: (d, c, _) => d === 'left' && c.containerId === 'main' && !GRID_GROUPS.has(c.groupId || '') && c.groupId !== 'movie-actions', handler: findNavigationActive, log: 'left from main (non-grid, non-movie-actions)' },
  { match: (d, c, _) => d === 'up' && c.groupId === 'movie-actions' && !c.isInitial, handler: findMovieActionsInitial, log: 'up from movie-actions to X' },
  { match: (d, c, _) => d === 'back' && c.groupId === 'portal-actions', handler: findPortalsContentActive, log: 'back from portal-actions' },
  // From back button, go to poster (below), otherwise go to season selector
  { match: (d, c, _) => d === 'down' && c.id === 'series-back-btn', handler: findSeriesPosterFromBackBtn, log: 'down from back-btn to poster' },
  { match: (d, c, _) => d === 'down' && c.groupId === 'series-actions', handler: findSeriesControlsFromAnyAction, log: 'down from other series-actions' },
  { match: (d, c, _) => d === 'up' && c.groupId === 'series-controls', handler: findSeriesActionsLast, log: 'up from series-controls to last action' },
  { match: (d, c, _) => d === 'down' && c.groupId === 'series-controls', handler: findSeriesEpisodesInitial, log: 'down from series-controls' },
  { match: (d, c, _) => d === 'up' && c.groupId === 'series-episodes' && c.index === 0, handler: findSeriesControlsOrActions, log: 'up from first episode' },
  { match: (d, c, _) => d === 'down' && c.groupId === 'series-episodes', handler: checkLastEpisodeAndBlock, log: 'down from episodes (block if last)' },
];

function getTargetContainer(
  state: NavigationState,
  current: NavigationState['nodes'][0],
  direction: Direction,
  context?: PluginContext
): { targetId: string | null; newContainerId: string | null } {
  for (const rule of rules) {
    const matched = rule.match(direction, current, state);
    console.log('[ContainerPlugin] checking rule:', rule.log, 'matched:', matched);
    if (matched) {
      const targetId = rule.handler(state, current);
      console.log('[ContainerPlugin] rule handler result:', targetId);
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
        // Try to restore last focus in new container, but only if group HAS changed
        // (when moving within the same group, use the explicit target from the rule)
        const targetNode = state.nodes.find(n => n.id === targetId);
        if (targetNode?.groupId !== current.groupId) {
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

function findMovieActionsInitial(state: NavigationState): string | null {
  const movieActionsElements = state.nodes.filter(n => n.groupId === 'movie-actions');
  const initialElement = movieActionsElements.find(n => n.isInitial);
  return initialElement?.id ?? null;
}

// SeriesDetails navigation helpers
function findSeriesEpisodesInitial(state: NavigationState): string | null {
  const episodes = state.nodes.filter(n => n.groupId === 'series-episodes' && !n.disabled);
  return episodes.find(n => n.index === 0)?.id ?? episodes[0]?.id ?? null;
}

function findSeriesControlsOrActions(state: NavigationState): string | null {
  // First try to find season selector
  const controlsElements = state.nodes.filter(n => n.groupId === 'series-controls' && !n.disabled);
  if (controlsElements.length > 0) {
    return controlsElements[0]?.id ?? null;
  }
  // Fallback to actions
  const actionsElements = state.nodes.filter(n => n.groupId === 'series-actions' && !n.disabled);
  return actionsElements.find(n => n.isInitial)?.id ?? actionsElements[0]?.id ?? null;
}

function getSeriesActionsElements(state: NavigationState) {
  return state.nodes
    .filter(n => n.groupId === 'series-actions' && !n.disabled)
    .sort((a, b) => {
      // Sort by Y first (row), then by X (column within row)
      const yDiff = a.rect.top - b.rect.top;
      if (Math.abs(yDiff) > 20) return yDiff; // Different rows
      return a.rect.left - b.rect.left; // Same row, sort by X
    });
}

function findNextInSeriesActions(state: NavigationState, current: NavigationState['nodes'][0]): string | null {
  const elements = getSeriesActionsElements(state);
  console.log('[ContainerPlugin] findNextInSeriesActions: elements count:', elements.length, 'ids:', elements.map(e => e.id));
  const currentIndex = elements.findIndex(n => n.id === current.id);
  console.log('[ContainerPlugin] findNextInSeriesActions: currentIndex:', currentIndex, 'current.id:', current.id);
  if (currentIndex === -1 || currentIndex >= elements.length - 1) {
    console.log('[ContainerPlugin] findNextInSeriesActions: at end or not found');
    return null; // At the end, let spatial plugin handle it or stay
  }
  const result = elements[currentIndex + 1]?.id ?? null;
  console.log('[ContainerPlugin] findNextInSeriesActions: result:', result);
  return result;
}

function findPrevInSeriesActions(state: NavigationState, current: NavigationState['nodes'][0]): string | null {
  const elements = getSeriesActionsElements(state);
  const currentIndex = elements.findIndex(n => n.id === current.id);
  if (currentIndex <= 0) {
    return null; // At the start, let spatial plugin handle it or stay
  }
  return elements[currentIndex - 1]?.id ?? null;
}

function findSeriesActionsLast(state: NavigationState): string | null {
  const elements = getSeriesActionsElements(state);
  return elements.at(-1)?.id ?? null;
}

function findSeriesPosterFromBackBtn(state: NavigationState): string | null {
  // From back button, go to poster (below in the layout)
  const poster = state.nodes.find(n => n.id === 'series-poster' && !n.disabled);
  if (poster) {
    return poster.id;
  }
  // Fallback to other actions
  const playFirst = state.nodes.find(n => n.id === 'series-play-first' && !n.disabled);
  if (playFirst) {
    return playFirst.id;
  }
  // Fallback to season selector
  const controlsElement = state.nodes.find(n => n.groupId === 'series-controls' && !n.disabled);
  return controlsElement?.id ?? null;
}

function findSeriesControlsFromAnyAction(state: NavigationState): string | null {
  // From any series-actions element, DOWN goes to season selector (series-controls)
  const controlsElement = state.nodes.find(n => n.groupId === 'series-controls' && !n.disabled);
  return controlsElement?.id ?? null;
}

function checkLastEpisodeAndBlock(state: NavigationState, current: NavigationState['nodes'][0]): string | null {
  console.log('[ContainerPlugin] checkLastEpisodeAndBlock called, current.id:', current.id, 'current.groupId:', current.groupId);
  // Check if current is the last episode in the group
  const episodes = state.nodes.filter(n => n.groupId === 'series-episodes' && !n.disabled);
  const sortedEpisodes = [...episodes].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const lastEpisode = sortedEpisodes.at(-1);
  console.log('[ContainerPlugin] episodes count:', episodes.length, 'lastEpisode.id:', lastEpisode?.id);

  // If current is the last episode, block navigation (return empty string to stay on current)
  if (current.id === lastEpisode?.id) {
    console.log('[ContainerPlugin] last episode reached, blocking DOWN');
    return current.id; // Return current ID to stay on current element
  }

  // Otherwise, let spatial plugin handle it
  console.log('[ContainerPlugin] not last episode, letting spatial plugin handle');
  return null;
}
