/** Canonical hosted policy (Google Play Console uses this URL). */
export const PRIVACY_POLICY_URL =
  'https://www.termsfeed.com/live/cded6b3e-c46c-465e-a562-f1a73cd79f1c';

export const PRIVACY_POLICY_LAST_UPDATED = 'September 9, 2026';

export const PRIVACY_CONTACT_EMAIL = 'antonpsar10@gmail.com';

/**
 * Icon identifier for a section — kept as a plain string (rather than a JSX
 * import) so this file stays pure data. PrivacyPolicyContent maps each id to
 * a lucide-react component.
 */
export type PrivacyPolicyIcon =
  | 'intro'
  | 'who'
  | 'collect'
  | 'storage'
  | 'not-collect'
  | 'internet'
  | 'links'
  | 'children'
  | 'security'
  | 'choices'
  | 'changes'
  | 'contact';

export type PrivacyPolicySection = {
  title: string;
  icon: PrivacyPolicyIcon;
  paragraphs: string[];
  bullets?: string[];
};

export type PrivacyQuickFact = {
  icon: 'lock' | 'device' | 'no-ads' | 'no-network';
  label: string;
};

/** Scannable reassurance strip shown above the full policy text. */
export const PRIVACY_QUICK_FACTS: PrivacyQuickFact[] = [
  { icon: 'lock', label: 'No accounts or sign-in' },
  { icon: 'device', label: 'Saves stay on this device' },
  { icon: 'no-ads', label: 'No ads or trackers bundled' },
  { icon: 'no-network', label: 'Android build ships network-free' },
];

/**
 * In-app privacy policy text aligned with Aether Gravity behavior
 * (on-device storage, no accounts, no third-party analytics in the app).
 */
export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: 'Introduction',
    icon: 'intro',
    paragraphs: [
      'This Privacy Policy describes how Aether Gravity ("the Application", "we", "us") handles information when you use the mobile and web versions of the app.',
      'By using the Application, you agree to this Privacy Policy. If you do not agree, please do not use the Application.',
    ],
  },
  {
    title: 'Who We Are',
    icon: 'who',
    paragraphs: [
      'The Application is provided by Antonios Psarras, based in Greece.',
      'For privacy-related questions, contact us at the email address listed at the end of this policy.',
    ],
  },
  {
    title: 'Information We Collect',
    icon: 'collect',
    paragraphs: [
      'We do not require you to create an account. We do not ask for your name, email address, or phone number inside the Application.',
      'We do not operate a backend service that receives your universe saves or simulation data from the Application.',
      'Data stored locally on your device may include:',
    ],
    bullets: [
      'Universe and folder names you choose',
      'Simulation state for worlds you create (celestial bodies, settings, and related metadata)',
      'UI preferences such as grid, dust, and habitable-zone display toggles',
    ],
  },
  {
    title: 'How Data Is Stored',
    icon: 'storage',
    paragraphs: [
      'The items listed above are stored locally on your device using browser or WebView storage (localStorage). Temporary migration backups may be created while an older universe is upgraded, then removed after the upgraded save is verified.',
      'Clearing app storage or uninstalling the Application permanently deletes this local data. The Application cannot recover it afterward.',
      'The Android Application excludes its app data from cloud backup and device-transfer backup.',
      'We do not sync this data to our servers.',
    ],
  },
  {
    title: 'Information We Do Not Collect',
    icon: 'not-collect',
    paragraphs: [
      'The Application, as distributed, does not include third-party analytics, advertising SDKs, or crash-reporting services that send usage profiles to us.',
    ],
    bullets: [
      'No account registration or login',
      'No collection of contact details through the app',
      'No sale of personal information',
    ],
  },
  {
    title: 'Internet Access',
    icon: 'internet',
    paragraphs: [
      'The Android Application does not request Internet or network-state permission. Routine gameplay and universe management do not use a network connection or upload your saves.',
      'If you choose a hosted-policy, GitHub, or email link, the Application hands that action to your browser or email application. The external application may use a network connection under its own privacy practices.',
    ],
  },
  {
    title: 'Third-Party Links',
    icon: 'links',
    paragraphs: [
      'The Application links to a hosted copy of this policy and may link to external services such as GitHub or your email application. These links open only when you choose them, do not attach your universe data, and are governed by the external service\'s privacy practices.',
    ],
  },
  {
    title: 'Children\'s Privacy',
    icon: 'children',
    paragraphs: [
      'The Application is not directed at children under 16, and we do not knowingly collect personal information from children. If you believe a child has provided personal information to us, contact us and we will address the request.',
    ],
  },
  {
    title: 'Security',
    icon: 'security',
    paragraphs: [
      'Local data is stored using your device\'s standard storage mechanisms. No method of electronic storage is completely secure, but we do not transmit your universe data to our servers.',
    ],
  },
  {
    title: 'Your Choices',
    icon: 'choices',
    paragraphs: [
      'You can delete universes and folders inside the Application. You can also remove all local app data by clearing the app\'s storage in your device settings or uninstalling the Application.',
    ],
  },
  {
    title: 'Changes to This Policy',
    icon: 'changes',
    paragraphs: [
      'We may update this Privacy Policy from time to time. The "Last updated" date at the top will change when we do. Continued use of the Application after changes means you accept the updated policy.',
      'The hosted version at the link below may also be updated for store listings and legal reference.',
    ],
  },
  {
    title: 'Contact Us',
    icon: 'contact',
    paragraphs: [
      `Email: ${PRIVACY_CONTACT_EMAIL}`,
      'GitHub: https://github.com/AntonisPsarras',
    ],
  },
];
