import { ethers } from 'ethers';
import deployed from '@/config/contracts.json';

/**
 * Wallet helpers shared by the auth store and the Sign In UI.
 * Kept free of React / Zustand so the error and network rules live in one place.
 */

export const PHAROS_DEVNET_CHAIN_ID = 50002;
export const HARDHAT_CHAIN_ID = 31337;

const PHAROS_NETWORK_CONFIG = {
  chainId: ethers.utils.hexValue(PHAROS_DEVNET_CHAIN_ID),
  chainName: 'Pharos Devnet',
  rpcUrls: ['https://devnet.dplabs-internal.com'],
  nativeCurrency: { name: 'Pharos', symbol: 'PHAROS', decimals: 18 },
  blockExplorerUrls: ['https://pharosscan.xyz'],
};

const HARDHAT_NETWORK_CONFIG = {
  chainId: ethers.utils.hexValue(HARDHAT_CHAIN_ID),
  chainName: 'Hardhat Local',
  rpcUrls: ['http://127.0.0.1:8545'],
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
};

export interface TargetNetwork {
  chainId: number;
  hexChainId: string;
  name: string;
  config: typeof PHAROS_NETWORK_CONFIG | typeof HARDHAT_NETWORK_CONFIG;
}

/** Hardhat when local contracts are deployed, otherwise Pharos Devnet. */
export const getTargetNetwork = (): TargetNetwork => {
  if (deployed.marketplace && Number(deployed.chainId) === HARDHAT_CHAIN_ID) {
    return {
      chainId: HARDHAT_CHAIN_ID,
      hexChainId: HARDHAT_NETWORK_CONFIG.chainId,
      name: HARDHAT_NETWORK_CONFIG.chainName,
      config: HARDHAT_NETWORK_CONFIG,
    };
  }
  return {
    chainId: PHAROS_DEVNET_CHAIN_ID,
    hexChainId: PHAROS_NETWORK_CONFIG.chainId,
    name: PHAROS_NETWORK_CONFIG.chainName,
    config: PHAROS_NETWORK_CONFIG,
  };
};

export const isSupportedChain = (chainId?: number) =>
  chainId === getTargetNetwork().chainId;

const KNOWN_CHAINS: Record<number, string> = {
  1: 'Ethereum Mainnet',
  10: 'OP Mainnet',
  56: 'BNB Chain',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum One',
  11155111: 'Sepolia',
  [HARDHAT_CHAIN_ID]: 'Hardhat Local',
  [PHAROS_DEVNET_CHAIN_ID]: 'Pharos Devnet',
};

export const getChainName = (chainId?: number) => {
  if (!chainId) {
    return 'Unknown network';
  }
  return KNOWN_CHAINS[chainId] ?? `Chain ${chainId}`;
};

export const shortenAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

export const METAMASK_DOWNLOAD_URL = 'https://metamask.io/download/';

/** Opens the current page inside the MetaMask mobile in-app browser. */
export const getMetaMaskDeepLink = () =>
  typeof window === 'undefined'
    ? METAMASK_DOWNLOAD_URL
    : `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Minimal EIP-1193 surface we rely on. */
export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isRabby?: boolean;
  providers?: Eip1193Provider[];
}

/** Prefer MetaMask when several wallets inject into `window.ethereum`. */
export const getInjectedProvider = (): Eip1193Provider | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) {
    return null;
  }
  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    const usable = injected.providers.filter((p) => typeof p?.request === 'function');
    return (
      usable.find((p) => p.isMetaMask) ||
      usable.find((p) => p.isOkxWallet) ||
      usable.find((p) => p.isRabby) ||
      usable[0] ||
      null
    );
  }
  return typeof injected.request === 'function' ? injected : null;
};

export const hasInjectedProvider = () => getInjectedProvider() !== null;

export const createWeb3Provider = (provider: Eip1193Provider) =>
  new ethers.providers.Web3Provider(provider as ethers.providers.ExternalProvider, 'any');

export const requestWallet = async <T>(
  provider: Eip1193Provider,
  method: string,
  params?: unknown[],
  timeoutMs?: number
): Promise<T> => {
  const request = provider.request(params ? { method, params } : { method }) as Promise<T>;
  // Account prompts wait on the user, so they never time out.
  if (!timeoutMs) {
    return request;
  }
  let timerId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timerId = window.setTimeout(
      () => reject(new WalletError('TIMEOUT', `Wallet request timed out: ${method}`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    window.clearTimeout(timerId);
  }
};

export const readChainId = async (provider: Eip1193Provider) => {
  const hex = await requestWallet<string>(provider, 'eth_chainId', undefined, 10000);
  return Number.parseInt(hex, 16);
};

export const readBalance = async (provider: Eip1193Provider, address: string) => {
  try {
    return ethers.utils.formatEther(await createWeb3Provider(provider).getBalance(address));
  } catch {
    return '0';
  }
};

/** Ask the wallet to switch (or add, on 4902) the app's target network. */
export const switchToTargetNetwork = async (provider: Eip1193Provider) => {
  const target = getTargetNetwork();
  try {
    await requestWallet<void>(provider, 'wallet_switchEthereumChain', [{ chainId: target.hexChainId }], 60000);
  } catch (switchError) {
    if (getErrorCode(switchError) !== 4902) {
      throw switchError;
    }
    await requestWallet<void>(provider, 'wallet_addEthereumChain', [target.config], 60000);
  }
  return readChainId(provider);
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type WalletErrorCode =
  | 'NO_WALLET'
  | 'USER_REJECTED'
  | 'REQUEST_PENDING'
  | 'NO_ACCOUNTS'
  | 'NETWORK_SWITCH_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class WalletError extends Error {
  constructor(public code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

/** Serializable shape stored in Zustand and rendered by the UI. */
export interface WalletErrorInfo {
  code: WalletErrorCode;
  message: string;
}

const getErrorCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const e = error as {
    code?: number | string;
    error?: { code?: number | string };
    data?: { originalError?: { code?: number | string } };
  };
  const raw = e.code ?? e.error?.code ?? e.data?.originalError?.code;
  const code = Number(raw);
  return Number.isFinite(code) ? code : undefined;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; error?: { message?: string } };
    return e.message ?? e.error?.message ?? '';
  }
  return typeof error === 'string' ? error : '';
};

/**
 * Map raw EIP-1193 / ethers errors to a stable code + copy a user can act on.
 * `context` lets the same code read differently for "connect" vs "switch network".
 */
export const toWalletError = (
  error: unknown,
  context: 'connect' | 'switch' = 'connect'
): WalletErrorInfo => {
  const targetName = getTargetNetwork().name;

  if (error instanceof WalletError && error.code !== 'TIMEOUT') {
    return { code: error.code, message: error.message };
  }

  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  // 4001: EIP-1193 user rejected request. ACTION_REJECTED: ethers v5 wrapper.
  if (code === 4001 || message.includes('user rejected') || message.includes('user denied')) {
    return {
      code: 'USER_REJECTED',
      message:
        context === 'switch'
          ? `You declined the network switch. RWAHub needs ${targetName} to send transactions.`
          : 'You rejected the connection request in your wallet. Nothing was shared — try again when ready.',
    };
  }

  // -32002: a request of the same type is already waiting in the wallet popup.
  if (code === -32002 || message.includes('already pending') || message.includes('already processing')) {
    return {
      code: 'REQUEST_PENDING',
      message: 'Your wallet already has a request open. Click the MetaMask icon in your browser toolbar to finish it.',
    };
  }

  if (error instanceof WalletError || message.includes('timed out')) {
    return {
      code: 'TIMEOUT',
      message: 'Your wallet did not respond in time. Open MetaMask, make sure it is unlocked, and try again.',
    };
  }

  if (context === 'switch') {
    return {
      code: 'NETWORK_SWITCH_FAILED',
      message: `Your wallet could not switch to ${targetName}. Switch networks in MetaMask manually, then come back.`,
    };
  }

  if (message.includes('receiving end does not exist')) {
    return {
      code: 'UNKNOWN',
      message: 'The wallet extension is not responding. Reload this page and try again.',
    };
  }

  return {
    code: 'UNKNOWN',
    message: 'Could not connect to your wallet. Please try again.',
  };
};
