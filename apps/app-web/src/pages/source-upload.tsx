import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Code,
  CheckCircle,
  Clock,
  AlertCircle,
  FileCode,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument, fetchDocuments, fetchDocumentChunks } from '@/api/ingestion';
import type { DocumentRow, DocumentChunk } from '@/api/ingestion';
import { useOrganization } from '@/contexts/OrganizationContext';

const SOURCE_CATEGORIES = ['source_controller', 'source_entity', 'source_service', 'source_mapper'] as const;

function getChunkCounts(chunks: DocumentChunk[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cat of SOURCE_CATEGORIES) {
    counts[cat] = 0;
  }
  for (const chunk of chunks) {
    const key = chunk.classification;
    if (key in counts) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    parsed: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB', label: 'Parsed' },
    completed: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16A34A', label: 'Completed' },
    processing: { bg: 'rgba(245, 158, 11, 0.1)', color: '#D97706', label: 'Processing' },
    failed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', label: 'Failed' },
    pending: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Pending' },
  };
  const s = map[status] ?? map["pending"] ?? { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Pending' };
  return (
    <Badge className="text-[10px]" style={{ backgroundColor: s.bg, color: s.color, border: 'none' }}>
      {s.label}
    </Badge>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'parsed':
    case 'completed':
      return <CheckCircle className="w-5 h-5" style={{ color: '#22C55E' }} />;
    case 'processing':
      return <Clock className="w-5 h-5 animate-spin" style={{ color: '#F59E0B' }} />;
    case 'failed':
      return <AlertCircle className="w-5 h-5" style={{ color: '#EF4444' }} />;
    default:
      return <Clock className="w-5 h-5" style={{ color: '#6B7280' }} />;
  }
}

export default function SourceUploadPage() {
  const { organizationId } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sourceDocs, setSourceDocs] = useState<DocumentRow[]>([]);
  const [chunkCounts, setChunkCounts] = useState<Record<string, Record<string, number>>>({});
  const [loadingChunks, setLoadingChunks] = useState<Set<string>>(new Set());

  const loadDocuments = async () => {
    const res = await fetchDocuments(organizationId);
    if (res.success) {
      // Filter to only show ZIP files (source code uploads)
      const zipDocs = res.data.documents.filter((d) =>
        d.file_type === 'zip' || d.original_name.endsWith('.zip')
      );
      setSourceDocs(zipDocs);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, [organizationId]);

  const loadChunksForDoc = async (docId: string) => {
    if (loadingChunks.has(docId)) return;
    setLoadingChunks((prev) => new Set(prev).add(docId));
    try {
      const res = await fetchDocumentChunks(organizationId, docId);
      if (res.success) {
        const counts = getChunkCounts(res.data.chunks);
        setChunkCounts((prev) => ({ ...prev, [docId]: counts }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingChunks((prev) => { const next = new Set(prev); next.delete(docId); return next; });
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast.error('ZIP files only. Please upload a .zip archive containing Java source code.');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadDocument(organizationId, file);
      if (res.success) {
        toast.success(`Upload complete: ${file.name}`);
        await loadDocuments();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  };

  const handleFileSelect = () => fileInputRef.current?.click();

  const parsedCount = sourceDocs.filter((d) => d.status === 'parsed' || d.status === 'completed').length;
  const processingCount = sourceDocs.filter((d) => d.status === 'processing').length;
  const failedCount = sourceDocs.filter((d) => d.status === 'failed').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Source Code Upload
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Java Spring source code (.zip) upload and parsing status
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Sources</div>
                <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{sourceDocs.length}</div>
              </div>
              <Code className="w-10 h-10" style={{ color: '#3B82F6', opacity: 0.2 }} />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Parsed</div>
                <div className="text-3xl font-bold mt-2" style={{ color: '#22C55E' }}>{parsedCount}</div>
              </div>
              <CheckCircle className="w-10 h-10" style={{ color: '#22C55E', opacity: 0.2 }} />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Processing</div>
                <div className="text-3xl font-bold mt-2" style={{ color: '#F59E0B' }}>{processingCount}</div>
              </div>
              <Clock className="w-10 h-10" style={{ color: '#F59E0B', opacity: 0.2 }} />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Failed</div>
                <div className="text-3xl font-bold mt-2" style={{ color: '#EF4444' }}>{failedCount}</div>
              </div>
              <AlertCircle className="w-10 h-10" style={{ color: '#EF4444', opacity: 0.2 }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Area */}
      <Card className="shadow-sm">
        <CardContent className="p-8">
          <div
            className="border-2 border-dashed rounded-xl p-12 text-center transition-all"
            style={{
              borderColor: isDragging ? 'var(--primary)' : 'var(--border)',
              backgroundColor: isDragging ? 'rgba(26, 54, 93, 0.05)' : 'transparent',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <FileCode className="w-8 h-8" style={{ color: '#3B82F6' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Drag & Drop ZIP File
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Upload Java Spring source code as .zip archive
            </p>
            <Button onClick={handleFileSelect} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Select File'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Source List */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Uploaded Sources
              <Badge variant="outline" className="ml-2 text-xs">{sourceDocs.length}</Badge>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => void loadDocuments()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sourceDocs.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              No source code uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {sourceDocs.map((doc) => {
                const docChunks = chunkCounts[doc.document_id];
                const isParsed = doc.status === 'parsed' || doc.status === 'completed';
                return (
                  <div
                    key={doc.document_id}
                    className="border rounded-lg p-4 transition-shadow hover:shadow-md"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">{getStatusIcon(doc.status)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {doc.original_name}
                          </h4>
                          {getStatusBadge(doc.status)}
                          <Badge variant="outline" className="text-[10px]">{doc.file_type}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span>{(doc.file_size_byte / 1024 / 1024).toFixed(2)} MB</span>
                          <span>|</span>
                          <span>{new Date(doc.uploaded_at).toLocaleString('ko-KR')}</span>
                        </div>
                        {doc.status === 'processing' && <Progress value={50} className="h-2 mt-2" />}
                        {doc.status === 'failed' && doc.error_message && (
                          <div className="mt-2 text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#DC2626' }}>
                            {doc.error_message}
                          </div>
                        )}

                        {/* Chunk counts */}
                        {isParsed && docChunks && (
                          <div className="mt-3 flex items-center gap-3 flex-wrap">
                            {SOURCE_CATEGORIES.map((cat) => {
                              const count = docChunks[cat] ?? 0;
                              const label = cat.replace('source_', '');
                              return (
                                <div key={cat} className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px] capitalize">{label}</Badge>
                                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isParsed && !docChunks && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 text-xs"
                            disabled={loadingChunks.has(doc.document_id)}
                            onClick={() => void loadChunksForDoc(doc.document_id)}
                          >
                            {loadingChunks.has(doc.document_id) ? 'Loading...' : 'Show Chunk Counts'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
