import { mutateArchive, mutateClosedWorld } from '../utils/worldOwnership';
import { StorageOperationError, storageIssueMessage } from '../utils/browserStorage';
import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Info, Sparkles, Globe2, Play, Pencil, Trash2, Check, X, Calendar, Clock, Folder, ChevronRight, ChevronDown, FolderInput, MoreVertical, Shield, ArrowDown, ArrowRight, Orbit, Dices, Rocket, Star, GripVertical } from 'lucide-react';
import { WorldMeta, FolderMeta } from '../types';
import { getWorldList, createWorld, deleteWorld, renameWorld, getFolderList, createFolder, deleteFolder, renameFolder, moveWorldToFolder } from '../utils/worldStorage';
import { registerBackHandler } from '../utils/backNavigation';
import { REAL_SYSTEMS } from '../content/realSystems';
import { getOnboardingProgress, markTutorialSeen } from '../utils/onboarding';
import { CREATION_ORDER } from './bodyTypeVisuals';

const MenuSpaceBackground = lazy(() => import('./MenuSpaceBackground'));
const PortfolioPanel = lazy(() => import('./PortfolioPanel'));
const TutorialOverlay = lazy(() => import('./TutorialOverlay'));
const PrivacyPolicyPanel = lazy(() => import('./PrivacyPolicyPanel'));

class MenuVisualBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) {
            return (
                <div className="menu-space-background fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden data-gpu-effects="fallback">
                    <div className="menu-space-fallback" />
                    <div className="menu-space-grade" />
                </div>
            );
        }
        return this.props.children;
    }
}

const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(timestamp);
};

const presetNameFor = (presetId?: string): string | null =>
    presetId ? REAL_SYSTEMS.find((system) => system.id === presetId)?.name ?? null : null;

// CreditsPanel replaced by PortfolioPanel

const MoveDestinationSelect: React.FC<{
    world: WorldMeta;
    folders: FolderMeta[];
    onMove: (worldId: string, folderId?: string) => void;
    onMoved?: () => void;
    compact?: boolean;
}> = ({ world, folders, onMove, onMoved, compact = false }) => (
    <label className={`menu-move-select ${compact ? 'menu-move-select-compact' : ''}`}>
        <FolderInput size={compact ? 14 : 16} aria-hidden />
        <span className="sr-only">Move {world.name} to collection</span>
        <select
            aria-label={`Move ${world.name} to collection`}
            value={world.folderId ?? ''}
            onChange={(event) => {
                onMove(world.id, event.currentTarget.value || undefined);
                onMoved?.();
            }}
        >
            <option value="">Independent systems</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
    </label>
);

const WorldCard: React.FC<{
    world: WorldMeta;
    folders: FolderMeta[];
    onOpen: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void | Promise<void>;
    onMove: (worldId: string, folderId?: string) => void;
    onDragStart: (worldId: string) => void;
    onDragEnd: () => void;
    onTouchDragStart: (worldId: string) => void;
    onTouchDragEnd: (clientX: number, clientY: number) => void;
}> = ({ world, folders, onOpen, onRename, onDelete, onMove, onDragStart, onDragEnd, onTouchDragStart, onTouchDragEnd }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(world.name);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const handleSaveRename = () => {
        try {
            if (editName.trim() && editName.trim() !== world.name) {
                onRename(world.id, editName.trim());
            }
            setIsEditing(false);
            setError(null);
        } catch (e: any) {
            setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.');
        }
    };
    const handleCancelEdit = () => { setEditName(world.name); setIsEditing(false); setError(null); };
    const handleConfirmDelete = async () => { await onDelete(world.id); setShowDeleteConfirm(false); };

    useEffect(() => {
        if (!showDeleteConfirm && !showActionsMenu && !isEditing) return;
        return registerBackHandler(() => {
            if (showDeleteConfirm) {
                setShowDeleteConfirm(false);
                return true;
            }
            if (showActionsMenu) {
                setShowActionsMenu(false);
                return true;
            }
            if (isEditing) {
                handleCancelEdit();
                return true;
            }
            return false;
        });
    }, [showDeleteConfirm, showActionsMenu, isEditing]);

    return (
        <article className="menu-world-card group relative rounded-2xl p-5" data-testid={`world-card-${world.id}`}>
            {showDeleteConfirm && (
                <div className="absolute inset-0 z-10 bg-[rgba(16,20,28,0.96)] backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
                    <Trash2 size={24} className="text-red-400 mb-3" />
                    <p className="text-sm text-pulsar-white/70 text-center mb-4">Permanently delete “{world.name}” from this device? This cannot be undone.</p>
                    <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="touch-target min-h-[2.75rem] px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 text-pulsar-white/70 rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleConfirmDelete} className="touch-target min-h-[2.75rem] px-4 py-2 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg transition-colors">Delete</button>
                    </div>
                </div>
            )}
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <input type="text" value={editName} maxLength={64} onChange={(e) => { setEditName(e.target.value); if (error) setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') handleCancelEdit(); }} autoFocus className={`min-w-0 w-full sm:flex-1 sm:w-auto bg-black/40 border rounded px-2 py-1 text-sm text-pulsar-white font-medium focus:outline-none focus:ring-1 ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-nova-gold/40 focus:ring-nova-gold/50'}`} />
                                <button onClick={handleSaveRename} aria-label="Save name" className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center text-emerald-400 hover:bg-emerald-500/20 rounded"><Check size={16} /></button>
                                <button onClick={handleCancelEdit} aria-label="Cancel rename" className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center text-slate-400 hover:bg-white/10 rounded"><X size={16} /></button>
                            </div>
                            {error && <p className="text-[10px] text-red-500 ml-1">{error}</p>}
                        </div>
                    ) : (
                        <h3 className="text-white font-medium truncate">{world.name}</h3>
                    )}
                    {presetNameFor(world.presetId) && (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-nova-gold/20 bg-nova-gold/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-nova-gold/75">
                            <Orbit size={11} /> {presetNameFor(world.presetId)}
                        </span>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-pulsar-white/40 min-w-0">
                        <span className="inline-flex min-w-0 items-center gap-1"><Calendar size={12} className="shrink-0" /><span className="truncate">{formatDate(world.createdAt)}</span></span>
                        <span className="inline-flex min-w-0 items-center gap-1"><Clock size={12} className="shrink-0" /><span className="truncate">{formatRelativeTime(world.lastOpenedAt)}</span></span>
                    </div>
                </div>
                <div className="flex shrink-0 justify-end md:w-auto">
                    <span
                        className="menu-world-drag-handle touch-target"
                        draggable={!isEditing}
                        onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', world.id);
                            onDragStart(world.id);
                        }}
                        onDragEnd={onDragEnd}
                        onPointerDown={(event) => {
                            if (event.pointerType !== 'mouse' && !isEditing) {
                                event.currentTarget.setPointerCapture(event.pointerId);
                                onTouchDragStart(world.id);
                            }
                        }}
                        onPointerUp={(event) => {
                            if (event.pointerType !== 'mouse') onTouchDragEnd(event.clientX, event.clientY);
                        }}
                        onPointerCancel={(event) => {
                            if (event.pointerType !== 'mouse') onDragEnd();
                        }}
                        title="Drag to a collection or Independent systems"
                        aria-label={`Drag ${world.name} to a collection or Independent systems`}
                    >
                        <GripVertical size={17} />
                    </span>
                    <div className="md:hidden">
                        <button
                            onClick={() => {
                                setShowActionsMenu(!showActionsMenu);
                            }}
                            className={`touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none transition-colors ${showActionsMenu ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/50 hover:text-pulsar-white hover:bg-white/10'}`}
                            title="World actions"
                            aria-label="World actions"
                        >
                            <MoreVertical size={16} />
                        </button>
                        {showActionsMenu && createPortal(
                            <div className="menu-world-actions-backdrop" onClick={() => setShowActionsMenu(false)}>
                                <section className="menu-world-actions-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${world.name}`} onClick={(event) => event.stopPropagation()}>
                                    <div className="menu-world-actions-heading">
                                        <div><span>Universe actions</span><strong>{world.name}</strong></div>
                                        <button type="button" onClick={() => setShowActionsMenu(false)} className="touch-target" aria-label="Close world actions"><X size={18} /></button>
                                    </div>
                                    <div className="px-4 py-3 border-y border-white/10"><MoveDestinationSelect world={world} folders={folders} onMove={onMove} onMoved={() => setShowActionsMenu(false)} compact /></div>
                                <button
                                    onClick={() => { setIsEditing(true); setShowActionsMenu(false); }}
                                    className="touch-target w-full px-4 py-3.5 text-left text-sm text-pulsar-white/75 hover:bg-white/5 transition-colors flex items-center gap-3"
                                >
                                    <Pencil size={16} /> Rename
                                </button>
                                <button
                                    onClick={() => { setShowDeleteConfirm(true); setShowActionsMenu(false); }}
                                    className="touch-target w-full px-4 py-3.5 text-left text-sm text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-3 border-t border-white/5"
                                >
                                    <Trash2 size={16} /> Delete
                                </button>
                                </section>
                            </div>,
                            document.body,
                        )}
                    </div>
                    <div className="hidden md:flex items-center gap-1 opacity-100 md:opacity-60 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                        <MoveDestinationSelect world={world} folders={folders} onMove={onMove} compact />
                        <button onClick={() => setIsEditing(true)} aria-label={`Rename ${world.name}`} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={16} /></button>
                        <button onClick={() => setShowDeleteConfirm(true)} aria-label={`Delete ${world.name}`} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={16} /></button>
                    </div>
                </div>
            </div>
            <button onClick={() => onOpen(world.id)} className="menu-secondary-button touch-target w-full mt-5 py-2.5 text-sm flex items-center justify-center gap-2 active:scale-[0.98]"><Play size={15} fill="currentColor" />Enter universe</button>
        </article>
    );
};

const FolderSection: React.FC<{
    folder: FolderMeta;
    worlds: WorldMeta[];
    folders: FolderMeta[];
    onOpen: (id: string) => void;
    onRenameWorld: (id: string, name: string) => void;
    onDeleteWorld: (id: string) => void;
    onRenameFolder: (id: string, name: string) => void;
    onDeleteFolder: (id: string) => void | Promise<void>;
    onMoveWorld: (worldId: string, folderId?: string) => void;
    draggedWorldId: string | null;
    onWorldDragStart: (worldId: string) => void;
    onWorldDragEnd: () => void;
    onTouchDragStart: (worldId: string) => void;
    onTouchDragEnd: (clientX: number, clientY: number) => void;
    onDropWorld: (event: React.DragEvent<HTMLElement>, folderId?: string) => void;
}> = ({ folder, worlds, folders, onOpen, onRenameWorld, onDeleteWorld, onRenameFolder, onDeleteFolder, onMoveWorld, draggedWorldId, onWorldDragStart, onWorldDragEnd, onTouchDragStart, onTouchDragEnd, onDropWorld }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(folder.name);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleSaveRename = () => {
        try {
            if (editName.trim() && editName.trim() !== folder.name) {
                onRenameFolder(folder.id, editName.trim());
            }
            setIsEditing(false);
            setError(null);
        } catch (e: any) {
            setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.');
        }
    };

    useEffect(() => {
        if (!showDeleteConfirm) return;
        return registerBackHandler(() => {
            setShowDeleteConfirm(false);
            return true;
        });
    }, [showDeleteConfirm]);

    return (
        <div
            className={`menu-folder-drop-target mb-6 relative ${draggedWorldId ? 'is-drop-active' : ''}`}
            data-folder-drop-id={folder.id}
            data-testid={`folder-section-${folder.id}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropWorld(event, folder.id)}
        >
            {showDeleteConfirm && (
                <div className="absolute inset-0 z-30 min-h-32 bg-[rgba(16,20,28,0.98)] backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4 border border-red-500/20">
                    <Trash2 size={24} className="text-red-400 mb-3" />
                    <p className="text-sm text-pulsar-white/70 text-center mb-4">
                        Delete the “{folder.name}” collection? The collection cannot be restored, but its {worlds.length} {worlds.length === 1 ? 'universe' : 'universes'} will be kept under Independent systems.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="touch-target min-h-[2.75rem] px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 text-pulsar-white/70 rounded-lg">Cancel</button>
                        <button onClick={async () => { await onDeleteFolder(folder.id); setShowDeleteConfirm(false); }} className="touch-target min-h-[2.75rem] px-4 py-2 text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 rounded-lg">Delete collection</button>
                    </div>
                </div>
            )}
            <div className="flex items-center gap-2 mb-3 px-1">
                <button onClick={() => setIsExpanded(!isExpanded)} className="touch-target flex h-11 w-11 shrink-0 items-center justify-center hover:bg-white/10 rounded-md text-pulsar-white/50 hover:text-white transition-colors" aria-expanded={isExpanded} aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <Folder size={20} className="text-nova-gold shrink-0" />
                {isEditing ? (
                    <div className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-xl border border-nova-gold/35 bg-[rgba(16,20,28,0.85)] p-1 shadow-lg ring-1 ring-white/10">
                        <input
                            type="text"
                            value={editName}
                            maxLength={64}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setIsEditing(false); }}
                            className="min-w-[6.5rem] w-36 sm:w-44 max-w-[12rem] bg-transparent px-2.5 py-1.5 text-base font-medium text-pulsar-white placeholder-pulsar-white/30 focus:outline-none"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleSaveRename}
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-400/50 bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/45 hover:text-white transition-colors"
                            aria-label="Save folder name"
                        >
                            <Check size={18} strokeWidth={2.5} className="block" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 text-pulsar-white hover:bg-white/25 transition-colors"
                            aria-label="Cancel rename"
                        >
                            <X size={18} strokeWidth={2.5} className="block" />
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-1 min-w-0 items-center gap-2">
                        <h3 className="text-base md:text-lg font-semibold text-pulsar-white truncate leading-none">{folder.name}</h3>
                        <div className="inline-flex items-center shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="inline-flex size-11 items-center justify-center text-pulsar-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                aria-label={`Rename ${folder.name}`}
                            >
                                <Pencil size={18} strokeWidth={2} className="block" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="inline-flex size-11 items-center justify-center text-pulsar-white/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                aria-label={`Delete ${folder.name}`}
                            >
                                <Trash2 size={18} strokeWidth={2} className="block" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {error && <p className="text-[10px] text-red-500 mb-2 px-8">{error}</p>}
            {isExpanded && (
                <div className="grid gap-4 md:grid-cols-2 px-4 border-l border-white/5 ml-4">
                    {worlds.length === 0 ? (
                        <div className="md:col-span-2 py-4 text-center text-xs text-slate-600 italic">Empty folder</div>
                    ) : (
                        worlds.map(world => (
                            <WorldCard key={world.id} world={world} folders={folders} onOpen={onOpen} onRename={onRenameWorld} onDelete={onDeleteWorld} onMove={onMoveWorld} onDragStart={onWorldDragStart} onDragEnd={onWorldDragEnd} onTouchDragStart={onTouchDragStart} onTouchDragEnd={onTouchDragEnd} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

type PresetCardProps = {
    id: string;
    selected: boolean;
    name: string;
    subtitle: string;
    description: string;
    meta: string;
    types: string[];
    procedural?: boolean;
    onSelect: () => void;
};

const PresetCard: React.FC<PresetCardProps> = ({ id, selected, name, subtitle, description, meta, types, procedural, onSelect }) => (
    <button
        type="button"
        role="radio"
        aria-checked={selected}
        data-testid={`menu-preset-${id}`}
        onClick={onSelect}
        className={`menu-preset-card touch-target ${selected ? 'is-selected' : ''}`}
    >
        <span className="flex items-start justify-between gap-3">
            <span className={`menu-preset-orb ${procedural ? 'is-procedural' : ''}`} aria-hidden>
                {procedural ? <Dices size={19} /> : <Orbit size={19} />}
            </span>
            <span className="menu-radio-indicator">{selected && <Check size={12} strokeWidth={3} />}</span>
        </span>
        <span className="mt-5 block text-base font-semibold text-pulsar-white">{name}</span>
        <span className="mt-1 block text-xs leading-relaxed text-pulsar-white/50">{subtitle}</span>
        <span className="mt-4 block text-xs leading-relaxed text-pulsar-white/65">{description}</span>
        <span className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-nova-gold/70">{meta}</span>
        <span className="mt-3 flex flex-wrap gap-1.5">
            {types.slice(0, 4).map((type) => <span key={type} className="menu-type-chip">{type}</span>)}
        </span>
    </button>
);

// A generated system is the clearest neutral starting point, so it is both
// first in the chooser and selected when the creator opens.
const defaultPresetId: string | null = null;
// Decorative ribbon of everything the sim can build. Derived from the toolbar's
// own order rather than re-typed, so adding a body type cannot leave this list
// silently stale.
const ALL_BODY_TYPES: readonly string[] = CREATION_ORDER;

export const MainMenu: React.FC<{ onOpenWorld: (id: string) => void; onCreateWorld: (id: string, presetId?: string) => void; }> = ({ onOpenWorld, onCreateWorld }) => {
    const [worlds, setWorlds] = useState<WorldMeta[]>([]);
    const [folders, setFolders] = useState<FolderMeta[]>([]);
    const [showCredits, setShowCredits] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [showTutorial, setShowTutorial] = useState(() => !getOnboardingProgress().tutorialSeen);
    const [isCreating, setIsCreating] = useState<'world' | 'folder' | null>(null);
    const [preset, setPreset] = useState<string | null>(defaultPresetId);
    const [newWorldName, setNewWorldName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [draggedWorldId, setDraggedWorldId] = useState<string | null>(null);
    const [moveNotice, setMoveNotice] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const libraryRef = useRef<HTMLElement | null>(null);
    const draggedWorldRef = useRef<string | null>(null);

    useEffect(() => {
        const refresh = () => { setWorlds(getWorldList()); setFolders(getFolderList()); };
        const changed = (event: StorageEvent) => {
            if (event.key === null || event.key.startsWith('aether:worlds:')) refresh();
        };
        refresh();
        window.addEventListener('storage', changed);
        return () => window.removeEventListener('storage', changed);
    }, []);

    const selectedSystem = useMemo(() => REAL_SYSTEMS.find((system) => system.id === preset), [preset]);
    const recentWorld = worlds[0];
    const uncategorized = useMemo(() => {
        const ids = new Set(folders.map(folder => folder.id));
        return worlds.filter(world => !world.folderId || !ids.has(world.folderId));
    }, [worlds, folders]);

    const openCreator = () => {
        setPreset(defaultPresetId);
        setNewWorldName('');
        setError(null);
        setIsCreating('world');
    };
    const closeCreator = () => {
        setIsCreating(null);
        setNewWorldName('');
        setError(null);
    };
    const scrollToHero = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

    const handleCreateWorld = async () => {
        try {
            const name = newWorldName.trim() || `${selectedSystem?.name ?? 'Uncharted'} Universe`;
            const id = await mutateArchive(() => createWorld(name, undefined, preset ?? undefined));
            closeCreator();
            onCreateWorld(id, preset ?? undefined);
        } catch (e: any) {
            setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.');
        }
    };

    const handleCreateFolder = async () => {
        try {
            const name = newWorldName.trim() || `Folder ${folders.length + 1}`;
            await mutateArchive(() => createFolder(name));
            closeCreator();
            setFolders(getFolderList());
            // The collection composer lives in the hero. Return the user to the
            // archive they were managing instead of leaving them at the top menu.
            requestAnimationFrame(() => libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        } catch (e: any) {
            setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.');
        }
    };

    const handleRename = async (id: string, name: string) => {
        try { await mutateArchive(() => renameWorld(id, name)); setWorlds(getWorldList()); setError(null); }
        catch (e: any) { setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.'); }
    };
    const handleRenameFolder = async (id: string, name: string) => {
        try { await mutateArchive(() => renameFolder(id, name)); setFolders(getFolderList()); setError(null); }
        catch (e: any) { setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.'); }
    };
    const handleMoveWorld = async (worldId: string, folderId?: string) => {
        try {
            const world = worlds.find((item) => item.id === worldId);
            await mutateArchive(() => moveWorldToFolder(worldId, folderId));
            setWorlds(getWorldList());
            setError(null);
            const destination = folderId ? folders.find((folder) => folder.id === folderId)?.name ?? 'collection' : 'Independent systems';
            setMoveNotice(`${world?.name ?? 'Universe'} moved to ${destination}.`);
        }
        catch (e: any) { setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.'); }
    };
    const handleWorldDragStart = (worldId: string) => {
        draggedWorldRef.current = worldId;
        setDraggedWorldId(worldId);
    };
    const handleWorldDragEnd = () => {
        draggedWorldRef.current = null;
        setDraggedWorldId(null);
    };
    const handleDropWorld = (event: React.DragEvent<HTMLElement>, folderId?: string) => {
        event.preventDefault();
        const worldId = event.dataTransfer.getData('text/plain') || draggedWorldRef.current;
        if (worldId) handleMoveWorld(worldId, folderId);
        handleWorldDragEnd();
    };
    const handleTouchDragEnd = (clientX: number, clientY: number) => {
        const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-folder-drop-id]');
        if (draggedWorldRef.current && target) handleMoveWorld(draggedWorldRef.current, target.dataset.folderDropId || undefined);
        handleWorldDragEnd();
    };
    const handleDelete = async (id: string) => {
        try { await mutateClosedWorld(id, () => deleteWorld(id)); setWorlds(getWorldList()); setError(null); }
        catch (e: any) { setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.'); }
    };
    const handleDeleteFolder = async (id: string) => {
        try { await mutateArchive(() => deleteFolder(id)); setFolders(getFolderList()); setWorlds(getWorldList()); setError(null); }
        catch (e: any) { setError(e instanceof StorageOperationError ? storageIssueMessage(e) : 'The archive operation could not be completed. Check the name and try again.'); }
    };
    const closeTutorial = () => {
        markTutorialSeen();
        setShowTutorial(false);
    };

    useEffect(() => registerBackHandler(() => {
        if (showTutorial) { closeTutorial(); return true; }
        if (showPrivacy) { setShowPrivacy(false); return true; }
        if (showCredits) { setShowCredits(false); return true; }
        if (isCreating) { closeCreator(); return true; }
        return false;
    }), [showTutorial, showPrivacy, showCredits, isCreating]);

    return (
        <div ref={scrollRef} className="main-menu-scroll panel-scroll h-dvh bg-void-navy text-pulsar-white overflow-y-auto overflow-x-hidden relative" data-testid="main-menu">
            <MenuVisualBoundary>
                <Suspense fallback={<div className="menu-space-background fixed inset-0 z-0"><div className="menu-space-fallback" /><div className="menu-space-grade" /></div>}>
                    <MenuSpaceBackground mode={isCreating === 'world' ? 'creator' : 'landing'} presetId={preset} />
                </Suspense>
            </MenuVisualBoundary>

            <main className="relative z-10">
                <section className={`menu-hero safe-pad ${isCreating ? 'is-composing' : ''}`}>
                    <div className="menu-hero-grid">
                        <div className="menu-brand-block">
                            <div className="menu-eyebrow"><Star size={12} fill="currentColor" /> Orbital sandbox · Local first</div>
                            <div className="menu-mark" aria-hidden><span /><Orbit size={28} /></div>
                            <h1 className="menu-title"><span>AETHER</span><span>GRAVITY</span></h1>
                            <p className="menu-kicker">Shape the impossible.</p>
                            <p className="menu-intro">Build living star systems, bend spacetime, and watch worlds find their orbit in a simulation that stays entirely yours.</p>

                            {!isCreating && (
                                <div className="menu-hero-actions">
                                    <button onClick={openCreator} data-testid="menu-new-universe" className="menu-primary-button touch-target">
                                        <Rocket size={19} /> Create universe <ArrowRight size={17} />
                                    </button>
                                    {recentWorld ? (
                                        <button onClick={() => onOpenWorld(recentWorld.id)} data-testid="menu-open-recent" className="menu-ghost-button touch-target">
                                            <Play size={16} fill="currentColor" /> Resume {recentWorld.name}
                                        </button>
                                    ) : (
                                        <button onClick={() => libraryRef.current?.scrollIntoView({ behavior: 'smooth' })} className="menu-ghost-button touch-target">
                                            <ArrowDown size={17} /> Explore the archive
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {isCreating && (
                            <section className="menu-composer" aria-label={isCreating === 'folder' ? 'Create folder' : 'Create universe'} data-testid="menu-composer">
                                {isCreating === 'world' ? (
                                    <>
                                        <div className="menu-composer-heading">
                                            <div><span className="menu-step-number">01</span><h2>Choose your origin</h2></div>
                                            <button onClick={closeCreator} className="menu-icon-button touch-target" aria-label="Close universe creator"><X size={18} /></button>
                                        </div>
                                        <p className="menu-step-copy">Start with a fresh randomized system, or choose a measured celestial system.</p>
                                        <div className="menu-preset-grid" role="radiogroup" aria-label="Starting system">
                                            <PresetCard
                                                id="procedural"
                                                selected={preset === null}
                                                onSelect={() => setPreset(null)}
                                                name="Random system"
                                                subtitle="A fresh system on every launch"
                                                description="Generate a new star and planetary family, then evolve it without a predetermined story."
                                                meta="Randomized · Sandbox"
                                                types={['Star', 'Planet', 'Gas Giant', 'Moon']}
                                                procedural
                                            />
                                            {REAL_SYSTEMS.map((system) => {
                                                const types = Array.from(new Set(system.bodies.map((body) => body.type)));
                                                return (
                                                    <PresetCard
                                                        key={system.id}
                                                        id={system.id}
                                                        selected={preset === system.id}
                                                        onSelect={() => setPreset(system.id)}
                                                        name={system.name}
                                                        subtitle={system.subtitle}
                                                        description={system.description}
                                                        meta={`${system.bodies.length} bodies · Science preset`}
                                                        types={types}
                                                    />
                                                );
                                            })}
                                        </div>

                                        <div className="menu-launch-row">
                                            <div className="menu-launch-copy"><span className="menu-step-number">02</span><div><h2>Name and launch</h2><p>Every object class remains available in the creation dock.</p></div></div>
                                            <div className="menu-object-ribbon" aria-label="Available celestial object types">
                                                {ALL_BODY_TYPES.map((type) => <span key={type}>{type}</span>)}
                                            </div>
                                            <div className="menu-name-row">
                                                <label className="sr-only" htmlFor="new-universe-name">Universe name</label>
                                                <input
                                                    id="new-universe-name"
                                                    data-testid="menu-universe-name"
                                                    type="text"
                                                    value={newWorldName}
                                                    maxLength={64}
                                                    onChange={(event) => { setNewWorldName(event.target.value); if (error) setError(null); }}
                                                    onKeyDown={(event) => { if (event.key === 'Enter') handleCreateWorld(); if (event.key === 'Escape') closeCreator(); }}
                                                    placeholder={`${selectedSystem?.name ?? 'Random System'} Universe`}
                                                    autoFocus
                                                    className={error ? 'has-error' : ''}
                                                />
                                                <button onClick={handleCreateWorld} data-testid="menu-launch-universe" className="menu-primary-button touch-target"><Rocket size={18} /> Launch universe</button>
                                            </div>
                                            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
                                            {selectedSystem && <p className="menu-source-note">Reference data: {selectedSystem.source}</p>}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="menu-composer-heading">
                                            <div><span className="menu-step-number">NEW</span><h2>Create a collection</h2></div>
                                            <button onClick={closeCreator} className="menu-icon-button touch-target" aria-label="Close folder creator"><X size={18} /></button>
                                        </div>
                                        <p className="menu-step-copy">Group related simulations without changing their local save data.</p>
                                        <div className="menu-name-row mt-6">
                                            <label className="sr-only" htmlFor="new-folder-name">Folder name</label>
                                            <input id="new-folder-name" type="text" value={newWorldName} maxLength={64} onChange={(event) => setNewWorldName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleCreateFolder(); if (event.key === 'Escape') closeCreator(); }} placeholder={`Collection ${folders.length + 1}`} autoFocus />
                                            <button onClick={handleCreateFolder} className="menu-primary-button touch-target"><Folder size={18} /> Create collection</button>
                                        </div>
                                        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
                                    </>
                                )}
                            </section>
                        )}

                        {!isCreating && (
                            <div className="menu-telemetry" aria-hidden>
                                <span><i /> N-body dynamics online</span><span>14 celestial classes</span><span>{REAL_SYSTEMS.length} measured systems</span>
                            </div>
                        )}
                    </div>
                    {!isCreating && <button onClick={() => libraryRef.current?.scrollIntoView({ behavior: 'smooth' })} className="menu-scroll-cue touch-target" data-testid="menu-universes-cue" aria-label="Scroll to your universes"><span>My universes</span><ArrowDown size={17} /></button>}
                </section>

                <section ref={libraryRef} className="menu-library safe-pad" data-testid="menu-library">
                    <div className="menu-library-inner">
                        <header className="menu-library-header">
                            <div><span className="menu-section-label">Local archive</span><h2>Your universes</h2><p>Saved on this device. Ready when you are.</p></div>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => { setNewWorldName(''); setError(null); setIsCreating('folder'); scrollToHero(); }} className="menu-ghost-button touch-target"><Folder size={16} /> New collection</button>
                                <button onClick={() => { openCreator(); scrollToHero(); }} className="menu-secondary-button touch-target px-4"><Plus size={17} /> New universe</button>
                            </div>
                        </header>

                        {worlds.length === 0 && folders.length === 0 ? (
                            <div className="menu-empty-state"><div className="menu-empty-orbit"><Globe2 size={34} /></div><h3>Your first universe is waiting</h3><p>Launch a measured system or generate something no one has seen before.</p><button onClick={() => { openCreator(); scrollToHero(); }} className="menu-primary-button touch-target"><Sparkles size={17} /> Begin creating</button></div>
                        ) : (
                            <div className="space-y-10">
                                {folders.map((folder) => <FolderSection key={folder.id} folder={folder} worlds={worlds.filter((world) => world.folderId === folder.id)} folders={folders} onOpen={onOpenWorld} onRenameWorld={handleRename} onDeleteWorld={handleDelete} onRenameFolder={handleRenameFolder} onDeleteFolder={handleDeleteFolder} onMoveWorld={handleMoveWorld} draggedWorldId={draggedWorldId} onWorldDragStart={handleWorldDragStart} onWorldDragEnd={handleWorldDragEnd} onTouchDragStart={handleWorldDragStart} onTouchDragEnd={handleTouchDragEnd} onDropWorld={handleDropWorld} />)}
                                {worlds.length > 0 && (
                                    <div
                                        className={`menu-folder-drop-target ${draggedWorldId ? 'is-drop-active' : ''}`}
                                        data-folder-drop-id=""
                                        data-testid="independent-systems-drop-target"
                                        onDragOver={(event) => event.preventDefault()}
                                        onDrop={(event) => handleDropWorld(event, undefined)}
                                    >
                                        <div className="menu-collection-label"><span /> Independent systems <small>{uncategorized.length}</small>{draggedWorldId && <em>Drop here to remove from a collection</em>}</div>
                                        <div className="grid gap-4 md:grid-cols-2">{uncategorized.length > 0 ? uncategorized.map((world) => <WorldCard key={world.id} world={world} folders={folders} onOpen={onOpenWorld} onRename={handleRename} onDelete={handleDelete} onMove={handleMoveWorld} onDragStart={handleWorldDragStart} onDragEnd={handleWorldDragEnd} onTouchDragStart={handleWorldDragStart} onTouchDragEnd={handleTouchDragEnd} />) : <div className="md:col-span-2 menu-independent-drop-copy">Drop a universe here to remove it from its collection.</div>}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="sr-only" aria-live="polite">{moveNotice}</p>

                        <footer className="menu-footer">
                            <span className="menu-footer-wordmark"><Orbit size={17} /> AETHER GRAVITY</span>
                            <nav aria-label="Application information">
                                <button onClick={() => setShowTutorial(true)} className="touch-target"><Sparkles size={15} /> Tutorial</button>
                                <button onClick={() => setShowPrivacy(true)} className="touch-target"><Shield size={15} /> Privacy</button>
                                <button onClick={() => setShowCredits(true)} className="touch-target"><Info size={15} /> Credits &amp; Support</button>
                            </nav>
                        </footer>
                    </div>
                </section>
            </main>

            {showPrivacy && <Suspense fallback={null}><PrivacyPolicyPanel onClose={() => setShowPrivacy(false)} /></Suspense>}
            {showCredits && <Suspense fallback={null}><PortfolioPanel onClose={() => setShowCredits(false)} /></Suspense>}
            <Suspense fallback={null}><TutorialOverlay isOpen={showTutorial} onClose={closeTutorial} /></Suspense>
        </div>
    );
};

export default MainMenu;
