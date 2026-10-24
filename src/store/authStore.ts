import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import {
  type Eip1193Provider,
  type WalletErrorInfo,
  WalletError,
  getInjectedProvider,
  isSupportedChain,
  readBalance,
  readChainId,
  requestWallet,
  shortenAddress,
  switchToTargetNetwork,
  toWalletError,
} from '@/lib/wallet';

// Wallet event wiring lives outside the store: provider handlers are not serializable
// and must not be persisted. They are re-attached by restoreWalletSession() after reload.
let activeProvider: Eip1193Provider | null = null;

const onAccountsChanged = async (accounts: string[]) => {
  const { user } = useAuthStore.getState();
  if (!accounts?.length) {
    // Wallet locked, or the site was disconnected from inside MetaMask.
    signOutLocally();
    toast.info('Your wallet was disconnected.');
    return;
  }
  const address = ethers.utils.getAddress(accounts[0]);
  if (address === user?.wallet?.address || !activeProvider) {
    return;
  }
  // A different account is a different identity: don't carry the old profile over.
  const chainId = await readChainId(activeProvider).catch(() => user?.wallet?.chainId);
  const balance = await readBalance(activeProvider, address);
  useAuthStore.setState({ user: createWalletUser(address, chainId, balance), walletError: null });
  toast.info(`Switched to account ${shortenAddress(address)}.`);
};

const onChainChanged = async (chainIdHex: string) => {
  const chainId = Number.parseInt(chainIdHex, 16);
  const { user, walletError } = useAuthStore.getState();
  if (!user?.wallet || !activeProvider) {
    return;
  }
  const balance = await readBalance(activeProvider, user.wallet.address);
  useAuthStore.setState((state) => ({
    user: state.user?.wallet
      ? { ...state.user, wallet: { ...state.user.wallet, chainId, balance } }
      : state.user,
    // A stale "switch failed" message is wrong once the user fixes it in MetaMask.
    walletError: isSupportedChain(chainId) ? null : walletError,
  }));
};

const attachProvider = (provider: Eip1193Provider) => {
  detachProvider();
  activeProvider = provider;
  provider.on?.('accountsChanged', onAccountsChanged);
  provider.on?.('chainChanged', onChainChanged);
};

const detachProvider = () => {
  activeProvider?.removeListener?.('accountsChanged', onAccountsChanged);
  activeProvider?.removeListener?.('chainChanged', onChainChanged);
  activeProvider = null;
};

const signOutLocally = () => {
  detachProvider();
  useAuthStore.setState({
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,
    walletRequest: 'none',
    walletError: null,
  });
};

const createWalletUser = (address: string, chainId?: number, balance = '0'): User => ({
  id: address.toLowerCase(),
  wallet: { address, isConnected: true, provider: 'metamask', chainId, balance },
  roles: { isBuyer: true, isSeller: false },
  stats: { totalPurchases: 0, totalSales: 0 },
});

/** What the wallet is currently being asked to do; drives the Sign In modal's progress copy. */
export type WalletRequest = 'none' | 'connecting' | 'switching';
interface KYCData {
  status: 'pending' | 'verified' | 'rejected';
  idVerified: boolean;
  addressVerified: boolean;
  documents: {
    governmentId?: string;
    proofOfAddress?: string;
    additionalDocs?: string[];
  };
  verificationDate?: Date;
}

interface WalletData {
  address: string;
  isConnected: boolean;
  provider?: string;
  chainId?: number;
  balance?: string;
}

interface User {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
  preferences?: {
    assetCategories: string[];
    notifications: boolean;
    language: string;
  };
  kyc?: KYCData;
  wallet?: WalletData;
  roles: {
    isBuyer: boolean;
    isSeller: boolean;
  };
  stats: {
    buyerRating?: number;
    sellerRating?: number;
    totalPurchases: number;
    totalSales: number;
  };
  bankAccount?: {
    isVerified: boolean;
    last4: string;
    type: string;
  };
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  authModalOpen: boolean;
  walletRequest: WalletRequest;
  walletError: WalletErrorInfo | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  connectWallet: () => Promise<boolean>;
  switchNetwork: () => Promise<boolean>;
  disconnectWallet: () => Promise<void>;
  restoreWalletSession: () => Promise<void>;
  clearWalletError: () => void;
  submitKYC: (documents: KYCData['documents']) => Promise<void>;
  updateKYCStatus: (status: KYCData['status']) => Promise<void>;
  toggleRole: (role: 'buyer' | 'seller', enabled: boolean) => Promise<void>;
  connectBankAccount: (accountDetails: any) => Promise<void>;
  clearError: () => void; // Added clearError to the interface
}

const mockUsers = [
  {
    id: '1',
    email: 'demo@example.com',
    password: 'password123',
    name: 'Demo User',
    roles: {
      isBuyer: true,
      isSeller: false,
    },
    stats: {
      totalPurchases: 0,
      totalSales: 0,
    },
  },
];

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      loading: false,
      error: null,
      authModalOpen: false,
      walletRequest: 'none',
      walletError: null,
      openAuthModal: () => set({ authModalOpen: true, error: null, walletError: null }),
      closeAuthModal: () => set({ authModalOpen: false }),

      login: async (email: string, password: string) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const user = mockUsers.find(
            (u) => u.email === email && u.password === password
          );
          if (!user) {
            throw new Error('Invalid email or password');
          }
          const { password: _, ...userData } = user;
          set({
            isAuthenticated: true,
            user: userData as User,
            loading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      register: async (email: string, password: string, name: string) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const newUser = {
            id: crypto.randomUUID(),
            email,
            name,
            roles: {
              isBuyer: true,
              isSeller: false,
            },
            stats: {
              totalPurchases: 0,
              totalSales: 0,
            },
          };
          set({
            isAuthenticated: true,
            user: newUser,
            loading: false,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      logout: async () => {
        await get().disconnectWallet();
      },

      resetPassword: async (email: string) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set({ loading: false });
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      updateProfile: async (updates: Partial<User>) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set((state) => ({
            user: state.user ? { ...state.user, ...updates } : null,
            loading: false,
          }));
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      connectWallet: async () => {
        if (get().walletRequest !== 'none') {
          return false;
        }
        const provider = getInjectedProvider();
        if (!provider) {
          set({
            walletError: {
              code: 'NO_WALLET',
              message: 'No wallet found in this browser. Install MetaMask to sign in.',
            },
          });
          return false;
        }

        set({ walletRequest: 'connecting', walletError: null, error: null });
        try {
          // No timeout: this waits on the user in the MetaMask popup.
          const accounts = await requestWallet<string[]>(provider, 'eth_requestAccounts');
          if (!accounts?.length) {
            throw new WalletError(
              'NO_ACCOUNTS',
              'Your wallet did not share an account. Unlock MetaMask, pick an account, and try again.'
            );
          }
          const address = ethers.utils.getAddress(accounts[0]);
          let chainId = await readChainId(provider);

          // Signing in only needs the account. If the network is wrong we still sign in,
          // offer the switch once, and leave the user in a visible "wrong network" state if
          // they decline — rather than failing the whole sign in.
          let walletError: WalletErrorInfo | null = null;
          if (!isSupportedChain(chainId)) {
            set({ walletRequest: 'switching' });
            try {
              chainId = await switchToTargetNetwork(provider);
            } catch (switchError) {
              walletError = toWalletError(switchError, 'switch');
            }
          }

          const balance = await readBalance(provider, address);
          const currentUser = get().user;
          const wallet = { address, isConnected: true, provider: 'metamask', chainId, balance };
          attachProvider(provider);
          set({
            isAuthenticated: true,
            user:
              currentUser?.wallet?.address === address
                ? { ...currentUser, wallet }
                : createWalletUser(address, chainId, balance),
            walletRequest: 'none',
            walletError,
          });
          return true;
        } catch (error) {
          set({ walletRequest: 'none', walletError: toWalletError(error, 'connect') });
          return false;
        }
      },

      switchNetwork: async () => {
        const provider = activeProvider ?? getInjectedProvider();
        if (!provider) {
          set({
            walletError: {
              code: 'NO_WALLET',
              message: 'No wallet found in this browser. Install MetaMask to continue.',
            },
          });
          return false;
        }
        set({ walletRequest: 'switching', walletError: null });
        try {
          const chainId = await switchToTargetNetwork(provider);
          set((state) => ({
            walletRequest: 'none',
            user: state.user?.wallet
              ? { ...state.user, wallet: { ...state.user.wallet, chainId } }
              : state.user,
          }));
          return isSupportedChain(chainId);
        } catch (error) {
          set({ walletRequest: 'none', walletError: toWalletError(error, 'switch') });
          return false;
        }
      },

      disconnectWallet: async () => {
        const provider = activeProvider ?? getInjectedProvider();
        signOutLocally();
        // dApps can't force MetaMask to forget a site, but wallets that support
        // wallet_revokePermissions (MetaMask 11.x+) will drop the grant so the next
        // Sign In shows the account picker again. Best effort only.
        if (provider) {
          requestWallet(provider, 'wallet_revokePermissions', [{ eth_accounts: {} }], 5000).catch(
            () => undefined
          );
        }
      },

      restoreWalletSession: async () => {
        const { isAuthenticated, user } = get();
        if (!isAuthenticated || !user?.wallet?.address) {
          return;
        }
        const provider = getInjectedProvider();
        if (!provider) {
          signOutLocally();
          return;
        }
        try {
          // eth_accounts never prompts: it only reports accounts this site may already see.
          const accounts = await requestWallet<string[]>(provider, 'eth_accounts', undefined, 10000);
          if (!accounts?.length) {
            signOutLocally();
            toast.info('Your wallet session ended. Sign in again to continue.');
            return;
          }
          attachProvider(provider);
          const address = ethers.utils.getAddress(accounts[0]);
          if (address !== user.wallet.address) {
            await onAccountsChanged(accounts);
            return;
          }
          const chainId = await readChainId(provider);
          const balance = await readBalance(provider, address);
          set((state) => ({
            user: state.user?.wallet
              ? { ...state.user, wallet: { ...state.user.wallet, chainId, balance, isConnected: true } }
              : state.user,
          }));
        } catch {
          // Extension not responding: keep the session; events will resync it when it wakes up.
        }
      },

      clearWalletError: () => set({ walletError: null }),

      submitKYC: async (documents: KYCData['documents']) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set((state) => ({
            user: state.user
              ? {
                  ...state.user,
                  kyc: {
                    status: 'pending',
                    idVerified: false,
                    addressVerified: false,
                    documents,
                    verificationDate: new Date(),
                  },
                }
              : null,
            loading: false,
          }));
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      updateKYCStatus: async (status: KYCData['status']) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set((state) => ({
            user: state.user && state.user.kyc
              ? {
                  ...state.user,
                  kyc: {
                    ...state.user.kyc,
                    status,
                    idVerified: status === 'verified',
                    addressVerified: status === 'verified',
                  },
                }
              : null,
            loading: false,
          }));
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      toggleRole: async (role: 'buyer' | 'seller', enabled: boolean) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set((state) => ({
            user: state.user
              ? {
                  ...state.user,
                  roles: {
                    ...state.user.roles,
                    [role === 'buyer' ? 'isBuyer' : 'isSeller']: enabled,
                  },
                }
              : null,
            loading: false,
          }));
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      connectBankAccount: async (accountDetails: any) => {
        try {
          set({ loading: true, error: null });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          set((state) => ({
            user: state.user
              ? {
                  ...state.user,
                  bankAccount: {
                    isVerified: true,
                    last4: accountDetails.last4,
                    type: accountDetails.type,
                  },
                }
              : null,
            loading: false,
          }));
        } catch (error) {
          set({
            error: (error as Error).message,
            loading: false,
          });
        }
      },

      clearError: () => set({ error: null }), // Implementation of clearError
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loading = false;
          state.error = null;
        }
      },
    }
  )
);