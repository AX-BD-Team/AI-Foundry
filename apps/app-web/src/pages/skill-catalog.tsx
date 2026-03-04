import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Package, Star, Download, ArrowUpDown, X, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSkills, fetchSkillStats, downloadSkill } from '@/api/skill';
import type { SkillRow, SkillStats } from '@/api/skill';
import { useOrganization } from '@/contexts/OrganizationContext';

const TRUST_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unreviewed: { label: '미검토', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  reviewed: { label: '검토됨', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
  validated: { label: '검증됨', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
};

const DEPTH_CONFIG: Record<string, { label: string; color: string; bg: string; minDepth: number }> = {
  rich: { label: '상세', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.1)', minDepth: 150 },
  medium: { label: '보통', color: '#CA8A04', bg: 'rgba(202, 138, 4, 0.1)', minDepth: 50 },
  thin: { label: '간략', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.1)', minDepth: 0 },
};

function getDepthLevel(depth: number): 'rich' | 'medium' | 'thin' {
  if (depth >= 150) return 'rich';
  if (depth >= 50) return 'medium';
  return 'thin';
}

type SortKey = 'newest' | 'depth' | 'trust' | 'policies';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'depth', label: '품질순' },
  { value: 'newest', label: '최신순' },
  { value: 'trust', label: '신뢰도순' },
  { value: 'policies', label: '정책수순' },
];

function sortSkills(skills: SkillRow[], key: SortKey): SkillRow[] {
  return [...skills].sort((a, b) => {
    switch (key) {
      case 'newest':
        return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
      case 'depth':
        return (b.contentDepth ?? 0) - (a.contentDepth ?? 0);
      case 'trust':
        return b.trust.score - a.trust.score;
      case 'policies':
        return b.policyCount - a.policyCount;
    }
  });
}

type DepthFilter = '' | 'rich' | 'medium+';

export default function SkillCatalogPage() {
  const { organizationId } = useOrganization();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SkillStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trustFilter, setTrustFilter] = useState('');
  const [depthFilter, setDepthFilter] = useState<DepthFilter>('medium+');
  const [domainFilter, setDomainFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('depth');

  // Load global stats once
  useEffect(() => {
    void fetchSkillStats(organizationId).then((res) => {
      if (res.success) setStats(res.data);
    });
  }, [organizationId]);

  const loadSkills = useCallback(() => {
    setLoading(true);
    const params: Parameters<typeof fetchSkills>[1] = {
      limit: 100,
      sort: sortKey === 'depth' ? 'depth_desc' : sortKey === 'newest' ? 'newest' : 'newest',
    };
    if (trustFilter) params.trustLevel = trustFilter;
    if (depthFilter === 'rich') params.minDepth = 150;
    else if (depthFilter === 'medium+') params.minDepth = 50;

    void fetchSkills(organizationId, params)
      .then((res) => {
        if (res.success) {
          setSkills(res.data.skills);
          setTotal(res.data.total);
        }
      })
      .catch(() => toast.error('Skill 목록을 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  }, [organizationId, trustFilter, depthFilter, sortKey]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  // Extract unique domains from loaded skills
  const domains = useMemo(() => {
    const domainSet = new Set<string>();
    for (const s of skills) {
      domainSet.add(s.metadata.domain);
    }
    return Array.from(domainSet).sort();
  }, [skills]);

  // Extract unique tags from loaded skills
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const s of skills) {
      for (const t of s.metadata.tags) {
        tagSet.add(t);
      }
    }
    return Array.from(tagSet).sort();
  }, [skills]);

  const handleDownload = async (e: React.MouseEvent, skillId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const blob = await downloadSkill(organizationId, skillId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${skillId}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('다운로드 완료');
    } catch {
      toast.error('다운로드 실패');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Client-side filter pipeline: search -> domain -> tags
  const filteredSkills = useMemo(() => {
    let result = skills;

    if (domainFilter) {
      result = result.filter((s) => s.metadata.domain === domainFilter);
    }

    if (selectedTags.size > 0) {
      result = result.filter((s) =>
        Array.from(selectedTags).every((tag) => s.metadata.tags.includes(tag))
      );
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.metadata.domain.toLowerCase().includes(q) ||
        s.skillId.toLowerCase().includes(q) ||
        (s.metadata.subdomain?.toLowerCase().includes(q) ?? false) ||
        s.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return sortSkills(result, sortKey);
  }, [skills, domainFilter, selectedTags, searchQuery, sortKey]);

  const depthStats = stats?.byContentDepth ?? { rich: 0, medium: 0, thin: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Skill Marketplace
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI Foundry Skill 패키지 탐색, 필터링, 다운로드
        </p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <Input placeholder="Skill 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {/* Domain filter */}
        <Select value={domainFilter} onValueChange={(v) => setDomainFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue placeholder="도메인 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">도메인 전체</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quality filter */}
        <Select value={depthFilter || '__all_depth__'} onValueChange={(v) => setDepthFilter(v === '__all_depth__' ? '' : v as DepthFilter)}>
          <SelectTrigger className="w-[160px]" size="sm">
            <BarChart3 className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all_depth__">품질 전체</SelectItem>
            <SelectItem value="medium+">보통 이상</SelectItem>
            <SelectItem value="rich">상세만</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[150px]" size="sm">
            <ArrowUpDown className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Trust filter buttons */}
        <div className="flex gap-2">
          {['', 'unreviewed', 'reviewed', 'validated'].map((filter) => (
            <Button
              key={filter}
              variant={trustFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrustFilter(filter)}
            >
              {filter === '' ? '전체' : TRUST_CONFIG[filter]?.label ?? filter}
            </Button>
          ))}
        </div>
      </div>

      {/* Tag Chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>태그:</span>
          {allTags.map((tag) => {
            const isActive = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer border"
                style={{
                  backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  borderColor: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                {tag}
                {isActive && <X className="w-3 h-3" />}
              </button>
            );
          })}
          {selectedTags.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags(new Set())}
              className="text-xs underline cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              초기화
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 Skill</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {(stats?.totalSkills ?? total).toLocaleString()}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>상세 (150+)</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#16A34A' }}>
            {depthStats.rich}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>보통 (50~150)</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#CA8A04' }}>
            {depthStats.medium}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>간략 (&lt;50)</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#DC2626' }}>
            {depthStats.thin}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 정책</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#9333EA' }}>
            {(stats?.totalPolicies ?? skills.reduce((sum, s) => sum + s.policyCount, 0)).toLocaleString()}
          </div>
        </CardContent></Card>
      </div>

      {/* Results count */}
      {!loading && (
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {filteredSkills.length === skills.length
            ? `${skills.length}개 Skill (전체 ${total.toLocaleString()}개 중 상위 ${skills.length}개 표시)`
            : `${filteredSkills.length} / ${skills.length}개 Skill (필터 적용 중)`}
        </div>
      )}

      {/* Skill Grid */}
      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</div>
      ) : filteredSkills.length === 0 ? (
        <Card><CardContent className="p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            {selectedTags.size > 0 || domainFilter || searchQuery
              ? '필터 조건에 맞는 Skill이 없습니다'
              : 'Skill 패키지가 없습니다'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => {
            const trust = TRUST_CONFIG[skill.trust.level] ?? TRUST_CONFIG['unreviewed']!;
            const depthLevel = getDepthLevel(skill.contentDepth ?? 0);
            const depth = DEPTH_CONFIG[depthLevel]!;
            return (
              <Link
                key={skill.skillId}
                to={`/skills/${skill.skillId}`}
                className="block group"
              >
                <Card className="shadow-sm hover:shadow-lg transition-shadow h-full group-hover:border-[var(--primary)] group-hover:border-opacity-50">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <code className="text-xs px-2 py-1 rounded font-mono" style={{ backgroundColor: 'var(--surface)', color: 'var(--primary)' }}>
                        {skill.skillId.slice(0, 12)}
                      </code>
                      <div className="flex gap-1.5">
                        <Badge style={{ backgroundColor: depth.bg, color: depth.color, border: 'none' }} className="text-xs">
                          {depth.label}
                        </Badge>
                        <Badge style={{ backgroundColor: trust.bg, color: trust.color, border: 'none' }} className="text-xs">
                          {trust.label}
                        </Badge>
                      </div>
                    </div>
                    <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      {skill.metadata.domain}
                      {skill.metadata.subdomain ? ` / ${skill.metadata.subdomain}` : ''}
                    </h3>
                    <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                      <span>v{skill.metadata.version}</span>
                      <span>|</span>
                      <span>정책 {skill.policyCount}건</span>
                      <span>|</span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" /> {skill.contentDepth ?? 0}자
                      </span>
                    </div>
                    {skill.metadata.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {skill.metadata.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                        {skill.metadata.tags.length > 4 && (
                          <Badge variant="outline" className="text-xs">+{skill.metadata.tags.length - 4}</Badge>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{skill.metadata.author} | {new Date(skill.metadata.createdAt).toLocaleDateString('ko-KR')}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => void handleDownload(e, skill.skillId)}
                      >
                        <Download className="w-3 h-3 mr-1" /> 다운로드
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
