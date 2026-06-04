/** Canonical hosted policy (Google Play Console uses this URL). */
export const PRIVACY_POLICY_URL =
  'https://www.termsfeed.com/live/cded6b3e-c46c-465e-a562-f1a73cd79f1c';

export const PRIVACY_POLICY_LAST_UPDATED = 'June 2, 2026';

export const PRIVACY_CONTACT_EMAIL = 'antonpsar10@gmail.com';

export type PrivacyPolicySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

/**
 * In-app privacy policy text aligned with Aether Gravity behavior
 * (on-device storage, no accounts, no third-party analytics in the app).
 */
export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: 'Introduction',
    paragraphs: [
      'This Privacy Policy describes how Aether Gravity ("the Application", "we", "us") handles information when you use the mobile and web versions of the app.',
      'By using the Application, you agree to this Privacy Policy. If you do not agree, please do not use the Application.',
    ],
  },
  {
    title: 'Who We Are',
    paragraphs: [
      'The Application is provided by Antonis Psarras, based in Greece.',
      'For privacy-related questions, contact us at the email address listed at the end of this policy.',
    ],
  },
  {
    title: 'Information We Collect',
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
    paragraphs: [
      'The items listed above are stored locally on your device using browser or WebView storage (for example localStorage). Data stays on your device unless you clear app storage, uninstall the app, or use device backup features provided by your operating system.',
      'We do not sync this data to our servers.',
    ],
  },
  {
    title: 'Information We Do Not Collect',
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
    paragraphs: [
      'The Application may request network access for general connectivity (for example opening external links you choose, such as GitHub). Routine gameplay and universe management do not require uploading your saves to us.',
    ],
  },
  {
    title: 'Third-Party Links',
    paragraphs: [
      'The Application may link to external websites (for example GitHub). Those sites have their own privacy practices. We are not responsible for third-party sites you open from the Application.',
    ],
  },
  {
    title: 'Children\'s Privacy',
    paragraphs: [
      'The Application is not directed at children under 16, and we do not knowingly collect personal information from children. If you believe a child has provided personal information to us, contact us and we will address the request.',
    ],
  },
  {
    title: 'Security',
    paragraphs: [
      'Local data is stored using your device\'s standard storage mechanisms. No method of electronic storage is completely secure, but we do not transmit your universe data to our servers.',
    ],
  },
  {
    title: 'Your Choices',
    paragraphs: [
      'You can delete universes and folders inside the Application. You can also remove all local app data by clearing the app\'s storage in your device settings or uninstalling the Application.',
    ],
  },
  {
    title: 'Changes to This Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. The "Last updated" date at the top will change when we do. Continued use of the Application after changes means you accept the updated policy.',
      'The hosted version at the link below may also be updated for store listings and legal reference.',
    ],
  },
  {
    title: 'Contact Us',
    paragraphs: [
      `Email: ${PRIVACY_CONTACT_EMAIL}`,
      'GitHub: https://github.com/AntonisPsarras',
    ],
  },
];
