/**
 * Prototype Orchestrator — WP 생성 전체 흐름 제어
 *
 * 1. collectOrgData()로 데이터 수집
 * 2. 생성기별 파일 생성 (기계적 → LLM)
 * 3. ZIP 패키징 + R2 저장
 * 4. D1 상태 업데이트
 */
import { createLogger } from "@ai-foundry/utils";
import type { GeneratedFile, GeneratePrototypeOptions, PrototypeOrigin } from "@ai-foundry/types";
import type { Env } from "../env.js";
import { collectOrgData, type CollectedData } from "./collector.js";
import { generateRulesJson } from "./generators/rules-json.js";
import { generateTermsJsonld } from "./generators/terms-jsonld.js";
import { generateBusinessLogic } from "./generators/business-logic.js";
import { generateDataModel } from "./generators/data-model.js";
import { generateFeatureSpec } from "./generators/feature-spec.js";
import { generateArchitecture } from "./generators/architecture.js";
import { generateApiSpec } from "./generators/api-spec.js";
import { generateClaudeMd } from "./generators/claude-md.js";
import { createManifest, createZip, uploadToR2 } from "./packager.js";

const logger = createLogger("prototype-orchestrator");

function generateOriginJson(orgId: string, orgName: string, data: CollectedData): GeneratedFile {
  const origin: PrototypeOrigin = {
    organizationId: orgId,
    organizationName: orgName,
    domain: inferDomain(data),
    generatedAt: new Date().toISOString(),
    generatedBy: "ai-foundry-prototype-generator",
    version: "1.0.0",
    pipeline: {
      documentCount: data.documents.length,
      policyCount: data.policies.length,
      termCount: data.terms.length,
      skillCount: data.skills.length,
      extractionCount: data.extractions.length,
    },
  };

  return {
    path: ".foundry/origin.json",
    content: JSON.stringify(origin, null, 2),
    type: "meta",
    generatedBy: "mechanical",
    sourceCount: 1,
  };
}

function inferDomain(data: CollectedData): string {
  if (data.skills.length > 0) {
    return data.skills[0]?.domain ?? "unknown";
  }
  return "unknown";
}

function generateReadme(orgName: string, data: CollectedData): GeneratedFile {
  const content = `# Working Prototype — ${orgName}

> AI Foundry 역공학 파이프라인에서 자동 생성된 반제품 스펙

## 데이터 소스

| 항목 | 건수 |
|------|------|
| 문서 (parsed) | ${data.documents.length} |
| 정책 (approved) | ${data.policies.length} |
| 용어 (terms) | ${data.terms.length} |
| 스킬 (bundled) | ${data.skills.length} |
| 구조 추출 | ${data.extractions.length} |

## 파일 구조

\`\`\`
.foundry/origin.json          # 원천 추적 메타데이터
.foundry/manifest.json        # 패키지 매니페스트
specs/01-business-logic.md    # 비즈니스 로직 명세
schemas/                      # (후속 Sprint)
rules/business-rules.json    # 정책 트리플 (JSON)
ontology/terms.jsonld         # 도메인 용어 (SKOS)
\`\`\`

## 사용법

이 패키지를 Claude Code 또는 Foundry-X에서 사용하려면:

1. ZIP을 프로젝트 루트에 압축 해제
2. \`specs/01-business-logic.md\`를 참조하여 비즈니스 로직 구현
3. \`rules/business-rules.json\`을 런타임 정책 엔진에 로드
4. \`ontology/terms.jsonld\`를 도메인 용어 사전으로 활용
`;

  return {
    path: "README.md",
    content,
    type: "readme",
    generatedBy: "template",
    sourceCount: 0,
  };
}

async function updatePrototypeStatus(
  env: Env,
  prototypeId: string,
  status: "completed" | "failed",
  r2Key?: string,
  data?: CollectedData,
  errorMessage?: string,
): Promise<void> {
  await env.DB_SKILL.prepare(
    `UPDATE prototypes SET
       status = ?,
       r2_key = ?,
       doc_count = ?,
       policy_count = ?,
       term_count = ?,
       skill_count = ?,
       error_message = ?,
       completed_at = datetime('now')
     WHERE prototype_id = ?`,
  ).bind(
    status,
    r2Key ?? null,
    data?.documents.length ?? 0,
    data?.policies.length ?? 0,
    data?.terms.length ?? 0,
    data?.skills.length ?? 0,
    errorMessage ?? null,
    prototypeId,
  ).run();
}

export async function generatePrototype(
  env: Env,
  prototypeId: string,
  orgId: string,
  orgName: string,
  options?: GeneratePrototypeOptions,
): Promise<void> {
  try {
    logger.info("Starting prototype generation", { prototypeId, orgId });

    // 1. 데이터 수집
    const data = await collectOrgData(env, orgId);
    logger.info("Data collected", {
      policies: data.policies.length,
      terms: data.terms.length,
      documents: data.documents.length,
      skills: data.skills.length,
      extractions: data.extractions.length,
    });

    // 2. 파일 생성
    const files: GeneratedFile[] = [];

    // 기계적 변환 (LLM 불필요)
    files.push(generateOriginJson(orgId, orgName, data));
    files.push(generateRulesJson(data.policies));
    files.push(generateTermsJsonld(data.terms));
    files.push(generateReadme(orgName, data));

    // ── Phase 1: 독립 생성 (병렬) ──
    const skipLlm = options?.skipLlm ?? false;
    const [bl, dm] = await Promise.all([
      generateBusinessLogic(env, data.policies, {
        skipLlm,
        maxPoliciesPerScenario: options?.maxPoliciesPerScenario ?? 20,
      }),
      generateDataModel(env, data.terms, { skipLlm }),
    ]);
    files.push(bl, dm);

    // ── Phase 2: 의존 생성 ──
    const fs = await generateFeatureSpec(env, data, bl, dm, { skipLlm });
    files.push(fs);

    const [arch, api] = await Promise.all([
      generateArchitecture(env, data, fs, { skipLlm }),
      generateApiSpec(env, fs, { skipLlm }),
    ]);
    files.push(arch, api);

    // ── Phase 3: 요약 생성 ──
    files.push(generateClaudeMd(orgName, data, { bl, dm, fs, arch, api }));

    // 3. manifest + ZIP + R2
    files.push(createManifest(orgName, files, options));
    const zipData = createZip(files);
    const r2Key = await uploadToR2(env, prototypeId, zipData);

    // 4. D1 완료
    await updatePrototypeStatus(env, prototypeId, "completed", r2Key, data);
    logger.info("Prototype generation completed", { prototypeId, r2Key, fileCount: files.length });

  } catch (e) {
    const errMsg = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 3).join("\n")}` : String(e);
    logger.error("Prototype generation failed", { prototypeId, error: errMsg });
    await updatePrototypeStatus(env, prototypeId, "failed", undefined, undefined, errMsg);
  }
}
