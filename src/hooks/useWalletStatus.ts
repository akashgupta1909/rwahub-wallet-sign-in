import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getChainName, getTargetNetwork, hasInjectedProvider, isSupportedChain } from '@/lib/wallet';

/**
 * Every state the Sign In UI can be in. Derived, never stored, so it can't drift
 * out of sync with the session / provider it's computed from.
 */
export type WalletStatus =
  | 'no_wallet'
  | 'idle'
  | 'connecting'
  | 'switching'
  | 'rejected'
  | 'error'
  | 'wrong_network'
  | 'connected';

/** Re-checks for a provider that injects after first paint (MetaMask fires `ethereum#initialized`). */
const useHasInjectedProvider = () => {
  const [detected, setDetected] = useState(hasInjectedProvider);
  useEffect(() => {
    if (detected) {
      return;
    }
    const update = () => setDetected(hasInjectedProvider());
    window.addEventListener('ethereum#initialized', update, { once: true });
    const timer = window.setTimeout(update, 3000);
    return () => {
      window.removeEventListener('ethereum#initialized', update);
      window.clearTimeout(timer);
    };
  }, [detected]);
  return detected;
};

export const useWalletStatus = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wallet = useAuthStore((s) => s.user?.wallet);
  const walletRequest = useAuthStore((s) => s.walletRequest);
  const walletError = useAuthStore((s) => s.walletError);
  const hasProvider = useHasInjectedProvider();

  const isSignedIn = isAuthenticated && Boolean(wallet?.address);
  const target = getTargetNetwork();

  let status: WalletStatus;
  if (walletRequest === 'connecting') status = 'connecting';
  else if (walletRequest === 'switching') status = 'switching';
  else if (isSignedIn) status = isSupportedChain(wallet?.chainId) ? 'connected' : 'wrong_network';
  else if (!hasProvider || walletError?.code === 'NO_WALLET') status = 'no_wallet';
  else if (walletError?.code === 'USER_REJECTED') status = 'rejected';
  else if (walletError) status = 'error';
  else status = 'idle';

  return {
    status,
    error: walletError,
    address: isSignedIn ? wallet?.address : undefined,
    chainId: wallet?.chainId,
    chainName: getChainName(wallet?.chainId),
    targetChainName: target.name,
    isSignedIn,
  };
};
