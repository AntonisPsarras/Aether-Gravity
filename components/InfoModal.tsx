import React from 'react';
import { X } from 'lucide-react';

export type InfoModalTab = { id: string; label: string; icon?: React.ReactNode };

/**
 * Shared shell for the menu's informational overlays (Credits, Privacy).
 * Keeps both surfaces visually identical to the main menu's own glass/gold
 * design language, and to each other, instead of each hand-rolling a dialog.
 */
const InfoModal: React.FC<{
    onClose: () => void;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    labelId: string;
    maxWidthClassName?: string;
    badgeMuted?: boolean;
    tabs?: InfoModalTab[];
    activeTab?: string;
    onTabChange?: (id: string) => void;
    /** Overlay stacking order — bump when a modal may open above another (inline style always wins over the CSS class's z-index). */
    zIndex?: number;
    children: React.ReactNode;
}> = ({ onClose, icon, title, subtitle, labelId, maxWidthClassName = 'max-w-[min(42rem,96vw)]', badgeMuted, tabs, activeTab, onTabChange, zIndex = 100, children }) => (
    <div
        className="info-modal-overlay"
        style={{ zIndex }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
        <div
            className={`info-modal w-full ${maxWidthClassName}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
        >
            <div className="info-modal-header">
                <div className="info-modal-heading">
                    <div className={`info-modal-badge ${badgeMuted ? 'is-muted' : ''}`} aria-hidden>{icon}</div>
                    <div className="min-w-0">
                        <h2 id={labelId} className="info-modal-title truncate">{title}</h2>
                        {subtitle && <p className="info-modal-subtitle truncate">{subtitle}</p>}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="touch-target flex h-11 w-11 shrink-0 items-center justify-center text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close"
                >
                    <X size={20} />
                </button>
            </div>

            {tabs && tabs.length > 0 && (
                <div className="info-modal-tabs" role="tablist">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            onClick={() => onTabChange?.(tab.id)}
                            className={`info-modal-tab touch-target ${activeTab === tab.id ? 'is-active' : ''}`}
                        >
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="info-modal-body panel-scroll">
                {children}
            </div>
        </div>
    </div>
);

export default InfoModal;
