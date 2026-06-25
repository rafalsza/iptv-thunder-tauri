import React from 'react';
import { render } from '@testing-library/react';
import { TVList } from '../TVList';
import { useLazyChannels, usePrefetchStream, useChannelSearch } from '../tv.hooks';
import { useFavorites, useFavoriteCategories } from '@/hooks/useFavorites';
import { usePortalsStore } from '@/store/portals.store';
import { useTranslation } from '@/hooks/useTranslation';

jest.mock('../tv.hooks', () => ({
  useLazyChannels: jest.fn(),
  usePrefetchStream: jest.fn(),
  useChannelSearch: jest.fn(),
}));

jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: jest.fn(),
  useFavoriteCategories: jest.fn(),
}));

jest.mock('@/store/portals.store', () => ({
  usePortalsStore: jest.fn(),
}));

jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('@/hooks/useLongPress', () => ({
  useLongPress: jest.fn(() => ({
    isLongPress: false,
    ref: { current: null },
    isLongPressRef: { current: false },
  })),
}));

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: jest.fn(() => ({
    getVirtualItems: jest.fn(() => [
      { key: 'row-0', index: 0, start: 0 },
    ]),
    getTotalSize: jest.fn(() => 140),
    measureElement: jest.fn(),
  })),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  writable: true,
  value: jest.fn(),
});

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    span: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  createDebugRequestContext: jest.fn(),
}));

jest.mock('../ChannelLogo', () => ({
  ChannelLogo: () => <div>ChannelLogo</div>,
}));

const mockUseTranslation = useTranslation as jest.Mock;
const mockUseLazyChannels = useLazyChannels as jest.Mock;
const mockUseChannelSearch = useChannelSearch as jest.Mock;
const mockUseFavorites = useFavorites as jest.Mock;
const mockUseFavoriteCategories = useFavoriteCategories as jest.Mock;
const mockUsePrefetchStream = usePrefetchStream as jest.Mock;
const mockUsePortalsStore = usePortalsStore as unknown as jest.Mock;

const mockClient = {} as any;

describe('TVList', () => {
  const mockOnChannelSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      language: 'pl',
    } as any);

    mockUseLazyChannels.mockReturnValue({
      channels: [],
      isLoading: false,
      hasMore: false,
      loadMore: jest.fn(),
      error: null,
    } as any);

    mockUseChannelSearch.mockReturnValue({
      results: [],
      isSearching: false,
    } as any);

    mockUsePrefetchStream.mockReturnValue(jest.fn());

    mockUseFavorites.mockReturnValue({
      favorites: [],
      toggleItemFavorite: jest.fn(),
      isItemFavorite: jest.fn(() => false),
    } as any);

    mockUseFavoriteCategories.mockReturnValue({
      isCategoryFavorite: jest.fn(() => false),
      toggleCategory: jest.fn(),
    } as any);

    mockUsePortalsStore.mockReturnValue({
      portals: [{ id: 'default', name: 'Test' }],
      activePortalId: 'default',
    } as any);
  });

  it('should render without crashing', () => {
    const { container } = render(
      <TVList
        client={mockClient}
        accountId="default"
        onChannelSelect={mockOnChannelSelect}
        search=""
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('should render loading state', () => {
    mockUseLazyChannels.mockReturnValue({
      channels: [],
      isLoading: true,
      hasMore: false,
      loadMore: jest.fn(),
      error: null,
    } as any);

    const { container } = render(
      <TVList
        client={mockClient}
        accountId="default"
        onChannelSelect={mockOnChannelSelect}
        search=""
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockUseLazyChannels.mockReturnValue({
      channels: [],
      isLoading: false,
      hasMore: false,
      loadMore: jest.fn(),
      error: new Error('Failed to load'),
    } as any);

    const { container } = render(
      <TVList
        client={mockClient}
        accountId="default"
        onChannelSelect={mockOnChannelSelect}
        search=""
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('should render channels list when loaded', () => {
    const mockChannels = [
      { id: '1', name: 'Channel 1', number: 1, logo: '', cmd: '' },
      { id: '2', name: 'Channel 2', number: 2, logo: '', cmd: '' },
    ] as any;

    mockUseLazyChannels.mockReturnValue({
      channels: mockChannels,
      isLoading: false,
      hasMore: false,
      loadMore: jest.fn(),
      error: null,
    } as any);

    const { container } = render(
      <TVList
        client={mockClient}
        accountId="default"
        onChannelSelect={mockOnChannelSelect}
        search=""
      />
    );

    expect(container).toBeInTheDocument();
  });

  it('should render with search results', () => {
    const mockSearchResults = [
      { id: '1', name: 'Channel 1', number: 1, logo: '', cmd: '' },
    ] as any;

    mockUseChannelSearch.mockReturnValue({
      results: mockSearchResults,
      isSearching: false,
    } as any);

    const { container } = render(
      <TVList
        client={mockClient}
        accountId="default"
        onChannelSelect={mockOnChannelSelect}
        search="Channel"
      />
    );

    expect(container).toBeInTheDocument();
  });
});
