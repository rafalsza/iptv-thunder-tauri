// PLUGIN - Container Navigation
// Handles container-specific navigation rules

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

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
  { match: (d, c) => d === 'right' && c.groupId === 'settings-tabs', handler: findSettingsContentInitial, log: 'right from settings-tabs' },
  { match: (d, c) => d === 'right' && c.groupId === 'favorite-categories', handler: findPortalsNavItem, log: 'right from favorite-categories' },
];

function handleNavbarNavigation(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (current.groupId !== 'navbar') return null;

  if (direction === 'down') {
    return findSubmenuForNavbar(state, current, 'down');
  }

  if (direction === 'up') {
    const navbarElements = state.nodes.filter(n => n.groupId === 'navbar');
    navbarElements.sort((a, b) => a.rect.top - b.rect.top);

    if (navbarElements[0]?.id === current.id) {
      return current.id;
    }

    return findSubmenuForNavbar(state, current, 'up');
  }

  return null;
}

function handleSubmenuNavigation(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (direction !== 'up' || !current.groupId || current.groupId === 'navbar') return null;
  return findParentNavbarForSubmenu(state, current);
}

export const containerPlugin: NavigationPlugin = {
  name: 'container',
  findNext: (state: NavigationState, direction: Direction) => {
    console.log('[ContainerPlugin] checking direction:', direction);
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      console.log('[ContainerPlugin] no current node');
      return null;
    }
    console.log('[ContainerPlugin] current:', current.id, 'container:', current.containerId, 'isSearch:', current.isSearch);

    for (const rule of rules) {
      if (rule.match(direction, current)) {
        console.log('[ContainerPlugin] match:', rule.log);
        return rule.handler(state, current);
      }
    }

    const navbarResult = handleNavbarNavigation(state, current, direction);
    if (navbarResult) {
      const isBlocked = navbarResult === current.id;
      console.log('[ContainerPlugin] match:', isBlocked ? 'up from first navbar - blocking' : `${direction} from navbar to submenu`);
      return navbarResult;
    }

    const submenuResult = handleSubmenuNavigation(state, current, direction);
    if (submenuResult) {
      console.log('[ContainerPlugin] match: up from submenu to navbar');
      return submenuResult;
    }

    console.log('[ContainerPlugin] no match found');
    return null;
  },
};

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

function findSettingsContentInitial(state: NavigationState): string | null {
  const contentElements = state.nodes.filter(n => n.groupId === 'settings-content');
  const initialElement = contentElements.find(n => n.isInitial);
  return initialElement?.id ?? null;
}

function findPortalsNavItem(state: NavigationState): string | null {
  const navElements = state.nodes.filter(n => n.containerId === 'navigation');
  const portalsItem = navElements.find(n => n.isInitial);
  return portalsItem?.id ?? null;
}

function findParentNavbarForSubmenu(state: NavigationState, current: { id: string; containerId?: string; groupId?: string }): string | null {
  // Find navbar elements in same container
  const navbarElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId === 'navbar'
  );
  console.log('[ContainerPlugin] findParentNavbarForSubmenu, navbar elements:', navbarElements.length);
  if (navbarElements.length > 0) {
    // Sort by top position
    navbarElements.sort((a, b) => a.rect.top - b.rect.top);

    // Get current element
    const currentNode = state.nodes.find(n => n.id === current.id);
    if (!currentNode) return null;

    // Check if current is the first element in its submenu group
    const submenuElements = state.nodes.filter(
      n => n.containerId === current.containerId && n.groupId === current.groupId
    );
    submenuElements.sort((a, b) => a.rect.top - b.rect.top);
    const isFirstInSubmenu = submenuElements[0]?.id === current.id;

    if (!isFirstInSubmenu) {
      console.log('[ContainerPlugin] findParentNavbarForSubmenu: not first in submenu, skip');
      return null;
    }

    // Find navbar element directly above current submenu
    const parentNavbar = navbarElements
      .filter(n => n.rect.top < currentNode.rect.top)
      .sort((a, b) => b.rect.top - a.rect.top)[0]; // Sort descending to get closest above

    if (parentNavbar) {
      console.log('[ContainerPlugin] findParentNavbarForSubmenu result:', parentNavbar.id);
      return parentNavbar.id;
    }
  }
  return null;
}

function hasNavbarBetween(
  state: NavigationState,
  containerId: string | undefined,
  top: number,
  bottom: number
): boolean {
  return state.nodes.some(
    n => n.containerId === containerId && n.groupId === 'navbar' &&
         n.rect.top > top && n.rect.top < bottom
  );
}

function findSubmenuDown(
  state: NavigationState,
  current: { id: string; containerId?: string },
  currentNode: NavigationState['nodes'][0],
  submenuElements: NavigationState['nodes']
): string | null {
  const firstSubmenu = submenuElements[0];
  if (firstSubmenu.rect.top <= currentNode.rect.top) {
    return null;
  }

  if (hasNavbarBetween(state, current.containerId, currentNode.rect.top, firstSubmenu.rect.top)) {
    console.log('[ContainerPlugin] findSubmenuForNavbar: other navbar elements between current and submenu, skip');
    return null;
  }

  console.log('[ContainerPlugin] findSubmenuForNavbar result:', firstSubmenu.id, '(directly below)');
  return firstSubmenu.id;
}

function findSubmenuUp(
  state: NavigationState,
  current: { id: string; containerId?: string },
  currentNode: NavigationState['nodes'][0],
  submenuElements: NavigationState['nodes']
): string | null {
  const lastSubmenu = submenuElements.at(-1);
  if (!lastSubmenu || lastSubmenu.rect.top >= currentNode.rect.top) {
    return null;
  }

  if (hasNavbarBetween(state, current.containerId, lastSubmenu.rect.top, currentNode.rect.top)) {
    console.log('[ContainerPlugin] findSubmenuForNavbar: other navbar elements between submenu and current, skip');
    return null;
  }

  console.log('[ContainerPlugin] findSubmenuForNavbar result:', lastSubmenu.id, '(directly above)');
  return lastSubmenu.id;
}

function findSubmenuForNavbar(
  state: NavigationState,
  current: { id: string; containerId?: string; groupId?: string },
  direction: 'up' | 'down'
): string | null {
  const submenuElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId && n.groupId !== current.groupId
  );
  console.log('[ContainerPlugin] findSubmenuForNavbar', direction, 'submenu elements:', submenuElements.length);

  if (submenuElements.length === 0) {
    return null;
  }

  submenuElements.sort((a, b) => a.rect.top - b.rect.top);

  const currentNode = state.nodes.find(n => n.id === current.id);
  if (!currentNode) {
    return null;
  }

  const result = direction === 'down'
    ? findSubmenuDown(state, current, currentNode, submenuElements)
    : findSubmenuUp(state, current, currentNode, submenuElements);

  if (!result) {
    console.log('[ContainerPlugin] findSubmenuForNavbar: submenu not in direction, skip');
  }

  return result;
}
