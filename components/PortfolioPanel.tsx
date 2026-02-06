import React, { useState } from 'react';
import { X, Globe, Cpu, Rocket, Award, ExternalLink, Mail, Github, BookOpen, GraduationCap, ChevronRight } from 'lucide-react';
import ComplexityChart from './Portfolio/ComplexityChart';
import SkillsRadar from './Portfolio/SkillsRadar';
import { ParentSize } from '@visx/responsive';

const LINK_GITHUB = "https://github.com/AntonisPsarras";
const LINK_EMAIL = "mailto:antonpsar10@gmail.com";

const PortfolioPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'tech' | 'roadmap'>('overview');

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className="relative bg-slate-900/95 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl ring-1 ring-white/5 animate-in zoom-in-95 duration-300 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                            <Rocket size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-wide">Aether Research</h2>
                            <p className="text-xs text-slate-400">Development Log & Credits</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-6">
                    <button onClick={() => setActiveTab('overview')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Overview</button>
                    <button onClick={() => setActiveTab('tech')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tech' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Technical Data</button>
                    <button onClick={() => setActiveTab('roadmap')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'roadmap' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>Roadmap/Support</button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">

                    {activeTab === 'overview' && (
                        <div className="grid md:grid-cols-2 gap-8 animation-in slide-in-from-left-4 duration-300">
                            <div className="space-y-6">
                                <div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3">
                                        Lead Developer
                                    </div>
                                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Antonios <span className="text-slate-400">Psarras</span></h1>
                                    <p className="text-lg text-slate-400 leading-relaxed">
                                        Exploring <span className="text-slate-200">Computational Physics</span> and <span className="text-slate-200">Quantum Mechanics</span> through code.
                                    </p>
                                </div>

                                <div className="flex gap-3 text-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-slate-300">
                                        <Globe size={14} className="text-cyan-400" /> Greece
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-slate-300">
                                        <GraduationCap size={14} className="text-purple-400" /> High School Freshman
                                    </div>
                                </div>

                                <div className="bg-slate-800/50 p-5 rounded-xl border border-white/5">
                                    <h3 className="font-bold text-white mb-2 flex items-center gap-2"><Cpu size={16} className="text-indigo-400" /> The Project</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        Aether Gravity started as an experiment to visualize N-body problems. I optimized the vector math to allow for real-time interaction in the browser, bridging the gap between textbook physics and interactive simulation.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tech' && (
                        <div className="space-y-8 animation-in slide-in-from-right-4 duration-300">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5">
                                    <h3 className="font-bold text-slate-200 mb-1 flex items-center gap-2"><Award size={16} className="text-cyan-400" /> Algorithmic Efficiency</h3>
                                    <p className="text-xs text-slate-500 mb-4">Benchmarking computational cost vs body count</p>
                                    <div className="h-48">
                                        <ParentSize>{({ width, height }) => <ComplexityChart width={width} height={height} />}</ParentSize>
                                    </div>
                                </div>
                                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5">
                                    <h3 className="font-bold text-slate-200 mb-1 flex items-center gap-2"><BookOpen size={16} className="text-purple-400" /> Core Competencies</h3>
                                    <p className="text-xs text-slate-500 mb-4">Technical radar visualization</p>
                                    <div className="h-48">
                                        <ParentSize>{({ width, height }) => <SkillsRadar width={width} height={height} />}</ParentSize>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'roadmap' && (
                        <div className="space-y-8 animation-in slide-in-from-bottom-4 duration-300">
                            <div className="grid gap-4">
                                {[
                                    { title: "Relativistic Effects", desc: "Time dilation & light bending", icon: <Globe className="text-cyan-400" size={18} />, status: 'In Research' },
                                    { title: "Molecular Clouds", desc: "Star formation simulation", icon: <Rocket className="text-purple-400" size={18} />, status: 'Planned' },
                                    { title: "Life Potential", desc: "Atmospheric logic", icon: <Award className="text-emerald-400" size={18} />, status: 'Planned' }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                                        <div className="p-2 bg-white/5 rounded-lg">{item.icon}</div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-200">{item.title}</h4>
                                            <p className="text-xs text-slate-500">{item.desc}</p>
                                        </div>
                                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] text-slate-400 uppercase tracking-wide">{item.status}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-2xl border border-white/5 text-center">
                                <h3 className="font-bold text-white mb-2">Connect & Collaborate</h3>
                                <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">
                                    Feel free to reach out for research discussions or technical inquiries.
                                </p>
                                <div className="flex justify-center gap-3">
                                    <a href={LINK_GITHUB} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors flex items-center gap-2 px-4 text-xs font-medium"><Github size={18} /> GitHub</a>
                                    <a href={LINK_EMAIL} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors flex items-center gap-2 px-4 text-xs font-medium"><Mail size={18} /> Email</a>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default PortfolioPanel;
