import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Network, Box, Link as LinkIcon, Plus, Edit, Loader2 } from 'lucide-react';
import { fetchTerms, type TermRow } from '@/api/ontology';
import { useOrganization } from '@/contexts/OrganizationContext';

interface OntologyNode {
  id: string;
  name: string;
  nameEn: string;
  type: 'domain' | 'concept' | 'attribute' | 'relation';
  description: string;
  parent?: string | undefined;
  children?: string[] | undefined;
  relatedConcepts?: string[] | undefined;
}

function termsToNodes(terms: TermRow[]): OntologyNode[] {
  const broaderMap = new Map<string, string[]>();
  for (const term of terms) {
    if (term.broaderTermId) {
      const existing = broaderMap.get(term.broaderTermId);
      if (existing) {
        existing.push(term.termId);
      } else {
        broaderMap.set(term.broaderTermId, [term.termId]);
      }
    }
  }

  return terms.map((term): OntologyNode => {
    const children = broaderMap.get(term.termId);
    const hasBroader = term.broaderTermId !== null;
    const type: OntologyNode['type'] = !hasBroader
      ? 'domain'
      : children !== undefined && children.length > 0
        ? 'concept'
        : 'attribute';

    const node: OntologyNode = {
      id: term.termId,
      name: term.label,
      nameEn: term.skosUri.split('/').pop() ?? term.label,
      type,
      description: term.definition ?? '',
    };
    if (term.broaderTermId) {
      node.parent = term.broaderTermId;
    }
    if (children !== undefined && children.length > 0) {
      node.children = children;
    }
    return node;
  });
}

const getNodeIcon = (type: OntologyNode['type']) => {
  switch (type) {
    case 'domain':
      return <Network className="w-5 h-5" style={{ color: '#3B82F6' }} />;
    case 'concept':
      return <Box className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    case 'attribute':
      return <LinkIcon className="w-5 h-5" style={{ color: '#10B981' }} />;
    case 'relation':
      return <LinkIcon className="w-5 h-5" style={{ color: '#9333EA' }} />;
  }
};

const getTypeBadge = (type: OntologyNode['type']) => {
  const config = {
    domain: { label: '도메인', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
    concept: { label: '개념', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
    attribute: { label: '속성', color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    relation: { label: '관계', color: '#9333EA', bg: 'rgba(147, 51, 234, 0.1)' },
  };
  const { label, color, bg } = config[type];
  return (
    <Badge style={{ backgroundColor: bg, color, border: 'none' }} className="text-xs">
      {label}
    </Badge>
  );
};

export default function OntologyPage() {
  const { organizationId } = useOrganization();
  const [nodes, setNodes] = useState<OntologyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTerms(organizationId, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          const converted = termsToNodes(res.data.terms);
          setNodes(converted);
          const firstNode = converted[0];
          if (firstNode) {
            setSelectedNode(firstNode);
            setExpandedNodes(new Set([firstNode.id]));
          }
        } else {
          setError(res.error.message);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Failed to fetch terms', e);
        setError('용어 목록을 불러올 수 없습니다');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNodeTree = (nodeId: string, depth: number = 0): React.ReactNode => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const isExpanded = expandedNodes.has(nodeId);
    const hasChildren = node.children !== undefined && node.children.length > 0;

    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
            selectedNode?.id === nodeId ? 'shadow-sm' : ''
          }`}
          style={{
            marginLeft: `${depth * 20}px`,
            backgroundColor: selectedNode?.id === nodeId ? 'rgba(26, 54, 93, 0.1)' : 'transparent',
          }}
          onClick={() => setSelectedNode(node)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleNode(nodeId); }}
              className="hover:bg-gray-200 rounded p-0.5"
            >
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isExpanded ? '\u25BC' : '\u25B6'}
              </span>
            </button>
          ) : (
            <span className="w-4" />
          )}
          {getNodeIcon(node.type)}
          <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
            {node.name}
          </span>
          {getTypeBadge(node.type)}
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children?.map((childId) => renderNodeTree(childId, depth + 1))}</div>
        )}
      </div>
    );
  };

  const domainNodes = nodes.filter((n) => n.type === 'domain');
  const totalConcepts = nodes.filter((n) => n.type === 'concept').length;
  const totalAttributes = nodes.filter((n) => n.type === 'attribute').length;

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      <div className="pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              온톨로지 탐색기 Ontology Explorer
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              도메인 지식 구조화 및 관계 매핑
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            노드 추가
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>도메인</div>
            <div className="text-2xl font-bold" style={{ color: '#3B82F6' }}>{domainNodes.length}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(246, 173, 85, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>개념</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{totalConcepts}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>속성</div>
            <div className="text-2xl font-bold" style={{ color: '#10B981' }}>{totalAttributes}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[40%_60%] overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
        {/* Left Panel -- Node Tree */}
        <div className="border-r overflow-hidden flex flex-col" style={{ borderColor: 'var(--border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <Input placeholder="노드 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
            {error && (
              <div className="text-sm text-center py-8" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            {!loading && !error && nodes.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                등록된 용어가 없습니다
              </div>
            )}
            {!loading && !error && domainNodes.map((node) => renderNodeTree(node.id))}
          </div>
        </div>

        {/* Right Panel -- Node Detail */}
        <div className="flex flex-col overflow-hidden">
          {selectedNode ? (
            <>
              <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getNodeIcon(selectedNode.type)}
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedNode.name}</h2>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedNode.nameEn}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTypeBadge(selectedNode.type)}
                    <Button variant="outline" size="sm">
                      <Edit className="w-4 h-4 mr-2" />
                      편집
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-6">
                <Card className="shadow-sm">
                  <CardHeader><CardTitle>설명 Description</CardTitle></CardHeader>
                  <CardContent>
                    <p style={{ color: 'var(--text-primary)' }}>{selectedNode.description || '(설명 없음)'}</p>
                  </CardContent>
                </Card>

                {selectedNode.parent && (() => {
                  const parentNode = nodes.find((n) => n.id === selectedNode.parent);
                  return parentNode ? (
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle>상위 노드 Parent Node</CardTitle></CardHeader>
                      <CardContent>
                        <div
                          className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                          style={{ borderColor: 'var(--border)' }}
                          onClick={() => setSelectedNode(parentNode)}
                        >
                          <div className="flex items-center gap-3">
                            {getNodeIcon(parentNode.type)}
                            <div className="flex-1">
                              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{parentNode.name}</div>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{parentNode.nameEn}</div>
                            </div>
                            {getTypeBadge(parentNode.type)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}

                {selectedNode.children !== undefined && selectedNode.children.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader><CardTitle>하위 노드 Child Nodes ({selectedNode.children.length})</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedNode.children.map((childId) => {
                          const childNode = nodes.find((n) => n.id === childId);
                          return childNode ? (
                            <div
                              key={childId}
                              className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => setSelectedNode(childNode)}
                            >
                              <div className="flex items-center gap-3">
                                {getNodeIcon(childNode.type)}
                                <div className="flex-1">
                                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{childNode.name}</div>
                                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{childNode.nameEn}</div>
                                </div>
                                {getTypeBadge(childNode.type)}
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedNode.relatedConcepts !== undefined && selectedNode.relatedConcepts.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader><CardTitle>관련 개념 Related Concepts</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedNode.relatedConcepts.map((relatedId) => {
                          const relatedNode = nodes.find((n) => n.id === relatedId);
                          return relatedNode ? (
                            <div
                              key={relatedId}
                              className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => setSelectedNode(relatedNode)}
                            >
                              <div className="flex items-center gap-3">
                                {getNodeIcon(relatedNode.type)}
                                <div className="flex-1">
                                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{relatedNode.name}</div>
                                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{relatedNode.nameEn}</div>
                                </div>
                                {getTypeBadge(relatedNode.type)}
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
              노드를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
