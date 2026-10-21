import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Pages inside the app are code-split so the landing and login pages load quickly.
const AuditDetailPage = lazy(() => import("./pages/AuditDetailPage").then((m) => ({ default: m.AuditDetailPage })));
const AuditListPage = lazy(() => import("./pages/AuditListPage").then((m) => ({ default: m.AuditListPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ElectionDetailPage = lazy(() => import("./pages/ElectionDetailPage").then((m) => ({ default: m.ElectionDetailPage })));
const ElectionsPage = lazy(() => import("./pages/ElectionsPage").then((m) => ({ default: m.ElectionsPage })));
const ManageElectionPage = lazy(() => import("./pages/ManageElectionPage").then((m) => ({ default: m.ManageElectionPage })));
const OrganizerPage = lazy(() => import("./pages/OrganizerPage").then((m) => ({ default: m.OrganizerPage })));
const ResultsPage = lazy(() => import("./pages/ResultsPage").then((m) => ({ default: m.ResultsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="elections" element={<ElectionsPage />} />
        <Route path="elections/:id" element={<ElectionDetailPage />} />
        <Route path="elections/:id/results" element={<ResultsPage />} />
        <Route
          path="organizer"
          element={
            <RequireAuth roles={["ORGANIZER"]}>
              <OrganizerPage />
            </RequireAuth>
          }
        />
        <Route
          path="organizer/elections/:id"
          element={
            <RequireAuth roles={["ORGANIZER", "ADMIN"]}>
              <ManageElectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="audit"
          element={
            <RequireAuth roles={["ADMIN", "AUDITOR", "ORGANIZER"]}>
              <AuditListPage />
            </RequireAuth>
          }
        />
        <Route
          path="audit/:id"
          element={
            <RequireAuth roles={["ADMIN", "AUDITOR", "ORGANIZER"]}>
              <AuditDetailPage />
            </RequireAuth>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
