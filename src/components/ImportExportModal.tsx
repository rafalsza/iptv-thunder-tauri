import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { importExportService } from '@/lib/importExport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ isOpen, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{
    success: boolean;
    message: string;
    details?: { imported: number; skipped: number };
  } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await importExportService.exportToFile();
      setImportResult({
        success: true,
        message: 'Accounts exported successfully!',
      });
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const isValid = await importExportService.validateImportFile(file);
      if (!isValid) {
        throw new Error('Invalid file format. Please select a valid IPTV Thunder export file.');
      }

      const result = await importExportService.importFromFile(file);
      setImportResult({
        success: true,
        message: 'Import completed successfully!',
        details: result,
      });
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Import failed',
      });
    } finally {
      setIsImporting(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setImportResult(null);
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
        onClick={handleClose}
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
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Import & Export Accounts
              </CardTitle>
              <CardDescription>
                Backup your accounts or import from another device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Export Section */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Export Accounts</Label>
                <p className="text-sm text-muted-foreground">
                  Download all your accounts as a JSON file for backup or sharing
                </p>
                <Button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? 'Exporting...' : 'Export All Accounts'}
                </Button>
              </div>

              {/* Import Section */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Import Accounts</Label>
                <p className="text-sm text-muted-foreground">
                  Select a JSON file exported from IPTV Thunder
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    disabled={isImporting}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Choose File
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Existing accounts with the same MAC and portal URL will be updated
                </p>
              </div>

              {/* Result Message */}
              <AnimatePresence>
                {importResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-3 rounded-lg flex items-start gap-2 ${
                      importResult.success
                        ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}
                  >
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{importResult.message}</p>
                      {importResult.details && (
                        <p className="text-xs mt-1">
                          {importResult.details.imported} imported, {importResult.details.skipped} skipped
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
