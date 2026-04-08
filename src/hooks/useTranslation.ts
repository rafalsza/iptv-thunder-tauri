import { useState, useEffect, useCallback } from 'react';
import { translations, Language, TranslationKey } from '@/lib/translations';
import { getSetting, setSetting } from '@/hooks/useSettings';

export const useTranslation = () => {
  const [currentLang, setCurrentLang] = useState<Language>('pl');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await getSetting('language');
        if (savedLang && ['pl', 'en'].includes(savedLang)) {
          setCurrentLang(savedLang as Language);
        }
      } catch (error) {
        console.error('[useTranslation] Error loading language:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[currentLang][key] || translations['pl'][key] || key;
  }, [currentLang]);

  const changeLanguage = useCallback(async (lang: Language) => {
    try {
      await setSetting('language', lang);
      setCurrentLang(lang);
    } catch (error) {
      console.error('[useTranslation] Error saving language:', error);
    }
  }, []);

  return { t, currentLang, changeLanguage, isLoading };
};
