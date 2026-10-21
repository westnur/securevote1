import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { Alert, Spinner } from "./ui";

/**
 * Route guard. This is a USABILITY feature only — it hides pages the user cannot use.
 * Real authorization is enforced by the backend API and the smart contract.
 */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { me, loading, hasRole, signedOut } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Loading session…" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={signedOut ? undefined : { from: location.pathname }} />;
  if (roles && !hasRole(...roles)) {
    return (
      <Alert tone="amber" title="Not available for your role">
        This page requires one of the roles: {roles.join(", ").toLowerCase()}.
      </Alert>
    );
  }
  return <>{children}</>;
}
