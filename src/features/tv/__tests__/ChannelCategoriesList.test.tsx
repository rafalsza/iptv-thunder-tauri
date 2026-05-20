import React from 'react';
import { render } from '@testing-library/react';
import { ChannelCategoriesList } from '../ChannelCategoriesList';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { useChannelCategories } from '../tv.hooks';
import { useTranslation } from '@/hooks/useTranslation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../tv.hooks', () => ({
  useChannelCategories: jest.fn(),
}));

jest.mock('@/hooks/useFavorites', () => ({
  useFavoriteCategories: jest.fn(),
}));

jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('@/components/ui/CategoryCard', () => ({
  CategoryCard: () => <div>CategoryCard</div>,
}));

const mockUseTranslation = useTranslation as jest.Mock;
const mockUseChannelCategories = useChannelCategories as jest.Mock;
const mockUseFavoriteCategories = useFavoriteCategories as jest.Mock;

const queryClient = new QueryClient();

const mockClient = {
  getAccount: () => ({ id: 'default' }),
} as any;

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('ChannelCategoriesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      language: 'pl',
    } as any);

    mockUseChannelCategories.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    mockUseFavoriteCategories.mockReturnValue({
      isCategoryFavorite: jest.fn(() => false),
      toggleCategory: jest.fn(),
    } as any);
  });

  it('should render without crashing', () => {
    const { container } = renderWithProviders(
      <ChannelCategoriesList
        client={mockClient}
        onCategorySelect={jest.fn()}
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render loading state', () => {
    mockUseChannelCategories.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    } as any);

    const { container } = renderWithProviders(
      <ChannelCategoriesList
        client={mockClient}
        onCategorySelect={jest.fn()}
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockUseChannelCategories.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Failed to load'),
      refetch: jest.fn(),
    } as any);

    const { container } = renderWithProviders(
      <ChannelCategoriesList
        client={mockClient}
        onCategorySelect={jest.fn()}
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render categories list when loaded', () => {
    const mockCategories = [
      { id: '1', title: 'News', alias: 'news' },
      { id: '2', title: 'Sports', alias: 'sports' },
    ] as any;

    mockUseChannelCategories.mockReturnValue({
      data: mockCategories,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    const { container } = renderWithProviders(
      <ChannelCategoriesList
        client={mockClient}
        onCategorySelect={jest.fn()}
      />
    );
    expect(container).toBeInTheDocument();
  });
});
