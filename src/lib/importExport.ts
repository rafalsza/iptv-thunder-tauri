import { StalkerAccount } from '@/types';
import { useAccountStore } from '@/store/accountStore';

export interface ExportData {
  version: string;
  exportDate: string;
  accounts: StalkerAccount[];
  settings?: any;
}

export class ImportExportService {
  private static instance: ImportExportService;

  private constructor() {}

  static getInstance(): ImportExportService {
    if (!ImportExportService.instance) {
      ImportExportService.instance = new ImportExportService();
    }
    return ImportExportService.instance;
  }

  async exportAccounts(): Promise<ExportData> {
    const { accounts, settings } = useAccountStore.getState();
    
    const exportData: ExportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      accounts: accounts.map(account => ({
        ...account,
        // Convert dates to strings for JSON serialization
        lastUsed: account.lastUsed.toISOString(),
        expiry: account.expiry ? account.expiry.toISOString() : undefined,
      })) as unknown as StalkerAccount[],
      settings,
    };

    return exportData;
  }

  async exportToFile(): Promise<void> {
    try {
      const exportData = await this.exportAccounts();
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iptv-thunder-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export accounts:', error);
      throw new Error('Failed to export accounts');
    }
  }

  async importFromFile(file: File): Promise<{ imported: number; skipped: number }> {
    try {
      const text = await file.text();
      const importData: ExportData = JSON.parse(text);
      
      return this.importFromData(importData);
    } catch (error) {
      console.error('Failed to import accounts:', error);
      throw new Error('Failed to import accounts. Please check the file format.');
    }
  }

  async importFromData(importData: ExportData): Promise<{ imported: number; skipped: number }> {
    const { accounts: existingAccounts, addAccount, updateAccount } = useAccountStore.getState();
    
    let imported = 0;
    let skipped = 0;

    // Validate import data
    if (!importData.accounts || !Array.isArray(importData.accounts)) {
      throw new Error('Invalid import data format');
    }

    for (const accountData of importData.accounts) {
      try {
        // Convert string dates back to Date objects
        const account: StalkerAccount = {
          ...accountData,
          lastUsed: new Date(accountData.lastUsed),
          expiry: accountData.expiry ? new Date(accountData.expiry) : undefined,
        };

        // Check if account already exists (by MAC address and portal URL)
        const existing = existingAccounts.find(
          acc => acc.mac === account.mac && acc.portalUrl === account.portalUrl
        );

        if (existing) {
          // Update existing account
          updateAccount(existing.id, {
            name: account.name,
            token: account.token,
            expiry: account.expiry,
          });
          skipped++;
        } else {
          // Add new account
          addAccount({
            name: account.name,
            portalUrl: account.portalUrl,
            mac: account.mac,
            isActive: false,
            token: account.token,
            expiry: account.expiry,
          });
          imported++;
        }
      } catch (error) {
        console.error('Failed to import account:', accountData.name, error);
        skipped++;
      }
    }

    return { imported, skipped };
  }

  validateImportFile(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data: ExportData = JSON.parse(content);
          
          // Basic validation
          const isValid = 
            data.version && 
            data.exportDate && 
            data.accounts && 
            Array.isArray(data.accounts) &&
            data.accounts.every(acc => 
              acc.name && acc.portalUrl && acc.mac
            );
          
          resolve(!!isValid);
        } catch {
          resolve(false);
        }
      };
      
      reader.onerror = () => resolve(false);
      reader.readAsText(file);
    });
  }

  async exportFavorites(accountId: string): Promise<any> {
    // This could be extended to export favorites and history
    // For now, just focusing on accounts
    console.log('Exporting favorites for account:', accountId);
    return {};
  }

  async importFavorites(accountId: string, data: any): Promise<void> {
    // This could be extended to import favorites and history
    // For now, just focusing on accounts
    console.log('Importing favorites for account:', accountId, data);
  }
}

export const importExportService = ImportExportService.getInstance();
