<div align="center">

# Aether Gravity

### A Minimalist Cosmic Space Simulator

*High-performance N-body physics, relativistic visuals, and a precision-crafted UI — built for the browser.*

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## Overview

**Aether Gravity** is a mobile-first, web-based space simulator built with **React**, **Three.js**, and custom **GLSL** shaders. It combines rigorous orbital mechanics with a restrained, cinematic presentation — letting you sculpt universes from binary stars to multi-planet systems orbiting supermassive black holes.

### Core capabilities

| Area | Highlights |
|------|------------|
| **N-Body physics** | Real-time gravitational interactions across many celestial bodies, with stability tooling (Hill spheres, Roche limits) and GPU-accelerated particle systems. |
| **Dynamic LOD black holes** | Kerr-type horizons with level-of-detail rendering, gravitational lensing, relativistic Doppler effects, and accretion-disk visuals. |
| **State-driven terrestrial shaders** | Procedural rocky and gas-giant surfaces with atmospheres, cloud layers, and thermodynamics-informed surface states that respond to simulation context. |
| **Universe sandbox** | Time control, precision launch mechanics, habitable-zone visualization, supernova events, and a glassmorphism UI for managing saved worlds. |

### Technical stack

- **Frontend:** React 18 · TypeScript · Vite  
- **Graphics:** Three.js · React Three Fiber · custom GLSL  
- **State:** Zustand  
- **Styling:** Tailwind CSS  

---

## The Visual Overhaul

Aether Gravity follows a strict, minimalist design system — every panel, orbit line, and shader backdrop is tuned to feel like deep space, not a generic sci-fi skin.

| Token | Hex | Role |
|-------|-----|------|
| **Void Navy** | `#10141C` | Primary background, chrome, and negative space |
| **Pulsar White** | `#F4F4FB` | Primary typography, accents, and high-contrast UI |

These colors are enforced across the app shell (`index.html`, CSS variables, Capacitor status bar) and UI components. Third-party themes or ad-hoc palette swaps are intentionally out of scope — the void is the brand.

---

## Local Installation

You may clone this repository and run it **on your own machine for learning and evaluation**. See [Legal & Licensing](#legal--licensing-notice) before sharing or publishing anything derived from this code.

**Prerequisites:** [Node.js](https://nodejs.org/) **v18 or newer** and **npm**

### 1. Clone the repository

```bash
git clone https://github.com/AntonisPsarras/aether-gravity.git
cd aether-gravity
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Vite will print a local URL (typically `http://localhost:5173`). Open it in a modern browser.

### Optional commands

| Command | Description |
|---------|-------------|
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run android:sync` | Build and sync to Capacitor Android (requires Android toolchain) |

---

## Legal & Licensing Notice

> **This repository is source-available, not open source.**  
> Licensed under the [PolyForm Strict License 1.0.0](https://polyformproject.org/licenses/strict/1.0.0) (`PolyForm-Strict-1.0.0`).

Copyright © 2026 Antonis Psarras. The full license text is in [`LICENSE`](./LICENSE).

This is **not** an [OSI-approved](https://opensource.org/licenses) open-source license (MIT, Apache, GPL, etc.). You may **use** the software only for **non-commercial permitted purposes** (personal study, hobby, research, and use by schools and other non-commercial organizations). The license does **not** grant permission to **distribute** the software or to **make changes or new works** based on it.

### You may (non-commercial use)

- Download and keep a copy for yourself  
- Read and study the source code  
- Build and run the app locally on your own machines for personal learning, hobby projects, or non-commercial institutional use  

### You may not

- **Redistribute** the code or any portion of it (uploads, mirrors, zip shares, public repos, etc.)  
- **Modify** the software or create derivative works (including private forks and patched builds)  
- **Publish** copies or variations to app stores, public hosting, or any distribution channel  
- Use the project for **commercial** purposes without a separate written agreement with the copyright holder  

**Cloning this repository does not grant permission to republish or fork it.** Share what you learned in your own words — do not ship this codebase (or a modified version) to others.

Third-party dependencies remain under their own licenses. For commercial licensing or other permissions, contact the repository owner via the official project channels.

---

<div align="center">

*Built for space enthusiasts who care about physics, performance, and craft.*

**© 2026 Antonis Psarras. All rights reserved.**

</div>
