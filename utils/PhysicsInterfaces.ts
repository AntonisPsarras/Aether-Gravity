/**
 * Physics Interfaces for N-body simulation and algorithmic benchmarking.
 * Optimized for high-precision simulation documentation and admissions-grade reporting.
 */

export interface Particle {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    mass: number;
    color: string;
    size: number;
}

export interface PhysicsConstants {
    G: number; // Gravitational Constant
    SOFTENING: number; // Softening parameter for gravity calculations
    TIME_STEP: number;
    DAMPING: number;
}

export interface ComplexityMetric {
    nodeCount: number;
    oNSquaredValue: number;
    oNLogNValue: number;
}

export interface SkillMetric {
    subject: string;
    A: number;
    fullMark: number;
}

export interface PortfolioIdentity {
    name: string;
    grade: string;
    location: string;
    interests: string[];
    bio: string;
}
