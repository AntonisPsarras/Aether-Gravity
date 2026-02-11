import React, { useState, useMemo } from 'react';
import { CelestialBody, BodyType } from '../types';
import { useStore } from '../utils/store';
import { checkHabitability } from '../utils/HabitabilityService';
import { findDominantParent } from '../utils/physicsUtils';
import {
    Sun, Globe, CircleDot, Aperture, Zap, Flame, Snowflake,
    ChevronDown, ChevronUp, ChevronRight, List, Droplets
} from 'lucide-react';

// Icon mapping for body types
const BodyIcon: React.FC<{ type: BodyType; className?: string }> = ({ type, className = '' }) => {
    const iconProps = { size: 14, className };
    switch (type) {
        case 'Star': return <Sun {...iconProps} />;
        case 'Red Giant': return <Flame {...iconProps} />;
        case 'Neutron Star': return <Zap {...iconProps} />;
        case 'Black Hole': return <Aperture {...iconProps} />;
        case 'Planet': return <Globe {...iconProps} />;
        case 'Ice Giant': return <Snowflake {...iconProps} />;
        case 'Dwarf': return <CircleDot {...iconProps} />;
        default: return <CircleDot {...iconProps} />;
    }
};

// Color mapping for body types
const getTypeColor = (type: BodyType): string => {
    switch (type) {
        case 'Star': return 'text-yellow-400';
        case 'Red Giant': return 'text-red-500';
        case 'Neutron Star': return 'text-cyan-300';
        case 'Black Hole': return 'text-orange-500';
        case 'Planet': return 'text-blue-400';
        case 'Ice Giant': return 'text-indigo-300';
        case 'Dwarf': return 'text-gray-400';
        default: return 'text-slate-400';
    }
};

interface HierarchyNode {
    body: CelestialBody;
    children: HierarchyNode[];
}

const buildHierarchy = (bodies: CelestialBody[]): HierarchyNode[] => {
    // Find parent relationships using the physics util
    const childMap = new Map<string | null, CelestialBody[]>();
    const allIds = new Set(bodies.map(b => b.id));

    bodies.forEach(body => {
        let parent = findDominantParent(body, bodies);
        // Fallback: If parent exists logically but is not in our current list (e.g. filtered/bug), treat as root
        if (parent && !allIds.has(parent.id)) {
            parent = null;
        }

        const parentId = parent?.id || null;
        if (!childMap.has(parentId)) {
            childMap.set(parentId, []);
        }
        childMap.get(parentId)!.push(body);
    });

    const buildNode = (body: CelestialBody): HierarchyNode => ({
        body,
        children: (childMap.get(body.id) || []).map(buildNode)
    });

    // Root nodes are those with explicitly null parent
    const roots = (childMap.get(null) || []).map(buildNode);

    // Safety check: ensure we didn't miss any orphans that were assigned to non-existent parents (handled above)
    // or if findDominantParent has loops, we might lose items.
    // For now, simple tree focus.

    return roots;
};



const OutlinerItem: React.FC<{
    node: HierarchyNode;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
}> = ({ node, depth, selectedId, onSelect }) => {
    const [expanded, setExpanded] = useState(true);
    const { bodies } = useStore();

    // Check habitability
    const isHabitable = useMemo(() => {
        if (!['Planet', 'Ice Giant', 'Dwarf'].includes(node.body.type)) return false;
        // Find the star (Simplified: Assume single star system or finding first star)
        // In a multi-star system, we should find the dominant parent recursively, but for now:
        const star = bodies.find(b => ['Star', 'Red Giant'].includes(b.type));
        return star ? checkHabitability(node.body, star) : false;
    }, [node.body, bodies]);

    const hasChildren = node.children.length > 0;
    const isSelected = selectedId === node.body.id;
    const typeColor = getTypeColor(node.body.type);

    return (
        <div>
            <div
                className={`
          flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer
          transition-all duration-150 group
          ${isSelected
                        ? 'bg-cyan-500/20 border border-cyan-500/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }
        `}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => onSelect(node.body.id)}
            >
                {/* Expand/Collapse Toggle */}
                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="p-0.5 hover:bg-white/10 rounded transition-colors"
                    >
                        {expanded ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
                    </button>
                ) : (
                    <div className="w-4" /> // Spacer
                )}

                {/* Icon */}
                <BodyIcon type={node.body.type} className={typeColor} />

                {/* Name */}
                <span className={`text-xs font-medium truncate flex-1 ${isSelected ? 'text-cyan-300' : 'text-slate-300 group-hover:text-white'}`}>
                    {node.body.name}
                </span>

                {/* Habitability Icon */}
                {isHabitable && (
                    <div title="Habitable Zone" className="text-emerald-400 animate-pulse mr-2">
                        <Droplets size={10} fill="currentColor" />
                    </div>
                )}

                {/* Type Badge */}
                <span className={`text-[9px] uppercase font-bold ${typeColor} opacity-50`}>
                    {node.body.type.split(' ')[0]}
                </span>
            </div>

            {/* Children */}
            {hasChildren && expanded && (
                <div className="relative">
                    <div
                        className="absolute left-0 top-0 bottom-0 w-px bg-slate-700/50"
                        style={{ marginLeft: `${depth * 16 + 14}px` }}
                    />
                    {node.children.map(child => (
                        <OutlinerItem
                            key={child.body.id}
                            node={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const UniverseOutliner: React.FC = () => {
    const { bodies, selectedId, selectBody, showOutliner, toggleOutliner } = useStore();
    // Default to fully expanded internal state, but respect global showOutliner for visibility
    const [isInternalExpanded, setInternalExpanded] = useState(true);

    const hierarchy = useMemo(() => buildHierarchy(bodies), [bodies]);

    if (!showOutliner) return null;

    return (
        <div className="fixed top-32 left-4 z-20 w-64 max-h-[60vh] flex flex-col bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl ring-1 ring-white/5 overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between p-3 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setInternalExpanded(!isInternalExpanded)}
            >
                <div className="flex items-center gap-2">
                    <List size={16} className="text-cyan-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Universe Outliner
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500">
                        {bodies.length} objects
                    </span>
                    {isInternalExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
            </div>

            {/* Body List */}
            {isInternalExpanded && (
                <div className="flex-1 overflow-y-auto p-2 scrollbar-custom">
                    {hierarchy.length === 0 && bodies.length > 0 ? (
                        // Fallback: If hierarchy failed but bodies exist (circular ref?), show flat list or error
                        <div className="text-center py-8 text-amber-500 text-xs">
                            Rebuilding hierarchy...
                        </div>
                    ) : hierarchy.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-xs">
                            No objects in simulation
                        </div>
                    ) : (
                        hierarchy.map(node => (
                            <OutlinerItem
                                key={node.body.id}
                                node={node}
                                depth={0}
                                selectedId={selectedId}
                                onSelect={selectBody}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default UniverseOutliner;
