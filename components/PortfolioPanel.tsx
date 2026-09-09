import React, { useState } from 'react';
import { Globe, Cpu, Rocket, Award, Mail, Github, BookOpen, GraduationCap, Shield, Map } from 'lucide-react';
import InfoModal, { InfoModalTab } from './InfoModal';
import PrivacyPolicyContent from './PrivacyPolicyContent';
import ComplexityChart from './Portfolio/ComplexityChart';
import SkillsRadar from './Portfolio/SkillsRadar';
import { ParentSize } from '@visx/responsive';

const LINK_GITHUB = "https://github.com/AntonisPsarras";
const LINK_EMAIL = "mailto:antonpsar10@gmail.com";

type TabId = 'overview' | 'tech' | 'roadmap' | 'legal';

const TABS: InfoModalTab[] = [
    { id: 'overview', label: 'Overview', icon: <Rocket size={15} /> },
    { id: 'tech', label: 'Technical Data', icon: <Cpu size={15} /> },
    { id: 'roadmap', label: 'Roadmap/Support', icon: <Map size={15} /> },
    { id: 'legal', label: 'Privacy', icon: <Shield size={15} /> },
];

const TAB_MODAL_MAX_W: Record<TabId, string> = {
    overview: 'max-w-[min(42rem,96vw)]',
    tech: 'max-w-[min(64rem,96vw)]',
    roadmap: 'max-w-[min(42rem,96vw)]',
    legal: 'max-w-[min(48rem,96vw)]',
};

const ROADMAP_ITEMS: { title: string; desc: string; icon: React.ReactNode; status: string }[] = [
    { title: "Relativistic Effects", desc: "Time dilation & light bending", icon: <Globe size={16} />, status: 'In research' },
    { title: "Molecular Clouds", desc: "Star formation simulation", icon: <Rocket size={16} />, status: 'Planned' },
    { title: "Life Potential", desc: "Atmospheric logic", icon: <Award size={16} />, status: 'Planned' },
];

const PortfolioPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    return (
        <InfoModal
            onClose={onClose}
            icon={<Rocket size={20} />}
            title="Aether Research"
            subtitle="Development log & credits"
            labelId="credits-panel-title"
            maxWidthClassName={TAB_MODAL_MAX_W[activeTab]}
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as TabId)}
        >
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <div>
                        <span className="info-chip is-accent mb-4">
                            <Award size={14} /> Lead Developer
                        </span>
                        <h1 className="mt-4 text-3xl md:text-4xl font-bold text-pulsar-white mb-2">
                            Antonios <span className="text-pulsar-white/40">Psarras</span>
                        </h1>
                        <p className="text-base md:text-lg text-pulsar-white/50 leading-relaxed">
                            Exploring <span className="text-pulsar-white/80">Computational Physics</span> and{' '}
                            <span className="text-pulsar-white/80">Quantum Mechanics</span> through code.
                        </p>
                    </div>

                    <div className="info-chip-row">
                        <span className="info-chip"><Globe size={14} className="text-nova-gold" /> Greece</span>
                        <span className="info-chip"><GraduationCap size={14} className="text-purple-400" /> High School Freshman</span>
                    </div>

                    <div className="info-card">
                        <h3 className="font-bold text-pulsar-white mb-2 flex items-center gap-2">
                            <Cpu size={16} className="text-nova-gold" /> The Project
                        </h3>
                        <p className="text-sm text-pulsar-white/50 leading-relaxed">
                            Aether Gravity started as an experiment to visualize N-body problems. I optimized the vector
                            math to allow for real-time interaction in the browser, bridging the gap between textbook
                            physics and interactive simulation.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'tech' && (
                <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                    <div className="info-card">
                        <h3 className="font-bold text-pulsar-white/80 mb-1 flex items-center gap-2">
                            <Award size={16} className="text-nova-gold" /> Algorithmic Efficiency
                        </h3>
                        <p className="text-xs text-pulsar-white/30 mb-4">Benchmarking computational cost vs body count</p>
                        <div className="h-48">
                            <ParentSize>{({ width, height }) => <ComplexityChart width={width} height={height} />}</ParentSize>
                        </div>
                    </div>
                    <div className="info-card">
                        <h3 className="font-bold text-pulsar-white/80 mb-1 flex items-center gap-2">
                            <BookOpen size={16} className="text-purple-400" /> Core Competencies
                        </h3>
                        <p className="text-xs text-pulsar-white/30 mb-4">Technical radar visualization</p>
                        <div className="h-48">
                            <ParentSize>{({ width, height }) => <SkillsRadar width={width} height={height} />}</ParentSize>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'roadmap' && (
                <div className="space-y-8">
                    <div className="info-section-list">
                        {ROADMAP_ITEMS.map((item) => (
                            <div key={item.title} className="info-section">
                                <div className="info-section-icon" aria-hidden>{item.icon}</div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="font-bold text-pulsar-white/85 text-sm">{item.title}</h4>
                                        <p className="text-xs text-pulsar-white/40 mt-0.5">{item.desc}</p>
                                    </div>
                                    <span className="shrink-0 px-2.5 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] text-pulsar-white/45 uppercase tracking-wide">
                                        {item.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="info-card text-center">
                        <h3 className="font-bold text-pulsar-white mb-2">Connect &amp; Collaborate</h3>
                        <p className="text-sm text-pulsar-white/50 mb-4 max-w-md mx-auto">
                            Feel free to reach out for research discussions or technical inquiries.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-3">
                            <a
                                href={LINK_GITHUB}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="touch-target px-4 bg-white/5 hover:bg-white/10 rounded-lg text-pulsar-white/70 hover:text-pulsar-white transition-colors flex items-center justify-center gap-2 text-xs font-medium"
                            >
                                <Github size={18} /> GitHub
                            </a>
                            <a
                                href={LINK_EMAIL}
                                className="touch-target px-4 bg-white/5 hover:bg-white/10 rounded-lg text-pulsar-white/70 hover:text-pulsar-white transition-colors flex items-center justify-center gap-2 text-xs font-medium"
                            >
                                <Mail size={18} /> Email
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'legal' && <PrivacyPolicyContent />}
        </InfoModal>
    );
};

export default PortfolioPanel;
