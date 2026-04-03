import React from 'react';
import { ChevronDown, Wifi, WifiOff, Settings, Users, LogOut, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePortalStore } from '@/store/usePortalStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface NavbarProps {
  currentView?: 'accounts' | 'player';
  setCurrentView?: (view: 'accounts' | 'player') => void;
  setShowSettings?: (show: boolean) => void;
  setShowAddAccount?: (show: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView = 'accounts', setCurrentView, setShowSettings, setShowAddAccount }) => {
  const { accounts, activeAccount, setActiveAccount, logoutAccount } = usePortalStore();

  const handleAccountSwitch = (accountId: string) => {
    setActiveAccount(accountId);
    setCurrentView?.('player');
  };

  const handleManageAccounts = () => {
    setCurrentView?.('accounts');
  };

  const handleSettings = () => {
    setShowSettings?.(true);
  };

  const handleDisconnect = () => {
    if (activeAccount) {
      logoutAccount(activeAccount.id);
      setCurrentView?.('accounts');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold">IPTV Thunder</h1>
          </div>
          
          {activeAccount && (
            <Badge variant="default" className="hidden sm:flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Connected to {activeAccount.name}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 min-w-[200px] justify-between">
                  <div className="flex items-center gap-2">
                    {activeAccount ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="truncate">{activeAccount.name}</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4" />
                        <span>No Account</span>
                      </>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent className="w-80" align="end">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Portal Accounts</span>
                  <Badge variant="secondary">{accounts.length}/15</Badge>
                </DropdownMenuLabel>
                
                <DropdownMenuSeparator />
                
                <AnimatePresence>
                  {accounts.map((account) => (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <DropdownMenuItem
                        onClick={() => handleAccountSwitch(account.id)}
                        className={`flex flex-col items-start p-3 cursor-pointer ${
                          activeAccount?.id === account.id 
                            ? 'bg-accent/50 border-l-2 border-primary' 
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              activeAccount?.id === account.id 
                                ? 'bg-green-500' 
                                : 'bg-gray-300'
                            }`} />
                            <span className="font-medium">{account.name}</span>
                          </div>
                          {activeAccount?.id === account.id && (
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground w-full">
                          <span className="truncate max-w-[120px]">{account.mac}</span>
                          <span>{formatDate(account.lastUsed)}</span>
                        </div>
                        
                        {account.token && account.expiry && (
                          <div className="text-xs mt-1">
                            <span className={
                              new Date(account.expiry) < new Date(Date.now() + 24 * 60 * 60 * 1000)
                                ? 'text-orange-500'
                                : 'text-green-500'
                            }>
                              Token: {formatDate(account.expiry)}
                            </span>
                          </div>
                        )}
                      </DropdownMenuItem>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {accounts.length > 0 && <DropdownMenuSeparator />}
                
                <DropdownMenuItem onClick={handleManageAccounts} className="flex items-center gap-2 cursor-pointer">
                  <Users className="w-4 h-4" />
                  <span>Manage Accounts</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={handleSettings} className="flex items-center gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                
                {activeAccount && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDisconnect} className="flex items-center gap-2 cursor-pointer text-destructive">
                      <LogOut className="w-4 h-4" />
                      <span>Disconnect</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Add Account Button - always visible */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowAddAccount?.(true)}
            disabled={accounts.length >= 15}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </Button>
          
          {activeAccount && (
            <Button 
              variant={currentView === 'accounts' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setCurrentView?.('accounts')}
            >
              <Users className="w-4 h-4 mr-2" />
              Accounts
            </Button>
          )}
          
          <Button variant="outline" size="sm" onClick={handleSettings}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
