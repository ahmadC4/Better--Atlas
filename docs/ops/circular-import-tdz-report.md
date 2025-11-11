# Circular Import / Temporal Dead Zone Report

## Overview

A review of the Atlas AI frontend bundler warnings was conducted to determine whether recent Vite overlay errors were caused by circular module dependencies or temporal dead zone (TDZ) issues.

## Tooling

- `npx madge` (currently failing in CI because the registry is locked down)
- Custom depth-first search (DFS) cycle detector that walks `client/src`

The custom DFS completed successfully without flagging any static circular dependencies.

## Findings

- The Vite overlay warnings originate from HTTP method misuse rather than a module cycle.
- No circular imports were detected by the custom DFS scanner.

## Recommendations

1. **Maintain the custom cycle scanner in CI.** This protects against regressions while `madge` remains unavailable.
2. **Unblock `madge`.** Vendor the dependency or expose it through an approved Artifactory mirror so the CI check can run reliably.
3. **Harden HTTP client usage.** Centralise HTTP requests through the existing `apiRequest` helper to prevent TDZ scenarios caused by misordered imports.
4. **Add unit tests.** Cover request signatures to guard against accidental regressions that could recreate the TDZ condition.

## Next Steps

- File an infrastructure ticket to restore `npx madge` execution in locked-down environments.
- Land CI wiring for the custom DFS scan if it is not already enforced.
- Extend the unit test suite around `apiRequest` consumers as new endpoints are added.
