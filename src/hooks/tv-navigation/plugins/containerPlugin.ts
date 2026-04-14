// PLUGIN - Container Navigation
// Handles container-specific navigation rules

import { NavigationState, Direction, NavigationPlugin } from '../core/types';

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

    // Special case: going down from search input
    if (direction === 'down' && current.isSearch) {
      console.log('[ContainerPlugin] match: down from search');
      return findMainInitial(state);
    }

    // Special case: going left from search input
    if (direction === 'left' && current.isSearch) {
      console.log('[ContainerPlugin] match: left from search');
      return findNavigationActive(state);
    }

    // Special case: going right from navigation container
    if (direction === 'right' && current.containerId === 'navigation') {
      console.log('[ContainerPlugin] match: right from navigation');
      return findMainInitial(state);
    }

    // Special case: going right from settings tabs
    if (direction === 'right' && current.groupId === 'settings-tabs') {
      console.log('[ContainerPlugin] match: right from settings-tabs');
      return findSettingsContentInitial(state);
    }

    // Special case: going right from favorite-categories
    if (direction === 'right' && current.groupId === 'favorite-categories') {
      console.log('[ContainerPlugin] match: right from favorite-categories');
      return findPortalsNavItem(state);
    }

    // Special case: going down from navbar item with submenu
    // If there are elements in navigation with different group, it's a submenu
    if (direction === 'down' && current.groupId === 'navbar') {
      const submenu = findSubmenuForNavbar(state, current, 'down');
      if (submenu) {
        console.log('[ContainerPlugin] match: down from navbar to submenu');
        return submenu;
      }
    }

    // Special case: going up from first navbar item - block it (nothing above)
    if (direction === 'up' && current.groupId === 'navbar') {
      // Check if this is the first navbar element
      const navbarElements = state.nodes.filter(n => n.groupId === 'navbar');
      navbarElements.sort((a, b) => a.rect.top - b.rect.top);
      const isFirst = navbarElements[0]?.id === current.id;
      if (isFirst) {
        console.log('[ContainerPlugin] match: up from first navbar - blocking, staying on', current.id);
        return current.id; // Block navigation - stay on current element
      }
    }

    // Special case: going up from navbar item below submenu
    // If submenu is above current navbar item, go to last submenu item
    if (direction === 'up' && current.groupId === 'navbar') {
      const submenuLast = findSubmenuForNavbar(state, current, 'up');
      if (submenuLast) {
        console.log('[ContainerPlugin] match: up from navbar to submenu');
        return submenuLast;
      }
    }

    // Special case: going up from first submenu item to parent navbar item
    // If we're in a submenu and it's the first item, go up to navbar item above
    if (direction === 'up' && current.groupId && current.groupId !== 'navbar') {
      const parentNavbar = findParentNavbarForSubmenu(state, current);
      if (parentNavbar) {
        console.log('[ContainerPlugin] match: up from submenu to navbar');
        return parentNavbar;
      }
    }

    // Note: removed 'left from main' rule - let spatial handle intra-container navigation
    // Spatial will find elements in same row/column within main container

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

function findSubmenuForNavbar(
  state: NavigationState,
  current: { id: string; containerId?: string; groupId?: string },
  direction: 'up' | 'down'
): string | null {
  // Find submenu elements - elements in same container but different group
  const submenuElements = state.nodes.filter(
    n => n.containerId === current.containerId && n.groupId && n.groupId !== current.groupId
  );
  console.log('[ContainerPlugin] findSubmenuForNavbar', direction, 'submenu elements:', submenuElements.length);
  if (submenuElements.length > 0) {
    // Sort by top position
    submenuElements.sort((a, b) => a.rect.top - b.rect.top);

    // Get current element rect
    const currentNode = state.nodes.find(n => n.id === current.id);
    if (!currentNode) return null;

    if (direction === 'down') {
      // For down: return first submenu element only if current is DIRECTLY above submenu
      // (no other navbar elements between current and submenu)
      const firstSubmenu = submenuElements[0];
      if (firstSubmenu.rect.top > currentNode.rect.top) {
        // Check if there are any navbar elements between current and submenu
        const navbarElements = state.nodes.filter(
          n => n.containerId === current.containerId && n.groupId === 'navbar' &&
               n.rect.top > currentNode.rect.top && n.rect.top < firstSubmenu.rect.top
        );
        if (navbarElements.length === 0) {
          // Current is directly above submenu
          console.log('[ContainerPlugin] findSubmenuForNavbar result:', firstSubmenu.id, '(directly below)');
          return firstSubmenu.id;
        }
        console.log('[ContainerPlugin] findSubmenuForNavbar: other navbar elements between current and submenu, skip');
      }
    } else if (direction === 'up') {
      // For up: return last submenu element only if current is DIRECTLY below submenu
      // (no other navbar elements between submenu and current)
      const lastSubmenu = submenuElements.at(-1);
      if (lastSubmenu && lastSubmenu.rect.top < currentNode.rect.top) {
        // Check if there are any navbar elements between submenu and current
        const navbarElements = state.nodes.filter(
          n => n.containerId === current.containerId && n.groupId === 'navbar' &&
               n.rect.top > lastSubmenu.rect.top && n.rect.top < currentNode.rect.top
        );
        if (navbarElements.length === 0) {
          // Current is directly below submenu
          console.log('[ContainerPlugin] findSubmenuForNavbar result:', lastSubmenu.id, '(directly above)');
          return lastSubmenu.id;
        }
        console.log('[ContainerPlugin] findSubmenuForNavbar: other navbar elements between submenu and current, skip');
      }
    }
    console.log('[ContainerPlugin] findSubmenuForNavbar: submenu not in direction, skip');
    return null;
  }
  return null;
}
