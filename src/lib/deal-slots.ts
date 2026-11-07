import { db } from "./db";

/**
 * Slot accounting for campaigns.
 *
 * `claimed_slots` used to be checked and then incremented in two separate
 * statements, so two concurrent submissions could both pass the check and
 * oversell a campaign (and pay out more refunds than budgeted). The claim is
 * now a single conditional UPDATE; the caller runs it inside the same
 * transaction as the order insert.
 */

/** Atomically take one slot. Returns false when the campaign is already full. */
export function claimDealSlot(dealId: number): boolean {
  const res = db
    .prepare(
      `UPDATE deals
          SET claimed_slots = claimed_slots + 1,
              stock = MAX(0, stock - 1)
        WHERE id = ?
          AND (total_slots = 0 OR claimed_slots < total_slots)`
    )
    .run(dealId);
  return res.changes === 1;
}

/** Give a slot back when an order is cancelled, rejected or deleted. */
export function releaseDealSlot(dealId: number | null | undefined): void {
  if (!dealId) return;
  db.prepare(
    `UPDATE deals
        SET claimed_slots = MAX(0, claimed_slots - 1),
            stock = stock + 1
      WHERE id = ?`
  ).run(dealId);
}
