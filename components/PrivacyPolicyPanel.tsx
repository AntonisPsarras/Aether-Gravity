import React from 'react';
import { X, Shield } from 'lucide-react';
import PrivacyPolicyContent from './PrivacyPolicyContent';

const PrivacyPolicyPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[110] safe-pad flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 p-4">
      <div
        className="relative bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-2xl w-full max-w-3xl max-w-[96vw] max-h-[min(92dvh,52rem)] overflow-hidden shadow-2xl ring-1 ring-white/5 animate-in zoom-in-95 duration-300 flex flex-col"
        role="dialog"
        aria-labelledby="privacy-policy-title"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-nova-gold/15 border border-nova-gold/25 rounded-xl flex items-center justify-center text-nova-gold shrink-0">
              <Shield size={20} />
            </div>
            <h2 id="privacy-policy-title" className="text-xl font-bold text-pulsar-white tracking-wide truncate">
              Privacy Policy
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex h-11 w-11 shrink-0 items-center justify-center text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close privacy policy"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 md:p-8 custom-scrollbar flex-1">
          <PrivacyPolicyContent />
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPanel;
