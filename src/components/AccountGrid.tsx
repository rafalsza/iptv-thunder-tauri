import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Wifi, WifiOff, Clock } from 'lucide-react';
import { StalkerAccount } from '@/lib/stalkerAPI_new';
import { usePortalStore } from '@/store/usePortalStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const AccountGrid: React.FC = () => {
  const { accounts, activeAccount, removeAccount, setActiveAccount } = usePortalStore();

  const handleEdit = (account: StalkerAccount) => {
    console.log('Edit account:', account);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      removeAccount(id);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await setActiveAccount(id);
      // Navigate to player view after connecting
      window.dispatchEvent(new CustomEvent('navigateToPlayer'));
    } catch (error) {
      console.error('Failed to connect:', error);
      // Error is already handled in store
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <div>
          <h2 className="text-2xl font-bold">Portal Accounts</h2>
          <p className="text-muted-foreground">
            Manage your IPTV portal connections ({accounts.length}/15)
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Wifi className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No accounts yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first IPTV portal account to get started
            </p>
            <Button onClick={() => window.dispatchEvent(new CustomEvent('showAddAccount'))}>
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account, index) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
            >
              <Card className={`relative transition-all duration-200 hover:shadow-lg ${
                activeAccount?.id === account.id 
                  ? 'ring-2 ring-primary border-primary' 
                  : 'hover:border-primary/50'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        activeAccount?.id === account.id 
                          ? 'bg-green-500' 
                          : 'bg-gray-300'
                      }`} />
                      <CardTitle className="text-lg">{account.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(account)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-1">
                    {account.portalUrl}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">MAC Address:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {account.mac}
                    </code>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={account.isActive ? "default" : "secondary"}>
                      {account.isActive ? (
                        <>
                          <Wifi className="w-3 h-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3 h-3 mr-1" />
                          Inactive
                        </>
                      )}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last used:</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(account.lastUsed)}</span>
                    </div>
                  </div>

                  {account.token && account.expiry && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Token expires:</span>
                      <span className={
                        new Date(account.expiry) < new Date(Date.now() + 24 * 60 * 60 * 1000)
                          ? 'text-orange-500'
                          : 'text-green-500'
                      }>
                        {formatDate(account.expiry)}
                      </span>
                    </div>
                  )}

                  <Button
                    className="w-full mt-4"
                    variant={activeAccount?.id === account.id ? "secondary" : "default"}
                    onClick={() => handleConnect(account.id)}
                    disabled={activeAccount?.id === account.id}
                  >
                    {activeAccount?.id === account.id ? 'Connected' : 'Connect'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
