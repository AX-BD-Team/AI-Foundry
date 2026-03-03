import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuditLogTable, type AuditLogEntry, type EventType, type SeverityLevel } from '@/components/AuditLogTable';
import { AuditLogSummary } from '@/components/AuditLogSummary';
import { Search, Download, FileText, Calendar, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAuditLogs, type AuditRow } from '@/api/security';
import { useOrganization } from '@/contexts/OrganizationContext';

const PAGE_SIZE = 12;

const ACTION_TO_EVENT_TYPE: Record<string, EventType> = {
  mask: '마스킹',
  unmask: '마스킹 복원',
  approve: '정책 검토',
  reject: '정책 검토',
  review: '정책 검토',
  login: '인증',
  logout: '인증',
  update_skill: 'Skill 변경',
  create_skill: 'Skill 변경',
  update_prompt: '프롬프트 변경',
  create_prompt: '프롬프트 변경',
  update_setting: '설정 변경',
};

function inferSeverity(action: string): SeverityLevel {
  if (action === 'unmask') return 'critical';
  if (action.startsWith('update_') || action.startsWith('create_')) return 'warning';
  return 'info';
}

function mapToEntry(row: AuditRow): AuditLogEntry {
  const eventType = ACTION_TO_EVENT_TYPE[row.action] ?? '설정 변경';
  return {
    id: row.audit_id,
    timestamp: new Date(row.occurred_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    eventType,
    severity: inferSeverity(row.action),
    actor: row.user_id,
    target: row.resource_id ?? '-',
    details: `${row.action} — ${row.resource}`,
    ip: row.ip_address ?? '-',
    fullDetail: row.details,
  };
}

const eventTypes: EventType[] = [
  '마스킹',
  '정책 검토',
  'Skill 변경',
  '프롬프트 변경',
  '인증',
  '설정 변경',
];

const severities: { value: SeverityLevel; label: string }[] = [
  { value: 'info', label: '정보' },
  { value: 'warning', label: '경고' },
  { value: 'error', label: '오류' },
  { value: 'critical', label: '위험' },
];

export default function AuditPage() {
  const { organizationId } = useOrganization();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceFilter, setResourceFilter] = useState('전체');
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<SeverityLevel[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: { limit: number; offset: number; resource?: string } = {
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    };
    if (resourceFilter !== '전체') params.resource = resourceFilter;

    void fetchAuditLogs(organizationId, params)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setItems(res.data.items);
          setTotal(res.data.pagination.total);
        } else {
          toast.error(res.error.message);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('감사 로그를 불러올 수 없습니다');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [currentPage, resourceFilter]);

  const entries = items.map(mapToEntry);

  const filteredEntries = entries.filter((e) => {
    if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(e.eventType)) return false;
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(e.severity)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.actor.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.details.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const warningCount = entries.filter((e) => e.severity === 'warning').length;
  const errorCount = entries.filter((e) => e.severity === 'error').length;
  const criticalCount = entries.filter((e) => e.severity === 'critical').length;

  const toggleEventType = (eventType: EventType) => {
    setSelectedEventTypes((prev) =>
      prev.includes(eventType) ? prev.filter((t) => t !== eventType) : [...prev, eventType]
    );
  };

  const toggleSeverity = (severity: SeverityLevel) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity) ? prev.filter((s) => s !== severity) : [...prev, severity]
    );
  };

  const activeFilterCount =
    (resourceFilter !== '전체' ? 1 : 0) + selectedEventTypes.length + selectedSeverities.length;

  const clearFilters = () => {
    setSearchQuery('');
    setResourceFilter('전체');
    setSelectedEventTypes([]);
    setSelectedSeverities([]);
  };

  const handleExportCsv = () => toast.success('CSV 다운로드를 시작합니다');
  const handleGenerateReport = () => toast.info('리포트 생성 중...');

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      <div className="pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              감사 추적 로그 Audit Trail Log
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              시스템 활동 및 보안 이벤트 추적
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-4 h-4 mr-2" />
              CSV 다운로드
            </Button>
            <Button variant="outline" size="sm" onClick={handleGenerateReport}>
              <FileText className="w-4 h-4 mr-2" />
              리포트 생성
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Calendar className="w-4 h-4 mr-2" />
            {new Date().toISOString().split('T')[0]}
          </Button>

          <Select value={resourceFilter} onValueChange={(v) => { setResourceFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체 리소스</SelectItem>
              <SelectItem value="document">document</SelectItem>
              <SelectItem value="policy">policy</SelectItem>
              <SelectItem value="skill">skill</SelectItem>
              <SelectItem value="prompt">prompt</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <Input
              placeholder="이벤트 검색... Search events"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              필터 초기화 ({activeFilterCount})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            이벤트 유형:
          </span>
          {eventTypes.map((et) => (
            <Badge
              key={et}
              variant="outline"
              className="cursor-pointer"
              onClick={() => toggleEventType(et)}
              style={{
                backgroundColor: selectedEventTypes.includes(et) ? 'var(--primary)' : 'transparent',
                color: selectedEventTypes.includes(et) ? 'var(--primary-foreground)' : 'var(--text-secondary)',
                borderColor: selectedEventTypes.includes(et) ? 'var(--primary)' : 'var(--border)',
              }}
            >
              {et}
            </Badge>
          ))}

          <div className="w-px h-5 mx-2" style={{ backgroundColor: 'var(--border)' }} />

          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            심각도:
          </span>
          {severities.map((s) => (
            <Badge
              key={s.value}
              variant="outline"
              className="cursor-pointer"
              onClick={() => toggleSeverity(s.value)}
              style={{
                backgroundColor: selectedSeverities.includes(s.value) ? 'var(--primary)' : 'transparent',
                color: selectedSeverities.includes(s.value) ? 'var(--primary-foreground)' : 'var(--text-secondary)',
                borderColor: selectedSeverities.includes(s.value) ? 'var(--primary)' : 'var(--border)',
              }}
            >
              {s.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</div>
        ) : (
          <AuditLogTable entries={filteredEntries} />
        )}
      </div>

      <div className="pt-4">
        <AuditLogSummary
          totalEvents={total}
          warningCount={warningCount}
          errorCount={errorCount}
          criticalCount={criticalCount}
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
