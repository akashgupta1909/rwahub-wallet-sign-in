import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Wallet,
  Loader2,
  AlertTriangle,
  XCircle,
  ArrowLeftRight,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { Button } from './ui/Button';
import { useAuthStore } from '@/store/authStore';
import { AnimatedLogo } from './AnimatedLogo';
import { useNavigate } from 'react-router-dom';
import { useWalletStatus } from '@/hooks/useWalletStatus';
import { METAMASK_DOWNLOAD_URL, getMetaMaskDeepLink, shortenAddress } from '@/lib/wallet';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMobileBrowser = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const primaryButtonClass =
  'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const connectWallet = useAuthStore((s) => s.connectWallet);
  const switchNetwork = useAuthStore((s) => s.switchNetwork);
  const disconnectWallet = useAuthStore((s) => s.disconnectWallet);
  const clearWalletError = useAuthStore((s) => s.clearWalletError);
  const { status, error, address, chainName, targetChainName } = useWalletStatus();
  const navigate = useNavigate();

  const goToDashboard = useCallback(() => {
    onClose();
    navigate('/dashboard', { replace: true });
  }, [navigate, onClose]);

  // Only a fully ready session closes the modal by itself. Wrong network stays open
  // so the user sees why and chooses to switch or continue.
  useEffect(() => {
    if (isOpen && status === 'connected') {
      goToDashboard();
    }
  }, [isOpen, status, goToDashboard]);

  const handleClose = useCallback(() => {
    clearWalletError();
    onClose();
  }, [clearWalletError, onClose]);

  // Handle escape key press
  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose]
  );

  // Add/remove event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscapeKey]);

  const handleDisconnect = async () => {
    onClose();
    navigate('/', { replace: true });
    await disconnectWallet();
  };

  const renderBody = () => {
    switch (status) {
      case 'no_wallet':
        return (
          <div className="space-y-4">
            <StatusCallout tone="info" icon={<Wallet size={18} />} title="No wallet detected">
              RWAHub signs you in with an Ethereum wallet. Install the MetaMask browser extension,
              then reload this page.
            </StatusCallout>
            {isMobileBrowser() ? (
              <a href={getMetaMaskDeepLink()} className={`btn w-full gap-2 ${primaryButtonClass}`}>
                <Smartphone size={16} aria-hidden="true" />
                Open in MetaMask app
              </a>
            ) : (
              <a
                href={METAMASK_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`btn w-full gap-2 ${primaryButtonClass}`}
              >
                <ExternalLink size={16} aria-hidden="true" />
                Install MetaMask
              </a>
            )}
            <Button
              fullWidth
              variant="outline"
              icon={<RefreshCw size={16} />}
              onClick={() => window.location.reload()}
            >
              I've installed it — reload
            </Button>
          </div>
        );

      case 'connecting':
      case 'switching':
        return (
          <div className="flex flex-col items-center text-center py-4 space-y-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" aria-hidden="true" />
            <p className="font-medium text-neutral-900">
              {status === 'connecting' ? 'Check your wallet' : `Switch to ${targetChainName}`}
            </p>
            <p className="text-sm text-neutral-600 max-w-xs">
              {status === 'connecting'
                ? 'Approve the connection request in MetaMask to share your address.'
                : `Approve the network switch in MetaMask. RWAHub transactions run on ${targetChainName}.`}
            </p>
            <p className="text-xs text-neutral-500">
              Don't see a popup? Click the MetaMask icon in your browser toolbar.
            </p>
          </div>
        );

      case 'wrong_network':
        return (
          <div className="space-y-4">
            <StatusCallout
              tone="warning"
              icon={<AlertTriangle size={18} />}
              title={`Connected as ${shortenAddress(address)}`}
            >
              Your wallet is on <strong>{chainName}</strong>. Switch to{' '}
              <strong>{targetChainName}</strong> to tokenize or trade assets.
              {error && <span className="block mt-2">{error.message}</span>}
            </StatusCallout>
            <Button
              fullWidth
              icon={<ArrowLeftRight size={16} />}
              onClick={switchNetwork}
              className={primaryButtonClass}
            >
              Switch to {targetChainName}
            </Button>
            <div className="flex gap-3">
              <Button fullWidth variant="outline" onClick={goToDashboard}>
                Continue anyway
              </Button>
              <Button fullWidth variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          </div>
        );

      case 'rejected':
      case 'error':
      case 'idle':
      case 'connected':
      default:
        return (
          <div className="space-y-4">
            {status === 'rejected' && error && (
              <StatusCallout tone="warning" icon={<XCircle size={18} />} title="Request rejected">
                {error.message}
              </StatusCallout>
            )}
            {status === 'error' && error && (
              <StatusCallout tone="error" icon={<AlertTriangle size={18} />} title="Couldn't connect">
                {error.message}
              </StatusCallout>
            )}
            <Button
              fullWidth
              icon={<Wallet size={16} />}
              iconPosition="left"
              onClick={connectWallet}
              className={primaryButtonClass}
            >
              {status === 'idle' || status === 'connected' ? 'Continue with MetaMask' : 'Try again'}
            </Button>
            <p className="flex items-start gap-2 text-xs text-neutral-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Signing in only shares your public address. It doesn't send a transaction or cost gas.
            </p>
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50"
          aria-labelledby="modal-title"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              {/* Modal Content */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="relative w-full max-w-[456px] transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  {/* Close button */}
                  <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 transition-colors rounded-full hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>

                  {/* Header */}
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-[180px]" aria-hidden="true">
                      <AnimatedLogo />
                    </div>
                    <h2
                      id="modal-title"
                      className="text-[28px] font-bold text-blue-700"
                    >
                      {status === 'wrong_network' ? 'Wrong Network' : 'Connect Wallet'}
                    </h2>
                    <p className="text-base text-neutral-600 text-center">
                      {status === 'wrong_network'
                        ? 'You are signed in, but your wallet is on another network.'
                        : 'Connect your wallet to access the platform'}
                    </p>
                  </div>

                  {/* Status-driven body; announced to screen readers as it changes */}
                  <div className="mt-8" aria-live="polite">
                    {renderBody()}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

const calloutTones = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-700',
};

interface StatusCalloutProps {
  tone: keyof typeof calloutTones;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const StatusCallout = ({ tone, icon, title, children }: StatusCalloutProps) => (
  <div
    className={`border p-3 rounded-lg text-sm flex gap-3 ${calloutTones[tone]}`}
    role={tone === 'info' ? 'status' : 'alert'}
  >
    <span className="mt-0.5 shrink-0" aria-hidden="true">
      {icon}
    </span>
    <div>
      <p className="font-semibold">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  </div>
);
