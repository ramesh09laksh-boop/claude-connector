import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/auth-schema";
import { activityLog } from "@/lib/db/schema";

/**
 * Organisations where this user is the only Owner.
 *
 * Deleting them would leave an organisation nobody can administer: no one to
 * add members, change roles, or delete it. The build sheet calls this out and
 * it is specific to Lanes having tenants.
 */
export async function soleOwnedOrganizations(userId: string) {
  const owned = await db
    .select({ organizationId: member.organizationId, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));

  const orphaned: { organizationId: string; name: string }[] = [];

  for (const org of owned) {
    const otherOwners = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, org.organizationId),
          eq(member.role, "owner"),
          ne(member.userId, userId),
        ),
      )
      .limit(1);

    if (otherOwners.length === 0) orphaned.push(org);
  }

  return orphaned;
}

export class SoleOwnerError extends Error {
  constructor(public organizations: { organizationId: string; name: string }[]) {
    const names = organizations.map((o) => o.name).join(", ");
    super(
      `You're the only owner of ${names}. Transfer ownership to someone else, or delete the organisation, then come back and delete your account.`,
    );
    this.name = "SoleOwnerError";
  }
}

/** Throws when deletion would orphan an organisation. Called from beforeDelete. */
export async function assertUserCanBeDeleted(userId: string) {
  const orphaned = await soleOwnedOrganizations(userId);
  if (orphaned.length > 0) throw new SoleOwnerError(orphaned);
}

/**
 * The account row is gone by now. `card.assignee_id` and `card.created_by_id`
 * are `set null`, so cards survive unassigned — that is deliberate, not a leak.
 */
export async function cleanUpDeletedUser(userId: string) {
  await db.insert(activityLog).values({
    userId: null,
    action: "account.deleted",
    detail: { userId },
  });
}
