import type { Election, Role } from "@prisma/client";
import type { AuthContext, MembershipWithOrg } from "../types/express.js";
import { forbidden, unauthorized } from "../lib/errors.js";

/**
 * Server-side authorization helpers. Every permission decision is made here from the
 * database membership of the authenticated user — never from data sent by the client.
 */

export function requireAuthContext(auth: AuthContext | undefined): AuthContext {
  if (!auth) throw unauthorized();
  return auth;
}

export function membershipFor(auth: AuthContext, organizationId: string): MembershipWithOrg | undefined {
  return auth.memberships.find((m) => m.organizationId === organizationId);
}

export function hasRole(auth: AuthContext, organizationId: string, ...roles: Role[]): boolean {
  const m = membershipFor(auth, organizationId);
  return !!m && m.roles.some((r) => roles.includes(r));
}

export function requireRole(auth: AuthContext, organizationId: string, roles: Role[], message?: string): MembershipWithOrg {
  const m = membershipFor(auth, organizationId);
  if (!m || !m.roles.some((r) => roles.includes(r))) throw forbidden(message);
  return m;
}

type ElectionRef = Pick<Election, "organizationId" | "createdById" | "status">;

/** Owner = the organizer who created the election (mirrors the contract's session organizer rule). */
export function isElectionOwner(auth: AuthContext, e: ElectionRef): boolean {
  return e.createdById === auth.user.id && hasRole(auth, e.organizationId, "ORGANIZER");
}

/**
 * Visibility rules:
 *  - ADMIN: every election of the organization (including drafts)
 *  - ORGANIZER: own drafts + all published elections of the organization
 *  - AUDITOR: published elections of the organization
 *  - SHAREHOLDER: published elections for which they are on the eligibility list
 */
export function canViewElection(auth: AuthContext, e: ElectionRef, isEligible: boolean): boolean {
  const m = membershipFor(auth, e.organizationId);
  if (!m) return false;
  const published = e.status === "PUBLISHED";
  return m.roles.some((role) => {
    switch (role) {
      case "ADMIN":
        return true;
      case "ORGANIZER":
        return published || e.createdById === auth.user.id;
      case "AUDITOR":
        return published;
      case "SHAREHOLDER":
        return published && isEligible;
      default:
        return false;
    }
  });
}

export function canCloseElection(auth: AuthContext, e: ElectionRef): boolean {
  return isElectionOwner(auth, e) || hasRole(auth, e.organizationId, "ADMIN");
}

export function canViewVoterList(auth: AuthContext, e: ElectionRef): boolean {
  return isElectionOwner(auth, e) || hasRole(auth, e.organizationId, "ADMIN", "AUDITOR");
}

export function canViewAudit(auth: AuthContext, e: ElectionRef): boolean {
  return hasRole(auth, e.organizationId, "ADMIN", "AUDITOR", "ORGANIZER");
}
