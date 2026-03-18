import type { PolicyCandidate } from "@ai-foundry/types";

function policyToText(candidate: PolicyCandidate): string {
  return `Policy Code: ${candidate.policyCode}
Title: ${candidate.title}
Condition (IF): ${candidate.condition}
Criteria: ${candidate.criteria}
Outcome (THEN): ${candidate.outcome}
Source Excerpt: ${candidate.sourceExcerpt ?? "(없음)"}
Source Page Ref: ${candidate.sourcePageRef ?? "(없음)"}
Tags: ${candidate.tags.join(", ") || "(없음)"}`;
}

export function buildAdvocatePrompt(candidate: PolicyCandidate): {
  system: string;
  userContent: string;
} {
  return {
    system: `You are the ADVOCATE in a policy quality review panel.
Your role is to argue WHY this policy is valid, well-structured, and should be approved.
Be thorough: cite specific aspects of the condition, criteria, and outcome that demonstrate quality.
Respond in Korean. Keep your argument under 500 words.`,
    userContent: `다음 정책의 타당성을 옹호해 주세요:\n\n${policyToText(candidate)}`,
  };
}

export function buildDevilPrompt(candidate: PolicyCandidate): {
  system: string;
  userContent: string;
} {
  return {
    system: `You are the DEVIL'S ADVOCATE in a policy quality review panel.
Your role is to find problems: contradictions, ambiguities, missing edge cases,
overly broad conditions, unverifiable criteria, or unachievable outcomes.
Be specific and cite exact phrases that are problematic.
Respond in Korean. Keep your critique under 500 words.`,
    userContent: `다음 정책의 문제점, 모순, 누락을 지적해 주세요:\n\n${policyToText(candidate)}`,
  };
}

export function buildJudgePrompt(
  candidate: PolicyCandidate,
  advocateArgs: string,
  devilArgs: string,
): { system: string; userContent: string } {
  return {
    system: `You are the JUDGE in a policy quality review panel.
Review the Advocate's arguments and Devil's critique, then make a fair decision.
Return ONLY a JSON object: { "decision": "approve" | "reject" | "split", "reasoning": "..." }
- "approve": if the policy is fundamentally sound despite minor issues
- "reject": if the policy has critical flaws (logical contradiction, ambiguity, unverifiable criteria)
- "split": if you cannot decide — the case needs human review with additional context`,
    userContent: `## 정책
${policyToText(candidate)}

## Advocate 의견
${advocateArgs}

## Devil's Advocate 의견
${devilArgs}

위 논거를 종합하여 판정해 주세요. JSON으로만 응답하세요.`,
  };
}

export function buildRound2Prompt(
  candidate: PolicyCandidate,
  advocateArgs: string,
  devilArgs: string,
  questions: string[],
): { system: string; userContent: string } {
  return {
    system: `You are the JUDGE conducting a Round 2 deep review.
The previous round ended in a split decision. Answer the following questions
to make a final determination.
Return ONLY a JSON object: { "decision": "approve" | "reject" | "split", "reasoning": "..." }`,
    userContent: `## 정책
${policyToText(candidate)}

## Round 1 Advocate
${advocateArgs}

## Round 1 Devil
${devilArgs}

## 심화 질문
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

위 질문에 답하고 최종 판정을 내려 주세요. JSON으로만 응답하세요.`,
  };
}
