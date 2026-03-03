import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  Download,
  FileJson,
  Code2,
  Globe,
  Star,
  Shield,
  Tag,
  Calendar,
  User,
  Hash,
  BookOpen,
  ClipboardCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchSkill, downloadSkill, fetchSkillMcp, fetchSkillOpenApi } from '@/api/skill';
import type { SkillDetail, McpAdapter } from '@/api/skill';

const TRUST_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unreviewed: { label: '\uBBF8\uAC80\uD1A0', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  reviewed: { label: '\uAC80\uD1A0\uB428', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
  validated: { label: '\uAC80\uC99D\uB428', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '\uCD08\uC548', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  published: { label: '\uBC1C\uD589\uB428', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
  archived: { label: '\uBCF4\uAD00\uB428', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
};

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mcpAdapter, setMcpAdapter] = useState<McpAdapter | null>(null);
  const [openApiSpec, setOpenApiSpec] = useState<unknown>(null);
  const [showMcp, setShowMcp] = useState(false);
  const [showOpenApi, setShowOpenApi] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void fetchSkill(id)
      .then((res) => {
        if (res.success) {
          setSkill(res.data);
        } else {
          toast.error('Skill\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4');
        }
      })
      .catch(() => toast.error('Skill \uC870\uD68C \uC2E4\uD328'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownload = async () => {
    if (!id) return;
    try {
      const blob = await downloadSkill(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('\uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC');
    } catch {
      toast.error('\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328');
    }
  };

  const handleViewMcp = async () => {
    if (!id) return;
    if (mcpAdapter) {
      setShowMcp(!showMcp);
      return;
    }
    try {
      const adapter = await fetchSkillMcp(id);
      setMcpAdapter(adapter);
      setShowMcp(true);
    } catch {
      toast.error('MCP \uC5B4\uB311\uD130 \uC870\uD68C \uC2E4\uD328');
    }
  };

  const handleViewOpenApi = async () => {
    if (!id) return;
    if (openApiSpec !== null) {
      setShowOpenApi(!showOpenApi);
      return;
    }
    try {
      const spec = await fetchSkillOpenApi(id);
      setOpenApiSpec(spec);
      setShowOpenApi(true);
    } catch {
      toast.error('OpenAPI \uC2A4\uD399 \uC870\uD68C \uC2E4\uD328');
    }
  };

  const trustConfig = useMemo(() => {
    if (!skill) return TRUST_CONFIG['unreviewed']!;
    return TRUST_CONFIG[skill.trust.level] ?? TRUST_CONFIG['unreviewed']!;
  }, [skill]);

  const statusConfig = useMemo(() => {
    if (!skill) return STATUS_CONFIG['draft']!;
    return STATUS_CONFIG[skill.status] ?? STATUS_CONFIG['draft']!;
  }, [skill]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Skill \uC815\uBCF4 \uBD88\uB7EC\uC624\uB294 \uC911...</p>
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/skills')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Skill \uCE74\uD0C8\uB85C\uADF8\uB85C \uB3CC\uC544\uAC00\uAE30
        </Button>
        <Card>
          <CardContent className="p-16 text-center">
            <p style={{ color: 'var(--text-secondary)' }}>Skill\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const trustPercent = Math.round(skill.trust.score * 100);

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Button variant="ghost" onClick={() => navigate('/skills')}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Skill \uCE74\uD0C8\uB85C\uADF8
      </Button>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between w-full">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <code
                  className="text-sm px-3 py-1 rounded font-mono"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--primary)' }}
                >
                  {skill.skillId}
                </code>
                <Badge style={{ backgroundColor: trustConfig.bg, color: trustConfig.color, border: 'none' }}>
                  <Shield className="w-3 h-3" />
                  {trustConfig.label}
                </Badge>
                <Badge style={{ backgroundColor: statusConfig.bg, color: statusConfig.color, border: 'none' }}>
                  {statusConfig.label}
                </Badge>
                <Badge variant="outline">v{skill.metadata.version}</Badge>
              </div>
              <CardTitle className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {skill.metadata.domain}
                {skill.metadata.subdomain ? ` / ${skill.metadata.subdomain}` : ''}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {skill.metadata.author}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(skill.metadata.createdAt).toLocaleDateString('ko-KR')}
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              {skill.metadata.language}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Trust Score */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>\uC2E0\uB8B0\uB3C4 Trust Score</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{trustPercent}%</span>
              <Badge style={{ backgroundColor: trustConfig.bg, color: trustConfig.color, border: 'none' }} className="text-xs">
                {trustConfig.label}
              </Badge>
            </div>
            <Progress value={trustPercent} className="h-2" />
          </CardContent>
        </Card>

        {/* Policy Count */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4" style={{ color: '#9333EA' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>\uC815\uCC45 \uC218 Policies</span>
            </div>
            <span className="text-3xl font-bold" style={{ color: '#9333EA' }}>{skill.policyCount}</span>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>condition-criteria-outcome triples</p>
          </CardContent>
        </Card>

        {/* Ontology Reference */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4" style={{ color: 'var(--success)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>\uC628\uD1A8\uB85C\uC9C0 Ontology</span>
            </div>
            <code
              className="text-sm px-2 py-1 rounded font-mono break-all"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              {skill.ontologyId || 'N/A'}
            </code>
          </CardContent>
        </Card>
      </div>

      {/* Tags */}
      {skill.metadata.tags.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>\uD0DC\uADF8 Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {skill.metadata.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata Detail */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>\uC0C1\uC138 \uC815\uBCF4</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>\uC0DD\uC131\uC77C</span>
              <p style={{ color: 'var(--text-primary)' }}>
                {new Date(skill.metadata.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>\uC218\uC815\uC77C</span>
              <p style={{ color: 'var(--text-primary)' }}>
                {new Date(skill.metadata.updatedAt).toLocaleString('ko-KR')}
              </p>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>R2 \uC800\uC7A5 \uACBD\uB85C</span>
              <code className="text-xs block mt-0.5 font-mono" style={{ color: 'var(--text-primary)' }}>
                {skill.r2Key}
              </code>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>\uC0C1\uD0DC</span>
              <p style={{ color: 'var(--text-primary)' }}>{statusConfig.label} ({skill.status})</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void handleDownload()}>
          <Download className="w-4 h-4 mr-2" /> .skill.json \uB2E4\uC6B4\uB85C\uB4DC
        </Button>
        <Button variant="outline" onClick={() => void handleViewMcp()}>
          <Code2 className="w-4 h-4 mr-2" /> {showMcp ? 'MCP \uC5B4\uB311\uD130 \uC228\uAE30\uAE30' : 'MCP \uC5B4\uB311\uD130 \uBCF4\uAE30'}
        </Button>
        <Button variant="outline" onClick={() => void handleViewOpenApi()}>
          <FileJson className="w-4 h-4 mr-2" /> {showOpenApi ? 'OpenAPI \uC2A4\uD399 \uC228\uAE30\uAE30' : 'OpenAPI \uC2A4\uD399 \uBCF4\uAE30'}
        </Button>
        <Button variant="secondary" disabled>
          <ClipboardCheck className="w-4 h-4 mr-2" /> \uD3C9\uAC00\uD558\uAE30 (\uC900\uBE44 \uC911)
        </Button>
      </div>

      {/* MCP Adapter Viewer */}
      {showMcp && mcpAdapter && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">MCP \uC5B4\uB311\uD130</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="text-xs p-4 rounded overflow-auto max-h-96 font-mono"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              {JSON.stringify(mcpAdapter, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* OpenAPI Spec Viewer */}
      {showOpenApi && openApiSpec !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">OpenAPI \uC2A4\uD399</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="text-xs p-4 rounded overflow-auto max-h-96 font-mono"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              {JSON.stringify(openApiSpec, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
