import React from 'react';
import {
  ExternalLink,
  Info,
  User,
  Database,
  HardDrive,
  EyeOff,
  Wifi,
  Link2,
  Baby,
  Lock,
  SlidersHorizontal,
  History,
  Mail,
  Smartphone,
  ShieldOff,
  WifiOff,
} from 'lucide-react';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_URL,
  PRIVACY_QUICK_FACTS,
  type PrivacyPolicyIcon,
  type PrivacyQuickFact,
} from '../content/privacyPolicy';

type IconComponent = React.ComponentType<{ size?: number | string; className?: string }>;

const SECTION_ICONS: Record<PrivacyPolicyIcon, IconComponent> = {
  intro: Info,
  who: User,
  collect: Database,
  storage: HardDrive,
  'not-collect': EyeOff,
  internet: Wifi,
  links: Link2,
  children: Baby,
  security: Lock,
  choices: SlidersHorizontal,
  changes: History,
  contact: Mail,
};

const QUICK_FACT_ICONS: Record<PrivacyQuickFact['icon'], IconComponent> = {
  lock: Lock,
  device: Smartphone,
  'no-ads': ShieldOff,
  'no-network': WifiOff,
};

const PrivacyPolicyContent: React.FC = () => (
  <div className="space-y-8">
    <div>
      <p className="text-sm text-pulsar-white/55 leading-relaxed mb-4">
        Last updated {PRIVACY_POLICY_LAST_UPDATED} — how Aether Gravity handles your information.
      </p>
      <div className="info-trust-row">
        {PRIVACY_QUICK_FACTS.map((fact) => {
          const Icon = QUICK_FACT_ICONS[fact.icon];
          return (
            <div key={fact.label} className="info-chip is-positive">
              <Icon size={15} />
              <span>{fact.label}</span>
            </div>
          );
        })}
      </div>
    </div>

    <a
      href={PRIVACY_POLICY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="touch-target inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-nova-gold transition-colors"
    >
      <ExternalLink size={14} />
      Open hosted policy (Play Store)
    </a>

    <div className="info-section-list">
      {PRIVACY_POLICY_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.icon];
        return (
          <section key={section.title} className="info-section">
            <div className="info-section-icon" aria-hidden><Icon size={16} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="info-section-title">{section.title}</h3>
              <div className="info-section-body">
                {section.paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  </div>
);

export default PrivacyPolicyContent;
