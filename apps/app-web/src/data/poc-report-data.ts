// ─── Raw markdown/code imports (Vite ?raw) ─────────────────────────────────
// Interview & PRD
import interviewLog from '../../../../반제품-스펙/interview-log.md?raw';
import prdFinal from '../../../../반제품-스펙/prd-final.md?raw';

// Spec documents (01~06)
import specBusinessLogic from '../../../../반제품-스펙/pilot-lpon-cancel/01-business-logic.md?raw';
import specDataModel from '../../../../반제품-스펙/pilot-lpon-cancel/02-data-model.md?raw';
import specFunctions from '../../../../반제품-스펙/pilot-lpon-cancel/03-functions.md?raw';
import specArchitecture from '../../../../반제품-스펙/pilot-lpon-cancel/04-architecture.md?raw';
import specApi from '../../../../반제품-스펙/pilot-lpon-cancel/05-api.md?raw';
import specScreens from '../../../../반제품-스펙/pilot-lpon-cancel/06-screens.md?raw';

// Working Version source code (domain + routes + index + db + auth)
import srcIndex from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/index.ts?raw';
import srcDb from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/db.ts?raw';
import srcAuth from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/auth.ts?raw';
import srcDomainCancel from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/domain/cancel.ts?raw';
import srcDomainCharging from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/domain/charging.ts?raw';
import srcDomainPayment from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/domain/payment.ts?raw';
import srcDomainRefund from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/domain/refund.ts?raw';
import srcRoutesCancel from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/routes/cancel.ts?raw';
import srcRoutesCharging from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/routes/charging.ts?raw';
import srcRoutesPayment from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/routes/payment.ts?raw';
import srcRoutesRefund from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/routes/refund.ts?raw';

// Test files
import testCancel from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/cancel.test.ts?raw';
import testCharging from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/charging.test.ts?raw';
import testPayment from '../../../../반제품-스펙/pilot-lpon-cancel/working-version/src/__tests__/payment.test.ts?raw';

// Sprint 2 — 자동 생성 엔진 코드
import engineOrchestrator from '../../../../services/svc-skill/src/prototype/orchestrator.ts?raw';
import engineDataModel from '../../../../services/svc-skill/src/prototype/generators/data-model.ts?raw';
import engineFeatureSpec from '../../../../services/svc-skill/src/prototype/generators/feature-spec.ts?raw';
import engineArchitecture from '../../../../services/svc-skill/src/prototype/generators/architecture.ts?raw';
import engineApiSpec from '../../../../services/svc-skill/src/prototype/generators/api-spec.ts?raw';
import engineClaudeMd from '../../../../services/svc-skill/src/prototype/generators/claude-md.ts?raw';
import engineCollector from '../../../../services/svc-skill/src/prototype/collector.ts?raw';

// ─── Exports ─────────────────────────────────────────────────────────────────

export const interview = interviewLog;
export const prd = prdFinal;

export const specDocs = [
  { id: 'business-logic', label: '01. 비즈니스 로직', labelEn: 'Business Logic', content: specBusinessLogic },
  { id: 'data-model', label: '02. 데이터 모델', labelEn: 'Data Model', content: specDataModel },
  { id: 'functions', label: '03. 기능 정의', labelEn: 'Functions', content: specFunctions },
  { id: 'architecture', label: '04. 아키텍처', labelEn: 'Architecture', content: specArchitecture },
  { id: 'api', label: '05. API 명세', labelEn: 'API Spec', content: specApi },
  { id: 'screens', label: '06. 화면 설계', labelEn: 'Screen Design', content: specScreens },
] as const;

export interface CodeFile {
  path: string;
  content: string;
  category: 'entry' | 'domain' | 'routes' | 'test';
}

export const codeFiles: CodeFile[] = [
  // Entry
  { path: 'src/index.ts', content: srcIndex, category: 'entry' },
  { path: 'src/db.ts', content: srcDb, category: 'entry' },
  { path: 'src/auth.ts', content: srcAuth, category: 'entry' },
  // Domain
  { path: 'src/domain/cancel.ts', content: srcDomainCancel, category: 'domain' },
  { path: 'src/domain/charging.ts', content: srcDomainCharging, category: 'domain' },
  { path: 'src/domain/payment.ts', content: srcDomainPayment, category: 'domain' },
  { path: 'src/domain/refund.ts', content: srcDomainRefund, category: 'domain' },
  // Routes
  { path: 'src/routes/cancel.ts', content: srcRoutesCancel, category: 'routes' },
  { path: 'src/routes/charging.ts', content: srcRoutesCharging, category: 'routes' },
  { path: 'src/routes/payment.ts', content: srcRoutesPayment, category: 'routes' },
  { path: 'src/routes/refund.ts', content: srcRoutesRefund, category: 'routes' },
  // Tests
  { path: 'src/__tests__/cancel.test.ts', content: testCancel, category: 'test' },
  { path: 'src/__tests__/charging.test.ts', content: testCharging, category: 'test' },
  { path: 'src/__tests__/payment.test.ts', content: testPayment, category: 'test' },
];

export const testResults = {
  totalTests: 24,
  passed: 24,
  failed: 0,
  suites: [
    { name: 'cancel.test.ts', tests: 8, passed: 8 },
    { name: 'charging.test.ts', tests: 8, passed: 8 },
    { name: 'payment.test.ts', tests: 8, passed: 8 },
  ],
} as const;

export interface EngineFile {
  path: string;
  content: string;
  category: 'orchestrator' | 'generator' | 'collector';
  label: string;
  lines: number;
}

export const engineFiles: EngineFile[] = [
  { path: 'prototype/orchestrator.ts', content: engineOrchestrator, category: 'orchestrator', label: 'Orchestrator (3-Phase)', lines: engineOrchestrator.split('\n').length },
  { path: 'prototype/collector.ts', content: engineCollector, category: 'collector', label: 'Collector (5-SVC 병렬)', lines: engineCollector.split('\n').length },
  { path: 'prototype/generators/data-model.ts', content: engineDataModel, category: 'generator', label: 'G4: Data Model', lines: engineDataModel.split('\n').length },
  { path: 'prototype/generators/feature-spec.ts', content: engineFeatureSpec, category: 'generator', label: 'G5: Feature Spec', lines: engineFeatureSpec.split('\n').length },
  { path: 'prototype/generators/architecture.ts', content: engineArchitecture, category: 'generator', label: 'G6: Architecture', lines: engineArchitecture.split('\n').length },
  { path: 'prototype/generators/api-spec.ts', content: engineApiSpec, category: 'generator', label: 'G7: API Spec', lines: engineApiSpec.split('\n').length },
  { path: 'prototype/generators/claude-md.ts', content: engineClaudeMd, category: 'generator', label: 'G8: CLAUDE.md', lines: engineClaudeMd.split('\n').length },
];

export const engineGenerators = [
  { id: 'G1', name: 'Business Logic', file: 'business-logic.ts', type: 'LLM+Mechanical', output: 'specs/01-business-logic.md', input: 'policies', sprint: 1 },
  { id: 'G2', name: 'Rules JSON', file: 'rules-json.ts', type: 'Mechanical', output: 'rules/business-rules.json', input: 'policies', sprint: 1 },
  { id: 'G3', name: 'Terms JSON-LD', file: 'terms-jsonld.ts', type: 'Mechanical', output: 'ontology/terms.jsonld', input: 'terms', sprint: 1 },
  { id: 'G4', name: 'Data Model', file: 'data-model.ts', type: 'LLM+Mechanical', output: 'specs/02-data-model.md', input: 'terms', sprint: 2 },
  { id: 'G5', name: 'Feature Spec', file: 'feature-spec.ts', type: 'LLM', output: 'specs/03-functions.md', input: 'skills+G1+G4', sprint: 2 },
  { id: 'G6', name: 'Architecture', file: 'architecture.ts', type: 'LLM', output: 'specs/04-architecture.md', input: 'data+G5', sprint: 2 },
  { id: 'G7', name: 'API Spec', file: 'api-spec.ts', type: 'LLM', output: 'specs/05-api.md', input: 'G5', sprint: 2 },
  { id: 'G8', name: 'CLAUDE.md', file: 'claude-md.ts', type: 'Template', output: 'CLAUDE.md', input: 'all', sprint: 2 },
] as const;

export const metrics = {
  specDocuments: 6,
  sourceFiles: 14,
  totalLines: 1610,
  testCount: 24,
  testPassRate: 100,
  humanIntervention: 0,
  domain: 'LPON 온누리상품권 결제/취소',
  generatedBy: 'AI Foundry 반제품 생성 엔진',
  pdcaMatchRate: 93,
  businessRules: 42,
  apiEndpoints: 10,
  dbTables: 7,
} as const;

export const engineMetrics = {
  generators: 8,
  generatorCodeLines: 1358,
  totalTests: 291,
  testFiles: 28,
  zipFiles: 11,
  e2eTime: '10초',
  sprint1Generators: 3,
  sprint2Generators: 5,
  productionE2e: true,
} as const;
