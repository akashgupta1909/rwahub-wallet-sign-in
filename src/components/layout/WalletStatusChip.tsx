import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useWalletStatus } from '@/hooks/useWalletStatus';
import { useAuthStore } from '@/store/authStore';
import { shortenAddress } from '@/lib/wallet';

/** Connected address + network, with a one-click fix when the network is wrong. */
export const WalletStatusChip = () => {
  const { status, address, chainName, targetChainName } = useWalletStatus();
  const switchNetwork = useAuthStore((s) => s.switchNetwork);
  const [copied, setCopied] = useState(false);

  if (!address) {
    return null;
  }

  const wrongNetwork = status === 'wrong_network';
  const switching = status === 'switching';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure origin); the full address is in the tooltip.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        title={`${address} — click to copy`}
        aria-label={`Wallet ${address} on ${chainName}. Copy address`}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
          wrongNetwork
            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${wrongNetwork ? 'bg-amber-500' : 'bg-green-500'}`}
          aria-hidden="true"
        />
        <span className="font-mono">{shortenAddress(address)}</span>
        <span className="hidden lg:inline text-xs text-neutral-500">· {chainName}</span>
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-neutral-400" />}
      </button>
      {(wrongNetwork || switching) && (
        <button
          type="button"
          onClick={switchNetwork}
          disabled={switching}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 disabled:opacity-60"
        >
          {switching ? 'Switching…' : `Switch to ${targetChainName}`}
        </button>
      )}
    </div>
  );
};
