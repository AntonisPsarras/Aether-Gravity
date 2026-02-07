import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, MousePointer2, Play, Search, Settings, HelpCircle, Check } from 'lucide-react';

const TUTORIAL_STEPS = [
    {
        title: "Welcome to Aether Gravity",
        content: "This is a high-performance space sandbox. You can create solar systems, simulate black holes, and observe cosmic evolution. Let's learn the controls.",
        icon: <HelpCircle size={32} className="text-cyan-400" />
    },
    {
        title: "Navigation Controls",
        content: "• Left Click + Drag to rotate the camera.\n• Right Click + Drag to pan the view.\n• Scroll to zoom in and out.\n• Click on any object to focus on it.",
        icon: <MousePointer2 size={32} className="text-blue-400" />
    },
    {
        title: "Creating Celestial Bodies",
        content: "Open the Creation Menu at the bottom (or bottom-left on desktop). Select a body type like 'Star' or 'Planet', then drag anywhere in space to launch it. The length of your drag determines the launch velocity.",
        icon: <Play size={32} className="text-emerald-400" />
    },
    {
        title: "Time Control",
        content: "Use the playback controls at the bottom center to Pause manually or adjust the simulation speed. Speeds > 1.0x will accelerate orbital mechanics and evolution.",
        icon: <Settings size={32} className="text-orange-400" />
    },
    {
        title: "Inspector & Analysis",
        content: "Click on any planet or star to open the Inspector Panel. Here you can view real-time data, atmospheric composition, and habitability metrics (ESI). You can even terraform planets by adjusting their properties!",
        icon: <Search size={32} className="text-purple-400" />
    },
    {
        title: "Visual Tools",
        content: "Use the toggle buttons in the Control Bar to show/hide:\n• Orbital Grid (Spacetime Curvature)\n• Dust Trails\n• Habitable Zones (Green rings around stars)\n• Stability Overlay (Hill Spheres)",
        icon: <Settings size={32} className="text-pink-400" />
    },
    {
        title: "Ready to Explore!",
        content: "You are now ready to build your own universe. Have fun experimenting with gravity!",
        icon: <Check size={32} className="text-green-400" />
    }
];

const TutorialOverlay: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (isOpen) setCurrentStep(0);
    }, [isOpen]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
            <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl ring-1 ring-white/5 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Progress Bar */}
                <div className="h-1 bg-slate-800 w-full">
                    <div
                        className="h-full bg-cyan-500 transition-all duration-300 ease-out"
                        style={{ width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
                    />
                </div>

                <div className="p-8 flex-1 flex flex-col items-center text-center">
                    <div className="mb-6 p-4 bg-white/5 rounded-full ring-1 ring-white/10 shadow-lg shadow-cyan-500/5">
                        {TUTORIAL_STEPS[currentStep].icon}
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">
                        {TUTORIAL_STEPS[currentStep].title}
                    </h2>

                    <div className="text-slate-400 leading-relaxed text-sm whitespace-pre-line min-h-[5rem]">
                        {TUTORIAL_STEPS[currentStep].content}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-6 bg-black/20 border-t border-white/5 flex justify-between items-center">
                    <button
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className={`flex items-center gap-2 text-sm font-medium transition-colors ${currentStep === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white'}`}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>

                    <div className="flex gap-2">
                        {TUTORIAL_STEPS.map((_, idx) => (
                            <div
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentStep ? 'bg-cyan-400' : 'bg-slate-700'}`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={handleNext}
                        className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg transition-all shadow-lg shadow-cyan-500/20 active:scale-95 text-sm"
                    >
                        {currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
                        {currentStep < TUTORIAL_STEPS.length - 1 && <ChevronRight size={16} />}
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    <X size={20} />
                </button>

            </div>
        </div>
    );
};

export default TutorialOverlay;
