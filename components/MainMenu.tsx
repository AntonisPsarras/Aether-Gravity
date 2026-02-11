import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Info, Sparkles, Globe2, Play, Pencil, Trash2, Check, X, Calendar, Clock, Heart, Github, Folder, ChevronRight, ChevronDown, FolderInput } from 'lucide-react';
import { WorldMeta, FolderMeta } from '../types';
import { getWorldList, createWorld, deleteWorld, renameWorld, getFolderList, createFolder, deleteFolder, renameFolder, moveWorldToFolder } from '../utils/worldStorage';
import PortfolioPanel from './PortfolioPanel';
import TutorialOverlay from './TutorialOverlay';

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

    return (
        <div className="group relative bg-slate-900/80 border border-white/10 rounded-xl p-4 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
            {showDeleteConfirm && (
                <div className="absolute inset-0 z-10 bg-slate-900/95 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
                    <Trash2 size={24} className="text-red-400 mb-3" />
                    <p className="text-sm text-slate-300 text-center mb-4">Delete "{world.name}"?</p>
                    <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleConfirmDelete} className="px-4 py-2 text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg transition-colors">Delete</button>
                    </div>
                </div>
            )}
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <input type="text" value={editName} onChange={(e) => { setEditName(e.target.value); if (error) setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') handleCancelEdit(); }} autoFocus className={`flex-1 bg-black/40 border rounded px-2 py-1 text-sm text-white font-medium focus:outline-none focus:ring-1 ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/50 focus:ring-cyan-500'}`} />
                                <button onClick={handleSaveRename} className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"><Check size={16} /></button>
                                <button onClick={handleCancelEdit} className="p-1 text-slate-400 hover:bg-white/10 rounded"><X size={16} /></button>
                            </div>
                            {error && <p className="text-[10px] text-red-500 ml-1">{error}</p>}
                        </div>
                    ) : (
                        <h3 className="text-white font-medium truncate">{world.name}</h3>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(world.createdAt)}</span>
                        <span className="flex items-center gap-1"><Clock size={12} />{formatRelativeTime(world.lastOpenedAt)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative">
                        <button onClick={() => setShowMoveMenu(!showMoveMenu)} className={`p-2 rounded-lg transition-colors ${showMoveMenu ? 'text-cyan-400 bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title="Move to folder">
                            <FolderInput size={16} />
                        </button>
                        {showMoveMenu && (
                            <div className="absolute right-0 top-full mt-2 z-20 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 py-2 border-b border-white/5 bg-white/5">Move to...</div>
                                <div className="max-h-48 overflow-auto">
                                    <button onClick={() => { onMove(world.id, undefined); setShowMoveMenu(false); }} className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${!world.folderId ? 'text-cyan-400' : 'text-slate-300'}`}>
                                        <Globe2 size={12} /> Uncategorized
                                    </button>
                                    {folders.map(f => (
                                        <button key={f.id} onClick={() => { onMove(world.id, f.id); setShowMoveMenu(false); }} className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors flex items-center gap-2 border-t border-white/5 ${world.folderId === f.id ? 'text-cyan-400' : 'text-slate-300'}`}>
                                            <Folder size={12} /> {f.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setIsEditing(true)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><Pencil size={16} /></button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
            </div>
            <button onClick={() => onOpen(world.id)} className="w-full mt-4 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"><Play size={16} fill="currentColor" />Open World</button>
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
            <div className="flex items-center gap-2 mb-3 px-1 group">
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-white/10 rounded-md text-slate-500 hover:text-white transition-colors">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <Folder size={18} className="text-cyan-400/70" />
                {isEditing ? (
                    <div className="flex-1 flex gap-2 items-center">
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setIsEditing(false); }}
                            className="bg-black/40 border border-cyan-500/50 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                            autoFocus
                        />
                        <button onClick={handleSaveRename} className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"><Check size={14} /></button>
                        <button onClick={() => setIsEditing(false)} className="p-1 text-slate-400 hover:bg-white/10 rounded"><X size={14} /></button>
                    </div>
                ) : (
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex-1">{folder.name}</h3>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg"><Pencil size={14} /></button>
                    <button onClick={() => onDeleteFolder(folder.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg"><Trash2 size={14} /></button>
                </div>
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

export const MainMenu: React.FC<{ onOpenWorld: (id: string) => void; onCreateWorld: (id: string) => void; }> = ({ onOpenWorld, onCreateWorld }) => {
    const [worlds, setWorlds] = useState<WorldMeta[]>([]);
    const [folders, setFolders] = useState<FolderMeta[]>([]);
    const [showCredits, setShowCredits] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [isCreating, setIsCreating] = useState<'world' | 'folder' | null>(null);
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
            onCreateWorld(id);
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

    return (
        <div className="min-h-screen bg-black text-white overflow-auto relative">
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,black_70%)]" />
            </div>
            <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 md:py-20 flex flex-col justify-center min-h-screen">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-3 mb-4"><Globe2 size={40} className="text-cyan-400" /></div>
                    <h1 className="text-4xl md:text-6xl font-bold tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-4">AETHER</h1>
                    <p className="text-slate-400 text-lg md:text-xl max-w-md mx-auto leading-relaxed">Create, simulate, and explore your own universes</p>
                </div>
                <div className="mb-12">
                    {isCreating ? (
                        <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-6 animate-in slide-in-from-top-2 duration-300">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                {isCreating === 'folder' ? <Folder size={20} className="text-cyan-400" /> : <Sparkles size={20} className="text-cyan-400" />}
                                New {isCreating === 'folder' ? 'Folder' : 'Universe'}
                            </h3>
                            <input
                                type="text"
                                value={newWorldName}
                                onChange={(e) => { setNewWorldName(e.target.value); if (error) setError(null); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') isCreating === 'folder' ? handleCreateFolder() : handleCreateWorld();
                                    if (e.key === 'Escape') setIsCreating(null);
                                }}
                                placeholder={isCreating === 'folder' ? "Enter folder name..." : "Enter universe name..."}
                                autoFocus
                                className={`w-full bg-black/40 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors mb-2 ${error ? 'border-red-500/50 focus:ring-red-500/50' : 'border-white/10 focus:border-cyan-500/50 focus:ring-cyan-500/50'}`}
                            />
                            {error && <p className="text-xs text-red-500 mb-4 ml-1">{error}</p>}
                            <div className="flex gap-3">
                                <button onClick={() => { setIsCreating(null); setError(null); setNewWorldName(''); }} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancel</button>
                                <button onClick={isCreating === 'folder' ? handleCreateFolder : handleCreateWorld} className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-bold rounded-lg transition-all shadow-lg shadow-cyan-500/20">
                                    Create {isCreating === 'folder' ? 'Folder' : 'Universe'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4">
                            <button onClick={() => setIsCreating('world')} className="flex-[2] py-3 md:py-5 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all group">
                                <Plus size={24} className="text-cyan-400 group-hover:rotate-90 transition-transform duration-300" /><span className="text-white">New Universe</span>
                            </button>
                            <button onClick={() => setIsCreating('folder')} className="flex-1 py-3 md:py-5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all group">
                                <Folder size={22} className="text-slate-400 group-hover:scale-110 transition-transform" /><span className="text-slate-300">New Folder</span>
                            </button>
                        </div>
                    )}
                </div>
                <div className="mb-12">
                    <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2"><span>Your Collection</span>{worlds.length > 0 && <span className="px-2 py-0.5 bg-white/5 rounded-full text-slate-400">{worlds.length}</span>}</h2>

                    {worlds.length === 0 && folders.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/40 border border-white/5 rounded-xl"><Globe2 size={48} className="text-slate-700 mx-auto mb-4" /><p className="text-slate-500">No universes yet</p></div>
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
                                        <div className="w-1 h-3 bg-slate-700 rounded-full"></div>
                                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Uncategorized</h3>
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
                <div className="flex justify-center gap-4 pt-8 border-t border-white/5">
                    <button onClick={() => setShowTutorial(true)} className="inline-flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-cyan-400 hover:bg-white/5 rounded-lg transition-colors group">
                        <Sparkles size={16} className="group-hover:text-cyan-400" /><span className="text-sm">Tutorial</span>
                    </button>
                    <button onClick={() => setShowCredits(true)} className="inline-flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><Info size={16} /><span className="text-sm">Credits & Support</span></button>
                </div>
            </div>
            {showCredits && <PortfolioPanel onClose={() => setShowCredits(false)} />}
            <TutorialOverlay isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
        </div>
    );
};

export default MainMenu;