// CORE ENGINE - Pure logic, no React, no DOM
// Only plugin orchestration

import { Direction, NavigationState, NavigationPlugin, PluginContext } from './types';

export function findNextNode(
  state: NavigationState,
  direction: Direction,
  plugins: NavigationPlugin[] = [],
  context?: PluginContext
): string | null {
  console.log('[Engine] findNextNode called:', direction);
  console.log('[Engine] currentId:', state.currentId);
  console.log('[Engine] nodes count:', state.nodes.length);

  const current = state.nodes.find(n => n.id === state.currentId);
  if (!current) {
    console.log('[Engine] no current node found');
    return null;
  }
  console.log('[Engine] current node:', current.id, 'container:', current.containerId, 'group:', current.groupId);

  // Try each plugin in order
  for (const plugin of plugins) {
    console.log('[Engine] trying plugin:', plugin.name);
    const result = plugin.findNext(state, direction, context);
    console.log('[Engine] plugin', plugin.name, 'result:', result);
    if (result) return result;
  }

  console.log('[Engine] no plugin returned result');
  return null;
}
