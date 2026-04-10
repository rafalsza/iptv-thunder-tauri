import { renderHook, act, waitFor } from '@testing-library/react';
import { translations, TranslationKey } from '@/lib/translations';

// Mock useSettings
const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn();

jest.mock('@/hooks/useSettings', () => ({
  getSetting: (...args: any[]) => mockGetSetting(...args),
  setSetting: (...args: any[]) => mockSetSetting(...args),
}));

// Import after mocking
const { useTranslation } = jest.requireActual('../useTranslation');

describe('translations', () => {
  it('should have Polish translations', () => {
    expect(translations.pl).toBeDefined();
    expect(translations.pl.channels).toBe('Kanały');
    expect(translations.pl.movies).toBe('Filmy');
    expect(translations.pl.series).toBe('Seriale');
  });

  it('should have English translations', () => {
    expect(translations.en).toBeDefined();
    expect(translations.en.channels).toBe('Channels');
    expect(translations.en.movies).toBe('Movies');
    expect(translations.en.series).toBe('Series');
  });

  it('should have same keys in both languages', () => {
    const plKeys = Object.keys(translations.pl);
    const enKeys = Object.keys(translations.en);

    expect(plKeys.sort()).toEqual(enKeys.sort());
  });

  it('should have all required translation keys', () => {
    const requiredKeys: TranslationKey[] = [
      'channels',
      'movies',
      'series',
      'settings',
      'search',
      'favorites',
      'player',
      'exit',
      'save',
      'cancel',
    ];

    requiredKeys.forEach(key => {
      expect(translations.pl[key]).toBeDefined();
      expect(translations.en[key]).toBeDefined();
    });
  });

  it('should have consistent structure between languages', () => {
    const plKeys = Object.keys(translations.pl);
    const enKeys = Object.keys(translations.en);

    expect(plKeys.length).toBe(enKeys.length);

    plKeys.forEach(key => {
      expect(translations.en[key as TranslationKey]).toBeDefined();
      expect(typeof translations.pl[key as TranslationKey]).toBe(typeof translations.en[key as TranslationKey]);
    });
  });

  it('should have non-empty translations', () => {
    Object.keys(translations.pl).forEach(key => {
      const plValue = translations.pl[key as TranslationKey];
      const enValue = translations.en[key as TranslationKey];

      expect(plValue).toBeTruthy();
      expect(enValue).toBeTruthy();
      expect(typeof plValue).toBe('string');
      expect(typeof enValue).toBe('string');
    });
  });
});

describe('useTranslation hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no saved language (will use default 'pl')
    mockGetSetting.mockResolvedValue(null);
    mockSetSetting.mockResolvedValue(undefined);

    // Reset global language state before each test
    const { _resetLanguageState } = jest.requireActual('../useTranslation');
    _resetLanguageState('pl');
  });

  it('should provide t function', async () => {
    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.t).toBeDefined();
      expect(typeof result.current.t).toBe('function');
    });
  });

  it('should have default language as Polish', async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentLang).toBe('pl');
  });

  it('should provide isLoading state', async () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should translate Polish keys correctly', async () => {
    mockGetSetting.mockResolvedValue('pl');
    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.t('channels')).toBe('Kanały');
    expect(result.current.t('movies')).toBe('Filmy');
    expect(result.current.t('series')).toBe('Seriale');
    expect(result.current.t('settings')).toBe('Ustawienia');
  });

  it('should translate English keys correctly', async () => {
    mockGetSetting.mockResolvedValue('en');
    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.t('channels')).toBe('Channels');
    expect(result.current.t('movies')).toBe('Movies');
    expect(result.current.t('series')).toBe('Series');
    expect(result.current.t('settings')).toBe('Settings');
  });

  it('should change language', async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialLang = result.current.currentLang;
    expect(initialLang).toBe('pl'); // Default language

    await act(async () => {
      await result.current.changeLanguage('en');
    });

    expect(result.current.currentLang).toBe('en');
    expect(result.current.t('channels')).toBe('Channels');
    expect(mockSetSetting).toHaveBeenCalledWith('language', 'en');
  });

  it('should fallback to Polish for unknown keys', async () => {
    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.t('unknownKey' as TranslationKey)).toBe('unknownKey');
  });

  it('should load saved language from settings', async () => {
    mockGetSetting.mockResolvedValue('en');

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.currentLang).toBe('en');
    });

    expect(mockGetSetting).toHaveBeenCalledWith('language');
  });

  it('should handle invalid saved language', async () => {
    mockGetSetting.mockResolvedValue('invalid-lang');

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should fallback to Polish when invalid language is saved
    expect(result.current.currentLang).toBe('pl');
  });

  it('should handle settings error gracefully', async () => {
    mockGetSetting.mockRejectedValue(new Error('Storage error'));

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should fallback to Polish on error
    expect(result.current.currentLang).toBe('pl');
  });

  it('should handle changeLanguage error gracefully', async () => {
    mockSetSetting.mockRejectedValue(new Error('Storage error'));

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialLang = result.current.currentLang;

    await act(async () => {
      await result.current.changeLanguage('en');
    });

    // Language should NOT change when save fails
    expect(result.current.currentLang).toBe(initialLang);
  });

  it('should synchronize language across multiple hook instances', async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result: result1 } = renderHook(() => useTranslation());
    const { result: result2 } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
      expect(result2.current.isLoading).toBe(false);
    });

    const initialLang1 = result1.current.currentLang;
    const initialLang2 = result2.current.currentLang;

    // Both should have same initial language
    expect(initialLang1).toBe(initialLang2);

    await act(async () => {
      await result1.current.changeLanguage('en');
    });

    // Both instances should be updated
    expect(result1.current.currentLang).toBe('en');
    expect(result2.current.currentLang).toBe('en');
  });

  it('should translate all common keys without errors', async () => {
    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const commonKeys: TranslationKey[] = [
      'channels',
      'movies',
      'series',
      'settings',
      'search',
      'favorites',
      'player',
      'exit',
      'save',
      'cancel',
      'loading',
      'error',
      'play',
      'pause',
    ];

    commonKeys.forEach(key => {
      const translation = result.current.t(key);
      expect(translation).toBeDefined();
      expect(typeof translation).toBe('string');
      expect(translation.length).toBeGreaterThan(0);
    });
  });

  it('should correctly translate keys in both Polish and English', async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Test Polish translations (default)
    expect(result.current.currentLang).toBe('pl');
    expect(result.current.t('channels')).toBe('Kanały');
    expect(result.current.t('movies')).toBe('Filmy');
    expect(result.current.t('series')).toBe('Seriale');
    expect(result.current.t('settings')).toBe('Ustawienia');
    expect(result.current.t('search')).toBe('Szukaj');
    expect(result.current.t('favorites')).toBe('Ulubione');
    expect(result.current.t('player')).toBe('Odtwarzacz');
    expect(result.current.t('exit')).toBe('Wyjdź');
    expect(result.current.t('save')).toBe('Zapisz');
    expect(result.current.t('cancel')).toBe('Anuluj');

    // Switch to English
    await act(async () => {
      await result.current.changeLanguage('en');
    });

    // Test English translations
    expect(result.current.currentLang).toBe('en');
    expect(result.current.t('channels')).toBe('Channels');
    expect(result.current.t('movies')).toBe('Movies');
    expect(result.current.t('series')).toBe('Series');
    expect(result.current.t('settings')).toBe('Settings');
    expect(result.current.t('search')).toBe('Search');
    expect(result.current.t('favorites')).toBe('Favorites');
    expect(result.current.t('player')).toBe('Player');
    expect(result.current.t('exit')).toBe('Exit');
    expect(result.current.t('save')).toBe('Save');
    expect(result.current.t('cancel')).toBe('Cancel');
  });

  it('should switch between PL and EN multiple times', async () => {
    mockGetSetting.mockResolvedValue(null);

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Start with Polish
    expect(result.current.currentLang).toBe('pl');
    expect(result.current.t('channels')).toBe('Kanały');

    // Switch to English
    await act(async () => {
      await result.current.changeLanguage('en');
    });
    expect(result.current.currentLang).toBe('en');
    expect(result.current.t('channels')).toBe('Channels');

    // Switch back to Polish
    await act(async () => {
      await result.current.changeLanguage('pl');
    });
    expect(result.current.currentLang).toBe('pl');
    expect(result.current.t('channels')).toBe('Kanały');

    // Switch to English again
    await act(async () => {
      await result.current.changeLanguage('en');
    });
    expect(result.current.currentLang).toBe('en');
    expect(result.current.t('channels')).toBe('Channels');
  });

  it('should load English from saved settings', async () => {
    mockGetSetting.mockResolvedValue('en');

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentLang).toBe('en');
    expect(result.current.t('movies')).toBe('Movies');
    expect(result.current.t('series')).toBe('Series');
  });

  it('should load Polish from saved settings', async () => {
    mockGetSetting.mockResolvedValue('pl');

    const { result } = renderHook(() => useTranslation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.currentLang).toBe('pl');
    expect(result.current.t('movies')).toBe('Filmy');
    expect(result.current.t('series')).toBe('Seriale');
  });
});
