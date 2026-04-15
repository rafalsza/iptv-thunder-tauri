// PLUGIN - Settings Navigation
// Handles navigation within settings modal (tabs, content, footer)
// Now uses configuration-based rules for reusability

import { NavigationState, Direction, NavigationPlugin } from '../core/types';
import { createRuleEnginePlugin } from './ruleEnginePlugin';
import { NavigationConfig } from '../core/config';

// Configuration for settings navigation
const settingsConfig: NavigationConfig = {
  rules: [
    {
      when: { group: 'settings-tabs', direction: 'right' },
      goTo: { group: 'settings-content', initial: true }
    },
    {
      when: { group: 'settings-content', direction: 'left' },
      goTo: { group: 'settings-tabs', active: true }
    },
    {
      when: { group: 'settings-content', direction: 'down' },
      goTo: { group: 'settings-footer', first: true }
    },
    {
      when: { group: 'settings-footer', direction: 'up' },
      goTo: { group: 'settings-content', last: true }
    },
    {
      when: { group: 'settings-tabs', direction: 'up', index: 1 },
      goTo: { group: 'settings-header', first: true }
    },
    {
      when: { group: 'settings-tabs', direction: 'down', last: true },
      goTo: { group: 'settings-footer', first: true }
    }
  ]
};

// Custom logic for settings tabs (index-based vertical navigation)
function handleSettingsTabsNavigation(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (current.groupId !== 'settings-tabs') return null;
  if (direction !== 'up' && direction !== 'down') return null;

  const tabsElements = state.nodes.filter(n => n.groupId === 'settings-tabs' && !n.disabled).sort((a, b) => (a.index || 0) - (b.index || 0));
  const currentIndex = tabsElements.findIndex(n => n.id === current.id);

  if (currentIndex === -1) return null;

  // Edge cases (first tab up, last tab down) are handled by NavigationConfig rules
  // Only handle basic tab-to-tab navigation here
  if (direction === 'up') {
    if (currentIndex === 0) return null; // Let config handle it
    const prevIndex = currentIndex - 1;
    return tabsElements[prevIndex]?.id || null;
  } else if (direction === 'down') {
    if (currentIndex === tabsElements.length - 1) return null; // Let config handle it
    const nextIndex = currentIndex + 1;
    return tabsElements[nextIndex]?.id || null;
  }

  return null;
}

// Custom logic for settings footer (checks if there are elements below before jumping to footer)
function handleSettingsFooterSpecial(state: NavigationState, current: NavigationState['nodes'][0], direction: Direction): string | null {
  if (direction !== 'down' || current.groupId !== 'settings-content') return null;

  const contentElements = state.nodes.filter(n => n.groupId === 'settings-content' && !n.disabled);
  const currentNode = state.nodes.find(n => n.id === current.id);

  if (currentNode) {
    const elementsBelow = contentElements.filter(n =>
      n.id !== current.id && n.rect.top > currentNode.rect.bottom
    );

    if (elementsBelow.length > 0) {
      console.log('[SettingsPlugin] elements below in content, skipping footer jump');
      // Return a special marker to skip rule engine entirely
      return 'SKIP_RULE_ENGINE';
    }
  }

  return null;
}

export const settingsPlugin: NavigationPlugin = {
  name: 'settings',
  findNext: (state: NavigationState, direction: Direction) => {
    const current = state.nodes.find(n => n.id === state.currentId);
    if (!current) return null;

    // Handle special case for settings tabs navigation
    const tabsResult = handleSettingsTabsNavigation(state, current, direction);
    if (tabsResult) return tabsResult;

    // Handle special case for settings footer
    const specialResult = handleSettingsFooterSpecial(state, current, direction);
    if (specialResult === 'SKIP_RULE_ENGINE') {
      // Skip rule engine entirely, let spatial navigation handle
      return null;
    }
    if (specialResult === null) {
      // Special case says skip, let rule engine handle
      const ruleEngine = createRuleEnginePlugin(settingsConfig);
      return ruleEngine.findNext(state, direction);
    }
    if (specialResult) return specialResult;

    // Default to rule engine
    const ruleEngine = createRuleEnginePlugin(settingsConfig);
    return ruleEngine.findNext(state, direction);
  },
};
