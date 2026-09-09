import React from 'react';
import { Shield } from 'lucide-react';
import InfoModal from './InfoModal';
import PrivacyPolicyContent from './PrivacyPolicyContent';

const PrivacyPolicyPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <InfoModal
    onClose={onClose}
    icon={<Shield size={20} />}
    title="Privacy Policy"
    subtitle="How your data is (and isn't) handled"
    labelId="privacy-policy-title"
    maxWidthClassName="max-w-[min(48rem,96vw)]"
    badgeMuted
    zIndex={110}
  >
    <PrivacyPolicyContent />
  </InfoModal>
);

export default PrivacyPolicyPanel;
