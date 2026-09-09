import React, { useEffect, useState } from 'react';
import {
  Aperture, BookOpen, Check, ChevronLeft, ChevronRight, CircleDot,
  Gauge, GitBranch, Globe2, MousePointer2, Search, Sparkles, X,
  type LucideIcon,
} from 'lucide-react';
import { TUTORIAL_STEPS, type TutorialIconId } from '../utils/onboarding';

const ICONS: Record<TutorialIconId, { icon: LucideIcon; color: string }> = {
  model: { icon: BookOpen, color: 'text-cyan-300' },
  navigate: { icon: MousePointer2, color: 'text-blue-400' },
  outliner: { icon: Search, color: 'text-violet-400' },
  create: { icon: Sparkles, color: 'text-emerald-400' },
  orbit: { icon: CircleDot, color: 'text-sky-400' },
  inspect: { icon: Gauge, color: 'text-orange-400' },
  evolve: { icon: GitBranch, color: 'text-rose-400' },
  habitability: { icon: Globe2, color: 'text-green-400' },
  overlays: { icon: Aperture, color: 'text-pink-400' },
};

const TutorialOverlay: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const icon = ICONS[step.icon];
  const Icon = icon.icon;
  const last = currentStep === TUTORIAL_STEPS.length - 1;

  const next = () => {
    if (last) onClose();
    else setCurrentStep((index) => index + 1);
  };

  return (
    <div
      className="tutorial-overlay fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      data-testid="tutorial-overlay"
    >
      <div className="tutorial-dialog relative bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-2xl w-full max-w-[min(46rem,96vw)] max-h-[min(92dvh,48rem)] shadow-2xl ring-1 ring-white/5 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="h-0.5 bg-white/8 w-full" aria-hidden>
          <div
            className="h-full bg-nova-gold transition-all duration-300 ease-out shadow-[0_0_8px_rgba(249,212,35,0.4)]"
            style={{ width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-5 py-6 md:px-9 md:py-8 flex-1 overflow-y-auto">
          <div className="flex items-start gap-4 md:gap-5 pr-8">
            <div className="shrink-0 p-3.5 bg-white/5 rounded-2xl ring-1 ring-white/10 shadow-lg shadow-nova-gold/5">
              <Icon size={28} className={icon.color} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-nova-gold/70 mb-1.5">
                Beginner course · {currentStep + 1} of {TUTORIAL_STEPS.length}
              </p>
              <h2 id="tutorial-title" className="text-xl md:text-2xl font-bold text-pulsar-white tracking-tight">
                {step.title}
              </h2>
            </div>
          </div>

          <p className="mt-6 text-sm md:text-[15px] text-pulsar-white/70 leading-relaxed">{step.summary}</p>

          <ul className="mt-5 space-y-3" aria-label="Key ideas">
            {step.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 text-sm text-pulsar-white/55 leading-relaxed">
                <span className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-cyan-300/70 shrink-0" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {step.physicsNote && (
            <div className="mt-6 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/70 mb-1">Physics note</p>
              <p className="text-xs text-pulsar-white/55 leading-relaxed">{step.physicsNote}</p>
            </div>
          )}
        </div>

        <div className="p-4 md:px-6 md:py-5 bg-black/20 border-t border-white/5 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentStep((index) => Math.max(0, index - 1))}
            disabled={currentStep === 0}
            className={`touch-target flex items-center gap-2 text-sm font-medium transition-colors ${currentStep === 0 ? 'text-pulsar-white/20 cursor-not-allowed' : 'text-pulsar-white/50 hover:text-pulsar-white'}`}
          >
            <ChevronLeft size={16} /> Back
          </button>

          <div className="hidden sm:flex gap-1.5" aria-label={`Step ${currentStep + 1} of ${TUTORIAL_STEPS.length}`}>
            {TUTORIAL_STEPS.map((item, index) => (
              <span key={item.id} className={`h-1.5 rounded-full transition-all duration-300 ${index === currentStep ? 'w-5 bg-cyan-300' : 'w-1.5 bg-white/15'}`} />
            ))}
          </div>

          <button
            type="button"
            onClick={next}
            className="touch-target flex items-center gap-2 px-5 py-2.5 bg-nova-gold hover:bg-nova-gold/90 text-void-navy font-bold rounded-lg transition-all shadow-lg shadow-nova-gold/20 active:scale-95 text-sm"
          >
            {last ? <><Check size={16} /> Finish</> : <>Next <ChevronRight size={16} /></>}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close tutorial"
          className="touch-target absolute top-3 right-3 p-2 text-pulsar-white/35 hover:text-pulsar-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

export default TutorialOverlay;
