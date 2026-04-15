// PLUGIN - Focus Trapping
// Traps focus within specific groups (e.g., portal-actions) to prevent escape

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

function handlePortalActionsNavigation(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (current.groupId !== 'portal-actions') return null;

  if (direction !== 'up' && direction !== 'down') return null;

  const menuElements = state.nodes.filter(n => n.groupId === 'portal-actions' && !n.disabled);
  if (menuElements.length === 0) return null;

  menuElements.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const currentIndex = menuElements.findIndex(n => n.id === current.id);
  if (currentIndex === -1) return null;

  if (direction === 'up' && currentIndex > 0) {
    return menuElements[currentIndex - 1].id;
  }
  if (direction === 'down' && currentIndex < menuElements.length - 1) {
    return menuElements[currentIndex + 1].id;
  }

  return current.id;
}

export const trapFocusPlugin: NavigationPlugin = {
  name: 'trapFocus',
  findNext: (state: NavigationState, direction: Direction) => {
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) return null;

    return handlePortalActionsNavigation(state, current, direction);
  },
};
