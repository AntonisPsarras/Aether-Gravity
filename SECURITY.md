# Security policy

## Supported versions

Security reports are accepted for the current Play Store / GitHub `main` release of Aether Gravity.

## Reporting a vulnerability

Please email **antonpsar10@gmail.com**. Do not open a public GitHub issue for a suspected vulnerability.

Include:

- The affected version (Android versionName / git revision if known)
- A description of the issue and its impact
- Steps or a minimal proof of concept that stays within legal testing of your own copy of the app

There is no bug-bounty program. You will receive a reply when the report has been triaged. Please give a reasonable window for a fix before any public disclosure.

## Scope notes

Aether Gravity is an offline sandbox. The production Android package is intended to ship without the INTERNET permission and without analytics, crash, or advertising SDKs. Please do not file reports that require adding network services, remote logging, or telemetry to “fix.”

Development-only surfaces (the Vite server, Playwright, Vitest) are not production attack surface when they are not running. Reports against those tools should go to their upstream maintainers unless a project configuration re-exposes them.
