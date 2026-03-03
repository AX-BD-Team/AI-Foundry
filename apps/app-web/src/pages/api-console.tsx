import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpMappingItem, type MappingStatus } from '@/components/McpMappingItem';
import { CodeBlock } from '@/components/CodeBlock';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { IntegrationGuide } from '@/components/IntegrationGuide';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSkills, fetchSkillMcp, type SkillRow, type McpAdapter } from '@/api/skill';
import { useOrganization } from '@/contexts/OrganizationContext';

interface McpMapping {
  id: string;
  skillId: string;
  skillName: string;
  mcpToolName: string;
  status: MappingStatus;
  lastSynced: string;
  enabled: boolean;
  definition: string;
}

function skillToMappings(skill: SkillRow, adapter: McpAdapter): McpMapping[] {
  return adapter.tools.map((tool, idx) => ({
    id: `${skill.skillId}-${String(idx)}`,
    skillId: skill.skillId,
    skillName: `${skill.metadata.domain}${skill.metadata.subdomain ? ` / ${skill.metadata.subdomain}` : ''}`,
    mcpToolName: tool.name,
    status: 'active' as MappingStatus,
    lastSynced: new Date().toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    enabled: true,
    definition: JSON.stringify(tool, null, 2),
  }));
}

export default function ApiConsolePage() {
  const { organizationId } = useOrganization();
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<McpMapping[]>([]);
  const [activeTab, setActiveTab] = useState('mcp-adapter');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSkills(organizationId, { limit: 50 })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error.message);
          setLoading(false);
          return;
        }

        const allMappings: McpMapping[] = [];
        for (const skill of res.data.skills) {
          if (cancelled) break;
          try {
            const adapter = await fetchSkillMcp(organizationId, skill.skillId);
            const items = skillToMappings(skill, adapter);
            allMappings.push(...items);
          } catch (e: unknown) {
            console.error(`Failed to fetch MCP for skill ${skill.skillId}`, e);
          }
        }

        if (cancelled) return;
        setMappings(allMappings);
        const firstMapping = allMappings[0];
        if (firstMapping) {
          setSelectedMappingId(firstMapping.id);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Failed to fetch skills', e);
        setError('스킬 목록을 불러올 수 없습니다');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const selectedMapping = mappings.find((m) => m.id === selectedMappingId);

  const handleToggleMapping = (id: string, enabled: boolean) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const newStatus: MappingStatus = enabled ? 'active' : 'inactive';
          toast.success(enabled ? 'Mapping이 활성화되었습니다' : 'Mapping이 비활성화되었습니다');
          return { ...m, enabled, status: newStatus };
        }
        return m;
      })
    );
  };

  const handleTestCall = () => {
    toast.info('MCP Tool 테스트 호출 중...');
    setTimeout(() => toast.success('테스트 호출 성공!'), 1000);
  };

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      <div className="pb-4">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          API & MCP 연결 콘솔
        </h1>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="mcp-adapter">MCP Adapter</TabsTrigger>
            <TabsTrigger value="openapi">OpenAPI 3.1</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="usage">사용량</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'mcp-adapter' && (
          <div className="h-full flex flex-col">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            {!loading && !error && mappings.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-secondary)' }}>
                등록된 Skill MCP 매핑이 없습니다
              </div>
            )}
            {!loading && !error && mappings.length > 0 && (
              <>
                <div className="flex-1 grid grid-cols-[40%_60%] gap-6 overflow-hidden">
                  <div className="flex flex-col space-y-4 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Skill → MCP Tool 변환 목록
                      </h2>
                    </div>
                    <div className="flex-1 overflow-auto space-y-3 pr-2">
                      {mappings.map((mapping) => (
                        <McpMappingItem
                          key={mapping.id}
                          skillId={mapping.skillId}
                          skillName={mapping.skillName}
                          mcpToolName={mapping.mcpToolName}
                          status={mapping.status}
                          lastSynced={mapping.lastSynced}
                          enabled={mapping.enabled}
                          onToggle={(enabled) => handleToggleMapping(mapping.id, enabled)}
                          onClick={() => setSelectedMappingId(mapping.id)}
                          isSelected={selectedMappingId === mapping.id}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col space-y-4 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        MCP Tool Definition
                      </h2>
                      <Button variant="outline" size="sm" onClick={handleTestCall}>
                        <FlaskConical className="w-4 h-4 mr-2" />
                        테스트 호출
                      </Button>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      {selectedMapping && (
                        <CodeBlock
                          code={selectedMapping.definition}
                          language="json"
                          title={`${selectedMapping.mcpToolName}.json`}
                          showActions={true}
                        />
                      )}
                    </div>

                    <ConnectionStatus
                      serverUrl="mcp://ai-foundry.ktds.co.kr/skills"
                      status="connected"
                      lastHeartbeat="3초 전"
                      connectedAgents={2}
                    />
                  </div>
                </div>

                <div className="pt-6">
                  <IntegrationGuide />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'openapi' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            OpenAPI 3.1 탭 (개발 예정)
          </div>
        )}

        {activeTab === 'api-keys' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            API Keys 탭 (개발 예정)
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            사용량 탭 (개발 예정)
          </div>
        )}
      </div>
    </div>
  );
}
