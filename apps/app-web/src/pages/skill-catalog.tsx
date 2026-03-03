import { useState, useEffect, useMemo } from 'react';
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
import { Search, Package, Star, Download, ArrowUpDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSkills, downloadSkill } from '@/api/skill';
import type { SkillRow } from '@/api/skill';
import { useOrganization } from '@/contexts/OrganizationContext';

const TRUST_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unreviewed: { label: '\uBBF8\uAC80\uD1A0', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  reviewed: { label: '\uAC80\uD1A0\uB428', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
  validated: { label: '\uAC80\uC99D\uB428', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
};

type SortKey = 'newest' | 'trust' | 'policies';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: '\uCD5C\uC2E0\uC21C' },
  { value: 'trust', label: '\uC2E0\uB8B0\uB3C4\uC21C' },
  { value: 'policies', label: '\uC815\uCC45\uC218\uC21C' },
];

function sortSkills(skills: SkillRow[], key: SortKey): SkillRow[] {
  return [...skills].sort((a, b) => {
    switch (key) {
      case 'newest':
        return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
      case 'trust':
        return b.trust.score - a.trust.score;
      case 'policies':
        return b.policyCount - a.policyCount;
    }
  });
}

export default function SkillCatalogPage() {
  const { organizationId } = useOrganization();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trustFilter, setTrustFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('newest');

  useEffect(() => {
    setLoading(true);
    void fetchSkills(organizationId, trustFilter ? { limit: 100, trustLevel: trustFilter } : { limit: 100 })
      .then((res) => { if (res.success) setSkills(res.data.skills); })
      .catch(() => toast.error('Skill \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4'))
      .finally(() => setLoading(false));
  }, [trustFilter]);

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
    e.preventDefault(); // prevent Link navigation
    e.stopPropagation();
    try {
      const blob = await downloadSkill(organizationId, skillId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${skillId}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('\uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC');
    } catch {
      toast.error('\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328');
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

  // Filter pipeline: search -> domain -> tags
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Domain filter
    if (domainFilter) {
      result = result.filter((s) => s.metadata.domain === domainFilter);
    }

    // Tag filter (AND logic: skill must have ALL selected tags)
    if (selectedTags.size > 0) {
      result = result.filter((s) =>
        Array.from(selectedTags).every((tag) => s.metadata.tags.includes(tag))
      );
    }

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.metadata.domain.toLowerCase().includes(q) ||
        s.skillId.toLowerCase().includes(q) ||
        (s.metadata.subdomain?.toLowerCase().includes(q) ?? false) ||
        s.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    return sortSkills(result, sortKey);
  }, [skills, domainFilter, selectedTags, searchQuery, sortKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Skill Marketplace
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI Foundry Skill \uD328\uD0A4\uC9C0 \uD0D0\uC0C9, \uD544\uD130\uB9C1, \uB2E4\uC6B4\uB85C\uB4DC
        </p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <Input placeholder="Skill \uAC80\uC0C9..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {/* Domain filter */}
        <Select value={domainFilter} onValueChange={(v) => setDomainFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue placeholder="\uB3C4\uBA54\uC778 \uC804\uCCB4" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">\uB3C4\uBA54\uC778 \uC804\uCCB4</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
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
              {filter === '' ? '\uC804\uCCB4' : TRUST_CONFIG[filter]?.label ?? filter}
            </Button>
          ))}
        </div>
      </div>

      {/* Tag Chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>\uD0DC\uADF8:</span>
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
              \uCD08\uAE30\uD654
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>\uCD1D Skill</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{skills.length}</div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>\uAC80\uC99D\uB428</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--success)' }}>
            {skills.filter((s) => s.trust.level === 'validated').length}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>\uAC80\uD1A0 \uC911</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--accent)' }}>
            {skills.filter((s) => s.trust.level === 'reviewed').length}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>\uCD1D \uC815\uCC45</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#9333EA' }}>
            {skills.reduce((sum, s) => sum + s.policyCount, 0)}
          </div>
        </CardContent></Card>
      </div>

      {/* Results count */}
      {!loading && (
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {filteredSkills.length === skills.length
            ? `${skills.length}\uAC1C Skill`
            : `${filteredSkills.length} / ${skills.length}\uAC1C Skill (\uD544\uD130 \uC801\uC6A9 \uC911)`}
        </div>
      )}

      {/* Skill Grid — responsive: 1/2/3 cols */}
      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>\uBD88\uB7EC\uC624\uB294 \uC911...</div>
      ) : filteredSkills.length === 0 ? (
        <Card><CardContent className="p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            {selectedTags.size > 0 || domainFilter || searchQuery
              ? '\uD544\uD130 \uC870\uAC74\uC5D0 \uB9DE\uB294 Skill\uC774 \uC5C6\uC2B5\uB2C8\uB2E4'
              : 'Skill \uD328\uD0A4\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => {
            const trust = TRUST_CONFIG[skill.trust.level] ?? TRUST_CONFIG['unreviewed']!;
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
                      <Badge style={{ backgroundColor: trust.bg, color: trust.color, border: 'none' }} className="text-xs">
                        {trust.label}
                      </Badge>
                    </div>
                    <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      {skill.metadata.domain}
                      {skill.metadata.subdomain ? ` / ${skill.metadata.subdomain}` : ''}
                    </h3>
                    <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                      <span>v{skill.metadata.version}</span>
                      <span>|</span>
                      <span>\uC815\uCC45 {skill.policyCount}\uAC74</span>
                      <span>|</span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" /> {(skill.trust.score * 100).toFixed(0)}%
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
                        <Download className="w-3 h-3 mr-1" /> \uB2E4\uC6B4\uB85C\uB4DC
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
