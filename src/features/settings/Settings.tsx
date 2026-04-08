import React, { useState, useEffect } from 'react';
import { usePortalStore, PREDEFINED_EPG_SERVICES } from '@/store/usePortalStore';
import { getSettings, setSetting, AppSettings } from '@/hooks/useSettings';
import { getVersion } from '@tauri-apps/api/app';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2, MonitorPlay, Tv, Wrench, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { TranslationKey } from '@/lib/translations';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'player' | 'epg' | 'advanced' | 'about';

const useTabs = (t: (key: TranslationKey) => string) => [
  { id: 'general' as const, label: t('general'), icon: <Settings2 className="w-4 h-4" /> },
  { id: 'player' as const, label: t('player'), icon: <MonitorPlay className="w-4 h-4" /> },
  { id: 'epg' as const, label: t('epg'), icon: <Tv className="w-4 h-4" /> },
  { id: 'advanced' as const, label: t('advanced'), icon: <Wrench className="w-4 h-4" /> },
  { id: 'about' as const, label: t('about'), icon: <Info className="w-4 h-4" /> },
];

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const { t, currentLang, changeLanguage } = useTranslation();
  const TABS = useTabs(t);

  const { 
    externalEpgUrl, 
    setExternalEpgUrl, 
    selectedEpgService, 
    setSelectedEpgService,
    getEffectiveEpgUrl 
  } = usePortalStore();

  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [version, setVersion] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [epgUrl, setEpgUrl] = useState(externalEpgUrl || '');
  const [selectedService, setSelectedService] = useState(selectedEpgService || 'auto');

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      getSettings().then(setSettings);
      getVersion().then(setVersion);
      setEpgUrl(externalEpgUrl || '');
      setSelectedService(selectedEpgService || 'auto');
    }
  }, [isOpen, externalEpgUrl, selectedEpgService]);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await setSetting(key, value);
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
  };

  const handleSave = () => {
    setSelectedEpgService(selectedService);
    if (selectedService === 'custom') {
      setExternalEpgUrl(epgUrl.trim() || null);
    }
    onClose();
  };

  const handleResetEpg = () => {
    setSelectedService('auto');
    setEpgUrl('');
    setSelectedEpgService('auto');
    setExternalEpgUrl(null);
  };

  if (!isOpen || !settings) return null;

  const effectiveEpgUrl = getEffectiveEpgUrl();
  const selectedServiceObj = PREDEFINED_EPG_SERVICES.find(s => s.id === selectedService);
  const showCustomUrl = selectedService === 'custom';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-white">{t('settings')}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex h-[calc(92vh-73px)]">
              {/* Sidebar Tabs */}
              <div className="w-56 border-r border-slate-700 bg-slate-950 p-4 flex-shrink-0">
                <div className="space-y-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all ${
                        activeTab === tab.id
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      {tab.icon}
                      <span className="font-medium">{tab.label as string}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-8">
                {activeTab === 'general' && (
                  <div className="max-w-md space-y-8">
                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">{t('theme')}</label>
                      <Select value={settings.theme} onValueChange={(v) => updateSetting('theme', v as any)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">{t('dark')}</SelectItem>
                          <SelectItem value="light">{t('light')}</SelectItem>
                          <SelectItem value="system">{t('system')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">{t('language')}</label>
                      <Select value={currentLang} onValueChange={(v) => changeLanguage(v as 'pl' | 'en')}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pl">Polski</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {activeTab === 'player' && (
                  <div className="max-w-md space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{t('autoPlay')}</p>
                        <p className="text-sm text-slate-400">{t('autoPlayDescription')}</p>
                      </div>
                      <Switch checked={settings.autoPlay} onCheckedChange={(v) => updateSetting('autoPlay', v)} />
                    </div>

                    <div>
                      <label className="text-sm text-slate-400 mb-3 block">
                        {t('videoQuality')}
                      </label>
                      <Select value={settings.videoQuality} onValueChange={(v) => updateSetting('videoQuality', v as any)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t('auto')}</SelectItem>
                          <SelectItem value="1080p">{t('1080p')}</SelectItem>
                          <SelectItem value="720p">{t('720p')}</SelectItem>
                          <SelectItem value="480p">{t('480p')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label htmlFor="default-volume" className="text-sm text-slate-400 mb-3 block">
                        {t('defaultVolume')} — {Math.round(settings.volume * 100)}%
                      </label>
                      <input
                        id="default-volume"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.volume}
                        onChange={(e) => updateSetting('volume', Number.parseFloat(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'epg' && (
                  <div className="max-w-lg space-y-8">
                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">{t('epgSource')}</label>
                      <Select value={selectedService} onValueChange={setSelectedService}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue>{selectedServiceObj?.name}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PREDEFINED_EPG_SERVICES.map(service => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {showCustomUrl && (
                      <div>
                        <label htmlFor="custom-epg-url" className="text-sm text-slate-400 mb-2 block">{t('customEpgUrl')}</label>
                        <input
                          id="custom-epg-url"
                          type="url"
                          value={epgUrl}
                          onChange={(e) => setEpgUrl(e.target.value)}
                          placeholder="https://twoj-serwer.pl/epg.xml"
                          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-700">
                      <p className="text-xs text-slate-400 mb-1">Aktualnie używany EPG:</p>
                      <p className="text-emerald-400 break-all text-sm font-mono">
                        {effectiveEpgUrl || 'Automatyczny z portalu IPTV'}
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button variant="outline" onClick={handleResetEpg}>
                        {t('reset')}
                      </Button>
                    </div>
                  </div>
                )}

                {activeTab === 'advanced' && (
                  <div className="max-w-md space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Tryb debugowania</p>
                        <p className="text-sm text-slate-400">Pokazuje szczegółowe logi w konsoli (Debug Mode)</p>
                      </div>
                      <Switch checked={settings.debugMode} onCheckedChange={(v) => updateSetting('debugMode', v)} />
                    </div>
                  </div>
                )}

                {activeTab === 'about' && (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center text-6xl mb-6 shadow-xl">
                      📺
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-1">IPTV Thunder</h3>
                    <p className="text-slate-400 mb-8">{t('version')} {version || '—'}</p>
                    
                    <div className="text-sm text-slate-500 max-w-xs">
                      Nowoczesna aplikacja IPTV stworzona z użyciem Tauri + React
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-700 px-8 py-5 flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button onClick={handleSave}>
                {t('saveChanges')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};