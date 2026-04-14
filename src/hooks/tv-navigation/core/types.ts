// CORE TYPES - Shared type definitions

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavNode {
  id: string;
  rect: DOMRect;
  disabled?: boolean;
  containerId?: string;
  groupId?: string;
  index?: number;
  isSearch?: boolean;
  isInitial?: boolean;
  isActive?: boolean;
}

export interface NavigationState {
  currentId: string | null;
  nodes: NavNode[];
  lastXByRow?: Map<number, number>;
  lastPositionByAxis?: { x: number; y: number };
}

export interface NavigationPlugin {
  name: string;
  findNext: (state: NavigationState, direction: Direction) => string | null;
}
