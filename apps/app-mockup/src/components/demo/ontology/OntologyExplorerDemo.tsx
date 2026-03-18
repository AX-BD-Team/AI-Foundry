import { useEffect, useMemo, useState } from "react";
import { useDomain } from "@/contexts/DomainContext";
import {
  fetchTerms,
  fetchGraphVisualization,
  type Term,
  type GraphNode,
  type GraphLink,
} from "@/lib/api/ontology";
import { TermCard } from "./TermCard";

const GROUP_COLORS: Record<string, string> = {
  core: "#3b82f6",
  important: "#f59e0b",
  standard: "#9ca3af",
};

function layoutNodes(nodes: GraphNode[]) {
  const cx = 300;
  const cy = 200;
  const r = 160;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

export function OntologyExplorerDemo() {
  const { domain } = useDomain();
  const [terms, setTerms] = useState<Term[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasTermData = domain.stats.terms > 0;

  useEffect(() => {
    if (!hasTermData) {
      setLoading(false);
      setTerms([]);
      setNodes([]);
      setLinks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchTerms(domain.organizationId, { limit: 50 }),
      fetchGraphVisualization(domain.organizationId, { limit: 60 }),
    ])
      .then(([termData, graphData]) => {
        if (cancelled) return;
        setTerms(termData.terms);
        setNodes(graphData.nodes);
        setLinks(graphData.links);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain.organizationId, hasTermData]);

  const filtered = useMemo(() => {
    if (!search) return terms;
    const q = search.toLowerCase();
    return terms.filter((t) => t.label.toLowerCase().includes(q));
  }, [terms, search]);

  const positioned = useMemo(() => layoutNodes(nodes), [nodes]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, (typeof positioned)[number]>();
    for (const n of positioned) m.set(n.id, n);
    return m;
  }, [positioned]);

  const selectedNode = selectedTermId
    ? positioned.find((n) => n.id === selectedTermId)
    : null;

  /* Domain has no term data */
  if (!hasTermData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-4xl">{domain.emoji}</div>
        <div className="text-center space-y-2">
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            이 도메인에는 아직 온톨로지 데이터가 없어요.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            온누리상품권(LPON) 도메인을 선택하면 7,332건의 용어를 탐색할 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full mr-3" />
        {domain.name} 온톨로지 데이터 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 text-center text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left: Term search + list */}
      <div className="w-1/3 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {domain.name} 용어 사전
        </h3>
        <input
          type="text"
          placeholder="용어 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">
              {search ? "검색 결과 없음" : "용어 없음"}
            </p>
          ) : (
            filtered.map((t) => (
              <TermCard
                key={t.termId}
                term={t}
                selected={selectedTermId === t.termId}
                onClick={() => setSelectedTermId(t.termId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Graph + detail */}
      <div className="w-2/3 flex flex-col gap-3">
        <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              그래프 데이터가 없어요
            </div>
          ) : (
            <svg viewBox="0 0 600 400" className="w-full h-full">
              {/* Links */}
              {links.map((link, i) => {
                const src = nodeMap.get(link.source);
                const tgt = nodeMap.get(link.target);
                if (!src || !tgt) return null;
                return (
                  <line
                    key={i}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="#d1d5db"
                    strokeWidth={Math.max(0.5, link.weight)}
                    opacity={0.5}
                  />
                );
              })}
              {/* Nodes */}
              {positioned.map((n) => {
                const isSelected = selectedTermId === n.id;
                const fill = GROUP_COLORS[n.group] ?? "#9ca3af";
                const radius = n.group === "core" ? 12 : n.group === "important" ? 9 : 6;
                return (
                  <g
                    key={n.id}
                    onClick={() => setSelectedTermId(n.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={radius}
                      fill={fill}
                      stroke={isSelected ? "#1d4ed8" : "none"}
                      strokeWidth={isSelected ? 3 : 0}
                      opacity={0.85}
                    />
                    <text
                      x={n.x}
                      y={n.y + radius + 12}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#6b7280"
                      className="pointer-events-none"
                    >
                      {n.label.length > 10 ? n.label.slice(0, 10) + "\u2026" : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[selectedNode.group] ?? "#9ca3af" }}
              />
              <span className="font-semibold text-sm">{selectedNode.label}</span>
              <span className="text-xs text-gray-500">({selectedNode.type})</span>
            </div>
            {selectedNode.definition && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {selectedNode.definition}
              </p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              Frequency: {selectedNode.frequency} | Group: {selectedNode.group}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
