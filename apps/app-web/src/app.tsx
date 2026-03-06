import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OrganizationProvider } from "./contexts/OrganizationContext";
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
const GuidePage = lazy(() => import("./pages/guide"));
const SettingsPage = lazy(() => import("./pages/settings"));
const SourceUploadPage = lazy(() => import("./pages/source-upload"));
const FactCheckPage = lazy(() => import("./pages/fact-check"));
const SpecCatalogPage = lazy(() => import("./pages/spec-catalog"));
const SpecDetailPage = lazy(() => import("./pages/spec-detail"));
const ExportCenterPage = lazy(() => import("./pages/export-center"));
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <OrganizationProvider>
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Layout><UploadPage /></Layout></ProtectedRoute>} />
            <Route path="/analysis" element={<ProtectedRoute><Layout><AnalysisPage /></Layout></ProtectedRoute>} />
            <Route path="/analysis-report" element={<ProtectedRoute><Layout><AnalysisReportPage /></Layout></ProtectedRoute>} />
            <Route path="/hitl" element={<ProtectedRoute><Layout><HITLReviewPage /></Layout></ProtectedRoute>} />
            <Route path="/ontology" element={<ProtectedRoute><Layout><OntologyPage /></Layout></ProtectedRoute>} />
            <Route path="/skills" element={<ProtectedRoute><Layout><SkillCatalogPage /></Layout></ProtectedRoute>} />
            <Route path="/skills/:id" element={<ProtectedRoute><Layout><SkillDetailPage /></Layout></ProtectedRoute>} />
            <Route path="/api-console" element={<ProtectedRoute><Layout><ApiConsolePage /></Layout></ProtectedRoute>} />
            <Route path="/trust" element={<ProtectedRoute><Layout><TrustDashboardPage /></Layout></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><Layout><AuditPage /></Layout></ProtectedRoute>} />
            <Route path="/guide" element={<ProtectedRoute><Layout><GuidePage /></Layout></ProtectedRoute>} />
            <Route path="/source-upload" element={<ProtectedRoute><Layout><SourceUploadPage /></Layout></ProtectedRoute>} />
            <Route path="/fact-check" element={<ProtectedRoute><Layout><FactCheckPage /></Layout></ProtectedRoute>} />
            <Route path="/specs" element={<ProtectedRoute><Layout><SpecCatalogPage /></Layout></ProtectedRoute>} />
            <Route path="/specs/:id" element={<ProtectedRoute><Layout><SpecDetailPage /></Layout></ProtectedRoute>} />
            <Route path="/export" element={<ProtectedRoute><Layout><ExportCenterPage /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
            <Route path="*" element={<ProtectedRoute><Layout><NotFoundPage /></Layout></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
