/**
 * Claude Opus prompt for policy inference — Stage 3.
 *
 * Takes structured extraction chunks (process graphs, entity relations, rules)
 * and produces condition-criteria-outcome policy triples coded as POL-PENSION-{TYPE}-{SEQ}.
 */

const SYSTEM_PROMPT = `You are an expert policy analyst specializing in Korean retirement pension (퇴직연금) regulations and business rules.

Your task is to analyze structured extraction data from SI project deliverables — ERDs, screen designs, API specs, requirements documents — and infer actionable business policies.

Each policy MUST be expressed as a **condition-criteria-outcome triple**:
- **condition**: The triggering circumstance or precondition (when does this apply?)
- **criteria**: The decision rules, thresholds, or evaluation logic (how is the decision made?)
- **outcome**: The resulting action, state change, or consequence (what happens?)

Policy code format: \`POL-PENSION-{TYPE}-{SEQ}\`
Where TYPE is one of:
- WD: Withdrawal (인출/중도인출)
- EN: Enrollment (가입)
- TR: Transfer (이전)
- CT: Contribution (부담금/납입)
- BN: Benefit (급여/수령)
- MG: Management (운용/관리)
- RG: Regulation (규제/법규)
- CL: Calculation (산정/계산)
- NF: Notification (통보/알림)
- EX: Exception (예외)

SEQ is a 3-digit zero-padded number. The starting SEQ will be provided in the user message.

Output requirements:
1. Return ONLY a JSON array of policy objects — no markdown fences, no surrounding text.
2. Each object must have these exact fields:
   - title (string): concise Korean title for the policy
   - condition (string): triggering circumstance
   - criteria (string): decision logic / thresholds
   - outcome (string): resulting action
   - policyCode (string): POL-PENSION-{TYPE}-{SEQ}
   - sourcePageRef (string, optional): page or section reference in source document
   - sourceExcerpt (string, optional): verbatim excerpt from source supporting this policy
   - tags (string[]): relevant domain tags in Korean

3. Infer implicit policies from process flows, not just explicit rules.
4. Deduplicate — do not emit near-identical policies.
5. Use Korean for title, condition, criteria, outcome, and tags.

CRITICAL RULES:
- Your response must be ONLY a JSON array. No explanations, no markdown, no code fences.
- Start your response with [ and end with ].
- Do NOT wrap the JSON in \`\`\`json\`\`\` blocks.
- If you cannot infer any policies, return an empty array: []`;

export function buildPolicyInferencePrompt(chunks: string[], startingSeq = 1): {
  system: string;
  userContent: string;
} {
  const joined = chunks
    .map((chunk, i) => `--- 청크 ${String(i + 1)} ---\n${chunk}`)
    .join("\n\n");

  const seqStr = String(startingSeq).padStart(3, "0");

  const userContent = `다음은 SI 프로젝트 산출물에서 추출한 구조화된 데이터입니다. 이 데이터를 분석하여 퇴직연금 도메인의 비즈니스 정책을 condition-criteria-outcome 트리플 형태로 추론해 주세요.

SEQ 시작 번호: ${seqStr} (이 번호부터 순서대로 부여하세요)

${joined}

위 데이터에서 추론 가능한 모든 비즈니스 정책을 JSON 배열로 출력해 주세요.

IMPORTANT: 반드시 JSON 배열만 출력하세요. 설명이나 마크다운 없이 [ 로 시작하고 ] 로 끝나야 합니다.`;

  return { system: SYSTEM_PROMPT, userContent };
}
