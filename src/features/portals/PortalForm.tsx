// =========================
// 📝 PORTAL FORM COMPONENT
// =========================
import React, { useState, useEffect } from 'react';
import { usePortalsStore } from '@/store/portals.store';
import { PortalAccount, PortalFormData } from './portals.types';
import { useToast } from '@/components/ui/Toast';

interface PortalFormProps {
  portal?: PortalAccount | null;
  onClose: () => void;
}

export const PortalForm: React.FC<PortalFormProps> = ({ portal, onClose }) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<PortalFormData>({
    name: '',
    login: '',
    password: '',
    portalUrl: '',
    mac: '',
    description: '',
    tags: [],
  });
  
  const [errors, setErrors] = useState<Partial<Record<keyof PortalFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const { addPortal, updatePortal } = usePortalsStore();

  useEffect(() => {
    if (portal) {
      setFormData({
        name: portal.name,
        login: portal.login,
        password: portal.password,
        portalUrl: portal.portalUrl,
        mac: portal.mac,
        description: portal.description || '',
        tags: portal.tags || [],
      });
    }
  }, [portal]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PortalFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Nazwa portalu jest wymagana';
    }

    // Login and password are optional for Stalker portals
    // if (!formData.login.trim()) {
    //   newErrors.login = 'Login jest wymagany';
    // }

    // if (!formData.password.trim()) {
    //   newErrors.password = 'Hasło jest wymagane';
    // }

    if (!formData.portalUrl.trim()) {
      newErrors.portalUrl = 'URL portalu jest wymagany';
    } else if (!isValidUrl(formData.portalUrl)) {
      newErrors.portalUrl = 'Nieprawidłowy format URL';
    }

    if (!formData.mac.trim()) {
      newErrors.mac = 'Adres MAC jest wymagany';
    } else if (!isValidMac(formData.mac)) {
      newErrors.mac = 'Nieprawidłowy format MAC (np. 00:1A:79:84:1A:AB)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isValidMac = (mac: string): boolean => {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (portal) {
        // Update existing portal
        updatePortal(portal.id, formData);
      } else {
        // Add new portal
        addPortal({ ...formData, isActive: true });
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving portal:', error);
      showToast('Wystąpił błąd podczas zapisywania portalu', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof PortalFormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      handleInputChange('tags', [...(formData.tags || []), tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleInputChange('tags', (formData.tags || []).filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700/50">
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 bg-slate-800/30 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              {portal ? 'Edytuj Portal' : 'Dodaj Nowy Portal'}
            </h2>
            <button
              onClick={onClose}
              className="p-2.5 hover:bg-slate-700/50 rounded-xl transition-all duration-200 text-slate-400 hover:text-white hover:scale-110"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Basic Info */}
          <div className="space-y-5">
            <h3 className="text-lg font-semibold text-white flex items-center gap-3">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></span>
              Podstawowe Informacje
            </h3>

            <div>
              <label htmlFor="portal-name" className="block text-sm font-medium text-slate-300 mb-2">
                Nazwa Portalu *
              </label>
              <input
                id="portal-name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200 ${
                  errors.name ? 'border-red-500' : 'border-slate-700'
                }`}
                placeholder="np. Mój Portal IPTV"
              />
              {errors.name && (
                <p className="mt-2 text-sm text-red-400">{errors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="portal-description" className="block text-sm font-medium text-slate-300 mb-2">
                Opis
              </label>
              <textarea
                id="portal-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200 resize-none"
                placeholder="Opis portalu (opcjonalnie)"
              />
            </div>

            <div>
              <label htmlFor="portal-tags" className="block text-sm font-medium text-slate-300 mb-2">
                Tagi
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {formData.tags?.map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-sm flex items-center gap-2 border border-emerald-400/20 backdrop-blur-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-emerald-400 hover:text-emerald-300 hover:scale-110 transition-all"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <input
                id="portal-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagKeyPress}
                onBlur={addTag}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200"
                placeholder="Dodaj tag i naciśnij Enter"
              />
            </div>
          </div>

          {/* Connection Info */}
          <div className="space-y-5">
            <h3 className="text-lg font-semibold text-white flex items-center gap-3">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></span>
              Dane Połączenia
            </h3>

            <div>
              <label htmlFor="portal-url" className="block text-sm font-medium text-slate-300 mb-2">
                URL Portalu *
              </label>
              <input
                id="portal-url"
                type="url"
                value={formData.portalUrl}
                onChange={(e) => handleInputChange('portalUrl', e.target.value)}
                className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200 ${
                  errors.portalUrl ? 'border-red-500' : 'border-slate-700'
                }`}
                placeholder="http://portal.example.com/"
              />
              {errors.portalUrl && (
                <p className="mt-2 text-sm text-red-400">{errors.portalUrl}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="portal-login" className="block text-sm font-medium text-slate-300 mb-2">
                  Login (opcjonalny)
                </label>
                <input
                  id="portal-login"
                  type="text"
                  value={formData.login}
                  onChange={(e) => handleInputChange('login', e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200 ${
                    errors.login ? 'border-red-500' : 'border-slate-700'
                  }`}
                  placeholder="Twój login (opcjonalnie)"
                />
                {errors.login && (
                  <p className="mt-2 text-sm text-red-400">{errors.login}</p>
                )}
              </div>

              <div>
                <label htmlFor="portal-password" className="block text-sm font-medium text-slate-300 mb-2">
                  Hasło (opcjonalne)
                </label>
                <input
                  id="portal-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 transition-all duration-200 ${
                    errors.password ? 'border-red-500' : 'border-slate-700'
                  }`}
                  placeholder="Twoje hasło (opcjonalnie)"
                />
                {errors.password && (
                  <p className="mt-2 text-sm text-red-400">{errors.password}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="portal-mac" className="block text-sm font-medium text-slate-300 mb-2">
                Adres MAC *
              </label>
              <input
                id="portal-mac"
                type="text"
                value={formData.mac}
                onChange={(e) => handleInputChange('mac', e.target.value.toUpperCase())}
                className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-slate-500 font-mono transition-all duration-200 ${
                  errors.mac ? 'border-red-500' : 'border-slate-700'
                }`}
                placeholder="00:1A:79:84:1A:AB"
              />
              {errors.mac && (
                <p className="mt-2 text-sm text-red-400">{errors.mac}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Format: XX:XX:XX:XX:XX:XX (hexadecymalne)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-700/50">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-slate-600 text-slate-300 rounded-xl hover:bg-slate-700/50 hover:text-white transition-all duration-200 hover:scale-105"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 flex items-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Zapisywanie...
                </>
              ) : (
                <>
                  {portal ? 'Zapisz Zmiany' : 'Dodaj Portal'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
