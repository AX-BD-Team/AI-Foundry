import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";

// Persona A — Analyst
const UploadPage = lazy(() => import("./pages/upload.tsx"));
const PipelinePage = lazy(() => import("./pages/pipeline.tsx"));
const ComparisonPage = lazy(() => import("./pages/comparison.tsx"));

// Persona B — Reviewer
const ReviewQueuePage = lazy(() => import("./pages/review-queue.tsx"));
const ReviewDetailPage = lazy(() => import("./pages/review-detail.tsx"));

// Persona C — Developer
const SkillCatalogPage = lazy(() => import("./pages/skill-catalog.tsx"));
const SkillDetailPage = lazy(() => import("./pages/skill-detail.tsx"));

// Persona D — Client
const ResultsPage = lazy(() => import("./pages/results.tsx"));
const AuditPage = lazy(() => import("./pages/audit.tsx"));

// Persona E — Executive
const DashboardPage = lazy(() => import("./pages/dashboard.tsx"));
const CostPage = lazy(() => import("./pages/cost.tsx"));

// Common
const LoginPage = lazy(() => import("./pages/login.tsx"));
const NotFoundPage = lazy(() => import("./pages/not-found.tsx"));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/review" element={<ReviewQueuePage />} />
          <Route path="/review/:policyId" element={<ReviewDetailPage />} />
          <Route path="/skills" element={<SkillCatalogPage />} />
          <Route path="/skills/:skillId" element={<SkillDetailPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cost" element={<CostPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
