import type { Organization, OrganizationMembership, User } from "@prisma/client";

export type MembershipWithOrg = OrganizationMembership & { organization: Organization };

export interface AuthContext {
  user: Pick<User, "id" | "email" | "displayName" | "walletAddress">;
  memberships: MembershipWithOrg[];
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
    }
  }
}
