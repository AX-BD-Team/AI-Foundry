/**
 * ZIP Packager — GeneratedFile[] → ZIP → R2 저장
 * fflate 사용 (Workers 호환, svc-ingestion에서 검증됨)
 */
import { zipSync, strToU8 } from "fflate";
import type { GeneratedFile, PrototypeManifest, PrototypeFileEntry } from "@ai-foundry/types";
import type { Env } from "../env.js";

export function createManifest(
  orgName: string,
  files: GeneratedFile[],
  options?: { includeScreenSpec?: boolean; maxPoliciesPerScenario?: number },
): GeneratedFile {
  const manifest: PrototypeManifest = {
    name: `working-prototype-${orgName}`,
    description: `AI Foundry Working Prototype for ${orgName}`,
    version: "1.0.0",
    files: files.map((f): PrototypeFileEntry => ({
      path: f.path,
      type: f.type,
      generatedBy: f.generatedBy,
      sourceCount: f.sourceCount,
    })),
    generationParams: {
      llmModel: "claude-sonnet",
      includeScreenSpec: options?.includeScreenSpec ?? false,
      maxPoliciesPerScenario: options?.maxPoliciesPerScenario ?? 20,
    },
  };

  return {
    path: ".foundry/manifest.json",
    content: JSON.stringify(manifest, null, 2),
    type: "meta",
    generatedBy: "mechanical",
    sourceCount: files.length,
  };
}

export function createZip(files: GeneratedFile[]): Uint8Array {
  const zipData: Record<string, Uint8Array> = {};
  for (const f of files) {
    zipData[f.path] = strToU8(f.content);
  }
  return zipSync(zipData);
}

export async function uploadToR2(
  env: Env,
  prototypeId: string,
  zipData: Uint8Array,
): Promise<string> {
  const r2Key = `working-prototypes/${prototypeId}.zip`;
  await env.R2_SKILL_PACKAGES.put(r2Key, zipData, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { prototypeId },
  });
  return r2Key;
}
