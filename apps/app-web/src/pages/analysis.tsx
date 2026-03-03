import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, FileText, CheckCircle, AlertCircle, ChevronDown, ChevronRight, Filter, Download, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDocuments, fetchDocumentChunks, downloadDocument, deleteDocument, reprocessDocument } from '@/api/ingestion';
import type { DocumentRow, DocumentChunk } from '@/api/ingestion';
import { useOrganization } from '@/contexts/OrganizationContext';
import { MarkdownContent } from '@/components/markdown-content';
import { getDocType, groupDocuments, getStatusInfo } from '@/lib/doc-categories';

export default function AnalysisPage() {
  const { organizationId } = useOrganization();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRow | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Filters
  const [filterDocType, setFilterDocType] = useState<string>('all');
  const [filterFileType, setFilterFileType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Track documents with an action in progress (reprocess/delete)
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set());

  // Auto-scroll to selected document
  const selectedDocRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  useEffect(() => {
    const targetDocId = searchParams.get('doc');
    void fetchDocuments(organizationId).then((res) => {
      if (res.success) {
        setDocuments(res.data.documents);
        const target = targetDocId
          ? res.data.documents.find((d) => d.document_id === targetDocId)
          : undefined;
        const fallback = res.data.documents[0];
        const chosen = target ?? fallback ?? null;
        setSelectedDoc(chosen);

        // When navigating with ?doc=, collapse all groups except the target's
        if (targetDocId && chosen) {
          const targetGroup = getDocType(chosen.original_name);
          const allGroups = new Set(res.data.documents.map((d) => getDocType(d.original_name)));
          allGroups.delete(targetGroup);
          setCollapsedGroups(allGroups);
        }
      } else {
        toast.error('문서 목록을 불러오지 못했습니다: ' + res.error.message);
      }
    }).catch(() => {
      toast.error('문서 목록 API 호출 실패');
    });
  }, [organizationId, searchParams]);

  useEffect(() => {
    if (!selectedDoc) return;
    setLoading(true);
    setSelectedChunk(null);
    void fetchDocumentChunks(organizationId, selectedDoc.document_id).then((res) => {
      if (res.success) {
        setChunks(res.data.chunks);
        const first = res.data.chunks[0];
        if (first) setSelectedChunk(first);
      } else {
        setChunks([]);
        toast.error('청크를 불러오지 못했습니다');
      }
    }).catch(() => {
      setChunks([]);
      toast.error('청크 API 호출 실패');
    }).finally(() => {
      setLoading(false);
    });
  }, [selectedDoc]);

  const handleViewOriginal = async (doc: DocumentRow) => {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDocument(organizationId, doc.document_id);
      const url = URL.createObjectURL(blob);
      const previewable = blob.type.startsWith('image/') || blob.type === 'application/pdf';
      if (previewable) {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`원본 파일: ${filename}`);
    } catch {
      toast.error('원본 파일을 가져올 수 없습니다');
    } finally {
      setDownloading(false);
    }
  };

  const refreshDocuments = async () => {
    const res = await fetchDocuments(organizationId);
    if (res.success) {
      setDocuments(res.data.documents);
      if (selectedDoc) {
        const updated = res.data.documents.find((d) => d.document_id === selectedDoc.document_id);
        if (updated) setSelectedDoc(updated);
        else setSelectedDoc(null);
      }
    }
  };

  const handleReprocess = async (doc: DocumentRow) => {
    if (actionInProgress.has(doc.document_id)) return;
    setActionInProgress((prev) => new Set(prev).add(doc.document_id));
    try {
      const res = await reprocessDocument(organizationId, doc.document_id);
      if (res.success) {
        toast.success(`재처리 시작: ${doc.original_name}`);
        await refreshDocuments();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('재처리 요청 중 오류가 발생했습니다');
    } finally {
      setActionInProgress((prev) => { const next = new Set(prev); next.delete(doc.document_id); return next; });
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    if (actionInProgress.has(doc.document_id)) return;
    if (!confirm(`정말 삭제하시겠습니까?\n${doc.original_name}`)) return;
    setActionInProgress((prev) => new Set(prev).add(doc.document_id));
    try {
      const res = await deleteDocument(organizationId, doc.document_id);
      if (res.success) {
        toast.success(`삭제 완료: ${doc.original_name}`);
        await refreshDocuments();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다');
    } finally {
      setActionInProgress((prev) => { const next = new Set(prev); next.delete(doc.document_id); return next; });
    }
  };

  // Derive filter options from data
  const docTypes = useMemo(() => {
    const set = new Set(documents.map((d) => getDocType(d.original_name)));
    return Array.from(set).sort();
  }, [documents]);

  const fileTypes = useMemo(() => {
    const set = new Set(documents.map((d) => d.file_type));
    return Array.from(set).sort();
  }, [documents]);

  // Apply filters
  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (searchQuery && !d.original_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterDocType !== 'all' && getDocType(d.original_name) !== filterDocType) return false;
      if (filterFileType !== 'all' && d.file_type !== filterFileType) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      return true;
    });
  }, [documents, searchQuery, filterDocType, filterFileType, filterStatus]);

  const groups = useMemo(() => groupDocuments(filteredDocs), [filteredDocs]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const activeFilterCount = [filterDocType, filterFileType, filterStatus].filter((f) => f !== 'all').length;

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)]">
      <div className="px-0 pb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          문서 파싱 결과 Document Parsing Results
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          청크 분할 및 메타데이터 확인
        </p>
      </div>

      <div className="grid grid-cols-[35%_65%] gap-0 h-[calc(100vh-10rem)]">
        {/* Left Panel */}
        <div className="border-r overflow-hidden flex flex-col pr-4" style={{ borderColor: 'var(--border)' }}>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <Input placeholder="문서 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Filter className="w-3.5 h-3.5" />
              {activeFilterCount > 0 && (
                <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>{activeFilterCount}</Badge>
              )}
            </div>
            <select
              className="text-xs border rounded px-2 py-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
            >
              <option value="all">문서 유형</option>
              {docTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="text-xs border rounded px-2 py-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
              value={filterFileType}
              onChange={(e) => setFilterFileType(e.target.value)}
            >
              <option value="all">파일 타입</option>
              {fileTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className="text-xs border rounded px-2 py-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">상태</option>
              <option value="parsed">파싱 완료</option>
              <option value="completed">완료</option>
              <option value="processing">처리 중</option>
              <option value="pending">대기</option>
              <option value="failed">실패</option>
              <option value="encrypted">암호화</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                className="text-xs underline"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => { setFilterDocType('all'); setFilterFileType('all'); setFilterStatus('all'); }}
              >
                초기화
              </button>
            )}
          </div>

          <Tabs defaultValue="documents">
            <TabsList className="w-full">
              <TabsTrigger value="documents" className="flex-1">
                문서 목록
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5">{filteredDocs.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="chunks" className="flex-1">
                청크 목록
                {chunks.length > 0 && <Badge variant="outline" className="ml-2 text-[10px] px-1.5">{chunks.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="mt-3 overflow-auto max-h-[calc(100vh-24rem)]">
              {groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.label);
                return (
                  <div key={group.label} className="mb-2">
                    {/* Group header */}
                    <button
                      className="flex items-center gap-2 w-full py-1.5 px-2 rounded text-left transition-colors hover:opacity-80"
                      style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)' }}
                      onClick={() => toggleGroup(group.label)}
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                      }
                      <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">{group.docs.length}</Badge>
                    </button>

                    {/* Group items */}
                    {!isCollapsed && (
                      <div className="space-y-1.5 mt-1.5 ml-2">
                        {group.docs.map((doc) => (
                          <div
                            key={doc.document_id}
                            ref={selectedDoc?.document_id === doc.document_id ? selectedDocRef : undefined}
                            className={`cursor-pointer rounded-lg p-3 transition-all border ${selectedDoc?.document_id === doc.document_id ? 'ring-2 ring-primary' : ''}`}
                            style={{ borderColor: 'var(--border)', backgroundColor: selectedDoc?.document_id === doc.document_id ? 'rgba(26, 54, 93, 0.05)' : 'transparent' }}
                            onClick={() => setSelectedDoc(doc)}
                          >
                            <div className="flex items-start gap-2">
                              <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{doc.original_name}</div>
                                <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{doc.file_type}</Badge>
                                  <span>{(doc.file_size_byte / 1024).toFixed(0)} KB</span>
                                  <span style={{ color: getStatusInfo(doc.status).color }}>
                                    {getStatusInfo(doc.status).label}
                                  </span>
                                </div>
                              </div>
                              {doc.status === 'parsed' || doc.status === 'completed'
                                ? <CheckCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
                                : doc.status === 'failed'
                                  ? <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#EF4444' }} />
                                  : doc.status === 'encrypted'
                                    ? <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#F59E0B' }} />
                                    : <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredDocs.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  {documents.length === 0 ? '문서가 없습니다.' : '필터 조건에 맞는 문서가 없습니다.'}
                </p>
              )}
            </TabsContent>

            <TabsContent value="chunks" className="mt-3 space-y-2 overflow-auto max-h-[calc(100vh-24rem)]">
              {loading && <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>청크 로딩 중...</p>}
              {chunks.map((chunk) => (
                <Card
                  key={chunk.chunk_id}
                  className={`cursor-pointer transition-all shadow-sm ${selectedChunk?.chunk_id === chunk.chunk_id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedChunk(chunk)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs">Chunk #{chunk.chunk_index}</Badge>
                      <Badge variant="outline" className="text-xs">{chunk.element_type}</Badge>
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: 'var(--text-primary)' }}>{chunk.masked_text}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel */}
        <div className="flex flex-col overflow-hidden pl-4">
          {selectedDoc && (
            <div className="pb-4 mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1 mr-4">
                  <h2 className="text-lg font-bold mb-1 break-words" style={{ color: 'var(--text-primary)' }}>{selectedDoc.original_name}</h2>
                  <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Badge variant="outline" className="text-xs">{getDocType(selectedDoc.original_name)}</Badge>
                    <span>{selectedDoc.document_id.slice(0, 8)}</span>
                    <span>|</span>
                    <span>{new Date(selectedDoc.uploaded_at).toLocaleString('ko-KR')}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" disabled={downloading} onClick={() => void handleViewOriginal(selectedDoc)}>
                  <Download className="w-4 h-4 mr-2" />{downloading ? '로딩...' : '원본 보기'}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>파일 크기</div>
                  <div className="text-2xl font-bold" style={{ color: '#3B82F6' }}>{(selectedDoc.file_size_byte / 1024).toFixed(0)} KB</div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(147, 51, 234, 0.1)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>총 청크</div>
                  <div className="text-2xl font-bold" style={{ color: '#9333EA' }}>{chunks.length}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(56, 161, 105, 0.1)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>상태</div>
                  <Badge style={{ backgroundColor: getStatusInfo(selectedDoc.status).color, color: '#fff' }}>
                    {getStatusInfo(selectedDoc.status).label}
                  </Badge>
                </div>
              </div>
              {(selectedDoc.status === 'failed' || selectedDoc.status === 'encrypted') && (
                <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: '#FBBF24', backgroundColor: 'rgba(251, 191, 36, 0.08)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4" style={{ color: '#D97706' }} />
                    <span className="text-xs font-semibold" style={{ color: '#D97706' }}>
                      {selectedDoc.status === 'encrypted' ? '암호화된 파일' : '처리 오류'}
                    </span>
                    {selectedDoc.error_type && (
                      <Badge variant="outline" className="text-[10px]">{selectedDoc.error_type}</Badge>
                    )}
                  </div>
                  {selectedDoc.error_message && (
                    <p className="text-xs ml-6 mb-2" style={{ color: 'var(--text-secondary)' }}>{selectedDoc.error_message}</p>
                  )}
                  <div className="flex gap-2 ml-6">
                    <Button size="sm" variant="outline" disabled={actionInProgress.has(selectedDoc.document_id)} onClick={() => void handleReprocess(selectedDoc)}>
                      <RotateCcw className={`w-3.5 h-3.5 mr-1.5${actionInProgress.has(selectedDoc.document_id) ? ' animate-spin' : ''}`} />
                      {actionInProgress.has(selectedDoc.document_id) ? '처리 중...' : '재처리'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600" disabled={actionInProgress.has(selectedDoc.document_id)} onClick={() => void handleDelete(selectedDoc)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />삭제
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {selectedChunk ? (
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>청크 상세 정보</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Chunk #{selectedChunk.chunk_index}</Badge>
                      <Badge variant="outline">{selectedChunk.classification}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>청크 내용</h3>
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <MarkdownContent content={selectedChunk.masked_text} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>유형</h3>
                      <Badge>{selectedChunk.element_type}</Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>분류</h3>
                      <Badge variant="outline">{selectedChunk.classification}</Badge>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>단어 수</h3>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selectedChunk.word_count}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
                청크를 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
