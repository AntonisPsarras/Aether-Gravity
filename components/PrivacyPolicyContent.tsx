import React from 'react';
import { ExternalLink } from 'lucide-react';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_URL,
} from '../content/privacyPolicy';

const PrivacyPolicyContent: React.FC = () => (
  <>
    <p className="text-sm text-pulsar-white/55 leading-relaxed mb-4">
      Last updated: {PRIVACY_POLICY_LAST_UPDATED}. This policy describes how Aether Gravity handles your
      information when you use the app.
    </p>
    <a
      href={PRIVACY_POLICY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="touch-target inline-flex items-center gap-2 mb-8 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-nova-gold transition-colors"
    >
      <ExternalLink size={14} />
      Open hosted policy (Play Store)
    </a>

    <div className="space-y-8">
      {PRIVACY_POLICY_SECTIONS.map((section) => (
        <section key={section.title}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-pulsar-white/70 mb-3">
            {section.title}
          </h3>
          {section.paragraphs.map((paragraph, i) => (
            <p key={i} className="text-sm text-pulsar-white/50 leading-relaxed mb-3 last:mb-0">
              {paragraph}
            </p>
          ))}
          {section.bullets && section.bullets.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm text-pulsar-white/50 list-disc pl-5 leading-relaxed">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  </>
);

export default PrivacyPolicyContent;
