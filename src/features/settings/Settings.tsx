// =========================
// ⚙️ SETTINGS COMPONENT
// =========================
import React, { useState, useEffect } from 'react';
import { usePortalStore, PREDEFINED_EPG_SERVICES } from '@/store/usePortalStore';
import { getSettings, setSetting, AppSettings } from '@/hooks/useSettings';
import { getVersion } from '@tauri-apps/api/app';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'player' | 'epg' | 'advanced' | 'about';

const LANGUAGES = [
  { code: 'pl', name: 'Polski' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

const VIDEO_QUALITIES = [
  { value: 'auto', name: 'Automatyczna' },
  { value: '1080p', name: '1080p (Full HD)' },
  { value: '720p', name: '720p (HD)' },
  { value: '480p', name: '480p (SD)' },
];

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const { 
    externalEpgUrl, 
    setExternalEpgUrl, 
    selectedEpgService, 
    setSelectedEpgService,
    getEffectiveEpgUrl
  } = usePortalStore();
  
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [version, setVersion] = useState<string>('');
  
  // App settings states
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [epgUrl, setEpgUrl] = useState(externalEpgUrl || '');
  const [selectedService, setSelectedService] = useState(selectedEpgService || 'auto');

  // Load settings on open
  useEffect(() => {
    if (isOpen) {
      getSettings().then(setSettings);
      getVersion().then(setVersion);
    }
  }, [isOpen]);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await setSetting(key, value);
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
  };

  const TabButton: React.FC<{ tab: TabType; label: string; icon: string }> = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        activeTab === tab
          ? 'bg-blue-600 text-white'
          : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );

  const selectedServiceObj = PREDEFINED_EPG_SERVICES.find(s => s.id === selectedService);
  const showCustomUrl = selectedService === 'custom';
  const effectiveEpgUrl = getEffectiveEpgUrl();

  const handleSave = () => {
    setSelectedEpgService(selectedService);
    if (selectedService === 'custom') {
      const trimmed = epgUrl.trim();
      setExternalEpgUrl(trimmed || null);
    }
    onClose();
  };

  const handleClear = () => {
    setSelectedService('auto');
    setEpgUrl('');
    setSelectedEpgService('auto');
    setExternalEpgUrl(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl mx-4 border border-slate-600 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-600">
          <h2 className="text-2xl font-semibold text-white">Ustawienia</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b border-slate-600 overflow-x-auto">
          <TabButton tab="general" label="Ogólne" icon="⚙️" />
          <TabButton tab="player" label="Player" icon="▶️" />
          <TabButton tab="epg" label="EPG" icon="📺" />
          <TabButton tab="advanced" label="Zaawansowane" icon="🔧" />
          <TabButton tab="about" label="O aplikacji" icon="ℹ️" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && settings && (
            <div className="space-y-6">
              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Motyw
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) => updateSetting('theme', e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="dark">Ciemny</option>
                  <option value="light">Jasny</option>
                  <option value="system">Systemowy</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Język
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              {/* Channel View Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Widok kanałów
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateSetting('channelViewMode', 'grid')}
                    className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
                      settings.channelViewMode === 'grid'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                    }`}
                  >
                    Siatka
                  </button>
                  <button
                    onClick={() => updateSetting('channelViewMode', 'list')}
                    className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
                      settings.channelViewMode === 'list'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                    }`}
                  >
                    Lista
                  </button>
                </div>
              </div>

              {/* Sidebar Collapsed */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  Zwinięty pasek boczny
                </label>
                <button
                  onClick={() => updateSetting('sidebarCollapsed', !settings.sidebarCollapsed)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.sidebarCollapsed ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.sidebarCollapsed ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'player' && settings && (
            <div className="space-y-6">
              {/* Auto Play */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    Autoodtwarzanie
                  </label>
                  <p className="text-xs text-gray-400">Automatycznie odtwarzaj po wybraniu kanału</p>
                </div>
                <button
                  onClick={() => updateSetting('autoPlay', !settings.autoPlay)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.autoPlay ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.autoPlay ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* Video Quality */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Jakość wideo
                </label>
                <select
                  value={settings.videoQuality}
                  onChange={(e) => updateSetting('videoQuality', e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {VIDEO_QUALITIES.map(q => (
                    <option key={q.value} value={q.value}>{q.name}</option>
                  ))}
                </select>
              </div>

              {/* Volume */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Głośność domyślna: {Math.round(settings.volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.volume}
                  onChange={(e) => updateSetting('volume', parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Muted by default */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  Wyciszony domyślnie
                </label>
                <button
                  onClick={() => updateSetting('muted', !settings.muted)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.muted ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.muted ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'epg' && (
            <div className="space-y-6">
              {/* EPG Service Selection */}
              <div>
                <label htmlFor="epg-service" className="block text-sm font-medium text-gray-300 mb-2">
                  Serwis EPG
                </label>
                <select
                  id="epg-service"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PREDEFINED_EPG_SERVICES.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                {selectedServiceObj?.description && (
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedServiceObj.description}
                  </p>
                )}
              </div>

              {/* Custom URL Input (only for custom) */}
              {showCustomUrl && (
                <div>
                  <label htmlFor="custom-epg-url" className="block text-sm font-medium text-gray-300 mb-2">
                    Własny URL EPG (XMLTV)
                  </label>
                  <input
                    id="custom-epg-url"
                    type="url"
                    value={epgUrl}
                    onChange={(e) => setEpgUrl(e.target.value)}
                    placeholder="https://example.com/epg.xml"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Wprowadź URL do pliku XMLTV z programem TV
                  </p>
                </div>
              )}

              {/* Current effective EPG display */}
              <div className="pt-2 border-t border-slate-600">
                {effectiveEpgUrl ? (
                  <div className="text-xs">
                    <span className="text-gray-400">Aktywny EPG: </span>
                    <span className="text-green-400 break-all">{effectiveEpgUrl}</span>
                  </div>
                ) : (
                  <div className="text-xs text-blue-400">
                    Używany EPG z serwera IPTV (automatyczny)
                  </div>
                )}
              </div>

              {settings && (
                <>
                  {/* EPG Enabled */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                      EPG włączone
                    </label>
                    <button
                      onClick={() => updateSetting('epgEnabled', !settings.epgEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        settings.epgEnabled ? 'bg-blue-600' : 'bg-slate-600'
                      }`}
                    >
                      <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                        settings.epgEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* EPG Days to Load */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Dni EPG do załadowania: {settings.epgDaysToLoad}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="14"
                      step="1"
                      value={settings.epgDaysToLoad}
                      onChange={(e) => updateSetting('epgDaysToLoad', parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Więcej dni = więcej danych do pobrania
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'advanced' && settings && (
            <div className="space-y-6">
              {/* Request Timeout */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Timeout żądania: {settings.requestTimeout}ms
                </label>
                <input
                  type="range"
                  min="5000"
                  max="60000"
                  step="5000"
                  value={settings.requestTimeout}
                  onChange={(e) => updateSetting('requestTimeout', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Max Concurrent Requests */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Maksymalna liczba równoczesnych żądań: {settings.maxConcurrentRequests}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={settings.maxConcurrentRequests}
                  onChange={(e) => updateSetting('maxConcurrentRequests', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Image Cache */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    Cache obrazów
                  </label>
                  <p className="text-xs text-gray-400">Przechowuj pliki graficzne lokalnie</p>
                </div>
                <button
                  onClick={() => updateSetting('imageCacheEnabled', !settings.imageCacheEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.imageCacheEnabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.imageCacheEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* Image Cache Max Size */}
              {settings.imageCacheEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Maksymalny rozmiar cache: {settings.imageCacheMaxSize} MB
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="100"
                    value={settings.imageCacheMaxSize}
                    onChange={(e) => updateSetting('imageCacheMaxSize', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              {/* Hardware Acceleration */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    Akceleracja sprzętowa
                  </label>
                  <p className="text-xs text-gray-400">Wymaga restartu aplikacji</p>
                </div>
                <button
                  onClick={() => updateSetting('hardwareAcceleration', !settings.hardwareAcceleration)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.hardwareAcceleration ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.hardwareAcceleration ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* Debug Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    Tryb debugowania
                  </label>
                  <p className="text-xs text-gray-400">Pokazuje dodatkowe informacje w konsoli</p>
                </div>
                <button
                  onClick={() => updateSetting('debugMode', !settings.debugMode)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.debugMode ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.debugMode ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6 text-center">
              <div className="py-8">
                <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-4xl">
                  📺
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">IPTV Thunder</h3>
                <p className="text-gray-400">Wersja {version || '...'}</p>
              </div>

              <div className="space-y-3 text-sm text-gray-400">
                <p>Aplikacja IPTV dla systemu Tauri</p>
                <p>Wsparcie dla protokołu Stalker Portal</p>
              </div>

              <div className="pt-4 border-t border-slate-600">
                <p className="text-xs text-gray-500">
                  © 2024 IPTV Thunder. Wszelkie prawa zastrzeżone.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-600">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Zapisz zmiany
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            Resetuj
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
