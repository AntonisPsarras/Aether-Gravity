import React, { useState, useMemo, useRef, useCallback } from 'react';
import { BODY_DRAG_THRESHOLD_PX, BODY_LONG_PRESS_MS, type BodyGestureKind } from '../utils/bodyPointerGesture';
import { CelestialBody, BodyType } from '../types';
import { useStore } from '../utils/store';
import { checkHabitability } from '../utils/HabitabilityService';
import { buildParentMap } from '../utils/physicsUtils';
import { fmtMass, fmtTemp } from '../utils/units';
import {
    Sun, Globe, CircleDot, Aperture, Zap, Flame, Snowflake,
    ChevronDown, ChevronUp, ChevronRight, List, Droplets,
    Moon, Gem, Sparkles, Sparkle, Wind, Radio
} from 'lucide-react';

// Icon mapping for body types
const BodyIcon: React.FC<{ type: BodyType; className?: string }> = ({ type, className = '' }) => {
    const iconProps = { size: 14, className };
    switch (type) {
        case 'Star': return <Sun {...iconProps} />;
        case 'Red Giant': return <Flame {...iconProps} />;
        case 'Neutron Star': return <Zap {...iconProps} />;
        case 'Black Hole': return <Aperture {...iconProps} />;
        case 'Pulsar': return <Radio {...iconProps} />;
        case 'White Dwarf': return <Sparkle {...iconProps} />;
        case 'Brown Dwarf': return <Moon {...iconProps} />;
        case 'Planet': return <Globe {...iconProps} />;
        case 'Gas Giant': return <Wind {...iconProps} />;
        case 'Ice Giant': return <Snowflake {...iconProps} />;
        case 'Dwarf': return <CircleDot {...iconProps} />;
        case 'Moon': return <Moon {...iconProps} />;
        case 'Asteroid': return <Gem {...iconProps} />;
        case 'Comet': return <Sparkles {...iconProps} />;
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
        case 'Pulsar': return 'text-cyan-200';
        case 'White Dwarf': return 'text-sky-200';
        case 'Brown Dwarf': return 'text-orange-800';
        case 'Planet': return 'text-blue-400';
        case 'Gas Giant': return 'text-amber-300';
        case 'Ice Giant': return 'text-indigo-300';
        case 'Dwarf': return 'text-gray-400';
        case 'Moon': return 'text-stone-300';
        case 'Asteroid': return 'text-stone-500';
        case 'Comet': return 'text-teal-200';
        default: return 'text-slate-400';
    }
};

interface HierarchyNode {
    body: CelestialBody;
    children: HierarchyNode[];
}

const buildHierarchy = (bodies: CelestialBody[]): HierarchyNode[] => {
    // Compute every parent in one pass instead of N × findDominantParent.
    const parentMap = buildParentMap(bodies);
    const childMap = new Map<string | null, CelestialBody[]>();
    const allIds = new Set(bodies.map(b => b.id));

    bodies.forEach(body => {
        let parent = parentMap.get(body.id) || null;
        if (parent && !allIds.has(parent.id)) parent = null;
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
    onGesture: (id: string, kind: BodyGestureKind) => void;
}> = ({ node, depth, selectedId, onGesture }) => {
    const [expanded, setExpanded] = useState(true);
    const { bodies } = useStore();
    const pointerStart = useRef({ x: 0, y: 0, time: 0, active: false });

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

    const onRowPointerDown = useCallback((e: React.PointerEvent) => {
        pointerStart.current = { x: e.clientX, y: e.clientY, time: performance.now(), active: true };
    }, []);

    const onRowPointerUp = useCallback((e: React.PointerEvent) => {
        if (!pointerStart.current.active) return;
        pointerStart.current.active = false;
        const dx = e.clientX - pointerStart.current.x;
        const dy = e.clientY - pointerStart.current.y;
        if (Math.hypot(dx, dy) > BODY_DRAG_THRESHOLD_PX) return;
        const elapsed = performance.now() - pointerStart.current.time;
        onGesture(node.body.id, elapsed >= BODY_LONG_PRESS_MS ? 'longPress' : 'tap');
    }, [node.body.id, onGesture]);

    const onRowPointerCancel = useCallback(() => {
        pointerStart.current.active = false;
    }, []);

    return (
        <div>
            <div
                className={`
          touch-target flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer
          transition-all duration-150 group
          ${isSelected
                        ? 'bg-nova-gold/15 border border-nova-gold/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }
        `}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onPointerDown={onRowPointerDown}
                onPointerUp={onRowPointerUp}
                onPointerCancel={onRowPointerCancel}
            >
                {/* Expand/Collapse Toggle */}
                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="touch-target flex h-11 w-11 shrink-0 items-center justify-center hover:bg-white/10 rounded transition-colors"
                    >
                        {expanded ? <ChevronDown size={12} className="text-pulsar-white/30" /> : <ChevronRight size={12} className="text-pulsar-white/30" />}
                    </button>
                ) : (
                    <div className="w-4" /> // Spacer
                )}

                {/* Icon */}
                <BodyIcon type={node.body.type} className={typeColor} />

                {/* Name + scientific spec line */}
                <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium truncate ${isSelected ? 'text-nova-gold' : 'text-pulsar-white/60 group-hover:text-pulsar-white'}`}>
                        {node.body.name}
                    </div>
                    <div className="text-[9px] font-mono text-pulsar-white/30 truncate">
                        {fmtMass(node.body.mass)} · {fmtTemp(node.body.temperature)}
                    </div>
                </div>

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
                        className="absolute left-0 top-0 bottom-0 w-px bg-white/8"
                        style={{ marginLeft: `${depth * 16 + 14}px` }}
                    />
                    {node.children.map(child => (
                        <OutlinerItem
                            key={child.body.id}
                            node={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onGesture={onGesture}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const UniverseOutliner: React.FC = () => {
    const { bodies, selectedId, selectBody, openInspector, closeInspector } = useStore();
    const [isInternalExpanded, setInternalExpanded] = useState(true);

    const hierarchy = useMemo(() => buildHierarchy(bodies), [bodies]);

    const handleOutlinerGesture = useCallback((id: string, kind: BodyGestureKind) => {
        if (kind === 'longPress') {
            selectBody(id);
            openInspector(id);
            return;
        }
        selectBody(id);
        const { inspectorBodyId } = useStore.getState();
        if (inspectorBodyId && inspectorBodyId !== id) {
            closeInspector();
        }
    }, [selectBody, openInspector, closeInspector]);

    return (
        <div
            className={`
                universe-outliner-anchor fixed z-20 flex flex-col
                bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10
                rounded-xl shadow-2xl ring-1 ring-white/5 overflow-hidden
                transition-[max-height] duration-300 ease-out
                ${isInternalExpanded ? 'is-expanded' : ''}
            `}
        >
            {/* Header */}
            <div
                className="touch-target flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setInternalExpanded(!isInternalExpanded)}
            >
                <div className="flex items-center gap-2">
                    <List size={16} className="text-nova-gold" />
                    <span className="text-xs font-bold uppercase tracking-wider text-pulsar-white/70">
                        Universe Outliner
                    </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-pulsar-white/30">
                        {bodies.length} objects
                    </span>
                    {isInternalExpanded ? <ChevronUp size={14} className="text-pulsar-white/30" /> : <ChevronDown size={14} className="text-pulsar-white/30" />}
                </div>
            </div>

            {/* Body List */}
            {isInternalExpanded && (
                <div className="flex-1 overflow-y-auto p-2 scrollbar-custom panel-scroll">
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
                                onGesture={handleOutlinerGesture}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default UniverseOutliner;
