import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TestTube, CheckCircle, AlertCircle } from 'lucide-react';
import { StalkerAccount } from '@/types';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { usePortalStore } from '@/store/usePortalStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  account?: StalkerAccount | null;
}

export const AccountForm: React.FC<AccountFormProps> = ({ isOpen, onClose, account }) => {
  const { addAccount, error } = usePortalStore();
  const [formData, setFormData] = useState({
    name: account?.name || '',
    portalUrl: account?.portalUrl || '',
    mac: account?.mac || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const validateMacAddress = (mac: string): boolean => {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (!formData.portalUrl.trim()) {
      newErrors.portalUrl = 'Portal URL is required';
    } else if (!validateUrl(formData.portalUrl)) {
      newErrors.portalUrl = 'Please enter a valid URL';
    }

    if (!formData.mac.trim()) {
      newErrors.mac = 'MAC address is required';
    } else if (!validateMacAddress(formData.mac)) {
      newErrors.mac = 'Please enter a valid MAC address (XX:XX:XX:XX:XX:XX)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const testConnection = async () => {
    if (!validateForm()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const testAccount: StalkerAccount = {
        id: 'test',
        name: formData.name,
        portalUrl: formData.portalUrl,
        mac: formData.mac,
        lastUsed: new Date(),
        isActive: false,
      };

      const client = new StalkerClient(testAccount);
      const success = await client.testConnection();
      
      setTestResult({
        success,
        message: success ? 'Connection successful! Portal is accessible.' : 'Connection failed: Unable to connect to portal',
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      await addAccount({
        name: formData.name,
        portalUrl: formData.portalUrl,
        mac: formData.mac,
        lastUsed: new Date(),
        isActive: false,
      });

      onClose();
    } catch (error) {
      // Error is already handled in store
      console.error('Add account failed:', error);
    }
  };

  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            className="bg-background rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {account ? 'Edit Account' : 'Add New Account'}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                placeholder="e.g., Provider EU 4K"
                value={formData.name}
                onChange={handleInputChange('name')}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="portalUrl">Portal URL</Label>
              <Input
                id="portalUrl"
                placeholder="http://example.com:8080/c/"
                value={formData.portalUrl}
                onChange={handleInputChange('portalUrl')}
                className={errors.portalUrl ? 'border-destructive' : ''}
              />
              {errors.portalUrl && (
                <p className="text-sm text-destructive">{errors.portalUrl}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mac">MAC Address</Label>
              <Input
                id="mac"
                placeholder="00:1A:79:XX:XX:XX"
                value={formData.mac}
                onChange={handleInputChange('mac')}
                className={errors.mac ? 'border-destructive' : ''}
                style={{ textTransform: 'uppercase' }}
              />
              {errors.mac && (
                <p className="text-sm text-destructive">{errors.mac}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Format: XX:XX:XX:XX:XX:XX (hexadecimal)
              </p>
            </div>

            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <p className="text-sm">{testResult.message}</p>
              </motion.div>
            )}

            {error && (
              <div className="p-3 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={isTesting}
                className="flex items-center gap-2"
              >
                <TestTube className="w-4 h-4" />
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button type="submit" className="flex-1">
                {account ? 'Update Account' : 'Add Account'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
