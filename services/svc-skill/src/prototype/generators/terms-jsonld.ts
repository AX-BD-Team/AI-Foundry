/**
 * Terms JSON-LD Generator — 기계적 변환 (LLM 불필요)
 * terms → ontology/terms.jsonld (SKOS/JSON-LD)
 */
import type { GeneratedFile } from "@ai-foundry/types";
import type { TermRow } from "../collector.js";

interface SkosNode {
  "@id": string;
  "@type": string;
  "skos:prefLabel": string;
  "skos:definition"?: string;
  "skos:broader"?: string;
  "ai-foundry:termType": string;
}

export function generateTermsJsonld(terms: TermRow[]): GeneratedFile {
  const graph: SkosNode[] = terms.map((t) => {
    const node: SkosNode = {
      "@id": t.skos_uri ?? `urn:ai-foundry:term:${t.term_id}`,
      "@type": "skos:Concept",
      "skos:prefLabel": t.label,
      "ai-foundry:termType": t.term_type,
    };
    if (t.definition) {
      node["skos:definition"] = t.definition;
    }
    if (t.broader_term_id) {
      node["skos:broader"] = `urn:ai-foundry:term:${t.broader_term_id}`;
    }
    return node;
  });

  const output = {
    "@context": {
      "skos": "http://www.w3.org/2004/02/skos/core#",
      "ai-foundry": "https://ai-foundry.ktds.com/ns/",
    },
    "@graph": graph,
  };

  return {
    path: "ontology/terms.jsonld",
    content: JSON.stringify(output, null, 2),
    type: "ontology",
    generatedBy: "mechanical",
    sourceCount: terms.length,
  };
}
