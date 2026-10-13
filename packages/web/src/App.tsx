import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/AppShell";
import { trackArrival, track } from "./lib/analytics";
import { useAuth } from "./lib/auth";
import { AdminAnalyticsPage } from "./pages/AdminAnalyticsPage";
import { AdminPage } from "./pages/AdminPage";
import { AuthPage } from "./pages/AuthPage";
import { BillingPage } from "./pages/BillingPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { TeamPage } from "./pages/TeamPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

/**
 * One page_view per route, and the arrival signal once per session. Kept in
 * the router rather than in each page so a new page cannot forget to report.
 */
function usePageViews(): void {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      trackArrival();
      return;
    }
    track("page_view", location.pathname);
  }, [location.pathname]);
}

export default function App() {
  const { user, loading } = useAuth();
  usePageViews();

  // Wait for the token check before routing, otherwise a signed-in user gets
  // flashed the login screen on every refresh.
  if (loading) return <div className="spinner-note">Loading...</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Reachable signed out: people click the link from an email client
            on a device where they have never signed in. */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
