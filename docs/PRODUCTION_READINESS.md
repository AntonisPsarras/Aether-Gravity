# Production readiness — 20 September 2026

## Release status

**READY WITH DOCUMENTED NON-BLOCKING RISKS.** The 14–19 September frozen-dependency blockers (nested tar/sharp via unused `@capacitor/assets`, Vite 6.4.2) are remediated. Remaining items are publisher console/device steps and accepted build-only advisories in `scripts/audit-allowlist.json`. This is not a signed Play or physical-device certificate.

## Executive evidence

20 September targeted remediation plus application/repo follow-up. Latest local evidence: **575 unit tests** in 42 files, **144 browser tests** (29 classified skips, 0 failures) on `--workers=2` including the previously flaky grid-ratio spec, serial 5-second performance soaks plus the allocation test, production build/smoke, `npm run audit:gate`, source and merged Android manifest gates, unsigned APK and AAB, lintRelease 0 errors / 18 warnings, and a freshly rerun native unit-test task. The 19 September 10-minute desktop soaks and the earlier two-worker grid-ratio failure remain in the historical ledger; they are not silently erased.

Named toolchain blockers are gone: Vite **6.4.3**, `@capacitor/assets` and sharp removed from the lockfile, tar overridden to **7.5.22**, PostCSS pinned to **8.5.28**. Production `npm audit --omit=dev --audit-level=high` is clean (fflate remains moderate, not in the measured production bundle). Full-tree high/critical leftovers are allowlisted build-only findings (Vitest API off, xmldom/browserslist/brace-expansion with repository-controlled inputs). No signed/device/store certification or exhaustive third-party source clearance is claimed.

## Constraints and baseline (14 September freeze, historical)

The 14–19 September work froze package versions. On 20 September the publisher authorized a **targeted** remediation (remove unused `@capacitor/assets`, pin patched Vite 6.x and related build tools, keep React/Three/Capacitor runtime frozen). Preserve `thumbnail.png` unchanged. No push, signing, or Play upload is authorized from this work.

14 September baseline (superseded for the release gate, retained as history):
- Inventory: 271 tracked files, 185 TypeScript files, 37 unit-test files, 17 E2E specifications. Inventory is not proof of review.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 539 tests in 37 files.
- `npm run build`: PASS. Tests/build initially failed on sandbox configuration access; rerunning outside the sandbox succeeded.
- `npm run test:e2e -- --workers=2`: FAIL, 135 passed, 29 skipped, one allocation test failed (1,000 sampled bytes in clampPositionVector; 168 in scanCollisionsInPlace).
- `npm ls --all --json --ignore-scripts`: no reported tree problems.
- `npm audit --json --ignore-scripts`: 21 affected packages (2 critical, 12 high, 5 moderate, 2 low).
- `npm audit --omit=dev --json --ignore-scripts`: one moderate finding, fflate.
- package.json SHA-256: `09587B0A3D275246359E513A36BFDB651EA1FF4FC598B74792AE26BC95D6677F`.
- package-lock.json SHA-256: `B4388531BCE0369E9E9F55997969069E288F5792504542FC715C9F1C100B1566`.

## Approved behavior

Keep sandbox visual-radius contacts, labeled as approximate; scientific presets use physical contacts. Use single-editor world ownership with browser locks; additional tabs cannot overwrite the editor. Keep valid saves compatible. No telemetry or new application network services.

## Phase ledger and review coverage

- Completed repository-wide text scanning, packaging inventory and focused source review. Inventory is **not** a claim of line-by-line semantic verification of all code or third-party internals.
- Completed production CSP/diagnostic hardening; storage bounds and editor ownership; numerical/cache/collision regressions; lifecycle cleanup; CI pins and Android configuration.
- Documentation reconciled with implementation. Original physics audit remains clearly historical.
- Final stable-source browser, serial stress and Android artifact checks are recorded below as they complete. No failed intermediate check is erased.

A file-by-file scan checklist follows this report. All baseline tracked files and added implementation files are included, with the user's thumbnail preserved. Binary inspection identifies PNG dimensions, filenames and packaging purpose; screenshot/image artwork and Gradle wrapper assets are retained. No generated tracked file was judged safely disposable and removed. Focused semantic review covered App/entrypoints, SpaceCanvas and its physics synchronization, store/bridge/snapshots, physics/units/relativity/Kepler/collisions, bounds, storage and migration, menu and inspector, production diagnostics, device/context/lifecycle helpers, configurations and workflow. Other UI/shader/data files received whole-file static checks and their existing integration tests; exhaustive manual visual and shader verification on every device is not claimed.

## Security, privacy and provenance findings

- Fixed P1 raw exception/component-stack reporting: production diagnostics use fixed codes. Global unhandled rejection/error handlers suppress raw browser reports and retain a sanitized signal. Console warnings/errors stay visible as fixed codes; development retains detail. The public production smoke injects a synthetic rejected promise and checks redaction.
- Fixed P2 production CSP development endpoints: WebSockets are permitted only by the development server transform. Production retains same-origin assets/connections, no frames/objects/forms, and no source maps. Inline styles remain necessary for React/R3F; CSP is not weakened for tests. No analytics, backend, authentication, SDK service, remote logging or cloud storage was added.
- Network review found the development-only fixture fetch, local Vite HMR, reference/hosted-policy/project/email links, and tooling/package registry/citation URLs. No runtime remote universe transfer was found. Web asset delivery necessarily contacts the host. Explicit external links are outside the app's offline guarantee. Data and body identifiers are never used as remote URLs.
- Parser/merge review: plain data allowlists, finite numeric conversion without invoking object coercion, own-property texture lookup, bounded record sizes, unsupported versions and unsafe body graphs rejected. React text rendering is used for user content. The static executable-input match is the scanner's own regex, not app execution.
- Secret-pattern scan found no detected credentials; this is a heuristic scan, not proof that no secret exists. Current provenance matches are the scanner's own search patterns. Ten matching historical commit-message lines were found; history was not rewritten. Legitimate copyright, scientific references and intentional public contact details remain.
- `.gitignore` now covers local credentials, dumps, archives, temporary output and native caches while permitting iOS source. Positive and negative `git check-ignore` cases cover env files, keystores, generated output, docs, screenshots, tests, Android manifest and iOS AppDelegate. Tracked assets were preserved.
- Pinned all three GitHub Actions to remote-verified immutable v4 revisions, set contents read and disabled persisted checkout credentials. Added production build/smoke and dependency-file diff gates. No pull_request_target, direct untrusted shell interpolation or secret-bearing deployment step was found. Existing CI installation commands remain; none was executed locally during this work.

## Storage and failure safety

Records are limited to 2,097,152 UTF-16 characters, worlds to 50 bodies and metadata lists to 10,000 entries. Unknown fields do not propagate into body properties. Duplicate identifiers, cyclic/dangling parents, invalid orbital elements and unsupported schema versions fail before loading. Oversized serialization fails rather than truncating a universe. Metadata duplicate checks use sets, and retained optimistic save snapshots are bounded to one world per tab.

One Web Lock is held for the world editor through saves; other tabs open paused and read-only. Store mutation guards and disabled inspector fields enforce the UI policy. Archive mutations take a separate shared-origin exclusive lock and reread metadata inside it. Deletion acquires world ownership first. Browser-lock absence fails to read-only persistence; it is not presented as conflict-safe editing. Two-tab tests check read-only access, unchanged storage and ownership after the first tab closes.

Legacy v1 migration validates before conversion, creates/verifies a verbatim backup and deletes it only after the upgraded record verifies. Existing tests retain interrupted-migration, failed backup, quota, no-op verification and optimistic conflict cases. Normal localStorage replacement is atomic per key; multi-key archive operations have rollback but are not a durable database transaction. Browser eviction, OS storage failure, hostile storage implementations and a non-cooperating old app tab can exceed these guarantees. There is no external backup/export recovery service. Save errors stay visible and leaving without a successful save requires the existing explicit UI choice.

## Physics, formulas and tolerances

Canonical units: M = GM_earth/G_SI, L = 0.025 AU, T = 31,557,600 seconds. G_model = G_SI M T²/L³; velocity converts by L/T. No SI constants or unit multipliers were changed. Density = 3m/(4πr³), surface gravity = Gm/r², escape speed = sqrt(2Gm/r), and Stefan-Boltzmann temperatures use physical radius, never drawn radius. Corrected misleading unit comments (approximate year and Jupiter mean radius).

The O(N²) force uses pair symmetry and Plummer denominator (r²+epsilon²)^(3/2). Energy tests use the corresponding softened potential, -G m1 m2/sqrt(r²+epsilon²). Velocity-Verlet is second order with Float64 accelerations and double-precision vectors. New-body partial caches now trigger full force recomputation. Fixed frame accumulation remains bounded; render/device quality does not reduce physical precision. Scientific/encounter timestep selection is dyadic with a 2^-18 year floor, so arbitrarily tight encounters are not claimed resolved.

Ordinary collisions now retain all mass (formerly all impacts lost 1%). Fragment mass budget checks avoid creating minimum-mass fragments without sufficient ejecta. Fragment positions are recentered about the input barycentre; momentum is mass-weighted and input kinetic energy is computed before mutating mass. Total angular momentum combines orbital r×mv with intrinsic canonical M L²/T accounting on remnants. Unresolved spin is bookkeeping, not a rigid-body solution. Compact-object 1% loss remains explicitly illustrative; events carry lost mass, velocity and angular momentum, and supernova losses are similarly accounted for. Visual wave amplitude is not an energy conservation mechanism or joules. Over-limit products do not merge. Relativistic formulas describe isolated Kerr geometry, not relativistic orbital integration. Analytic moons exert no back-reaction. Class changes/supernovae are mass-threshold approximations, not age-resolved stellar tracks. These limits are now visible in Settings and docs.

New `productionPhysics` tests preserve existing tolerances: 100 Sun/Earth orbits at 1/1024 yr, maximum softened-energy drift <0.001; relative angular drift <1e-10 and zero-reference linear momentum absolute error <1e-8. Verlet global truncation is O(dt²), so bounded energy rather than exact energy is appropriate; angular/pairwise momentum tolerances allow accumulated Float64 roundoff over 102,400 steps. 4,096 forward and reverse steps require position/velocity recovery <1e-10 in a controlled collision-free fixture. Collision barycentre and momentum/angular accounting use 1e-10 absolute tolerance for order-one fixtures; compact mass-loss momentum uses 1e-12 relative tolerance because the reference mass is millions of Earth masses. Partial-cache/reinitialized trajectories match within 1e-12.

Existing Kepler period/element round-trip, finite extreme input, radius/density/gravity/escape/temperature conversions, classifications, relativistic bounds, deterministic frame partition and scientific convergence fixtures remain enforced. The 1000-inner-orbit TRAPPIST-1 test measured max fractional energy error 1.8474037581125338e-7 with dt=7.62939453125e-6 yr over 542,169 steps; the measured convergence ratio was 0.1996399854037463. No physical assertion was relaxed.

## Performance, lifecycle and Android

The allocation fix moves contact resolution out of the steady-state pair scan, uses stable swept-separation arithmetic and gives valid position clamping an immediate return. The existing exact allocation assertion is retained. Initial serial performance validation passed four tests with the optional stress test skipped; final stress evidence follows below. Device-tier budgets, capped DPR, context recovery and background accumulator protections remain covered by browser/unit tests. Headless desktop emulation is not physical Android performance evidence.

Late native listener registration now removes its handle even after React cleanup. Rejected native operations receive fixed diagnostics. Browser zoom restrictions and blanket gesture prevention were removed. Existing interaction, touch, viewport, undo/redo, live edits, WebGL2 absence and context-loss tests remain active.

Android disables cleartext, backups and release/WebView debugging. FileProvider is confined to shared_exports under cache. ES 3.0 is required. Lint errors block release, and the native instrumentation package expectation was corrected. Offline lintDebug and processReleaseMainManifest completed successfully. The merged release manifest contains VIBRATE and the app-scoped dynamic receiver permission, no INTERNET; exported launcher/profileinstaller components need normal platform permission review (profileinstaller requires DUMP). No signing credential, version or dependency was changed. Signed release/device and store checks are unverified.

## Dependency and supply-chain gate

**The audit is not clean.** Full npm audit reports 21 affected packages: 2 critical, 12 high, 5 moderate and 2 low. Production-only audit reports fflate (moderate). Dependency declarations, versions and package-lock bytes are frozen. The installed tree reports no dependency problems; all resolved lock sources use the npm registry and all resolved entries have integrity metadata. Integrity metadata presence does not prove every installed file is untampered. No package installation, postinstall, dependency patch or audit fix was run.

The installed lifecycle census identifies esbuild postinstall and sharp install/native download behavior, plus package prepare scripts. The root postinstall patch is documented and was not run. Tar/sharp and Windows development-server exposure remain blockers for the general production toolchain under the frozen versions: running a trusted local build is not proof that arbitrary inputs or future release operations are safe. The runtime bundle does not retain fflate (Rollup rendered-module evidence); there is no ZIP import path. This is a scoped non-blocking runtime finding, not a fixed dependency.

Bundled license notices are emitted from actual retained module package roots. License metadata census is predominantly MIT/ISC/Apache/BSD with BlueOak and development attribution-data licenses. SEE LICENSE entries and the unspecified webgl-constants license were inspected in installed license files. No incompatible bundled license was identified in this review; this is not a legal clearance. No package was removed for size. Native/Maven dependency security and package abandonment/malicious-code analysis are not comprehensively certified by npm audit.

Individual package classifications and direct advisory links follow. Transitive findings inherit the named input boundary; adding new loaders, APIs, image generation or untrusted build inputs requires reassessment.

- **@babel/core (low) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Build-only source-map input is repository controlled; no public transform endpoint. [advisory 1](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8).
- **@capacitor/assets (high) — UNRESOLVED PRODUCTION TOOLCHAIN BLOCKER.** Inherits vulnerable sharp and its nested CLI/tar path; do not regenerate assets with untrusted inputs. Inherited advisory dependencies: @capacitor/cli, sharp.
- **@capacitor/cli (high) — UNRESOLVED PRODUCTION TOOLCHAIN BLOCKER.** The affected copy is nested under assets (not all installed CLI copies); inherits the archive-path blocker. Inherited advisory dependencies: tar.
- **@trapezedev/project (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Config tooling only; inherits replace/xcode boundaries, not shipped application input. Inherited advisory dependencies: replace, xcode.
- **@vitest/mocker (moderate) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** No Vitest browser redirect-mock/API server exposed in the configured test path. [advisory 1](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- **@xmldom/xmldom (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Native/config tooling reads repository-controlled XML; no public XML input boundary. Untrusted configuration generation is outside acceptance. [advisory 1](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6), [advisory 2](https://github.com/advisories/GHSA-6mj3-qw4j-hgrw), [advisory 3](https://github.com/advisories/GHSA-g53g-w8rj-fmg7), [advisory 4](https://github.com/advisories/GHSA-w2rr-34g9-rvrj), [advisory 5](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm), [advisory 6](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv), [advisory 7](https://github.com/advisories/GHSA-27p8-2357-5qqv), [advisory 8](https://github.com/advisories/GHSA-3px3-54cx-rmw9), [advisory 9](https://github.com/advisories/GHSA-vr34-hp96-76pp), [advisory 10](https://github.com/advisories/GHSA-6h8r-xr42-gp59), [advisory 11](https://github.com/advisories/GHSA-8344-3jmq-59r6), [advisory 12](https://github.com/advisories/GHSA-x4fp-j954-r2f4), [advisory 13](https://github.com/advisories/GHSA-965w-775f-mr7g), [advisory 14](https://github.com/advisories/GHSA-93r5-fhx6-vmg9).
- **baseline-browser-mapping (moderate) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Build-only fixed target query; no public arbitrary target input. [advisory 1](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).
- **brace-expansion (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Repository-owned tooling globs only; not a public pattern service. [advisory 1](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [advisory 2](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [advisory 3](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- **browserslist (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Build-time bounded fixed queries and no external stats input; not a long-running query endpoint. [advisory 1](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [advisory 2](https://github.com/advisories/GHSA-73wf-gq98-2v4g).
- **fflate (moderate) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Not retained by the measured production bundle; no ZIP loader/import in public UI. [advisory 1](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
- **minimatch (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Affected copy is in replace tooling; no user-controlled public glob endpoint. [advisory 1](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [advisory 2](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [advisory 3](https://github.com/advisories/GHSA-23c5-xmqv-rm74).
- **nanoid (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** No public generator size input reaches this development dependency. [advisory 1](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [advisory 2](https://github.com/advisories/GHSA-2v37-7h3g-55p8).
- **postcss (high) — FIXED EXPOSURE WITHOUT CHANGING DEPENDENCIES, FOR THE CONFIGURED BUILD.** `postcss.config.js` sets map:false, disabling automatic previous-source-map loading. Two regression cases first reproduce parsing under the installed vulnerable default and then verify no map is parsed with project configuration, both with and without from. Vite defaults css.devSourcemap to false and preserves this option. Enabling devSourcemap or invoking PostCSS outside this configuration requires reassessment; npm still correctly reports the installed advisory. [advisory 1](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [advisory 2](https://github.com/advisories/GHSA-r28c-9q8g-f849).
- **postcss-selector-parser (low) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Repository-controlled build CSS, no runtime selector parser service. [advisory 1](https://github.com/advisories/GHSA-w9m9-85wc-3x92).
- **replace (high) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Inherits minimatch tooling boundary; no public replacement endpoint. Inherited advisory dependencies: minimatch.
- **sharp (high) — UNRESOLVED PRODUCTION TOOLCHAIN BLOCKER.** Native image parsers contain high-severity libvips/libheif findings; asset regeneration remains blocked. [advisory 1](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [advisory 2](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).
- **tar (critical) — UNRESOLVED PRODUCTION TOOLCHAIN BLOCKER.** Archive extraction/parse paths have critical/high advisories; the general native toolchain cannot be declared safe without updating or removing vulnerable entry points. [advisory 1](https://github.com/advisories/GHSA-34x7-hfp2-rc4v), [advisory 2](https://github.com/advisories/GHSA-8qq5-rm4j-mr97), [advisory 3](https://github.com/advisories/GHSA-83g3-92jg-28cx), [advisory 4](https://github.com/advisories/GHSA-qffp-2rhf-9h96), [advisory 5](https://github.com/advisories/GHSA-9ppj-qmqm-q256), [advisory 6](https://github.com/advisories/GHSA-r6q2-hw4h-h46w), [advisory 7](https://github.com/advisories/GHSA-vmf3-w455-68vh), [advisory 8](https://github.com/advisories/GHSA-w8wr-v893-vjvp), [advisory 9](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [advisory 10](https://github.com/advisories/GHSA-8x88-c5mf-7j5w), [advisory 11](https://github.com/advisories/GHSA-gvwx-54wh-qm9j), [advisory 12](https://github.com/advisories/GHSA-r292-9mhp-454m).
- **uuid (moderate) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Affected optional-buffer generation APIs are not app input boundaries; application uses browser UUIDs. [advisory 1](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- **vite (high) — UNRESOLVED PRODUCTION TOOLCHAIN BLOCKER.** Windows development server file-deny bypass and editor UNC disclosure remain unpatched; localhost binding reduces exposure but does not prove these paths safe. [advisory 1](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [advisory 2](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- **vitest (critical) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Run-only unit tests with api:false, no UI/API/browser-mode server; critical advisory requires the listening server. Enabling it is prohibited until reassessed. [advisory 1](https://github.com/advisories/GHSA-5xrq-8626-4rwp), [advisory 2](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- **xcode (moderate) — ACCEPTED, NON-BLOCKING WITH STATED INPUT BOUNDARY.** Native project tooling, not browser runtime; inherits uuid boundary. Inherited advisory dependencies: uuid.

## Validation ledger

Baseline commands/results are above. Additional implementation checks:

- `npm test`: PASS, 557 tests across 39 files (includes physics/storage regressions).
- `npm run build`: PASS, typecheck plus production assets and 53 kB third-party notices. An intermediate notices-plugin build failed on Rollup virtual module IDs; fixed by stripping the null prefix, then rebuilt successfully.
- `npm run test:e2e -- e2e/perf.spec.ts --workers=1`: PASS, 4 passed/1 optional stress skipped in the earlier serial run.
- `npm run test:e2e -- e2e/menu.spec.ts e2e/storageOwnership.spec.ts --workers=2`: intermediate 30 passed/2 menu failures caused by assertions racing asynchronous archive-lock completion. Modal handlers now await completion and tests await visible folder disappearance before asserting exact persisted contents.
- `npm run test:e2e -- --workers=2`: intermediate 132 passed, 28 skipped, 6 failed, 1 not run while development source was changing; final stable-source rerun required. Failures in grid/viewport/perf/preset state remain recorded until resolved by that run. A subsequent attempt exited 1 before test output; retry started normally.
- `node scripts/production-smoke.mjs`: earlier PASS against production assets; final rebuilt smoke PASS (see final update).
- `android/gradlew.bat -p android :app:lintDebug :app:processReleaseMainManifest --offline --no-daemon` with JDK21: PASS, 287 tasks. Initial sandbox wrapper access denied; outside-sandbox cached toolchain succeeded. No downloaded dependencies were authorized.
- `node scripts/repository-audit.mjs`: PASS credential-pattern gate; scanner's own regex accounts for provenance/executable-input matches. No accidental machine paths found in source scan.
- `npm ls --all --json --ignore-scripts`: PASS tree consistency. `npm audit --json --ignore-scripts` and `npm audit --omit=dev --json --ignore-scripts`: NONZERO findings, not a clean audit.

Unit/build/browser commands required filesystem escalation for esbuild/config access. Environment failures are not counted as passing tests. Final results and package hashes are recorded in the final verification update.

## Remaining actions and verified facts

Release remains BLOCKED by unmitigated frozen dependency findings. Publisher approval for a future dependency remediation is necessary; this work does not silently bypass the freeze. Independently verify signed Android artifacts on representative devices, release credentials/versioning, Play policy and Data safety, hosting response headers and access logs, GitHub branch protection, secret scanning and push protection. No credential needing rotation was detected; rotate any credential later found in history through the owning service.

Verified facts are command results, inspected configuration, measured bundle paths, tested numerical bounds, unchanged package files and implemented behavior. Assumptions are trusted build inputs, cooperating tabs, normal atomic localStorage behavior and runtime/device support beyond the tested Chromium/JDK environment. This report does not claim bug-free software, full security, full scientific fidelity, unlimited storage durability, or exhaustive third-party source review.

## Files changed and reasons

- `.github/workflows/playwright.yml`: immutable actions, minimum permissions, credential isolation and production build/smoke gates.
- `.gitignore`: retain native source while excluding credentials, archives and generated output.
- `App.tsx`: world ownership, read-only sessions, stale async-open protection, native cleanup, bounded-save error handling and zoom support.
- `README.md`, `ANDROID_BUILD.md`, `PHYSICS_AUDIT.md`, `docs/SCIENTIFIC_PRESETS.md`: reconcile behavior, units, approximation limits, toolchain and release claims.
- `docs/PRODUCTION_READINESS.md`: resumable audit, findings, validation, per-file coverage and release gate.
- `android/app/build.gradle`: explicit non-debuggable release and failing lint errors.
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`: correct expected application identifier.
- `android/app/src/main/AndroidManifest.xml`: disallow cleartext and require ES 3.0, with manifest feature ordering corrected.
- `android/app/src/main/res/xml/file_paths.xml`: constrain exported file sharing to dedicated cache directory.
- `capacitor.config.ts`: disable native logging and WebView debugging.
- `components/ErrorBoundary.tsx`, `index.tsx`, `utils/diagnostics.ts`, `utils/productionConsole.ts`: safe production diagnostics and async listener failure cleanup.
- `components/MainMenu.tsx`: serialize archive mutations, protect deletion against active editors, await async operations and label rename controls.
- `components/SettingsPanel.tsx`: disclose collision, evolution, reverse-time and relativity limits.
- `components/inspector/InspectorPanel.tsx`: disable editable fields for a read-only viewer.
- `content/privacyPolicy.ts`: explain web asset hosting separately from local Android gameplay.
- `e2e/menu.spec.ts`: await asynchronous collection deletion before verifying unchanged exact persistence assertions.
- `e2e/storageOwnership.spec.ts`: real two-tab ownership, corrupt-save recovery, storage-event refresh and orphan-collection visibility regressions.
- `index.html`: production CSP and user zoom access.
- `scripts/production-smoke.mjs`: public-UI production smoke, outbound-request and diagnostic assertions.
- `scripts/repository-audit.mjs`: redacted static scan, file/asset inventory, lock-source/integrity/license/lifecycle census.
- `types.ts`: intrinsic angular-momentum and loss-event accounting fields.
- `utils/browserStorage.ts`: record-size limits and bounded queued errors.
- `utils/collisionOutcome.ts`, `utils/collisionOutcome.test.ts`: ordinary-impact mass conservation and valid fragment budgets, strengthened expectations.
- `utils/physicsBounds.ts`: safe coercion, own-property allowlist, bounded derived values and hot-path clamp fast return.
- `utils/physicsSoA.ts`: correct partial force-cache initialization and empty-system return.
- `utils/physicsUtils.ts`: cold contact resolver, stable swept separation, barycentre and angular/loss accounting.
- `utils/productionPhysics.test.ts`: deterministic long-orbit, reversal, cache and collision invariants.
- `utils/productionSafety.test.ts`: malformed/oversized/prototype inputs, native cleanup and lock ownership tests.
- `utils/releaseRegression.test.ts`: paused-parent deletion regression preserving position/velocity and save validity.
- `utils/buildSafety.test.ts`, `postcss.config.js`: verify and disable previous-source-map parsing without dependency updates.
- `components/inspector/InspectorHeader.tsx`: disable destructive control for read-only viewers.
- `utils/store.ts`: read-only edit/playback guards and immediate inertial detachment after parent deletion while paused.
- `utils/units.ts`: correct reference comments; constants preserved.
- `utils/worldStorage.ts`: structural validation, bounded snapshots, safe serialization/migration/viewer behavior and identifier checks.
- `utils/worldOwnership.ts`, `utils/worldValidation.ts`: exclusive browser editing/metadata locks and dependency-free schema boundary.
- `vite.config.ts`: production-only license notices, no source maps, development-only CSP transform and no unused environment loading.
- `vitest.config.ts`: explicitly disable the unnecessary API server.

## File review checklist

The checklist records actual review level. Checked entries mean the named static inventory/scan completed; they do not imply manual semantic sign-off. “Focused semantic review” below names the path inspected, not whole-file or device-level clearance. Focused review and changed-file reasons are described in the sections above. The implementation initially remained uncommitted; the user authorized a commit on 19 September.

- [x] `docs/PRODUCTION_READINESS.md` — whole-file static scan; changed for the remediation described above.
- [x] `e2e/storageOwnership.spec.ts` — whole-file static scan; changed for the remediation described above.
- [x] `scripts/production-smoke.mjs` — whole-file static scan; changed for the remediation described above.
- [x] `scripts/repository-audit.mjs` — whole-file static scan; changed for the remediation described above.
- [x] `thumbnail.png` — binary packaging inventory; preserved.
- [x] `utils/diagnostics.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/productionPhysics.test.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/productionSafety.test.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/worldOwnership.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/worldValidation.ts` — whole-file static scan; changed for the remediation described above.
- [x] `.github/workflows/playwright.yml` — whole-file static scan; changed for the remediation described above.
- [x] `.gitignore` — whole-file static scan; changed for the remediation described above.
- [x] `ANDROID_BUILD.md` — whole-file static scan; changed for the remediation described above.
- [x] `App.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `CONTRIBUTING.md` — whole-file static scan; preserved.
- [x] `ICONS_README.md` — whole-file static scan; preserved.
- [x] `LICENSE` — whole-file static scan; preserved.
- [x] `LOW_END_PERFORMANCE_REPORT.md` — whole-file static scan; preserved.
- [x] `PHYSICS_AUDIT.md` — whole-file static scan; changed for the remediation described above.
- [x] `PROGUARD_FIX.md` — whole-file static scan; preserved.
- [x] `README.md` — whole-file static scan; changed for the remediation described above.
- [x] `android/.gitignore` — whole-file static scan; preserved.
- [x] `android/app/.gitignore` — whole-file static scan; preserved.
- [x] `android/app/build.gradle` — whole-file static scan; changed for the remediation described above.
- [x] `android/app/capacitor.build.gradle` — whole-file static scan; preserved.
- [x] `android/app/proguard-rules.pro` — whole-file static scan; preserved.
- [x] `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` — whole-file static scan; changed for the remediation described above.
- [x] `android/app/src/main/AndroidManifest.xml` — whole-file static scan; changed for the remediation described above.
- [x] `android/app/src/main/java/com/aethergravity/app/MainActivity.java` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/drawable-land-hdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-land-mdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-land-xhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-land-xxhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-land-xxxhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-port-hdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-port-mdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-port-xhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-port-xxhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable-port-xxxhdpi/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/drawable/splash.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/layout/activity_main.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` — binary packaging inventory; preserved.
- [x] `android/app/src/main/res/values/colors.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/values/ic_launcher_background.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/values/strings.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/values/styles.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/xml/backup_rules.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/xml/data_extraction_rules.xml` — whole-file static scan; preserved.
- [x] `android/app/src/main/res/xml/file_paths.xml` — whole-file static scan; changed for the remediation described above.
- [x] `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` — whole-file static scan; preserved.
- [x] `android/build.gradle` — whole-file static scan; preserved.
- [x] `android/capacitor.settings.gradle` — whole-file static scan; preserved.
- [x] `android/gradle.properties` — whole-file static scan; preserved.
- [x] `android/gradle/wrapper/gradle-wrapper.jar` — binary packaging inventory; preserved.
- [x] `android/gradle/wrapper/gradle-wrapper.properties` — whole-file static scan; preserved.
- [x] `android/gradlew` — whole-file static scan; preserved.
- [x] `android/gradlew.bat` — whole-file static scan; preserved.
- [x] `android/settings.gradle` — whole-file static scan; preserved.
- [x] `android/variables.gradle` — whole-file static scan; preserved.
- [x] `capacitor.config.ts` — whole-file static scan; changed for the remediation described above.
- [x] `components/BlackHole/BlackHoleLensCapture.tsx` — whole-file static scan; preserved.
- [x] `components/BlackHole/BlackHoleRig.tsx` — whole-file static scan; preserved.
- [x] `components/CanvasSetup.tsx` — whole-file static scan; preserved.
- [x] `components/DevPhysicsDiagnostics.tsx` — whole-file static scan; preserved.
- [x] `components/Environment/DecorativeDust.tsx` — whole-file static scan; preserved.
- [x] `components/Environment/EnvironmentContext.tsx` — whole-file static scan; preserved.
- [x] `components/Environment/GasClouds.tsx` — whole-file static scan; preserved.
- [x] `components/Environment/README.md` — whole-file static scan; preserved.
- [x] `components/Environment/RadiationEffects.tsx` — whole-file static scan; preserved.
- [x] `components/ErrorBoundary.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `components/HabitableZoneVisual.tsx` — whole-file static scan; preserved.
- [x] `components/InfoModal.tsx` — whole-file static scan; preserved.
- [x] `components/LiveHelper.tsx` — whole-file static scan; preserved.
- [x] `components/MainMenu.tsx` — whole-file static scan plus focused semantic review of archive async callbacks/draft and confirmation lifecycle; changed for the remediation described above.
- [x] `components/MenuBlackHole.tsx` — whole-file static scan; preserved.
- [x] `components/MenuSpaceBackground.tsx` — whole-file static scan; preserved.
- [x] `components/MoonCreator.tsx` — whole-file static scan; preserved.
- [x] `components/MoonCreatorPanel.tsx` — whole-file static scan; preserved.
- [x] `components/OrbitPaths.tsx` — whole-file static scan; preserved.
- [x] `components/Panels.tsx` — whole-file static scan; preserved.
- [x] `components/PhysicsDiagnostics.tsx` — whole-file static scan; preserved.
- [x] `components/Planet/PlanetShaders.ts` — whole-file static scan; preserved.
- [x] `components/Portfolio/ComplexityChart.tsx` — whole-file static scan; preserved.
- [x] `components/Portfolio/SkillsRadar.tsx` — whole-file static scan; preserved.
- [x] `components/PortfolioPanel.tsx` — whole-file static scan; preserved.
- [x] `components/PrivacyPolicyContent.tsx` — whole-file static scan; preserved.
- [x] `components/PrivacyPolicyPanel.tsx` — whole-file static scan; preserved.
- [x] `components/SettingsPanel.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `components/SpaceCanvas.tsx` — whole-file static scan; preserved.
- [x] `components/TestMetricsCollector.tsx` — whole-file static scan; preserved.
- [x] `components/TutorialOverlay.tsx` — whole-file static scan; preserved.
- [x] `components/UniverseOutliner.tsx` — whole-file static scan; preserved.
- [x] `components/WebGL2RequiredScreen.tsx` — whole-file static scan; preserved.
- [x] `components/bodyTypeVisuals.ts` — whole-file static scan; preserved.
- [x] `components/hooks/useBodySelectionGesture.ts` — whole-file static scan; preserved.
- [x] `components/hooks/useMediaQuery.ts` — whole-file static scan; preserved.
- [x] `components/hooks/useReducedMotion.ts` — whole-file static scan; preserved.
- [x] `components/hooks/useValueFlash.ts` — whole-file static scan; preserved.
- [x] `components/inspector/InspectorContext.ts` — whole-file static scan; preserved.
- [x] `components/inspector/InspectorHeader.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `components/inspector/InspectorPanel.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `components/inspector/controls/AtmosphereChart.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/CircularDial.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/CompositionSlider.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/DerivedRow.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/Gauge.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/NumberInput.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/controls/RangeInput.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/AnalysisSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/AtmosphereSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/CompositionSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/DynamicsSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/OrbitSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/PhysicalSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/RelativisticSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/RingsSection.tsx` — whole-file static scan; preserved.
- [x] `components/inspector/sections/ThermalSection.tsx` — whole-file static scan; preserved.
- [x] `components/outliner/OutlinerRow.tsx` — whole-file static scan; preserved.
- [x] `components/outliner/OutlinerToolbar.tsx` — whole-file static scan; preserved.
- [x] `components/outliner/UniverseOutliner.tsx` — whole-file static scan; preserved.
- [x] `components/shaders/relativityChunk.ts` — whole-file static scan; preserved.
- [x] `components/ui/Collapsible.tsx` — whole-file static scan; preserved.
- [x] `components/ui/FilterChip.tsx` — whole-file static scan; preserved.
- [x] `components/ui/SearchInput.tsx` — whole-file static scan; preserved.
- [x] `components/ui/Sheet.tsx` — whole-file static scan; preserved.
- [x] `components/ui/Tabs.tsx` — whole-file static scan; preserved.
- [x] `components/ui/cn.ts` — whole-file static scan; preserved.
- [x] `constants.ts` — whole-file static scan; preserved.
- [x] `content/privacyPolicy.ts` — whole-file static scan; changed for the remediation described above.
- [x] `content/realSystems.ts` — whole-file static scan; preserved.
- [x] `content/solarSatelliteElements.json` — whole-file static scan; preserved.
- [x] `docs/SCIENTIFIC_PRESETS.md` — whole-file static scan; changed for the remediation described above.
- [x] `docs/screenshots/advanced-mode.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/beginner-mode.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/black-hole.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/inspector.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/main-menu.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/mobile-inspector.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/solar-system.png` — binary packaging inventory; preserved.
- [x] `docs/screenshots/universe-creator.png` — binary packaging inventory; preserved.
- [x] `e2e/editlock.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/devServerSecurity.spec.ts` — new focused Vite endpoint/CORS browser regression; reviewed in full.
- [x] `e2e/environment.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/fixtures/compact-impact.json` — whole-file static scan; preserved.
- [x] `e2e/fixtures/minimal-3body.json` — whole-file static scan; preserved.
- [x] `e2e/fixtures/stress-20b.json` — whole-file static scan; preserved.
- [x] `e2e/gesture.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/globalTeardown.ts` — whole-file static scan; preserved.
- [x] `e2e/graphicsMode.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/grid.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/gridMobileVisual.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/gridMobileVisual.spec.ts-snapshots/grid-performance-phone-chromium-win32.png` — binary packaging inventory; preserved.
- [x] `e2e/gridMobileVisual.spec.ts-snapshots/grid-quality-phone-chromium-win32.png` — binary packaging inventory; preserved.
- [x] `e2e/helpers.ts` — whole-file static scan plus focused review of CDP forced-GC soak instrumentation; changed in this continuation.
- [x] `e2e/layout.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/menu.spec.ts` — whole-file static scan; changed for the remediation described above.
- [x] `e2e/moonCreation.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/onboarding.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/perf.spec.ts` — whole-file static scan plus focused review of serial timeout/FPS/retained-heap gates; changed in this continuation.
- [x] `e2e/perfReport.ts` — whole-file static scan plus focused review of retained-heap reporting; changed in this continuation.
- [x] `e2e/presets.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/release.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/screenshots.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/simulation.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/smoke.spec.ts` — whole-file static scan; preserved.
- [x] `e2e/webgl2Required.spec.ts` — whole-file static scan; preserved.
- [x] `index.css` — whole-file static scan; preserved.
- [x] `index.html` — whole-file static scan; changed for the remediation described above.
- [x] `index.tsx` — whole-file static scan; changed for the remediation described above.
- [x] `package-lock.json` — whole-file static scan; preserved.
- [x] `package.json` — whole-file static scan; preserved.
- [x] `playwright.config.ts` — whole-file static scan; preserved.
- [x] `postcss.config.js` — whole-file static scan; changed for the remediation described above.
- [x] `public/manifest.json` — whole-file static scan; preserved.
- [x] `scripts/fetch-satellite-elements.ps1` — whole-file static scan; preserved.
- [x] `scripts/fix-proguard.js` — whole-file static scan; preserved.
- [x] `scripts/playwright-server.mjs` — whole-file static scan; preserved.
- [x] `tailwind.config.js` — whole-file static scan; preserved.
- [x] `tsconfig.json` — whole-file static scan; preserved.
- [x] `types.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/HabitabilityService.ts` — whole-file static scan; preserved.
- [x] `utils/PhysicsInterfaces.ts` — whole-file static scan; preserved.
- [x] `utils/autoGraphics.test.ts` — whole-file static scan; preserved.
- [x] `utils/autoGraphics.ts` — whole-file static scan; preserved.
- [x] `utils/backNavigation.test.ts` — whole-file static scan; preserved.
- [x] `utils/backNavigation.ts` — whole-file static scan; preserved.
- [x] `utils/bodyAppearance.test.ts` — whole-file static scan; preserved.
- [x] `utils/bodyAppearance.ts` — whole-file static scan; preserved.
- [x] `utils/bodyDerivation.test.ts` — whole-file static scan; preserved.
- [x] `utils/bodyDerivation.ts` — whole-file static scan; preserved.
- [x] `utils/bodyFactory.ts` — whole-file static scan; preserved.
- [x] `utils/bodyPointerGesture.test.ts` — whole-file static scan; preserved.
- [x] `utils/bodyPointerGesture.ts` — whole-file static scan; preserved.
- [x] `utils/browserStorage.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/cameraFly.test.ts` — whole-file static scan; preserved.
- [x] `utils/cameraFly.ts` — whole-file static scan; preserved.
- [x] `utils/collisionOutcome.test.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/collisionOutcome.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/curvatureDisplay.test.ts` — whole-file static scan; preserved.
- [x] `utils/curvatureDisplay.ts` — whole-file static scan; preserved.
- [x] `utils/deferFrames.ts` — whole-file static scan; preserved.
- [x] `utils/deviceCapabilities.test.ts` — whole-file static scan; preserved.
- [x] `utils/deviceCapabilities.ts` — whole-file static scan; preserved.
- [x] `utils/displayMode.test.ts` — whole-file static scan; preserved.
- [x] `utils/displayMode.ts` — whole-file static scan; preserved.
- [x] `utils/displayPrefs.test.ts` — whole-file static scan; preserved.
- [x] `utils/displayPrefs.ts` — whole-file static scan; preserved.
- [x] `utils/e2eConfig.test.ts` — whole-file static scan; preserved.
- [x] `utils/e2eConfig.ts` — whole-file static scan; preserved.
- [x] `utils/gasClouds.test.ts` — whole-file static scan; preserved.
- [x] `utils/graphicsPrefScope.test.ts` — whole-file static scan; preserved.
- [x] `utils/graphicsQuality.test.ts` — whole-file static scan; preserved.
- [x] `utils/graphicsQuality.ts` — whole-file static scan; preserved.
- [x] `utils/gridLattice.test.ts` — whole-file static scan; preserved.
- [x] `utils/gridLattice.ts` — whole-file static scan; preserved.
- [x] `utils/gridWells.ts` — whole-file static scan; preserved.
- [x] `utils/habitability.test.ts` — whole-file static scan; preserved.
- [x] `utils/habitabilityState.ts` — whole-file static scan; preserved.
- [x] `utils/haptics.ts` — whole-file static scan plus focused semantic review of optional native rejection and fixed diagnostics; changed in this continuation.
- [x] `utils/haptics.test.ts` — new focused synchronous/asynchronous native diagnostic regressions; reviewed in full.
- [x] `utils/hitTarget.test.ts` — whole-file static scan; preserved.
- [x] `utils/hitTarget.ts` — whole-file static scan; preserved.
- [x] `utils/inspectorSections.test.ts` — whole-file static scan; preserved.
- [x] `utils/inspectorSections.ts` — whole-file static scan; preserved.
- [x] `utils/keplerOrbit.test.ts` — whole-file static scan; preserved.
- [x] `utils/keplerOrbit.ts` — whole-file static scan; preserved.
- [x] `utils/moonCreation.test.ts` — whole-file static scan; preserved.
- [x] `utils/moonCreation.ts` — whole-file static scan; preserved.
- [x] `utils/moonDraft.ts` — whole-file static scan; preserved.
- [x] `utils/moonSystem.ts` — whole-file static scan; preserved.
- [x] `utils/onboarding.test.ts` — whole-file static scan; preserved.
- [x] `utils/onboarding.ts` — whole-file static scan; preserved.
- [x] `utils/orbitControls.ts` — whole-file static scan; preserved.
- [x] `utils/orbitPaths.test.ts` — whole-file static scan; preserved.
- [x] `utils/orbitPaths.ts` — whole-file static scan; preserved.
- [x] `utils/outlinerModel.test.ts` — whole-file static scan; preserved.
- [x] `utils/outlinerModel.ts` — whole-file static scan; preserved.
- [x] `utils/physicsBounds.test.ts` — whole-file static scan; preserved.
- [x] `utils/physicsBounds.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/physicsBridge.ts` — whole-file static scan; preserved.
- [x] `utils/physicsDerivation.test.ts` — whole-file static scan; preserved.
- [x] `utils/physicsHotPath.test.ts` — whole-file static scan; preserved.
- [x] `utils/physicsPolicy.test.ts` — whole-file static scan; preserved.
- [x] `utils/physicsSoA.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/physicsUtils.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/presetViews.ts` — whole-file static scan; preserved.
- [x] `utils/productionConsole.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/realSystems.test.ts` — whole-file static scan; preserved.
- [x] `utils/relativity.test.ts` — whole-file static scan; preserved.
- [x] `utils/relativity.ts` — whole-file static scan; preserved.
- [x] `utils/releaseRegression.test.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/renderBridge.ts` — whole-file static scan; preserved.
- [x] `utils/renderPosition.test.ts` — whole-file static scan; preserved.
- [x] `utils/renderPosition.ts` — whole-file static scan; preserved.
- [x] `utils/scientificPresets.test.ts` — whole-file static scan; preserved.
- [x] `utils/scientificStep.ts` — whole-file static scan; preserved.
- [x] `utils/scratchVectors.ts` — whole-file static scan; preserved.
- [x] `utils/simRate.test.ts` — whole-file static scan; preserved.
- [x] `utils/simRate.ts` — whole-file static scan; preserved.
- [x] `utils/simulationSnapshot.ts` — whole-file static scan; preserved.
- [x] `utils/store.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/testBridge.ts` — whole-file static scan plus focused review of test-only retained-heap report interface; changed in this continuation.
- [x] `utils/timeState.test.ts` — whole-file static scan; preserved.
- [x] `utils/timeState.ts` — whole-file static scan; preserved.
- [x] `utils/units.ts` — whole-file static scan; changed for the remediation described above.
- [x] `utils/webgl2Support.test.ts` — whole-file static scan; preserved.
- [x] `utils/webgl2Support.ts` — whole-file static scan; preserved.
- [x] `utils/worldStorage.test.ts` — whole-file static scan plus focused review of capacity, failure-boundary and spin round-trip regressions; changed in this continuation.
- [x] `utils/worldStorage.ts` — whole-file static scan plus focused semantic review of capacity, migration, multi-key ordering and rollback boundaries; changed for the remediation described above.
- [x] `vite-env.d.ts` — whole-file static scan; preserved.
- [x] `vite.config.ts` — whole-file static scan plus focused semantic review of middleware ordering, loopback binding and development CORS; changed for the remediation described above.
- [x] `vitest.config.ts` — whole-file static scan; changed for the remediation described above.

## Final verification update

- `npm run test:e2e -- --workers=2`: **PASS, 138 passed / 29 skipped / 0 failed**, stable application sources. This rerun resolves the intermediate failures; development reloads during the earlier run invalidated its state/metrics measurements.
- Skip classification: desktop-only/phone-only viewport cases, touch-only gestures, duplicate desktop onboarding coverage, six optional screenshot-capture specs, and the stress test requiring explicit duration. The serial stress run enables that last condition. No skip was added to hide a failure. Screenshot regeneration is deliberately not run against the user's existing screenshots.
- `git diff --check`: PASS. `git diff --numstat -- package.json package-lock.json`: empty. SHA-256 for both files exactly matches the baseline above.

- Final numerical/storage regression update: `npm test` PASS, **558 tests / 39 files** after paused-parent deletion fix. The new test was first observed failing (`parentId` remained set), then passed after store deletion immediately detached the rail while preserving inertial position and velocity. `utils/releaseRegression.test.ts` changed for this fixture.
- Additional archive review: menu now refreshes on cross-tab storage changes and displays worlds whose folder is missing under independent systems. A browser regression verifies both immediate refresh and reload. `components/inspector/InspectorHeader.tsx` now disables deletion in a read-only session.
- `$env:PERF_SOAK_MS='10000'; npm run test:e2e -- e2e/perf.spec.ts --workers=1`: PASS **5/5**, including stress and the unchanged allocation assertion. Average FPS: minimal 61.8; 20-body stress 60.4; Solar System 60.4; low-tier rendering profile 60.5. No context losses; reported heap samples stayed flat at 48.1–51.0 MB. Browser heap sampling is coarse and ten seconds is not a long-session leak proof.
- `node scripts/production-smoke.mjs`: PASS on rebuilt production assets, with zero unexpected outbound requests, resource errors or raw injected rejection details.
- `node node_modules/@capacitor/cli/bin/capacitor copy android`: PASS; only generated Android assets/configuration refreshed.
- JDK21 + `android/gradlew.bat -p android :app:assembleRelease :app:lintRelease :app:testDebugUnitTest --offline --no-daemon`: PASS, 401 tasks, unsigned APK assembled. Native unit test: 1 passed / 0 failed. Instrumentation/device tests were not executed. Full lint runs even where redundant lintVital tasks are skipped.
- Release lint has **20 warnings, zero errors**: five unused-resource, five launcher-shape, two monochrome-icon, one density-size, one duplicate-config, one icon-location and five duplicate-icon warnings. These concern existing visual resources; artwork was preserved. They are documented non-blocking cosmetic/packaging risks. Gradle also reports the existing newDsl=false deprecation and flatDir metadata limitation; versions/configuration compatibility was preserved.
- Refreshed full and production npm audits retain exactly **21** and **1** affected packages respectively, exit 1 for findings. Deprecation metadata additionally marks nested glob 9.3.5, nested tar 6.2.1, q 1.5.1, three-mesh-bvh 0.7.8 and uuid 7.0.3. Tar/uuid findings are classified above; the others are maintenance risks, not evidence of malicious code or a runtime exploit. No dependency change was made.

- Final complete browser run: `npm run test:e2e -- --workers=2` **PASS, 139 passed / 29 conditional skips / 0 failures** after the archive visibility and read-only controls fixes. Subsequent PostCSS-only configuration mitigation is separately covered by unit/build/production-smoke validation.
- Final unit run including build isolation: `npm test` **PASS, 560 tests / 40 files**. The PostCSS default-parsing control reproduces the vulnerable behavior; project map:false suppresses it. No installed package changed.
- Final focused UI run before the last archive-visibility addition: `npm run test:e2e -- e2e/release.spec.ts e2e/storageOwnership.spec.ts e2e/menu.spec.ts e2e/moonCreation.spec.ts --workers=2`: 55 passed / 1 touch-only skip. The complete 139-pass run supersedes this focused result.

- Final `npm run build`: PASS, including typecheck, after PostCSS mitigation; final `node scripts/production-smoke.mjs`: PASS.
- Final Android assets recopied; offline `:app:assembleRelease :app:lintRelease :app:testDebugUnitTest --console=plain` PASS again (401 tasks, 8 executed, 393 up-to-date). The unsigned APK has 22 public asset files, includes third-party notices and matches final dist/index.html. No .map, .git, .env or e2e fixture files were found in its public assets. APK SHA-256: `4bc6c53946f161c7dd971c0f7c112ec318bf4c79638fa414a0f2649cf185cc89` (3,836,482 bytes). This is an unsigned validation artifact, not a publishable release.
- Final static scan: 282 files including 33 binaries (the untracked user thumbnail included), zero detected secret patterns and zero accidental machine-path matches. The scanner itself accounts for its one provenance and one executable-input pattern match. Final dependency tree has no npm-reported problems; ignore allow/deny checks pass. Local .cache evidence is disposable and not shipped.
- Final diff review includes all changed source/configuration/test files and this report. No dependency declaration/version or lockfile byte changed; no push, history rewrite or installed-package patch occurred. The user's thumbnail is preserved. The subsequent commit was explicitly authorized on 19 September.

The latest results above supersede intermediate counts while retaining the failure history. Readiness is conditional on resolving the named blockers and external release checks; no claim of full security or scientific exactness is made.

- [x] `utils/buildSafety.test.ts` — whole-file static scan and focused build-input regression review.


## Continuation — 15 September 2026

User requested more fixes plus a prompt for a separate chat. Rechecked git status/diff and preserved all accumulated edits. Two storage failures were reproduced by new regression tests before remediation:

- Archive writers could append a 10,001st record even though readers reject more than 10,000. Both metadata write paths now enforce the same capacity before writing, preserving the readable original.
- A stale collection selected after another tab deletes it could become a new dangling folder reference. Creating or moving a world now verifies the destination against current collection metadata within the caller's archive lock. Failure leaves the previous metadata intact.

Changed `utils/worldStorage.ts` and `utils/worldStorage.test.ts`; added `docs/NEXT_CHAT_PROMPT.md` with the requested handoff, frozen-dependency constraints and outstanding review work. The new tests initially failed (both expected throws absent); after fixes `npm test` passed **562 tests / 40 files**. Remaining UI review includes async rename draft preservation; deeper semantic/device/long-session coverage remains explicitly outstanding. Release is still BLOCKED, not certified complete.

Continuation validation: `npm run build` PASS (includes typecheck); `npm run test:e2e -- e2e/menu.spec.ts e2e/storageOwnership.spec.ts --workers=2` PASS **33/33**, no skips; `node scripts/production-smoke.mjs` PASS. Both package hashes still match the original baseline. The last complete browser/performance/Android runs remain those dated above; the existing unsigned APK predates this continuation and must be recopied/rebuilt before release. No claim is made that it includes today's two fixes.

## Continuation — 19 September 2026

Release gate remains **BLOCKED**. This continuation started from a clean `release-readiness-fixes` checkout and preserved `thumbnail.png`, which Git currently identifies as tracked (the older inventory's “untracked” description is stale). No package declaration, lockfile or installed dependency was changed. The freeze remains in force.

The file checklist above records whole-file static scanning, not a claim that each listed file has received semantic review. This continuation semantically traced archive callbacks through `components/MainMenu.tsx`, `utils/worldOwnership.ts`, `utils/worldStorage.ts` and `utils/browserStorage.ts`; optional native haptic failure flow; Vite middleware ordering; the `gridWells`/`gridLattice` profile comparison; and the indicated numerical collision and performance paths. Shader and UI searches plus existing WebGL compilation tests are useful evidence, but they do not amount to exhaustive per-device shader or UI semantic review. In particular, no assertion of such exhaustive completion is made here.

Confirmed regressions were observed failing before fixes: asynchronous rename drafts were dismissed on a rejected archive lock; Vite served `__open-in-editor` with HTTP 200; and a failed index rollback skipped restoration of deleted world data. Archive rename, move and delete callbacks now return explicit success/failure results. Failed rename drafts and deletion confirmations stay open, errors remain in an archive-level alert, cancellation restores original names, and pending controls reject duplicate submission. Rollback now attempts each captured key independently and reports secondary recovery failures. Per-key localStorage writes are still not a durable multi-key transaction; process termination can leave an interrupted operation, so backups and recovery remain essential.

Both metadata lists have a 10,000-entry read/write cap. New tests cover world-index capacity, folder capacity, delayed and unavailable Web Locks, concurrent archive writers, create/delete boundaries, quota/no-op verification and migration-backup preservation. Numerical additions test unchanged bodies and conserved quantities on over-limit contact and intrinsic angular accounting through consecutive mergers; Settings now explicitly notes that over-limit products do not merge or truncate. Existing reverse-playback, dyadic-step, high-speed and snapshot tests remain active, but their coverage is not presented as proof of every physical edge case.

The development server remains bound to `127.0.0.1`. A pre-Vite middleware now returns 404 for `__open-in-editor`, and permissive development CORS is disabled. A browser regression first reproduced the installed endpoint returning 200, then passed with the guard. This is configuration-scoped containment, not remediation of frozen Vite 6.4.2; bypassing this config remains unsafe. Native haptic failures now emit only the fixed `Aether: native-haptic-failed` diagnostic, without exception text; synchronous and rejected-promise paths are unit tested.

Primary advisories rechecked 19 September: Vite 6.4.2 remains below 6.4.3 for the [Windows file-deny issue](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) and [editor UNC issue](https://github.com/advisories/GHSA-v6wh-96g9-6wx3). Installed Sharp 0.32.6 remains below the patched releases for [libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) and [libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). Installed tar paths remain subject to [hardlink traversal](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) and [recursion DoS](https://github.com/advisories/GHSA-r292-9mhp-454m) among the previously documented findings. Installed root `cap copy android` copies built assets without tar extraction; `@capacitor/assets` directly processes images with vulnerable Sharp, and asset generation, platform addition, migration and other tar-consuming commands stay prohibited until an authorized dependency remediation. Neither scoped command use nor the configured Vite guard makes the audit clean.

Android lint's 20 existing warnings were reviewed by resource: five unused items (`activity_main`, Cordova `config`, `package_name`, `custom_url_scheme`, `AppTheme.NoActionBar`); five density variants of square legacy launcher artwork; two adaptive icon monochrome omissions; one landscape splash DIP-size mismatch; one generic/land-mdpi identical splash; one bitmap in the densityless drawable folder; five density variants where launcher and foreground icon art are identical. The unused XML/strings/style may be Capacitor/Cordova integration resources; deleting them without a generator/device check is not justified. Icon and splash warnings are real artwork/placement risks, but no replacement art or provably safe relocation was established. None was suppressed or deleted merely to clear lint.

Validation chronology and final results:

- Pre-soak unit run: 572 tests / 41 files PASS; typecheck/build and production smoke PASS. Focused archive/Vite browser regressions: 5/5 PASS. Short serial performance instrumentation: 5/5 PASS, forced-GC retained-heap deltas 0.7–1.8 MiB, zero context losses.
- A complete two-worker browser run had 143 passed, 29 conditional skips and one phone-grid well-core ratio failure (2.089 > 1.75). Both grid tests passed unchanged in isolation. A complete one-worker rerun with stable application sources passed **144 tests, 29 conditional skips, zero failures**. This supports a concurrency-sensitive/intermittent observation, not a claim that the first failure never occurred; screenshot baselines were not regenerated and no assertion was relaxed.
- `PERF_SOAK_MS=600000`, one Playwright worker: **5/5 PASS**, including four 10-minute scenarios plus the original hot-path allocation assertion. Minimal: 3 bodies, 65.4 average FPS, p95 frame time 18.10 ms, retained heap 22.4→23.5 MiB (+1.1). Stress: 20 bodies, 60.3 FPS, p95 17.90 ms, 24.6→25.3 MiB (+0.7). Solar System: 21 bodies, 60.2 FPS, p95 17.90 ms, 24.8→25.7 MiB (+0.9). Performance graphics: 3 bodies, 60.3 FPS, p95 18.00 ms, 22.3→23.4 MiB (+1.2). Each had zero WebGL context losses and met its existing FPS floor. The new retained-heap gate is delta ≤ max(32 MiB, 50% of start), measured with forced Chromium GC. `perf-metrics-report-600000.json` preserves the full JSON after the complete browser suite overwrote its default short-run report; its SHA-256 is `56DCBDD00F6295E6DB82695BB502759B9FFFBE91D2A6D9E165A75F3067B5A4DD`. These are long desktop/headless runs, not physical Android evidence.
- Additional test-only fixtures cover core-collapse lost angular momentum, intrinsic spin in compact accretion, undo snapshot copies, serialized/storage-reloaded spin and the exact dyadic timestep floor. Final `npm test`: **574 tests / 41 files PASS**. Final `npm run build` (including typecheck): PASS; `node scripts/production-smoke.mjs`: PASS with local-only requests, CSP, no maps/test bridge and redacted rejection. Application sources were not edited during the final browser or soak runs.
- Final `dist` was copied with the installed root Capacitor CLI using `cap copy android`; no asset generation or tar extraction was invoked. Offline Gradle `:app:assembleRelease :app:lintRelease :app:testDebugUnitTest --no-daemon --console=plain` passed, 401 actionable tasks (23 executed, 378 up-to-date). Since the native unit task was initially up-to-date with an older XML result, `:app:testDebugUnitTest --offline --no-daemon --console=plain --rerun-tasks` was then run: PASS, 112/112 tasks executed, current XML dated 19 September, one test / zero failures. Release lint remains 0 errors / 20 warnings with the resource dispositions above; existing newDsl and flatDir Gradle warnings remain.
- The rebuilt unsigned APK is 3,837,162 bytes, SHA-256 `A0E09622FAB33A1A06EADC0E50D31DF8D97B731A53D27C52B6BAB3002526FE04`. All 20 final `dist` files are byte-identical to packaged `assets/public` entries; two additional packaged files are Cordova bootstrap scripts. No source maps, env, Git or E2E fixture assets were found in public entries. The merged release manifest requires ES 3.0, includes VIBRATE, disables backup and cleartext, has a non-exported FileProvider and no INTERNET permission. The artifact is unsigned, untested on a physical device and not publishable.
- Final `git diff --check` passed. Both package hashes match the original baseline (`package.json` `09587B0A3D275246359E513A36BFDB651EA1FF4FC598B74792AE26BC95D6677F`; lockfile `B4388531BCE0369E9E9F55997969069E288F5792504542FC715C9F1C100B1566`); `git diff --numstat -- package.json package-lock.json` is empty. `thumbnail.png` remains tracked and unchanged (SHA-256 `BA4BCE4F1778A9C7A7D0B00DB8B468BB0DD42B9245FD69AA1E9275A800956483`). No push, reset, cleanup, signing, publication or dependency installation occurred. A commit was subsequently authorized on 19 September.

The remaining 19 September actions required explicit authorization for dependency remediation (Sharp, tar, nested Capacitor assets/CLI, Vite), followed by repeat validation. That authorization was given on 20 September. The 19 September status at the time of that freeze remained **BLOCKED**.

## Continuation — 20 September 2026

Publisher authorized targeted supply-chain remediation: remove unused `@capacitor/assets`, pin patched Vite 6.x, keep React / Three / R3F / Capacitor runtime frozen. `npm install --ignore-scripts` was used; the known local `postinstall` ProGuard patch was then run once.

### Supply chain

- Removed `@capacitor/assets` (303 nested packages, including sharp 0.32.6 and tar 6.2.1). Icons remain committed; regeneration is Icon Kitchen / manual only ([ICONS_README.md](../ICONS_README.md)).
- Pinned `vite` to **6.4.3** (GHSA-fx2h-pf6j-xcff, GHSA-v6wh-96g9-6wx3). Loopback bind, CORS off, and `__open-in-editor` 404 remain as defense in depth.
- Overrode `tar` to **7.5.22** (Capacitor CLI 8 still needs tar; 7.5.15 was in the critical range `<=7.5.20`).
- Pinned `postcss` to **8.5.28**. Existing `map: false` regression still passes.
- Pinned `@types/react` / `@types/react-dom` to 18.3.x matching `react@18.3.1`.
- App version aligned to **1.6.0** (`package.json` and Android `versionName`); `versionCode` **5**.
- `npm run audit:gate` PASS: all lock `resolved` URLs are `registry.npmjs.org`, integrity present, no sharp/`@capacitor/assets`, production audit has no high/critical, remaining findings match [scripts/audit-allowlist.json](../scripts/audit-allowlist.json).
- `npm audit --omit=dev`: fflate moderate only (not in `.cache/audit/bundled-packages.json`).
- Full tree: 9 findings (2 low, 3 moderate, 3 high, 1 critical). Critical is Vitest with `api: false`. High leftovers are `@xmldom/xmldom`, `brace-expansion`, `browserslist` (repository-controlled tooling inputs).

CI freeze-diff replaced with the audit gate, Dependabot (majors ignored for React/Three/R3F/Capacitor), [SECURITY.md](../SECURITY.md), `engines.node >= 22`, and [scripts/android-manifest-gate.mjs](../scripts/android-manifest-gate.mjs).

### Application

- Read-only viewers: `setSpeed` is a no-op; ControlBar disables undo/redo/pause/speed; unit + two-tab e2e coverage.
- Grid-ratio flake: `e2e/gridMobileVisual.spec.ts` polls consecutive well snapshots instead of a 700 ms sleep. `--workers=2` run passed (including that spec). `MAX_CORE_RATIO` was not relaxed.
- Haptic failures go through `reportDiagnostic('native-haptic-failed')`.
- SpaceCanvas: debris `BufferGeometry` is now disposed on budget change/unmount. Context-loss, grid geometry, body-group, and window listeners already cleaned up; no shader rewrite.

### Android / Play packaging

- Adaptive monochrome vector added; lint warnings **20 → 18** (the two monochrome omissions are gone). Unused Cordova strings and launcher-shape/density warnings kept.
- `minifyEnabled false` unchanged.
- Data safety sheet in [ANDROID_BUILD.md](../ANDROID_BUILD.md). Publisher checklist in [docs/NEXT_CHAT_PROMPT.md](NEXT_CHAT_PROMPT.md).

### 20 September validation

- `npm test`: **575 tests / 42 files PASS**.
- `npm run build` (typecheck + Vite 6.4.3): PASS. fflate not in bundled notices.
- `node scripts/production-smoke.mjs`: PASS.
- `node scripts/repository-audit.mjs`: 0 secret patterns, 0 machine paths, no unusual lock sources.
- `npm run test:e2e -- --workers=2`: **144 passed / 29 skipped / 0 failed**.
- Serial `e2e/perf.spec.ts`: 4 passed, stress skipped (`PERF_SOAK_MS` default). Minimal 60.5 FPS heap delta +0.7 MiB; Solar System 60.6 FPS +0.3 MiB; performance profile 60.5 FPS +0.9 MiB; allocation assertion passed. 10-minute soaks were not rerun (physics hot path unchanged).
- `cap copy android` via root CLI 8: PASS, no tar extraction.
- Offline Gradle `:app:assembleRelease :app:bundleRelease :app:lintRelease`: PASS, 410 tasks. Lint **0 errors / 18 warnings**.
- `:app:testDebugUnitTest --rerun-tasks`: PASS, 112/112 tasks executed.
- Merged release manifest: versionCode 5 / 1.6.0, ES 3.0, VIBRATE, no INTERNET, cleartext false, backup false, FileProvider not exported.
- Unsigned APK 3,838,030 bytes, SHA-256 `988BFADE8B537A6EAA083853CC3513ADC333E86516F2EFB08BCE07E9FA325470`. Unsigned AAB 3,676,235 bytes, SHA-256 `3C93D49624150D0953193F4FCB6BD7696280BCA0A8546DC8ADD7CD2C51890E33`.
- package.json SHA-256 `274C498ABB94E34B2BD0C54DE973E6E543AF07C67C387C3DDF0B64BABB0A39F4`; lockfile `B0861B2639C30163C65D884B9B112E4AD373983C4EFAA0520FECE8197207EBD4`.
- `thumbnail.png` unchanged (`BA4BCE4F1778A9C7A7D0B00DB8B468BB0DD42B9245FD69AA1E9275A800956483`).
- `git diff --check` reported only CRLF normalization warnings on edited text files.

### Remaining publisher-only gates (not claimed passed)

- Sign the AAB with the existing Play upload key (outside the repo).
- Physical-device / thermal / instrumentation matrix on the signed artifact.
- Play Console Data safety, listing assets, hosted TermsFeed eyeball-check.
- GitHub branch protection, secret scanning, push protection, 2FA.
- Exhaustive per-device shader/UI review.

Unverified external checks remain assumptions. In-repo status: **READY WITH DOCUMENTED NON-BLOCKING RISKS**.

- [x] `SECURITY.md` — new private-report policy.
- [x] `.github/dependabot.yml` — weekly npm (majors ignored for runtime) and monthly Actions.
- [x] `scripts/audit-gate.mjs`, `scripts/audit-allowlist.json`, `scripts/android-manifest-gate.mjs`.
- [x] `utils/storeReadOnly.test.ts`.
- [x] `android/app/src/main/res/drawable/ic_launcher_monochrome.xml`.
