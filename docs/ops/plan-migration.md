# Plan Alignment Runbook

This runbook documents how to reconcile legacy `users.plan` string assignments with the canonical `plans` table and Stripe price
metadata.

## Prerequisites
- Database credentials with permission to read and update the `users` table.
- Seeded `plans` table (run `./scripts/seed-plans.ts` first in new environments).
- The `STRIPE_PRICE_PLAN_MAP` environment variable populated wherever Stripe price → plan slug mappings are required.

## Dry-run validation
1. Export the necessary environment variables (`DATABASE_URL`, optional `STRIPE_PRICE_PLAN_MAP`).
2. Execute the migration script in dry-run mode (default):
   ```bash
   ./scripts/migrate-legacy-plans.ts --dry-run --verbose
   ```
3. Review the output for counts by reason and individual user adjustments. No data is modified during this pass.

## Applying updates
1. Schedule a brief maintenance window if large batches of users require updates.
2. Re-run the script with the `--apply` flag once the dry-run output is satisfactory:
   ```bash
   ./scripts/migrate-legacy-plans.ts --apply
   ```
3. Capture the JSON summary for audit logs if required:
   ```bash
   ./scripts/migrate-legacy-plans.ts --apply --json > plan-migration-report.json
   ```
4. Verify a sampling of users in the admin UI to confirm `planId`, `plan` slug, and entitlements match the intended plan.

## Post-deployment checklist
- Update billing automation (Stripe, coupons, partner promos) to reference plan slugs that exist in the admin UI.
- Record the canonical `planId` and slug for any manual upgrades performed during the maintenance window.
- Keep the runbook alongside deployment notes so future plan migrations remain deterministic across environments.
