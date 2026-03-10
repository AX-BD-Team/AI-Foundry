import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  BookOpen,
  GraduationCap,
  BarChart3,
  GitCompare,
  Download,
  Eye,
  Package,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import { MarkdownContent } from '@/components/markdown-content';
import {
  DELIVERABLE_ITEMS,
  fetchDeliverableMarkdown,
} from '@/api/deliverables';
import type { DeliverableType } from '@/api/deliverables';

const ICONS: Record<string, React.ReactNode> = {
  "interface-spec": <FileText className="w-5 h-5" />,
  "business-rules": <BookOpen className="w-5 h-5" />,
  "glossary": <GraduationCap className="w-5 h-5" />,
  "gap-report": <BarChart3 className="w-5 h-5" />,
  "comparison": <GitCompare className="w-5 h-5" />,
};

function triggerBlobDownload(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DeliverableTab() {
  const { organizationId } = useOrganization();
  const [selectedType, setSelectedType] = useState<DeliverableType | null>(null);
  const [previewCache, setPreviewCache] = useState<Partial<Record<DeliverableType, string>>>({});
  const [loading, setLoading] = useState(false);

  // Reset cache when org changes
  const [lastOrg, setLastOrg] = useState(organizationId);
  if (lastOrg !== organizationId) {
    setLastOrg(organizationId);
    setPreviewCache({});
    setSelectedType(null);
  }

  const fetchMarkdown = async (type: DeliverableType): Promise<string | null> => {
    const cached = previewCache[type];
    if (cached) return cached;

    setLoading(true);
    try {
      const md = await fetchDeliverableMarkdown(organizationId, type);
      setPreviewCache((prev) => ({ ...prev, [type]: md }));
      return md;
    } catch {
      toast.error('산출물 로딩 실패');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (type: DeliverableType) => {
    setSelectedType(type);
    await fetchMarkdown(type);
  };

  const handleDownload = async (type: DeliverableType, filename: string) => {
    const md = await fetchMarkdown(type);
    if (md) {
      triggerBlobDownload(md, `${filename}-${organizationId}-${today()}.md`);
      toast.success(`${filename}.md 다운로드 완료`);
    }
  };

  const handleDownloadAll = async () => {
    const md = await fetchMarkdown("all");
    if (md) {
      triggerBlobDownload(md, `D-all-deliverables-${organizationId}-${today()}.md`);
      toast.success('전체 산출물 다운로드 완료');
    }
  };

  const previewMarkdown = selectedType ? (previewCache[selectedType] ?? null) : null;

  return (
    <div className="grid grid-cols-12 gap-6 mt-4">
      {/* Left: Card list */}
      <div className="col-span-5 space-y-3">
        {DELIVERABLE_ITEMS.map((item) => (
          <Card
            key={item.type}
            className={`shadow-sm transition-colors ${selectedType === item.type ? 'ring-2 ring-primary' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }}>
                  {ICONS[item.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--primary)' }}>
                      {item.code}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {item.description}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={loading && selectedType === item.type}
                      onClick={() => void handlePreview(item.type)}
                    >
                      {loading && selectedType === item.type ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3 mr-1" />
                      )}
                      미리보기
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={loading}
                      onClick={() => void handleDownload(item.type, item.filename)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      다운로드
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Download All */}
        <Button
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void handleDownloadAll()}
        >
          <Package className="w-4 h-4 mr-2" />
          전체 다운로드 (D1~D5)
        </Button>
      </div>

      {/* Right: Preview panel */}
      <div className="col-span-7">
        <Card className="shadow-sm h-full">
          <CardContent className="p-4">
            {!selectedType && (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  산출물을 선택하면 미리보기를 볼 수 있어요
                </p>
              </div>
            )}

            {selectedType && loading && !previewMarkdown && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin mr-2" style={{ color: 'var(--primary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>로딩 중...</span>
              </div>
            )}

            {selectedType && previewMarkdown && (
              <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                <MarkdownContent content={previewMarkdown} />
              </div>
            )}

            {selectedType && !loading && previewMarkdown === null && (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  산출물 데이터가 없어요. 먼저 파이프라인을 실행해 주세요
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
