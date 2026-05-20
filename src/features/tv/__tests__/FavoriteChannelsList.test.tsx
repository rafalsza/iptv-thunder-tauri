import React from 'react';
import { render } from '@testing-library/react';
import { FavoriteChannelsList } from '../FavoriteChannelsList';
import { useFavorites } from '@/hooks/useFavorites';
import { useTranslation } from '@/hooks/useTranslation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: jest.fn(),
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

jest.mock('@/hooks/useDatabase', () => ({
  searchChannels: jest.fn(() => Promise.resolve([])),
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

const mockUseTranslation = useTranslation as jest.Mock;
const mockUseFavorites = useFavorites as jest.Mock;

const queryClient = new QueryClient();

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('FavoriteChannelsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      language: 'pl',
    } as any);

    mockUseFavorites.mockReturnValue({
      favorites: [],
      toggleItemFavorite: jest.fn(),
    } as any);
  });

  it('should render without crashing', () => {
    const { container } = renderWithProviders(
      <FavoriteChannelsList
        accountId="default"
        onChannelSelect={jest.fn()}
        search=""
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render with favorites', () => {
    const mockFavorites = [
      { id: '1', type: 'live', itemId: 'ch1', addedAt: Date.now() },
    ] as any;

    mockUseFavorites.mockReturnValue({
      favorites: mockFavorites,
      toggleItemFavorite: jest.fn(),
    } as any);

    const { container } = renderWithProviders(
      <FavoriteChannelsList
        accountId="default"
        onChannelSelect={jest.fn()}
        search=""
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render with search', () => {
    const { container } = renderWithProviders(
      <FavoriteChannelsList
        accountId="default"
        onChannelSelect={jest.fn()}
        search="Channel"
      />
    );
    expect(container).toBeInTheDocument();
  });
});
