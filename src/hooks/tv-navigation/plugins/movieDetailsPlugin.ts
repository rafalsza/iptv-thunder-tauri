// PLUGIN - Movie Details Navigation
// Handles navigation within movie details view and resume dialog

import { NavigationState, Direction, NavigationPlugin, PluginContext, RuleResult } from '../core/types';

type Handler = (state: NavigationState, current: NavigationState['nodes'][0]) => RuleResult;

interface Rule {
  match: (direction: Direction, current: NavigationState['nodes'][0]) => boolean;
  handler: Handler;
  log: string;
}

const rules: Rule[] = [
  // Close button (X) - handle back navigation
  { match: (d, c) => d === 'back' && c.groupId === 'movie-actions', handler: handleCloseBack, log: 'back from movie-actions' },

  // Left from leftmost movie-actions button to navigation
  { match: (d, c) => d === 'left' && c.groupId === 'movie-actions', handler: handleLeftFromMovieActions, log: 'left from movie-actions' },

  // Resume dialog navigation
  { match: (d, c) => d === 'back' && isResumeDialogButton(c), handler: () => ({ handled: false, reason: 'resume-dialog-back-defer' }), log: 'back handled by resume dialog close' },
  { match: (d, c) => d === 'left' && isResumeDialogButton(c) && isResumeCloseButton(c), handler: () => ({ handled: true, reason: 'resume-dialog-close-block-left' }), log: 'left from resume close button' },
  { match: (d, c) => d === 'right' && isResumeDialogButton(c) && isResumeActionButton(c), handler: () => ({ handled: true, reason: 'resume-dialog-action-block-right' }), log: 'right from resume action button' },
];

function isResumeDialogButton(node: NavigationState['nodes'][0]): boolean {
  // Use semantic flags instead of hardcoded ID checks
  return node.flags?.isResumeDialog === true || node.containerType === 'modal';
}

function isResumeCloseButton(node: NavigationState['nodes'][0]): boolean {
  // Use semantic flags instead of hardcoded ID checks
  return node.flags?.isCloseButton === true;
}

function isResumeActionButton(node: NavigationState['nodes'][0]): boolean {
  // Use semantic flags instead of hardcoded ID checks
  return node.flags?.isActionButton === true;
}

function isLeftmostInGroup(state: NavigationState, current: NavigationState['nodes'][0]): boolean {
  // Find all elements in the same group
  const groupElements = state.nodes.filter(n => n.groupId === current.groupId);
  if (groupElements.length === 0) return false;

  // Find the leftmost element by rect.left
  const leftmost = groupElements.reduce((min, node) =>
    node.rect.left < min.rect.left ? node : min
  , groupElements[0]);

  return leftmost.id === current.id;
}

function findNavigationActive(state: NavigationState, _current: NavigationState['nodes'][0]): string | null {
  // Find active element in navigation container
  const navElements = state.nodes.filter(n => n.containerId === 'navigation');
  const activeElement = navElements.find(n => n.isActive);
  return activeElement?.id ?? navElements[0]?.id ?? null;
}

function handleLeftFromMovieActions(state: NavigationState, current: NavigationState['nodes'][0]): RuleResult {
  // If leftmost in group, go to navigation; otherwise let spatial handle it
  if (isLeftmostInGroup(state, current)) {
    const targetId = findNavigationActive(state, current);
    return { targetId, handled: true, reason: 'leftmost-in-group' };
  }
  return { handled: false, reason: 'not-leftmost-defer-to-spatial' };
}

function handleCloseBack(_state: NavigationState, _current: NavigationState['nodes'][0]): RuleResult {
  // Emit BACK intent instead of leaking UI concerns
  // The hook will handle calling onBack when it sees this action
  return { handled: true, action: 'BACK', reason: 'emit-back-intent' };
}

export const movieDetailsPlugin: NavigationPlugin = {
  name: 'movieDetails',
  findNext: (state: NavigationState, direction: Direction, _context?: PluginContext) => {
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) {
      return null;
    }

    // Check rules
    for (const rule of rules) {
      if (rule.match(direction, current)) {
        const result = rule.handler(state, current);
        if (result.handled) {
          return result.targetId ?? null;
        }
        // If not handled, continue to next rule or let other plugins handle
        return null;
      }
    }

    return null;
  },
};
