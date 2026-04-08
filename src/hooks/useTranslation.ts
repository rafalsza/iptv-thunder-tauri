import { useState, useEffect, useCallback } from 'react';
import { translations, Language, TranslationKey } from '@/lib/translations';
import { getSetting, setSetting } from '@/hooks/useSettings';

// Global state for language synchronization
let globalLanguage: Language = 'pl';
const listeners = new Set<(lang: Language) => void>();

const subscribe = (callback: (lang: Language) => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const notifyListeners = (lang: Language) => {
  globalLanguage = lang;
  listeners.forEach(cb => cb(lang));
};

export const useTranslation = () => {
  const [currentLang, setCurrentLang] = useState<Language>(globalLanguage);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await getSetting('language');
        if (savedLang && ['pl', 'en'].includes(savedLang)) {
          const lang = savedLang as Language;
          setCurrentLang(lang);
          globalLanguage = lang;
        }
      } catch (error) {
        console.error('[useTranslation] Error loading language:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();

    // Subscribe to language changes from other components
    const unsubscribe = subscribe((lang) => {
      setCurrentLang(lang);
    });

    return () => { unsubscribe(); };
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[currentLang][key] || translations['pl'][key] || key;
  }, [currentLang]);

  const changeLanguage = useCallback(async (lang: Language) => {
    try {
      await setSetting('language', lang);
      setCurrentLang(lang);
      notifyListeners(lang);
    } catch (error) {
      console.error('[useTranslation] Error saving language:', error);
    }
  }, []);

  return { t, currentLang, changeLanguage, isLoading };
};
