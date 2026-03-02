import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, FileText, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDocuments, fetchDocumentChunks } from '@/api/ingestion';
import type { DocumentRow, DocumentChunk } from '@/api/ingestion';

export default function AnalysisPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRow | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchDocuments().then((res) => {
      if (res.success) {
        setDocuments(res.data.documents);
        const first = res.data.documents[0];
        if (first) setSelectedDoc(first);
      } else {
        toast.error('문서 목록을 불러오지 못했습니다: ' + res.error.message);
      }
    }).catch(() => {
      toast.error('문서 목록 API 호출 실패');
    });
  }, []);

  useEffect(() => {
    if (!selectedDoc) return;
    setLoading(true);
    setSelectedChunk(null);
    void fetchDocumentChunks(selectedDoc.document_id).then((res) => {
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

  const filteredDocs = searchQuery
    ? documents.filter((d) => d.original_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents;

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
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <Input placeholder="문서 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>

          <Tabs defaultValue="documents">
            <TabsList className="w-full">
              <TabsTrigger value="documents" className="flex-1">문서 목록</TabsTrigger>
              <TabsTrigger value="chunks" className="flex-1">청크 목록</TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="mt-4 space-y-3 overflow-auto max-h-[calc(100vh-20rem)]">
              {filteredDocs.map((doc) => (
                <Card
                  key={doc.document_id}
                  className={`cursor-pointer transition-all shadow-sm ${selectedDoc?.document_id === doc.document_id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedDoc(doc)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <FileText className="w-5 h-5 mt-1" style={{ color: 'var(--primary)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{doc.original_name}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {doc.document_id.slice(0, 8)} | {new Date(doc.uploaded_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      {doc.status === 'parsed' || doc.status === 'completed'
                        ? <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
                        : doc.status === 'failed'
                          ? <AlertCircle className="w-5 h-5" style={{ color: '#EF4444' }} />
                          : <AlertCircle className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                      }
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{doc.file_type}</span>
                      <span>|</span>
                      <span>{(doc.file_size_byte / 1024).toFixed(0)} KB</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredDocs.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>문서가 없습니다.</p>
              )}
            </TabsContent>

            <TabsContent value="chunks" className="mt-4 space-y-2 overflow-auto max-h-[calc(100vh-20rem)]">
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
                <div>
                  <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{selectedDoc.original_name}</h2>
                  <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span>{selectedDoc.document_id.slice(0, 8)}</span>
                    <span>|</span>
                    <span>{new Date(selectedDoc.uploaded_at).toLocaleString('ko-KR')}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />원본 보기
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
                  <Badge style={{ backgroundColor: selectedDoc.status === 'parsed' || selectedDoc.status === 'completed' ? 'var(--success)' : selectedDoc.status === 'failed' ? '#EF4444' : 'var(--accent)', color: '#fff' }}>
                    {selectedDoc.status === 'parsed' ? '파싱 완료' : selectedDoc.status === 'completed' ? '완료' : selectedDoc.status === 'failed' ? '실패' : selectedDoc.status === 'pending' ? '대기중' : selectedDoc.status}
                  </Badge>
                </div>
              </div>
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
                    <div className="p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      {selectedChunk.masked_text}
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
