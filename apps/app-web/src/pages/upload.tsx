import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  FileSearch,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument, fetchDocuments } from '@/api/ingestion';
import type { DocumentRow } from '@/api/ingestion';
import { useOrganization } from '@/contexts/OrganizationContext';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

export default function DocumentUploadPage() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void fetchDocuments(organizationId).then((res) => {
      if (res.success) setDocuments(res.data.documents);
    });
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(`지원하지 않는 파일 형식: ${file.name}`);
      return;
    }
    setUploading(true);
    try {
      const res = await uploadDocument(organizationId, file);
      if (res.success) {
        toast.success(`업로드 완료: ${file.name}`);
        const refreshed = await fetchDocuments(organizationId);
        if (refreshed.success) setDocuments(refreshed.data.documents);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('업로드 중 오류가 발생했습니다');
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

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: '대기', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.1)' },
      processing: { label: '처리 중', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
      parsed: { label: '파싱 완료', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
      completed: { label: '완료', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
      failed: { label: '오류', color: 'var(--danger)', bg: 'rgba(229, 62, 62, 0.1)' },
    };
    const c = config[status] ?? config['pending']!;
    return <Badge style={{ backgroundColor: c.bg, color: c.color, border: 'none' }} className="text-xs">{c.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'parsed': return <CheckCircle className="w-5 h-5" style={{ color: '#3B82F6' }} />;
      case 'completed': return <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />;
      case 'processing': return <Clock className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
      case 'failed': return <AlertCircle className="w-5 h-5" style={{ color: 'var(--danger)' }} />;
      default: return <Clock className="w-5 h-5" style={{ color: '#6B7280' }} />;
    }
  };

  const completedCount = documents.filter((d) => d.status === 'completed' || d.status === 'parsed').length;
  const processingCount = documents.filter((d) => d.status === 'processing').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          문서 업로드 및 파싱 Document Upload & Parsing
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          정책 문서, 약관, 가이드 업로드 및 자동 파싱
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 문서</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{documents.length}</div>
            </div>
            <FileText className="w-10 h-10" style={{ color: '#3B82F6', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>완료</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--success)' }}>{completedCount}</div>
            </div>
            <CheckCircle className="w-10 h-10" style={{ color: 'var(--success)', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>처리 중</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--accent)' }}>{processingCount}</div>
            </div>
            <Zap className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>오류</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--danger)' }}>
                {documents.filter((d) => d.status === 'failed').length}
              </div>
            </div>
            <FileSearch className="w-10 h-10" style={{ color: '#9333EA', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
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
              <Upload className="w-8 h-8" style={{ color: '#3B82F6' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              파일을 드래그하여 업로드
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              또는 클릭하여 파일 선택 (PDF, DOCX, PPTX, XLSX, 이미지 지원)
            </p>
            <Button onClick={handleFileSelect} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? '업로드 중...' : '파일 선택'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>업로드된 문서 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              업로드된 문서가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.document_id} className="border rounded-lg p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{getStatusIcon(doc.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{doc.original_name}</h4>
                        {getStatusBadge(doc.status)}
                        <Badge variant="outline" className="text-xs" style={{ color: 'var(--text-secondary)' }}>{doc.file_type}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>{(doc.file_size_byte / 1024 / 1024).toFixed(2)} MB</span>
                        <span>|</span>
                        <span>{new Date(doc.uploaded_at).toLocaleString('ko-KR')}</span>
                      </div>
                      {doc.status === 'processing' && <Progress value={50} className="h-2 mt-2" />}
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(`/analysis?doc=${doc.document_id}`)}>
                      <FileSearch className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
