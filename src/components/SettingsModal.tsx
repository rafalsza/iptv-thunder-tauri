import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Moon, Globe, Database } from 'lucide-react';
import { useAccountStore } from '@/store/accountStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useAccountStore();

  const handleSave = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          className="bg-background rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Settings
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                Configure your IPTV Thunder application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme Settings */}
              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Moon className="w-4 h-4" />
                  Theme
                </Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Dark Mode</span>
                  <Badge variant="default">Enabled</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dark theme is currently always enabled
                </p>
              </div>

              {/* Language Settings */}
              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Language
                </Label>
                <select 
                  value={settings.language}
                  onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'pl' | 'de' })}
                  className="w-full p-2 border rounded-md bg-background"
                >
                  <option value="en">English</option>
                  <option value="pl">Polski</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>

              {/* Connection Settings */}
              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Connection
                </Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-connect on startup</span>
                    <input
                      type="checkbox"
                      checked={settings.autoConnect}
                      onChange={(e) => updateSettings({ autoConnect: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Buffer time (ms)</span>
                    <Input
                      type="number"
                      value={settings.bufferTime}
                      onChange={(e) => updateSettings({ bufferTime: Number.parseInt(e.target.value) || 5000 })}
                      className="w-24"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1">
                  Save Settings
                </Button>
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
