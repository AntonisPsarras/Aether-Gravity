# Scientific presets

The three preset IDs are unchanged. Existing saves keep their bodies and assumptions;
creating a new preset world uses the revised data. No runtime network access is needed.

## Data and reference frames

- Solar System: JD 2451545 TDB, J2000 ecliptic. Most planets retain the JPL approximate
  element set. Earth (not the Earth–Moon barycentre), Pluto and all eleven moons use
  geometric Horizons osculating elements at that epoch. The checked-in
  `content/solarSatelliteElements.json` includes the exact requests. Regenerate with
  `powershell -NoProfile -File scripts/fetch-satellite-elements.ps1`.
- TRAPPIST-1: BJD TDB 2457257.93115525, Agol 2021 Table 2 posterior central parameters.
  Transit epochs and eccentricity vectors determine phase; mass-scaled periods determine
  semi-major axes in Jacobi coordinates. The common plane is rotated for viewing.
  These central parameters are an approximate representative realization, not a full
  posterior sample. Agol 2024 updates transit forecasts and is cited as a limitation;
  this app does not reproduce those forecasts or mix their timings into the 2021 fit.
- Centauri: Kervella 2016 Table 1 binary solution, with the Kervella 2017 wide-orbit
  central estimate for Proxima around the A/B barycentre. The wide orbit has a semi-major
  axis of 8700 AU and roughly 13000 AU instantaneous separation. Proxima b and d use
  radial-velocity minimum masses and assumed rocky radii, circular orbits and phases.
  The 2025 NIRPS paper is linked for confirmation of d; disputed c is excluded.

Source links, epochs, reference planes and limitations are available in Settings under
Scientific preset. Exoplanet inspectors distinguish assumed properties from measurements.
Colors, surfaces and compositions are illustrative. An orbit in a model habitable zone
does not establish the presence of an atmosphere, liquid water or life.

## Physics and display

Integrated bodies start in their common centre-of-mass frame. The same translation
is applied to analytical satellites, preserving their relative state immediately.
Moons and Proxima's planets remain analytical: no moon gravity, mutual perturbations,
precession, tides or relativistic corrections are modeled. Solar osculating satellite
periods can differ from long-term mean sidereal periods.

Scientific bodies use physical contact radii and near-point-mass Newtonian forces;
legacy sandbox bodies retain their existing collision policy. Double-precision
acceleration buffers support the compact orbits. A dyadic timestep resolves at least
256 samples per estimated pericentre orbital timescale, with equal accuracy on low/high
device tiers. Both modes share this policy. Frame budgets stay fixed; playback slows
for short periods. The effective rate is displayed in Settings. At unusually low
frame rates or after a stall, the existing catch-up cap can still discard elapsed time.

Measured stellar luminosity overrides survive derivation, edits and persistence.
Incident fluxes from multiple stars add. Derived exoplanet temperatures use an assumed
Bond albedo of 0.3 and no greenhouse heating. Rotation periods are positive about the
tilted spin axis, so an obliquity over 90 degrees produces retrograde rotation without
double reversing its sign. Preset surface spin follows simulation time.

Meshes remain enlarged in both modes. Compact systems use additional radius compression;
moon displays expand separation to match their parent's displayed size. Proxima planet
distances are not inflated. Guided views fit the relevant bodies, hide the grid for
compact views, and dismiss the phone outliner. Floating-origin rendering and wider
bounds support the true Centauri separation. Simulation time is saved so analytic
satellites reload at the saved phase; older saves default to elapsed time zero.

## Regression coverage

`utils/scientificPresets.test.ts` covers initialization, persistence, luminosity,
mode/device pacing, true separation, rotation conventions, and an 80-year binary run.
The TRAPPIST-1 regression runs at least 1000 inner orbits at the production accuracy
limit, then repeats with half and quarter timesteps for convergence. The recorded
baseline maximum fractional energy error is approximately 7.6e-7 (0.000076%).

`e2e/presets.spec.ts` exercises all three presets at desktop and phone widths, both
modes, guided views, pause/reverse, selection, and serialized world reload. It also
writes screenshots for manual visual inspection. Other physics, storage and rendering
regressions remain in the existing unit and browser suites.
