import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { Plus, Info, Sparkles, Globe2, Play, Pencil, Trash2, Check, X, Calendar, Clock, Folder, ChevronRight, ChevronDown, FolderInput, MoreVertical, Shield } from 'lucide-react';
import { WorldMeta, FolderMeta } from '../types';
import { getWorldList, createWorld, deleteWorld, renameWorld, getFolderList, createFolder, deleteFolder, renameFolder, moveWorldToFolder } from '../utils/worldStorage';
import { registerBackHandler } from '../utils/backNavigation';
import { REAL_SYSTEMS } from '../content/realSystems';

const MenuSpaceBackground = lazy(() => import('./MenuSpaceBackground'));
const PortfolioPanel = lazy(() => import('./PortfolioPanel'));
const TutorialOverlay = lazy(() => import('./TutorialOverlay'));
const PrivacyPolicyPanel = lazy(() => import('./PrivacyPolicyPanel'));

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

// CreditsPanel replaced by PortfolioPanel

const WorldCard: React.FC<{
    world: WorldMeta;
    folders: FolderMeta[];
    onOpen: (id: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onMove: (worldId: string, folderId?: string) => void;
}> = ({ world, folders, onOpen, onRename, onDelete, onMove }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(world.name);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement | null>(null);

    const [error, setError] = useState<string | null>(null);

    const handleSaveRename = () => {
        try {
            if (editName.trim() && editName.trim() !== world.name) {
                onRename(world.id, editName.trim());
            }
            setIsEditing(false);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    };
    const handleCancelEdit = () => { setEditName(world.name); setIsEditing(false); setError(null); };
    const handleConfirmDelete = () => { onDelete(world.id); setShowDeleteConfirm(false); };

    useEffect(() => {
        if (!showActionsMenu) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
                setShowActionsMenu(false);
                setShowMoveMenu(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [showActionsMenu]);

    useEffect(() => {
        if (!showDeleteConfirm && !showActionsMenu && !showMoveMenu && !isEditing) return;
        return registerBackHandler(() => {
            if (showDeleteConfirm) {
                setShowDeleteConfirm(false);
                return true;
            }
            if (showMoveMenu) {
                setShowMoveMenu(false);
                setShowActionsMenu(false);
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
    }, [showDeleteConfirm, showActionsMenu, showMoveMenu, isEditing]);

    return (
        <div className="group relative bg-[rgba(45,51,64,0.5)] border border-white/10 rounded-xl p-4 hover:border-nova-gold/25 transition-all duration-300 hover:shadow-lg hover:shadow-nova-gold/5">
            {showDeleteConfirm && (
                <div className="absolute inset-0 z-10 bg-[rgba(16,20,28,0.96)] backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
                    <Trash2 size={24} className="text-red-400 mb-3" />
                    <p className="text-sm text-pulsar-white/70 text-center mb-4">Delete "{world.name}"?</p>
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
                                <button onClick={handleSaveRename} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center text-emerald-400 hover:bg-emerald-500/20 rounded"><Check size={16} /></button>
                                <button onClick={handleCancelEdit} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center text-slate-400 hover:bg-white/10 rounded"><X size={16} /></button>
                            </div>
                            {error && <p className="text-[10px] text-red-500 ml-1">{error}</p>}
                        </div>
                    ) : (
                        <h3 className="text-white font-medium truncate">{world.name}</h3>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-pulsar-white/35 min-w-0">
                        <span className="inline-flex min-w-0 items-center gap-1"><Calendar size={12} className="shrink-0" /><span className="truncate">{formatDate(world.createdAt)}</span></span>
                        <span className="inline-flex min-w-0 items-center gap-1"><Clock size={12} className="shrink-0" /><span className="truncate">{formatRelativeTime(world.lastOpenedAt)}</span></span>
                    </div>
                </div>
                <div className="flex shrink-0 justify-end md:w-auto">
                    <div ref={actionsMenuRef} className="relative md:hidden">
                        <button
                            onClick={() => {
                                setShowActionsMenu(!showActionsMenu);
                                if (showActionsMenu) setShowMoveMenu(false);
                            }}
                            className={`touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none transition-colors ${showActionsMenu ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/50 hover:text-pulsar-white hover:bg-white/10'}`}
                            title="World actions"
                            aria-label="World actions"
                        >
                            <MoreVertical size={16} />
                        </button>
                        {showActionsMenu && (
                            <div className="absolute right-0 top-full mt-2 z-20 w-52 max-w-[calc(100vw-3rem)] bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                <button
                                    onClick={() => setShowMoveMenu(!showMoveMenu)}
                                    className="touch-target w-full px-3 py-2.5 text-left text-xs text-pulsar-white/75 hover:bg-white/5 transition-colors flex items-center gap-2"
                                >
                                    <FolderInput size={14} /> Move to folder
                                </button>
                                <button
                                    onClick={() => { setIsEditing(true); setShowActionsMenu(false); setShowMoveMenu(false); }}
                                    className="touch-target w-full px-3 py-2.5 text-left text-xs text-pulsar-white/75 hover:bg-white/5 transition-colors flex items-center gap-2 border-t border-white/5"
                                >
                                    <Pencil size={14} /> Rename
                                </button>
                                <button
                                    onClick={() => { setShowDeleteConfirm(true); setShowActionsMenu(false); setShowMoveMenu(false); }}
                                    className="touch-target w-full px-3 py-2.5 text-left text-xs text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2 border-t border-white/5"
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                                {showMoveMenu && (
                                    <div className="border-t border-white/10 bg-white/5">
                                        <div className="text-[10px] uppercase tracking-wider text-pulsar-white/30 px-3 py-2 border-b border-white/5">Move to...</div>
                                        <div className="max-h-48 overflow-auto">
                                            <button onClick={() => { onMove(world.id, undefined); setShowMoveMenu(false); setShowActionsMenu(false); }} className={`touch-target w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${!world.folderId ? 'text-nova-gold' : 'text-pulsar-white/60'}`}>
                                                <Globe2 size={12} /> Uncategorized
                                            </button>
                                            {folders.map(f => (
                                                <button key={f.id} onClick={() => { onMove(world.id, f.id); setShowMoveMenu(false); setShowActionsMenu(false); }} className={`touch-target w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-t border-white/5 ${world.folderId === f.id ? 'text-nova-gold' : 'text-pulsar-white/60'}`}>
                                                    <Folder size={12} /> {f.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="hidden md:flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <div className="relative">
                            <button onClick={() => setShowMoveMenu(!showMoveMenu)} className={`touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none transition-colors ${showMoveMenu ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10'}`} title="Move to folder">
                                <FolderInput size={16} />
                            </button>
                            {showMoveMenu && (
                                <div className="absolute right-0 top-full mt-2 z-20 w-44 max-w-[calc(100vw-3rem)] bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="text-[10px] uppercase tracking-wider text-pulsar-white/30 px-3 py-2 border-b border-white/5 bg-white/5">Move to...</div>
                                    <div className="max-h-48 overflow-auto">
                                        <button onClick={() => { onMove(world.id, undefined); setShowMoveMenu(false); }} className={`touch-target w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${!world.folderId ? 'text-nova-gold' : 'text-pulsar-white/60'}`}>
                                            <Globe2 size={12} /> Uncategorized
                                        </button>
                                        {folders.map(f => (
                                            <button key={f.id} onClick={() => { onMove(world.id, f.id); setShowMoveMenu(false); }} className={`touch-target w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-t border-white/5 ${world.folderId === f.id ? 'text-nova-gold' : 'text-pulsar-white/60'}`}>
                                                <Folder size={12} /> {f.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setIsEditing(true)} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={16} /></button>
                        <button onClick={() => setShowDeleteConfirm(true)} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-0 leading-none text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={16} /></button>
                    </div>
                </div>
            </div>
            <button onClick={() => onOpen(world.id)} className="touch-target w-full mt-4 py-2.5 bg-nova-gold/8 hover:bg-nova-gold/15 border border-nova-gold/25 text-nova-gold rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"><Play size={16} fill="currentColor" />Open World</button>
        </div>
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
    onDeleteFolder: (id: string) => void;
    onMoveWorld: (worldId: string, folderId?: string) => void;
}> = ({ folder, worlds, folders, onOpen, onRenameWorld, onDeleteWorld, onRenameFolder, onDeleteFolder, onMoveWorld }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(folder.name);
    const [error, setError] = useState<string | null>(null);

    const handleSaveRename = () => {
        try {
            if (editName.trim() && editName.trim() !== folder.name) {
                onRenameFolder(folder.id, editName.trim());
            }
            setIsEditing(false);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <div className="mb-6">
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
                                onClick={() => onDeleteFolder(folder.id)}
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
                            <WorldCard key={world.id} world={world} folders={folders} onOpen={onOpen} onRename={onRenameWorld} onDelete={onDeleteWorld} onMove={onMoveWorld} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

/** One selectable starting system in the new-universe dialog. */
const PresetOption: React.FC<{
    selected: boolean;
    onSelect: () => void;
    name: string;
    subtitle: string;
}> = ({ selected, onSelect, name, subtitle }) => (
    <button
        type="button"
        onClick={onSelect}
        className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
            selected
                ? 'bg-nova-gold/15 border-nova-gold/50'
                : 'bg-black/30 border-white/10 hover:border-white/25'
        }`}
    >
        <div className="text-sm font-medium text-pulsar-white">{name}</div>
        <div className="text-[11px] text-pulsar-white/45 mt-0.5">{subtitle}</div>
    </button>
);

export const MainMenu: React.FC<{ onOpenWorld: (id: string) => void; onCreateWorld: (id: string, presetId?: string) => void; }> = ({ onOpenWorld, onCreateWorld }) => {
    const [worlds, setWorlds] = useState<WorldMeta[]>([]);
    const [folders, setFolders] = useState<FolderMeta[]>([]);
    const [showCredits, setShowCredits] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [isCreating, setIsCreating] = useState<'world' | 'folder' | null>(null);
    /** Chosen starting system; null means the procedural generator. */
    const [preset, setPreset] = useState<string | null>(null);
    const [newWorldName, setNewWorldName] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setWorlds(getWorldList());
        setFolders(getFolderList());
    }, []);

    const handleCreateWorld = () => {
        try {
            const name = newWorldName.trim() || `Universe ${worlds.length + 1}`;
            const id = createWorld(name);
            setNewWorldName('');
            setIsCreating(null);
            setError(null);
            onCreateWorld(id, preset ?? undefined);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleCreateFolder = () => {
        try {
            const name = newWorldName.trim() || `Folder ${folders.length + 1}`;
            createFolder(name);
            setNewWorldName('');
            setIsCreating(null);
            setError(null);
            setFolders(getFolderList());
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRename = (id: string, name: string) => {
        try {
            renameWorld(id, name);
            setWorlds(getWorldList());
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRenameFolder = (id: string, name: string) => {
        renameFolder(id, name);
        setFolders(getFolderList());
    };

    const handleMoveWorld = (worldId: string, folderId?: string) => {
        moveWorldToFolder(worldId, folderId);
        setWorlds(getWorldList());
    };

    const handleDelete = (id: string) => { deleteWorld(id); setWorlds(getWorldList()); };
    const handleDeleteFolder = (id: string) => { deleteFolder(id); setFolders(getFolderList()); setWorlds(getWorldList()); };

    useEffect(() => {
        return registerBackHandler(() => {
            if (showTutorial) {
                setShowTutorial(false);
                return true;
            }
            if (showPrivacy) {
                setShowPrivacy(false);
                return true;
            }
            if (showCredits) {
                setShowCredits(false);
                return true;
            }
            if (isCreating) {
                setIsCreating(null);
                setNewWorldName('');
                setError(null);
                return true;
            }
            return false;
        });
    }, [showTutorial, showPrivacy, showCredits, isCreating]);

    return (
        <div className="main-menu-scroll panel-scroll h-dvh bg-void-navy text-pulsar-white overflow-y-auto overflow-x-hidden relative safe-pad">
            <Suspense fallback={null}>
                <MenuSpaceBackground />
            </Suspense>
            <div className="relative z-10 max-w-4xl mx-auto px-4 py-10 md:py-20 flex flex-col justify-center min-h-screen min-h-dvh">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-3 mb-4"><Globe2 size={40} className="text-nova-gold" /></div>
                    <h1
                        className="text-4xl md:text-6xl font-bold tracking-[0.2em] mb-4 select-none"
                        style={{
                            background: 'linear-gradient(to bottom, #F4F4FB 25%, rgba(244,244,251,0.42))',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}
                    >
                        AETHER
                    </h1>
                    <p className="text-pulsar-white/50 text-lg md:text-xl max-w-md mx-auto leading-relaxed">Create, simulate, and explore your own universes</p>
                </div>
                <div className="mb-12">
                    {isCreating ? (
                        <div className="bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-nova-gold/25 rounded-xl p-6 animate-in slide-in-from-top-2 duration-300">
                            <h3 className="text-lg font-bold text-pulsar-white mb-4 flex items-center gap-2">
                                {isCreating === 'folder' ? <Folder size={20} className="text-nova-gold" /> : <Sparkles size={20} className="text-nova-gold" />}
                                New {isCreating === 'folder' ? 'Folder' : 'Universe'}
                            </h3>
                            <input
                                type="text"
                                value={newWorldName}
                                maxLength={64}
                                onChange={(e) => { setNewWorldName(e.target.value); if (error) setError(null); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') isCreating === 'folder' ? handleCreateFolder() : handleCreateWorld();
                                    if (e.key === 'Escape') setIsCreating(null);
                                }}
                                placeholder={isCreating === 'folder' ? "Enter folder name..." : "Enter universe name..."}
                                autoFocus
                                className={`w-full bg-black/40 border rounded-lg px-4 py-3 text-pulsar-white placeholder-pulsar-white/25 focus:outline-none focus:ring-1 transition-colors mb-2 ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:border-nova-gold/50 focus:ring-nova-gold/50'}`}
                            />
                            {error && <p className="text-xs text-red-500 mb-4 ml-1">{error}</p>}

                            {/* Start from a real, scientifically-parameterised
                                system rather than a random one. */}
                            {isCreating === 'world' && (
                                <div className="mb-4">
                                    <label className="text-[10px] uppercase tracking-widest text-pulsar-white/40 block mb-2">
                                        Starting System
                                    </label>
                                    <div className="grid grid-cols-1 gap-2">
                                        <PresetOption
                                            selected={preset === null}
                                            onSelect={() => setPreset(null)}
                                            name="Random System"
                                            subtitle="Procedurally generated star and planets"
                                        />
                                        {REAL_SYSTEMS.map((s) => (
                                            <PresetOption
                                                key={s.id}
                                                selected={preset === s.id}
                                                onSelect={() => setPreset(s.id)}
                                                name={s.name}
                                                subtitle={s.subtitle}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-3">
                                <button onClick={() => { setIsCreating(null); setError(null); setNewWorldName(''); }} className="touch-target flex-1 py-3 bg-white/5 hover:bg-white/10 text-pulsar-white/70 rounded-lg font-medium transition-colors">Cancel</button>
                                <button onClick={isCreating === 'folder' ? handleCreateFolder : handleCreateWorld} className="touch-target flex-1 py-3 bg-nova-gold hover:bg-nova-gold/90 text-void-navy font-bold rounded-lg transition-all shadow-lg shadow-nova-gold/20">
                                    Create {isCreating === 'folder' ? 'Folder' : 'Universe'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <button onClick={() => setIsCreating('world')} data-testid="menu-new-universe" className="touch-target sm:col-span-2 py-3 md:py-5 bg-nova-gold/8 hover:bg-nova-gold/15 border border-nova-gold/30 hover:border-nova-gold/50 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all group">
                                <Plus size={24} className="text-nova-gold group-hover:rotate-90 transition-transform duration-300" /><span className="text-pulsar-white">New Universe</span>
                            </button>
                            <button onClick={() => setIsCreating('folder')} className="touch-target py-3 md:py-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all group">
                                <Folder size={22} className="text-slate-400 group-hover:scale-110 transition-transform" /><span className="text-slate-300">New Folder</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="mb-12">
                    <h2 className="text-xs uppercase tracking-widest text-pulsar-white/35 mb-6 flex items-center gap-2"><span>Your Collection</span>{worlds.length > 0 && <span className="px-2 py-0.5 bg-white/5 rounded-full text-pulsar-white/50">{worlds.length}</span>}</h2>

                    {worlds.length === 0 && folders.length === 0 ? (
                        <div className="text-center py-16 bg-white/3 border border-white/5 rounded-xl"><Globe2 size={48} className="text-pulsar-white/20 mx-auto mb-4" /><p className="text-pulsar-white/35">No universes yet</p></div>
                    ) : (
                        <div className="space-y-8">
                            {/* Group by Folder */}
                            {folders.map(folder => (
                                <FolderSection
                                    key={folder.id}
                                    folder={folder}
                                    worlds={worlds.filter(w => w.folderId === folder.id)}
                                    folders={folders}
                                    onOpen={onOpenWorld}
                                    onRenameWorld={handleRename}
                                    onDeleteWorld={handleDelete}
                                    onRenameFolder={handleRenameFolder}
                                    onDeleteFolder={handleDeleteFolder}
                                    onMoveWorld={handleMoveWorld}
                                />
                            ))}

                            {/* Uncategorized Worlds */}
                            {worlds.filter(w => !w.folderId).length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-4 px-1">
                                        <div className="w-1 h-3 bg-white/15 rounded-full"></div>
                                        <h3 className="text-sm font-bold uppercase tracking-widest text-pulsar-white/35">Uncategorized</h3>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {worlds.filter(w => !w.folderId).map((world) => (
                                            <WorldCard key={world.id} world={world} folders={folders} onOpen={onOpenWorld} onRename={handleRename} onDelete={handleDelete} onMove={handleMoveWorld} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 pt-8 border-t border-white/5">
                    <button onClick={() => setShowTutorial(true)} className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2 text-pulsar-white/35 hover:text-nova-gold hover:bg-nova-gold/5 rounded-lg transition-colors group">
                        <Sparkles size={16} className="group-hover:text-nova-gold" /><span className="text-sm">Tutorial</span>
                    </button>
                    <button onClick={() => setShowPrivacy(true)} className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2 text-pulsar-white/35 hover:text-pulsar-white hover:bg-white/5 rounded-lg transition-colors">
                        <Shield size={16} /><span className="text-sm">Privacy Policy</span>
                    </button>
                    <button onClick={() => setShowCredits(true)} className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2 text-pulsar-white/35 hover:text-pulsar-white hover:bg-white/5 rounded-lg transition-colors"><Info size={16} /><span className="text-sm">Credits & Support</span></button>
                </div>
            </div>
            {showPrivacy && (
              <Suspense fallback={null}>
                <PrivacyPolicyPanel onClose={() => setShowPrivacy(false)} />
              </Suspense>
            )}
            {showCredits && (
              <Suspense fallback={null}>
                <PortfolioPanel onClose={() => setShowCredits(false)} />
              </Suspense>
            )}
            <Suspense fallback={null}>
              <TutorialOverlay isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
            </Suspense>
        </div>
    );
};

export default MainMenu;