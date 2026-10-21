import { Suspense } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { EducationalBanner } from "./EducationalNotice";
import { NetworkIndicator } from "./NetworkIndicator";
import { Badge, Button, cx, Spinner } from "./ui";
import { WalletControl } from "./WalletControl";

const NAV: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/elections", label: "Elections" },
  { to: "/app/organizer", label: "Organizer", roles: ["ORGANIZER"] },
  { to: "/app/audit", label: "Audit", roles: ["ADMIN", "AUDITOR", "ORGANIZER"] },
  { to: "/app/settings", label: "Organization & settings" },
];

const ROLE_TONE: Record<Role, "blue" | "violet" | "green" | "amber"> = {
  ADMIN: "amber",
  ORGANIZER: "violet",
  SHAREHOLDER: "green",
  AUDITOR: "blue",
};

export function AppShell() {
  const { me, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.roles || hasRole(...n.roles));
  const primary = me?.memberships[0];

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-3 focus:py-1"
      >
        Skip to content
      </a>
      <EducationalBanner />
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r border-navy-800 bg-navy-900/60 md:block">
          <div className="sticky top-0 flex h-screen flex-col p-4">
            <div className="mb-8 flex items-center gap-2 px-2">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              <span className="text-lg font-semibold text-white">SecureVote</span>
            </div>
            <nav aria-label="Main" className="space-y-1">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/app"}
                  className={({ isActive }) =>
                    cx(
                      "block rounded-md px-3 py-2 text-sm",
                      isActive ? "bg-blue-600/20 text-white" : "text-slate-400 hover:bg-navy-800 hover:text-slate-100",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <p className="mt-auto px-2 text-[11px] leading-snug text-slate-500">
              Educational prototype · fictional organizations · local Hardhat chain (31337)
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800 bg-navy-900/40 px-4 py-3 md:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <nav aria-label="Mobile" className="flex gap-1 md:hidden">
                {items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/app"}
                    className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-navy-800"
                  >
                    {n.label.split(" ")[0]}
                  </NavLink>
                ))}
              </nav>
              <div className="text-sm">
                <span className="font-medium text-white">{me?.user.displayName}</span>
                {primary && <span className="text-slate-400"> · {primary.organizationName}</span>}
              </div>
              <div className="flex gap-1">
                {[...new Set(me?.memberships.flatMap((m) => m.roles))].map((r) => (
                  <Badge key={r} tone={ROLE_TONE[r]}>
                    {r.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <NetworkIndicator />
              <WalletControl />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await logout(); // completes the server-side session deletion first
                  navigate("/login", { replace: true });
                }}
              >
                Sign out
              </Button>
            </div>
          </header>
          <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <Suspense fallback={<Spinner label="Loading page…" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
