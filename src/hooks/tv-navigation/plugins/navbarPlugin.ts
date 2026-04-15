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
  console.log('[NavbarPlugin] findSubmenuForNavbar', direction, 'submenu elements:', submenuElements.length);

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
    console.log('[NavbarPlugin] findSubmenuForNavbar: submenu not in direction, skip');
  }

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
    console.log('[NavbarPlugin] findSubmenuForNavbar: other navbar elements between current and submenu, skip');
    return null;
  }

  console.log('[NavbarPlugin] findSubmenuForNavbar result:', firstSubmenu.id, '(directly below)');
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
    console.log('[NavbarPlugin] findSubmenuForNavbar: other navbar elements between submenu and current, skip');
    return null;
  }

  console.log('[NavbarPlugin] findSubmenuForNavbar result:', lastSubmenu.id, '(directly above)');
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
  console.log('[NavbarPlugin] findParentNavbarForSubmenu, navbar elements:', navbarElements.length);
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
      console.log('[NavbarPlugin] findParentNavbarForSubmenu: not first in submenu, skip');
      return null;
    }

    const parentNavbar = navbarElements
      .filter(n => n.rect.top < currentNode.rect.top)
      .sort((a, b) => b.rect.top - a.rect.top)[0];

    if (parentNavbar) {
      console.log('[NavbarPlugin] findParentNavbarForSubmenu result:', parentNavbar.id);
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
