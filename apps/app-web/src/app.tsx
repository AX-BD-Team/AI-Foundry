import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "./components/ui/sonner";
import { Layout } from "./components/Layout";

// Pages
const DashboardPage = lazy(() => import("./pages/dashboard"));
const LoginPage = lazy(() => import("./pages/login"));
const UploadPage = lazy(() => import("./pages/upload"));
const AnalysisPage = lazy(() => import("./pages/analysis"));
const HITLReviewPage = lazy(() => import("./pages/hitl"));
const OntologyPage = lazy(() => import("./pages/ontology"));
const SkillCatalogPage = lazy(() => import("./pages/skill-catalog"));
const SkillDetailPage = lazy(() => import("./pages/skill-detail"));
const ApiConsolePage = lazy(() => import("./pages/api-console"));
const TrustDashboardPage = lazy(() => import("./pages/trust"));
const AnalysisReportPage = lazy(() => import("./pages/analysis-report"));
const AuditPage = lazy(() => import("./pages/audit"));
const SettingsPage = lazy(() => import("./pages/settings"));
const NotFoundPage = lazy(() => import("./pages/not-found"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Layout><DashboardPage /></Layout>} />
            <Route path="/upload" element={<Layout><UploadPage /></Layout>} />
            <Route path="/analysis" element={<Layout><AnalysisPage /></Layout>} />
            <Route path="/analysis-report" element={<Layout><AnalysisReportPage /></Layout>} />
            <Route path="/hitl" element={<Layout><HITLReviewPage /></Layout>} />
            <Route path="/ontology" element={<Layout><OntologyPage /></Layout>} />
            <Route path="/skills" element={<Layout><SkillCatalogPage /></Layout>} />
            <Route path="/skills/:id" element={<Layout><SkillDetailPage /></Layout>} />
            <Route path="/api-console" element={<Layout><ApiConsolePage /></Layout>} />
            <Route path="/trust" element={<Layout><TrustDashboardPage /></Layout>} />
            <Route path="/audit" element={<Layout><AuditPage /></Layout>} />
            <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
            <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
