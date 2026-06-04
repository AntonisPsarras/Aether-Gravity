import React, { useState } from 'react';
import { X, Globe, Cpu, Rocket, Award, ExternalLink, Mail, Github, BookOpen, GraduationCap, ChevronRight, Shield } from 'lucide-react';
import PrivacyPolicyContent from './PrivacyPolicyContent';
import ComplexityChart from './Portfolio/ComplexityChart';
import SkillsRadar from './Portfolio/SkillsRadar';
import { ParentSize } from '@visx/responsive';

const LINK_GITHUB = "https://github.com/AntonisPsarras";
const LINK_EMAIL = "mailto:antonpsar10@gmail.com";

const TAB_MODAL_MAX_W: Record<'overview' | 'tech' | 'roadmap' | 'legal', string> = {
    overview: 'max-w-2xl',
    tech: 'max-w-5xl',
    roadmap: 'max-w-2xl',
    legal: 'max-w-3xl',
};

const PortfolioPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'tech' | 'roadmap' | 'legal'>('overview');

    return (
        <div className="fixed inset-0 z-[100] safe-pad flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className={`relative bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-2xl w-full ${TAB_MODAL_MAX_W[activeTab]} max-w-[96vw] max-h-[min(92dvh,52rem)] overflow-hidden shadow-2xl ring-1 ring-white/5 animate-in zoom-in-95 duration-300 flex flex-col transition-[max-width] duration-300 ease-out`}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-nova-gold to-nebula-rust rounded-xl flex items-center justify-center text-void-navy shadow-lg shadow-nova-gold/20">
                            <Rocket size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-pulsar-white tracking-wide">Aether Research</h2>
                            <p className="text-xs text-pulsar-white/40">Development Log & Credits</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="touch-target flex h-11 w-11 shrink-0 items-center justify-center text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10 rounded-lg transition-colors" aria-label="Close"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-3 md:px-6 overflow-x-auto">
                    <button onClick={() => setActiveTab('overview')} className={`touch-target shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-nova-gold text-nova-gold' : 'border-transparent text-pulsar-white/40 hover:text-pulsar-white'}`}>Overview</button>
                    <button onClick={() => setActiveTab('tech')} className={`touch-target shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tech' ? 'border-nova-gold text-nova-gold' : 'border-transparent text-pulsar-white/40 hover:text-pulsar-white'}`}>Technical Data</button>
                    <button onClick={() => setActiveTab('roadmap')} className={`touch-target shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'roadmap' ? 'border-nova-gold text-nova-gold' : 'border-transparent text-pulsar-white/40 hover:text-pulsar-white'}`}>Roadmap/Support</button>
                    <button onClick={() => setActiveTab('legal')} className={`touch-target shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'legal' ? 'border-nova-gold text-nova-gold' : 'border-transparent text-pulsar-white/40 hover:text-pulsar-white'}`}><Shield size={14} /> Privacy</button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-4 md:p-8 custom-scrollbar flex-1">
                    <div className="space-y-8 w-full mx-auto">

                    {activeTab === 'overview' && (
                        <div className="space-y-6 animation-in slide-in-from-left-4 duration-300">
                                <div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-nova-gold/10 text-nova-gold border border-nova-gold/20 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3">
                                        Lead Developer
                                    </div>
                                    <h1 className="text-3xl md:text-4xl font-bold text-pulsar-white mb-2">Antonios <span className="text-pulsar-white/40">Psarras</span></h1>
                                    <p className="text-lg text-pulsar-white/50 leading-relaxed">
                                        Exploring <span className="text-pulsar-white/80">Computational Physics</span> and <span className="text-pulsar-white/80">Quantum Mechanics</span> through code.
                                    </p>
                                </div>

                                <div className="flex gap-3 text-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-pulsar-white/70">
                                        <Globe size={14} className="text-nova-gold" /> Greece
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-pulsar-white/70">
                                        <GraduationCap size={14} className="text-purple-400" /> High School Freshman
                                    </div>
                                </div>

                                <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                                    <h3 className="font-bold text-pulsar-white mb-2 flex items-center gap-2"><Cpu size={16} className="text-nova-gold" /> The Project</h3>
                                    <p className="text-sm text-pulsar-white/50 leading-relaxed">
                                        Aether Gravity started as an experiment to visualize N-body problems. I optimized the vector math to allow for real-time interaction in the browser, bridging the gap between textbook physics and interactive simulation.
                                    </p>
                                </div>
                        </div>
                    )}

                    {activeTab === 'tech' && (
                        <div className="space-y-8 w-full animation-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                    <h3 className="font-bold text-pulsar-white/80 mb-1 flex items-center gap-2"><Award size={16} className="text-nova-gold" /> Algorithmic Efficiency</h3>
                                    <p className="text-xs text-pulsar-white/30 mb-4">Benchmarking computational cost vs body count</p>
                                    <div className="h-48">
                                        <ParentSize>{({ width, height }) => <ComplexityChart width={width} height={height} />}</ParentSize>
                                    </div>
                                </div>
                                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                                    <h3 className="font-bold text-pulsar-white/80 mb-1 flex items-center gap-2"><BookOpen size={16} className="text-purple-400" /> Core Competencies</h3>
                                    <p className="text-xs text-pulsar-white/30 mb-4">Technical radar visualization</p>
                                    <div className="h-48">
                                        <ParentSize>{({ width, height }) => <SkillsRadar width={width} height={height} />}</ParentSize>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'roadmap' && (
                        <div className="space-y-8 w-full animation-in slide-in-from-bottom-4 duration-300">
                            <div className="grid gap-4">
                                {[
                                    { title: "Relativistic Effects", desc: "Time dilation & light bending", icon: <Globe className="text-nova-gold" size={18} />, status: 'In Research' },
                                    { title: "Molecular Clouds", desc: "Star formation simulation", icon: <Rocket className="text-purple-400" size={18} />, status: 'Planned' },
                                    { title: "Life Potential", desc: "Atmospheric logic", icon: <Award className="text-emerald-400" size={18} />, status: 'Planned' }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                                        <div className="p-2 bg-white/5 rounded-lg">{item.icon}</div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-pulsar-white/80">{item.title}</h4>
                                            <p className="text-xs text-pulsar-white/30">{item.desc}</p>
                                        </div>
                                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] text-pulsar-white/40 uppercase tracking-wide">{item.status}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-[rgba(16,20,28,0.6)] p-6 rounded-2xl border border-white/8 text-center">
                                <h3 className="font-bold text-pulsar-white mb-2">Connect & Collaborate</h3>
                                <p className="text-sm text-pulsar-white/50 mb-4 max-w-md mx-auto">
                                    Feel free to reach out for research discussions or technical inquiries.
                                </p>
                                <div className="flex flex-col sm:flex-row justify-center gap-3">
                                    <a href={LINK_GITHUB} target="_blank" rel="noopener noreferrer" className="touch-target p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-pulsar-white/70 hover:text-pulsar-white transition-colors flex items-center justify-center gap-2 px-4 text-xs font-medium"><Github size={18} /> GitHub</a>
                                    <a href={LINK_EMAIL} className="touch-target p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-pulsar-white/70 hover:text-pulsar-white transition-colors flex items-center justify-center gap-2 px-4 text-xs font-medium"><Mail size={18} /> Email</a>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'legal' && (
                        <div className="animation-in slide-in-from-bottom-4 duration-300">
                            <PrivacyPolicyContent />
                        </div>
                    )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PortfolioPanel;
