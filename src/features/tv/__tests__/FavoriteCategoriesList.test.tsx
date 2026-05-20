import React from 'react';
import { render } from '@testing-library/react';
import { FavoriteCategoriesList } from '../FavoriteCategoriesList';
import { useFavoriteCategories } from '@/hooks/useFavorites';
import { useTranslation } from '@/hooks/useTranslation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useFavorites', () => ({
  useFavoriteCategories: jest.fn(),
}));

jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('@/components/ui/CategoryCard', () => ({
  CategoryCard: () => <div>CategoryCard</div>,
}));

jest.mock('../tv.api', () => ({
  getGenres: jest.fn(() => Promise.resolve([])),
}));

const mockUseTranslation = useTranslation as jest.Mock;
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

describe('FavoriteCategoriesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      language: 'pl',
    } as any);

    mockUseFavoriteCategories.mockReturnValue({
      categoryIds: [],
      toggleCategory: jest.fn(),
    } as any);
  });

  it('should render without crashing', () => {
    const { container } = renderWithProviders(
      <FavoriteCategoriesList
        client={mockClient}
        onCategorySelect={jest.fn()}
      />
    );
    expect(container).toBeInTheDocument();
  });

  it('should render loading state', () => {
    queryClient.clear();
    const loadingQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    
    loadingQueryClient.setQueryData(['channel-genres', 'default'], undefined);
    
    const { container } = render(
      <QueryClientProvider client={loadingQueryClient}>
        <FavoriteCategoriesList
          client={mockClient}
          onCategorySelect={jest.fn()}
        />
      </QueryClientProvider>
    );
    expect(container).toBeInTheDocument();
  });
});
