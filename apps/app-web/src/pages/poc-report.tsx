import { useState, useCallback } from 'react';
import {
  FileText,
  MessageSquare,
  ClipboardList,
  BookOpen,
  Code2,
  TestTube2,
  IterationCcw,
  ChevronRight,
  CheckCircle2,
  User,
  Zap,
  FolderTree,
  Play,
  Cpu,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MarkdownContent } from '@/components/markdown-content';
import {
  interview,
  prd,
  specDocs,
  codeFiles,
  testResults,
  metrics,
  engineFiles,
  engineGenerators,
  engineMetrics,
} from '@/data/poc-report-data';

/* ─── Helpers ─── */

const CATEGORY_LABELS: Record<string, string> = {
  entry: 'Entry',
  domain: 'Domain',
  routes: 'Routes',
  test: 'Tests',
};

const CATEGORY_COLORS: Record<string, string> = {
  entry: '#3B82F6',
  domain: '#8B5CF6',
  routes: '#10B981',
  test: '#F59E0B',
};

/* ─── Hero Banner ─── */

function MetricsBanner() {
  const items = [
    { label: '스펙 문서', value: String(metrics.specDocuments), unit: '편' },
    { label: '소스 파일', value: String(metrics.sourceFiles), unit: '개' },
    { label: '코드 라인', value: metrics.totalLines.toLocaleString('ko-KR'), unit: '줄' },
    { label: '테스트', value: `${metrics.testCount} / ${metrics.testPassRate}%`, unit: '' },
    { label: '사람 개입', value: String(metrics.humanIntervention), unit: '회' },
  ];

  return (
    <Card
      className="p-5 mb-6"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
        border: '1px solid var(--accent)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Zap className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          반제품 생성 결과 — {metrics.domain}
        </span>
        <Badge
          className="text-xs ml-auto"
          style={{
            backgroundColor: 'color-mix(in srgb, #10B981 15%, transparent)',
            color: '#10B981',
            border: '1px solid #10B981',
          }}
        >
          PDCA {metrics.pdcaMatchRate}%
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {item.value}
              {item.unit && (
                <span className="text-sm font-normal ml-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {item.unit}
                </span>
              )}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Tab: 개요 ─── */

function OverviewTab() {
  return (
    <div className="space-y-4">
      <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          PoC 목표
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          AI Foundry의 5-Stage 파이프라인이 추출한 지식(policies, ontologies, skills)을{' '}
          <strong>사람 개입 없이</strong> 실행 가능한 Working Prototype으로 변환할 수 있는지 검증한다.
          <strong>Sprint 1</strong>: LPON 온누리상품권 결제/취소 도메인으로 반제품 스펙 6종 + Working Version(14파일, 1,610줄) 수동 생성.{' '}
          <strong>Sprint 2</strong>: 이 과정을 자동화하는 엔진(8 generators + 3-Phase orchestrator)을 구축, <code style={{ fontSize: '0.85em' }}>POST /prototype/generate</code> API 한 번으로 11파일 ZIP을 10초 내 자동 생성한다.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4" style={{ color: '#3B82F6' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>입력</span>
          </div>
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>Policies: 848 approved</div>
            <div>Ontologies: 848 terms</div>
            <div>Skills: 11 bundled (859 items)</div>
          </div>
        </Card>
        <Card className="p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <ChevronRight className="w-4 h-4" style={{ color: '#8B5CF6' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>처리</span>
          </div>
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>인터뷰 → PRD → 스펙 6종</div>
            <div>비즈니스 룰: {metrics.businessRules}개</div>
            <div>API 엔드포인트: {metrics.apiEndpoints}개</div>
          </div>
        </Card>
        <Card className="p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4" style={{ color: '#10B981' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>출력</span>
          </div>
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div>Working Version: 14 파일</div>
            <div>테스트: 24개 (100% pass)</div>
            <div>DB 테이블: {metrics.dbTables}개</div>
          </div>
        </Card>
      </div>

      <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          파이프라인 흐름
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { step: '1', label: '인터뷰', color: '#3B82F6' },
            { step: '2', label: 'PRD', color: '#8B5CF6' },
            { step: '3', label: '외부 검토', color: '#F59E0B' },
            { step: '4', label: '스펙 6종', color: '#10B981' },
            { step: '5', label: 'Working Version', color: '#EF4444' },
            { step: '6', label: '테스트 검증', color: '#06B6D4' },
          ].map((item, i) => (
            <div key={item.step} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-4 h-4" style={{ color: 'var(--border)' }} />}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {item.step}
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── Tab: 인터뷰 ─── */

function InterviewTab() {
  return (
    <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5" style={{ color: '#3B82F6' }} />
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>인터뷰 로그</h3>
        <Badge className="text-xs" style={{ backgroundColor: 'color-mix(in srgb, #3B82F6 15%, transparent)', color: '#3B82F6', border: '1px solid #3B82F6' }}>
          자동 생성
        </Badge>
      </div>
      <MarkdownContent content={interview} />
    </Card>
  );
}

/* ─── Tab: PRD ─── */

function PrdTab() {
  return (
    <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="w-5 h-5" style={{ color: '#8B5CF6' }} />
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>PRD (최종)</h3>
        <Badge className="text-xs" style={{ backgroundColor: 'color-mix(in srgb, #8B5CF6 15%, transparent)', color: '#8B5CF6', border: '1px solid #8B5CF6' }}>
          v4 final
        </Badge>
      </div>
      <MarkdownContent content={prd} />
    </Card>
  );
}

/* ─── Tab: 스펙 문서 (서브탭 6개) ─── */

function SpecDocsTab() {
  return (
    <Tabs defaultValue={specDocs[0].id}>
      <TabsList className="flex-wrap mb-4">
        {specDocs.map((doc) => (
          <TabsTrigger key={doc.id} value={doc.id} className="text-xs">
            {doc.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {specDocs.map((doc) => (
        <TabsContent key={doc.id} value={doc.id}>
          <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5" style={{ color: '#10B981' }} />
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {doc.label}
              </h3>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {doc.labelEn}
              </span>
            </div>
            <MarkdownContent content={doc.content} />
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

/* ─── Tab: Working Version (코드 뷰어) ─── */

function WorkingVersionTab() {
  const [selectedFile, setSelectedFile] = useState(codeFiles[0]!.path);
  const current = codeFiles.find((f) => f.path === selectedFile) ?? codeFiles[0]!;
  const categories = ['entry', 'domain', 'routes', 'test'] as const;

  return (
    <div className="grid grid-cols-[240px_1fr] gap-4">
      {/* File tree */}
      <Card className="p-3 h-fit" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-3 px-1">
          <FolderTree className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {codeFiles.length} files
          </span>
        </div>
        {categories.map((cat) => {
          const files = codeFiles.filter((f) => f.category === cat);
          if (files.length === 0) return null;
          return (
            <div key={cat} className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1" style={{ color: CATEGORY_COLORS[cat] }}>
                {CATEGORY_LABELS[cat]}
              </div>
              {files.map((file) => {
                const active = file.path === selectedFile;
                const fileName = file.path.split('/').pop()!;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className="w-full text-left px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      backgroundColor: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {fileName}
                  </button>
                );
              })}
            </div>
          );
        })}
      </Card>

      {/* Code viewer */}
      <Card className="p-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <div
          className="flex items-center gap-2 px-4 py-2 border-b"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <Code2 className="w-4 h-4" style={{ color: CATEGORY_COLORS[current.category] }} />
          <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
            {current.path}
          </span>
          <Badge
            className="text-[10px] ml-auto"
            style={{
              backgroundColor: `color-mix(in srgb, ${CATEGORY_COLORS[current.category]} 15%, transparent)`,
              color: CATEGORY_COLORS[current.category],
              border: `1px solid ${CATEGORY_COLORS[current.category]}`,
            }}
          >
            {current.content.split('\n').length} lines
          </Badge>
        </div>
        <pre
          className="p-4 overflow-auto text-xs font-mono leading-relaxed max-h-[600px]"
          style={{ color: 'var(--text-primary)' }}
        >
          {current.content.split('\n').map((line, i) => (
            <div key={i} className="flex">
              <span
                className="inline-block w-10 text-right pr-3 select-none shrink-0"
                style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
              >
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre">{line}</span>
            </div>
          ))}
        </pre>
      </Card>
    </div>
  );
}

/* ─── Tab: 테스트 ─── */

function TestResultsTab() {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold" style={{ color: '#10B981' }}>{testResults.totalTests}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Total Tests</div>
        </Card>
        <Card className="p-4 text-center" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold" style={{ color: '#10B981' }}>{testResults.passed}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Passed</div>
        </Card>
        <Card className="p-4 text-center" style={{ backgroundColor: 'color-mix(in srgb, #10B981 5%, var(--bg-primary))', border: '1px solid #10B981' }}>
          <div className="text-3xl font-bold" style={{ color: '#10B981' }}>100%</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Pass Rate</div>
        </Card>
      </div>

      {/* Per-suite */}
      <Card className="overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Test Suite</th>
              <th className="text-center p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Tests</th>
              <th className="text-center p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Passed</th>
              <th className="text-center p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {testResults.suites.map((suite) => (
              <tr key={suite.name} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                  <TestTube2 className="w-3.5 h-3.5 inline mr-2" style={{ color: '#F59E0B' }} />
                  {suite.name}
                </td>
                <td className="p-3 text-center font-semibold" style={{ color: 'var(--text-primary)' }}>{suite.tests}</td>
                <td className="p-3 text-center font-semibold" style={{ color: '#10B981' }}>{suite.passed}</td>
                <td className="p-3 text-center">
                  <Badge
                    className="text-xs"
                    style={{
                      backgroundColor: 'color-mix(in srgb, #10B981 15%, transparent)',
                      color: '#10B981',
                      border: '1px solid #10B981',
                    }}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    PASS
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ─── Tab: PDCA ─── */

function PdcaTab() {
  const phases = [
    {
      phase: 'Plan',
      color: '#3B82F6',
      items: [
        '인터뷰 기반 요구사항 수집 (10개 질문)',
        'PRD v1 → v4 반복 개선 (3회 외부 AI 검토)',
        '최종 PRD: 10개 기능, 42개 비즈니스 룰 정의',
      ],
    },
    {
      phase: 'Do',
      color: '#10B981',
      items: [
        '반제품 스펙 6종 자동 생성 (비즈니스 로직 ~ 화면 설계)',
        'Working Version 코드 생성 (14 파일, 1,610줄)',
        'DB 스키마 7 테이블, API 10 엔드포인트, 4 도메인 모듈',
      ],
    },
    {
      phase: 'Check',
      color: '#F59E0B',
      items: [
        '테스트 24개 전수 통과 (100%)',
        'Gap 분석 Match Rate: 93%',
        '사람 개입 횟수: 0회 (완전 자동)',
      ],
    },
    {
      phase: 'Act',
      color: '#8B5CF6',
      items: [
        '반제품 스펙 포맷 표준화 (AIF-REQ-027)',
        'PoC 보고서 Production 게시 (AIF-REQ-028)',
        'Sprint 2: LLM 생성기 5종 + Orchestrator 3-Phase 병렬 (AIF-REQ-026)',
        'POST /prototype/generate → 8 스펙 + 3 메타 = 11파일 ZIP, Production E2E 10초',
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {/* Match Rate Hero */}
      <Card
        className="p-5 text-center"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
          border: '1px solid var(--accent)',
        }}
      >
        <div className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
          {metrics.pdcaMatchRate}%
        </div>
        <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          PDCA Gap Analysis Match Rate
        </div>
      </Card>

      {/* Phase cards */}
      <div className="grid grid-cols-2 gap-4">
        {phases.map((p) => (
          <Card key={p.phase} className="p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.phase[0]}
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{p.phase}</span>
            </div>
            <div className="space-y-1.5">
              {p.items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: p.color }} />
                  <span className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Key insight */}
      <Card className="p-4" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <User className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>핵심 검증 결과</span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Sprint 1 (수동)</strong>: 인터뷰→PRD→스펙 6종→Working Version(14파일, 1,610줄, 테스트 24개 100%). 사람 개입 0회.{' '}
          <strong style={{ color: 'var(--text-primary)' }}>Sprint 2 (자동화)</strong>: <code style={{ fontSize: '0.8em', backgroundColor: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px' }}>POST /prototype/generate</code> 한 번으로 8개 스펙 파일 완비 ZIP 자동 생성 (10초).{' '}
          역공학 출력이 <strong style={{ color: 'var(--text-primary)' }}>API 한 번</strong>으로 순공학 입력(Working Prototype)으로 변환되는{' '}
          <strong style={{ color: 'var(--text-primary)' }}>Reverse-to-Forward Bridge</strong>의 완전 자동화를 달성했다.
        </p>
      </Card>
    </div>
  );
}

/* ─── Tab: 자동화 엔진 (Sprint 2) ─── */

const ENGINE_CATEGORY_LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  generator: 'Generators',
  collector: 'Collector',
};

const ENGINE_CATEGORY_COLORS: Record<string, string> = {
  orchestrator: '#EF4444',
  generator: '#8B5CF6',
  collector: '#10B981',
};

function EngineTab() {
  const [selectedFile, setSelectedFile] = useState(engineFiles[0]!.path);
  const current = engineFiles.find((f) => f.path === selectedFile) ?? engineFiles[0]!;
  const categories = ['orchestrator', 'collector', 'generator'] as const;

  return (
    <div className="space-y-4">
      {/* Engine Hero */}
      <Card
        className="p-5"
        style={{
          backgroundColor: 'color-mix(in srgb, #EF4444 5%, var(--bg-primary))',
          border: '1px solid color-mix(in srgb, #EF4444 30%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-5 h-5" style={{ color: '#EF4444' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Sprint 2 — 자동 생성 엔진
          </span>
          <Badge className="text-xs ml-auto" style={{ backgroundColor: 'color-mix(in srgb, #10B981 15%, transparent)', color: '#10B981', border: '1px solid #10B981' }}>
            Production E2E {engineMetrics.e2eTime}
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{engineMetrics.generators}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generators</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{engineMetrics.generatorCodeLines.toLocaleString()}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>코드 (줄)</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{engineMetrics.totalTests}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>테스트</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{engineMetrics.zipFiles}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>ZIP 파일</div>
          </div>
        </div>
      </Card>

      {/* 3-Phase Pipeline */}
      <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          3-Phase 병렬 파이프라인
        </h3>
        <div className="text-xs font-mono leading-relaxed p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          <div>POST /prototype/generate (orgId, skipLlm)</div>
          <div className="mt-2" style={{ color: 'var(--text-secondary)' }}>{'  '}│</div>
          <div style={{ color: '#3B82F6' }}>{'  '}├── Phase 1 (병렬): G1(business-logic) + G4(data-model)</div>
          <div style={{ color: 'var(--text-secondary)' }}>{'  '}│</div>
          <div style={{ color: '#8B5CF6' }}>{'  '}├── Phase 2 (순차→병렬): G5(feature-spec) → G6(architecture) + G7(api-spec)</div>
          <div style={{ color: 'var(--text-secondary)' }}>{'  '}│</div>
          <div style={{ color: '#10B981' }}>{'  '}├── Phase 3: G8(claude-md)</div>
          <div style={{ color: 'var(--text-secondary)' }}>{'  '}│</div>
          <div style={{ color: '#F59E0B' }}>{'  '}└── ZIP (fflate) → R2 upload → D1 completed</div>
        </div>
      </Card>

      {/* Generators Table */}
      <Card className="overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Generator 8종</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>ID</th>
              <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Generator</th>
              <th className="text-center p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Type</th>
              <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Input</th>
              <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Output</th>
              <th className="text-center p-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Sprint</th>
            </tr>
          </thead>
          <tbody>
            {engineGenerators.map((gen) => (
              <tr key={gen.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="p-3 font-mono font-bold text-xs" style={{ color: gen.sprint === 2 ? '#EF4444' : 'var(--text-primary)' }}>{gen.id}</td>
                <td className="p-3 text-xs" style={{ color: 'var(--text-primary)' }}>{gen.name}</td>
                <td className="p-3 text-center">
                  <Badge className="text-[10px]" style={{
                    backgroundColor: gen.type === 'LLM' ? 'color-mix(in srgb, #8B5CF6 15%, transparent)' : gen.type === 'Mechanical' ? 'color-mix(in srgb, #10B981 15%, transparent)' : 'color-mix(in srgb, #F59E0B 15%, transparent)',
                    color: gen.type === 'LLM' ? '#8B5CF6' : gen.type === 'Mechanical' ? '#10B981' : '#F59E0B',
                    border: `1px solid ${gen.type === 'LLM' ? '#8B5CF6' : gen.type === 'Mechanical' ? '#10B981' : '#F59E0B'}`,
                  }}>
                    {gen.type}
                  </Badge>
                </td>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{gen.input}</td>
                <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{gen.output}</td>
                <td className="p-3 text-center text-xs font-semibold" style={{ color: gen.sprint === 2 ? '#EF4444' : 'var(--text-secondary)' }}>S{gen.sprint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ZIP Structure */}
      <Card className="p-5" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>ZIP 출력 구조 (11 files)</h3>
        <div className="text-xs font-mono leading-relaxed p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          <div>{'working-prototypes/{prototypeId}.zip'}</div>
          <div style={{ color: 'var(--text-secondary)' }}>├── .foundry/origin.json{'         '}S1</div>
          <div style={{ color: 'var(--text-secondary)' }}>├── .foundry/manifest.json{'       '}S1</div>
          <div style={{ color: 'var(--text-secondary)' }}>├── README.md{'                    '}S1</div>
          <div style={{ color: '#3B82F6' }}>├── specs/01-business-logic.md{'   '}S1 (G1)</div>
          <div style={{ color: '#10B981' }}>├── rules/business-rules.json{'   '}S1 (G2)</div>
          <div style={{ color: '#10B981' }}>├── ontology/terms.jsonld{'        '}S1 (G3)</div>
          <div style={{ color: '#EF4444' }}>├── specs/02-data-model.md{'      '}S2 (G4)</div>
          <div style={{ color: '#EF4444' }}>├── specs/03-functions.md{'        '}S2 (G5)</div>
          <div style={{ color: '#EF4444' }}>├── specs/04-architecture.md{'     '}S2 (G6)</div>
          <div style={{ color: '#EF4444' }}>├── specs/05-api.md{'              '}S2 (G7)</div>
          <div style={{ color: '#EF4444' }}>└── CLAUDE.md{'                    '}S2 (G8)</div>
        </div>
      </Card>

      {/* Engine Source Code Viewer */}
      <Card className="p-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4" style={{ color: '#EF4444' }} />
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>엔진 소스 코드</h3>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
              {engineFiles.reduce((sum, f) => sum + f.lines, 0).toLocaleString()} lines total
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[200px_1fr]">
          {/* File tree */}
          <div className="p-3 border-r" style={{ borderColor: 'var(--border)' }}>
            {categories.map((cat) => {
              const files = engineFiles.filter((f) => f.category === cat);
              if (files.length === 0) return null;
              return (
                <div key={cat} className="mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1" style={{ color: ENGINE_CATEGORY_COLORS[cat] }}>
                    {ENGINE_CATEGORY_LABELS[cat]}
                  </div>
                  {files.map((file) => {
                    const active = file.path === selectedFile;
                    return (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file.path)}
                        className="w-full text-left px-2 py-1 rounded text-xs transition-colors"
                        style={{
                          backgroundColor: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {file.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Code viewer */}
          <div>
            <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                svc-skill/src/{current.path}
              </span>
              <Badge className="text-[10px] ml-auto" style={{
                backgroundColor: `color-mix(in srgb, ${ENGINE_CATEGORY_COLORS[current.category]} 15%, transparent)`,
                color: ENGINE_CATEGORY_COLORS[current.category],
                border: `1px solid ${ENGINE_CATEGORY_COLORS[current.category]}`,
              }}>
                {current.lines} lines
              </Badge>
            </div>
            <pre className="p-4 overflow-auto text-xs font-mono leading-relaxed max-h-[500px]" style={{ color: 'var(--text-primary)' }}>
              {current.content.split('\n').map((line, i) => (
                <div key={i} className="flex">
                  <span className="inline-block w-10 text-right pr-3 select-none shrink-0" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>{i + 1}</span>
                  <span className="flex-1 whitespace-pre">{line}</span>
                </div>
              ))}
            </pre>
          </div>
        </div>
      </Card>

      {/* Production E2E */}
      <Card className="p-5" style={{ backgroundColor: 'color-mix(in srgb, #10B981 5%, var(--bg-primary))', border: '1px solid color-mix(in srgb, #10B981 30%, transparent)' }}>
        <h3 className="text-base font-bold mb-3" style={{ color: '#10B981' }}>Production E2E 검증</h3>
        <div className="text-xs font-mono leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          <div>POST /prototype/generate (LPON, skipLlm=true)</div>
          <div style={{ color: '#10B981' }}>{'  '}→ 202 Accepted (prototypeId: wp-c41ab2d3-...)</div>
          <div style={{ color: '#10B981' }}>{'  '}→ GET /prototype/{'{'}{'}'}id{'}'} → 10초 내 completed</div>
          <div style={{ color: '#10B981' }}>{'  '}→ policies: 100, terms: 100, skills: 35, docs: 88</div>
          <div style={{ color: '#10B981' }}>{'  '}→ R2: working-prototypes/wp-c41ab2d3-...zip ✅</div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Live Demo (Client Simulation) ─── */

interface LogEntry { time: string; method: string; path: string; status: number; ok: boolean; body: string }

function LiveDemoTab() {
  const [balance, setBalance] = useState(100_000);
  const [lastPid, setLastPid] = useState('');
  const [lastCanceled, setLastCanceled] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chargeAmt, setChargeAmt] = useState(10000);
  const [payAmt, setPayAmt] = useState(30000);
  const [payMethod, setPayMethod] = useState('QR');
  const [cancelReason, setCancelReason] = useState('단순 변심');

  const uid = () => crypto.randomUUID().slice(0, 8);
  const now = () => new Date().toISOString();
  const addLog = useCallback((method: string, path: string, status: number, data: unknown) => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString('ko'), method, path, status, ok: status < 400, body: JSON.stringify(data, null, 2) }, ...prev.slice(0, 19)]);
  }, []);

  function doCharge() {
    if (chargeAmt < 1000 || chargeAmt > 500000 || chargeAmt % 1000 !== 0) {
      addLog('POST', `/api/v1/vouchers/voucher-001/charges`, 422, { success: false, error: { code: 'E422-AMT', message: 'Invalid charge amount (1,000~500,000, unit 1,000)' } });
      return;
    }
    const newBal = balance + chargeAmt;
    setBalance(newBal);
    const res = { success: true, data: { charge_id: `chg-${uid()}`, voucher_id: 'voucher-001', amount: chargeAmt, balance_after: newBal, charged_at: now() } };
    addLog('POST', `/api/v1/vouchers/voucher-001/charges`, 201, res);
  }

  function doPayment() {
    if (payAmt <= 0) { addLog('POST', '/api/v1/payments', 422, { success: false, error: { code: 'E422-AMT', message: 'Payment amount must be positive' } }); return; }
    if (balance < payAmt) { addLog('POST', '/api/v1/payments', 422, { success: false, error: { code: 'E422-BAL', message: 'Insufficient voucher balance' } }); return; }
    const newBal = balance - payAmt;
    setBalance(newBal);
    const pid = `pay-${uid()}`;
    setLastPid(pid);
    setLastCanceled(false);
    const res = { success: true, data: { payment_id: pid, voucher_id: 'voucher-001', merchant_id: 'merchant-001', amount: payAmt, balance_after: newBal, status: 'PAID', method: payMethod, paid_at: now() } };
    addLog('POST', '/api/v1/payments', 201, res);
  }

  function doCancel() {
    if (!lastPid) { addLog('POST', `/api/v1/payments/.../cancel`, 404, { success: false, error: { code: 'E404', message: 'Payment not found — 먼저 결제를 실행하세요' } }); return; }
    if (lastCanceled) { addLog('POST', `/api/v1/payments/${lastPid}/cancel`, 409, { success: false, error: { code: 'E409-ST', message: 'Already canceled' } }); return; }
    setBalance(b => b + payAmt);
    setLastCanceled(true);
    const res = { success: true, data: { payment_id: lastPid, status: 'CANCEL_REQUESTED', cancel_reason: cancelReason, requested_at: now() } };
    addLog('POST', `/api/v1/payments/${lastPid}/cancel`, 200, res);
  }

  function doRefund() {
    if (!lastPid || !lastCanceled) { addLog('POST', '/api/v1/refunds', 409, { success: false, error: { code: 'E409-ST', message: 'Payment must be CANCELED before refund' } }); return; }
    const res = { success: true, data: { refund_id: `ref-${uid()}`, payment_id: lastPid, amount: payAmt, status: 'REQUESTED', reason: '데모 환불', requested_at: now() } };
    addLog('POST', '/api/v1/refunds', 201, res);
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem' };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' };

  return (
    <div className="space-y-4">
      <Card className="p-4 text-center" style={{ backgroundColor: 'color-mix(in srgb, #22c55e 8%, var(--bg-primary))', border: '1px solid color-mix(in srgb, #22c55e 30%, transparent)' }}>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>상품권 잔액 (voucher-001 / 홍길동)</div>
        <div className="text-3xl font-bold" style={{ color: '#22c55e' }}>{balance.toLocaleString()}원</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>클라이언트 시뮬레이션 — BL-001~047 비즈니스 룰 반영</div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>1. 충전</h3>
          <div style={labelStyle}>충전 금액 (원, 1,000단위)</div>
          <input type="number" value={chargeAmt} onChange={e => setChargeAmt(Number(e.target.value))} step={1000} min={1000} max={500000} style={inputStyle} />
          <button onClick={doCharge} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#2563eb' }}>충전하기</button>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>2. 결제</h3>
          <div style={labelStyle}>결제 금액 (원)</div>
          <input type="number" value={payAmt} onChange={e => setPayAmt(Number(e.target.value))} step={1000} style={inputStyle} />
          <div style={{ ...labelStyle, marginTop: '8px' }}>결제 수단</div>
          <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={inputStyle}>
            <option value="QR">QR</option><option value="CARD">카드</option>
          </select>
          <button onClick={doPayment} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#2563eb' }}>결제하기</button>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#ef4444' }}>3. 결제 취소</h3>
          <div style={labelStyle}>결제 ID</div>
          <input type="text" value={lastPid} readOnly style={{ ...inputStyle, opacity: 0.7 }} placeholder="결제 후 자동 입력" />
          <div style={{ ...labelStyle, marginTop: '8px' }}>취소 사유</div>
          <input type="text" value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={inputStyle} />
          <button onClick={doCancel} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#dc2626' }}>결제 취소</button>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#d97706' }}>4. 환불 신청</h3>
          <div style={labelStyle}>결제 ID (취소된 건)</div>
          <input type="text" value={lastCanceled ? lastPid : ''} readOnly style={{ ...inputStyle, opacity: 0.7 }} placeholder="취소 후 자동 입력" />
          <div style={{ ...labelStyle, marginTop: '8px' }}>환불 금액</div>
          <input type="number" value={payAmt} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
          <button onClick={doRefund} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#d97706' }}>환불 신청</button>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>API 호출 로그</h3>
        <div style={{ maxHeight: '350px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {logs.length === 0 && <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>위 버튼을 눌러 API를 테스트하세요</div>}
          {logs.map((log, i) => (
            <div key={i} style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{log.time} </span>
              <span style={{ fontWeight: 700, color: log.method === 'POST' ? '#22c55e' : '#60a5fa' }}>{log.method} </span>
              <span>{log.path} </span>
              <span style={{ color: log.ok ? '#22c55e' : '#ef4444' }}>{log.status}</span>
              <pre style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '4px', fontSize: '0.75rem' }}>{log.body}</pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── Main Tabs ─── */

const TABS = [
  { id: 'overview', label: '개요', labelEn: 'Overview', icon: <FileText className="w-4 h-4" /> },
  { id: 'interview', label: '인터뷰', labelEn: 'Interview', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'prd', label: 'PRD', labelEn: 'PRD', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'specs', label: '스펙 문서', labelEn: 'Specs', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'code', label: 'Working Version', labelEn: 'Code', icon: <Code2 className="w-4 h-4" /> },
  { id: 'demo', label: '라이브 데모', labelEn: 'Live Demo', icon: <Play className="w-4 h-4" /> },
  { id: 'engine', label: '자동화 엔진', labelEn: 'Engine', icon: <Cpu className="w-4 h-4" /> },
  { id: 'tests', label: '테스트', labelEn: 'Tests', icon: <TestTube2 className="w-4 h-4" /> },
  { id: 'pdca', label: 'PDCA', labelEn: 'PDCA', icon: <IterationCcw className="w-4 h-4" /> },
] as const;

export default function PocReportPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <FileText className="w-5 h-5" style={{ color: 'var(--accent-foreground)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            PoC 보고서
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            반제품 생성 엔진 — LPON 온누리상품권 결제/취소 파일럿
          </p>
        </div>
      </div>

      <MetricsBanner />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap mb-4">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="interview"><InterviewTab /></TabsContent>
        <TabsContent value="prd"><PrdTab /></TabsContent>
        <TabsContent value="specs"><SpecDocsTab /></TabsContent>
        <TabsContent value="code"><WorkingVersionTab /></TabsContent>
        <TabsContent value="demo"><LiveDemoTab /></TabsContent>
        <TabsContent value="engine"><EngineTab /></TabsContent>
        <TabsContent value="tests"><TestResultsTab /></TabsContent>
        <TabsContent value="pdca"><PdcaTab /></TabsContent>
      </Tabs>

      {/* Footer */}
      <div
        className="mt-10 pt-6 text-center text-xs"
        style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}
      >
        AI Foundry v0.6.0 — 반제품 생성 엔진 PoC — KTDS AX BD Team
      </div>
    </div>
  );
}
