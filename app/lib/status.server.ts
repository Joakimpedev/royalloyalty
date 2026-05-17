// Centralised state machine for Redemption and Referral. Every status change
// goes through here — never update status directly via Prisma. Add side effects
// here in later phases; never change the transition table.
import prisma from "../db.server";
import type { RecordStatus } from "@prisma/client";

const ALLOWED: Record<RecordStatus, RecordStatus[]> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED", "REVERSED"],
  COMPLETED: ["REVERSED"],
  CANCELLED: [],
  REVERSED: [],
};

export async function transitionStatus(
  model: "redemption" | "referral",
  recordId: string,
  newStatus: RecordStatus,
) {
  const client: any = (prisma as any)[model];
  const rec = await client.findUnique({ where: { id: recordId } });
  if (!rec) throw new Error(`${model} ${recordId} not found`);
  const current = rec.status as RecordStatus;
  if (!ALLOWED[current]?.includes(newStatus)) {
    throw new Error(`Illegal ${model} transition ${current} → ${newStatus}`);
  }
  return client.update({
    where: { id: recordId },
    data: { status: newStatus, statusChangedAt: new Date() },
  });
}
