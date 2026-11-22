/**
 * Deal statuses a merchant may still edit. An ended or archived deal has nothing left to sell, and the
 * API refuses a save whose end date has passed.
 */
export const EDITABLE_DEAL_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'changes_requested',
  'in_review',
  'approved',
  'scheduled',
  'active',
  'paused',
]);
