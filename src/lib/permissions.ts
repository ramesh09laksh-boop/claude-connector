import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Organisation-role permissions. This is the `owner` / `admin` / `member` role
 * a person holds *inside an organisation* — it has nothing to do with the
 * platform-admin `user.role` flag that gates `/settings/system`.
 */
export const statement = {
  ...defaultStatements, // organization, member, invitation, team
  card: ["create", "update", "delete"],
  column: ["create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
  ...memberAc.statements,
  card: ["create", "update", "delete"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  card: ["create", "update", "delete"],
  column: ["create", "update", "delete"],
  team: ["create", "update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  card: ["create", "update", "delete"],
  column: ["create", "update", "delete"],
});

export const roles = { owner, admin, member };

/** The organisation roles, most privileged first. */
export const orgRoles = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof orgRoles)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (orgRoles as readonly string[]).includes(value);
}

/** Lower number = more privileged. Used to stop an Admin minting an Owner link. */
export function roleRank(role: OrgRole): number {
  return orgRoles.indexOf(role);
}
