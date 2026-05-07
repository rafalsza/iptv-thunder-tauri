// PLUGIN - Navbar/Submenu Navigation
// Handles navigation between navbar items and their submenus

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

function hasSubmenu(state: NavigationState, current: NavigationState['nodes'][0]): boolean {
  const submenuElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId && n.groupId !== current.groupId
  );
  return submenuElements.length > 0;
}

function findSubmenuForNavbar(
  state: NavigationState,
  current: { id: string; containerId?: string; groupId?: string },
  direction: 'up' | 'down'
): string | null {
  const submenuElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId && n.groupId !== current.groupId
  );

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

  return result;
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
    return null;
  }

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
    return null;
  }

  return lastSubmenu.id;
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

function findParentNavbarForSubmenu(state: NavigationState, current: { id: string; containerId?: string; groupId?: string }): string | null {
  const navbarElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId === 'navbar'
  );
  if (navbarElements.length > 0) {
    navbarElements.sort((a, b) => a.rect.top - b.rect.top);

    const currentNode = state.nodes.find(n => n.id === current.id);
    if (!currentNode) return null;

    const submenuElements = state.nodes.filter(
      n => n.containerId === current.containerId && n.groupId === current.groupId
    );
    submenuElements.sort((a, b) => a.rect.top - b.rect.top);
    const isFirstInSubmenu = submenuElements[0]?.id === current.id;

    if (!isFirstInSubmenu) {
      return null;
    }

    const parentNavbar = navbarElements
      .filter(n => n.rect.top < currentNode.rect.top)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (parentNavbar) {
      return parentNavbar.id;
    }
  }
  return null;
}

function handleNavbarNavigation(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (current.groupId !== 'navbar') return null;

  if (!hasSubmenu(state, current)) {
    return null;
  }

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
  
  // Only return parent navbar if on first submenu item overall (by rect.top)
  // Otherwise return null to let containerPlugin handle navigation within submenu
  const allSubmenuElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId !== 'navbar'
  );
  allSubmenuElements.sort((a, b) => a.rect.top - b.rect.top);
  const isFirstInSubmenu = allSubmenuElements[0]?.id === current.id;
  
  if (!isFirstInSubmenu) {
    return null;
  }
  
  return findParentNavbarForSubmenu(state, current);
}

export const navbarPlugin: NavigationPlugin = {
  name: 'navbar',
  findNext: (state: NavigationState, direction: Direction) => {
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) return null;

    const navbarResult = handleNavbarNavigation(state, current, direction);
    if (navbarResult) return navbarResult;

    const submenuResult = handleSubmenuNavigation(state, current, direction);
    if (submenuResult) return submenuResult;

    return null;
  },
};
