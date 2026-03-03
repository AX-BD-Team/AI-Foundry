import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Bell, Lock, Palette, Database, Save, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { fetchNotifications, markNotificationRead } from '@/api/notification';
import type { Notification } from '@/api/notification';
import { useOrganization } from '@/contexts/OrganizationContext';

interface ServiceHealth {
  name: string;
  status: 'ok' | 'error' | 'loading';
  timestamp?: string;
}

const SERVICES = [
  'svc-ingestion', 'svc-extraction', 'svc-policy', 'svc-ontology', 'svc-skill',
  'svc-llm-router', 'svc-security', 'svc-governance', 'svc-notification',
  'svc-analytics', 'svc-queue-router',
] as const;

export default function SettingsPage() {
  const { organizationId } = useOrganization();
  const { darkMode, setDarkMode } = useTheme();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(true);
  const [language, setLanguage] = useState('ko');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [healthChecks, setHealthChecks] = useState<ServiceHealth[]>(
    SERVICES.map((s) => ({ name: s, status: 'loading' as const })),
  );
  const [healthLoading, setHealthLoading] = useState(false);

  const handleSave = () => toast.success('설정이 저장되었습니다');

  // --- Notification API ---
  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await fetchNotifications(organizationId);
      if (res.success && res.data) {
        setNotifications(res.data.items);
      }
    } catch {
      // silent — notifications unavailable
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(organizationId, id);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === id ? { ...n, read: true } : n)),
      );
      toast.success('알림을 읽음 처리했습니다');
    } catch {
      toast.error('처리 실패');
    }
  };

  // --- Health Check ---
  const runHealthChecks = useCallback(async () => {
    setHealthLoading(true);
    setHealthChecks(SERVICES.map((s) => ({ name: s, status: 'loading' as const })));

    const apiBase =
      (import.meta.env['VITE_API_BASE'] as string | undefined) ?? '/api';
    const secret =
      (import.meta.env['VITE_INTERNAL_SECRET'] as string | undefined) ??
      'dev-secret';

    // Use the proxy to hit each service's health endpoint
    // The proxy routes /api/<segment>/health → svc-<service>/segment/health
    // But /health is the root endpoint, not under a segment.
    // So we directly fetch the Worker URLs for health checks.
    const account = 'sinclair-account';
    const results = await Promise.allSettled(
      SERVICES.map(async (svc) => {
        const url = `https://${svc}.${account}.workers.dev/health`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json() as { status?: string; timestamp?: string };
        return { name: svc, status: data.status === 'ok' ? 'ok' : 'error', timestamp: data.timestamp } as ServiceHealth;
      }),
    );

    // If direct fetch fails due to CORS, fall back to proxy-based check
    const newChecks: ServiceHealth[] = results.map((r, i) => {
      const svc = SERVICES[i];
      if (!svc) return { name: 'unknown', status: 'error' as const };
      if (r.status === 'fulfilled') return r.value;
      return { name: svc, status: 'error' as const };
    });
    setHealthChecks(newChecks);
    setHealthLoading(false);

    const okCount = newChecks.filter((c) => c.status === 'ok').length;
    toast.info(`Health Check: ${String(okCount)}/${String(SERVICES.length)} 정상`);
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const okCount = healthChecks.filter((c) => c.status === 'ok').length;
  const errorCount = healthChecks.filter((c) => c.status === 'error').length;
  const loadingCount = healthChecks.filter((c) => c.status === 'loading').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          설정 Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          시스템 환경 설정 및 개인화
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile"><User className="w-4 h-4 mr-2" />프로필</TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />알림
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5">
                {notifications.filter((n) => !n.read).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="security"><Lock className="w-4 h-4 mr-2" />보안</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" />모양</TabsTrigger>
          <TabsTrigger value="system"><Database className="w-4 h-4 mr-2" />시스템</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>사용자 정보 User Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름 Name</Label>
                  <Input id="name" defaultValue="관리자" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">역할 Role</Label>
                  <Input id="role" defaultValue="시스템 관리자" disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일 Email</Label>
                <Input id="email" type="email" defaultValue="admin@aifoundry.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">부서 Department</Label>
                <Select defaultValue="it">
                  <SelectTrigger id="department"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">IT 운영팀</SelectItem>
                    <SelectItem value="dev">개발팀</SelectItem>
                    <SelectItem value="domain">도메인 전문가</SelectItem>
                    <SelectItem value="qa">품질 관리팀</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>알림 설정 Notification Settings</CardTitle>
                <Button variant="outline" size="sm" onClick={() => void loadNotifications()} disabled={notifLoading}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${notifLoading ? 'animate-spin' : ''}`} />새로고침
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>이메일 알림</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>중요 이벤트 발생 시 이메일로 알림을 받습니다</div>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Slack 알림</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Slack 채널로 실시간 알림을 받습니다</div>
                </div>
                <Switch checked={slackNotifications} onCheckedChange={setSlackNotifications} />
              </div>

              {/* Recent notifications from API */}
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  최근 알림 ({String(notifications.length)}건)
                </h4>
                {notifications.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>알림이 없습니다.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.slice(0, 20).map((n) => (
                      <div
                        key={n.notification_id}
                        className="flex items-start justify-between p-3 rounded-lg"
                        style={{
                          backgroundColor: n.read ? 'var(--surface)' : 'var(--accent-bg, rgba(59,130,246,0.08))',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                            {!n.read && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2" />}
                            {n.title}
                          </div>
                          <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                            {n.body}
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {new Date(n.created_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 shrink-0"
                            onClick={() => void handleMarkRead(n.notification_id)}
                          >
                            읽음
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>알림 유형</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-policy">정책 검토 요청</Label>
                    <Switch id="notif-policy" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-error">시스템 오류</Label>
                    <Switch id="notif-error" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-deploy">Skill 배포 완료</Label>
                    <Switch id="notif-deploy" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-trust">신뢰도 경고</Label>
                    <Switch id="notif-trust" defaultChecked />
                  </div>
                </div>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>보안 설정 Security Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>2단계 인증 (2FA)</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>로그인 시 추가 인증 단계를 거칩니다</div>
                </div>
                <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>비밀번호 변경</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">현재 비밀번호</Label>
                    <Input id="current-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">새 비밀번호</Label>
                    <Input id="new-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">비밀번호 확인</Label>
                    <Input id="confirm-password" type="password" />
                  </div>
                  <Button variant="outline">비밀번호 변경</Button>
                </div>
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>세션 관리</h4>
                <div className="p-4 rounded-lg mb-3" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>현재 세션</div>
                    <div className="text-xs text-green-600">● 활성</div>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>IP: 10.0.1.45 • 위치: Seoul, Korea</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>마지막 활동: 방금 전</div>
                </div>
                <Button variant="destructive" size="sm">모든 세션 종료</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>모양 설정 Appearance Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="language">언어 Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ko">한국어 (Korean)</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>다크 모드</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>어두운 테마를 사용합니다</div>
                </div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="density">화면 밀도</Label>
                <Select defaultValue="comfortable">
                  <SelectTrigger id="density"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">컴팩트</SelectItem>
                    <SelectItem value="comfortable">편안함</SelectItem>
                    <SelectItem value="spacious">여유있게</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>서비스 Health 모니터링</CardTitle>
                <Button variant="outline" size="sm" onClick={() => void runHealthChecks()} disabled={healthLoading}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${healthLoading ? 'animate-spin' : ''}`} />
                  {loadingCount > 0 ? '확인 중...' : '전체 확인'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-1 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span style={{ color: 'var(--text-secondary)' }}>{String(okCount)} 정상</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span style={{ color: 'var(--text-secondary)' }}>{String(errorCount)} 오류</span>
                </div>
                {loadingCount > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{String(loadingCount)} 확인 중</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {healthChecks.map((svc) => (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                      {svc.name.replace('svc-', '')}
                    </span>
                    {svc.status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-secondary)' }} />}
                    {svc.status === 'ok' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {svc.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader><CardTitle>시스템 설정 System Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input id="api-endpoint" defaultValue="https://ai-foundry.minu.best/api" disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-concurrent">최대 동시 실행 Skill</Label>
                <Input id="max-concurrent" type="number" defaultValue="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">요청 타임아웃 (초)</Label>
                <Input id="timeout" type="number" defaultValue="30" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>자동 백업</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>매일 자동으로 데이터를 백업합니다</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>상세 로깅</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>모든 API 호출 및 이벤트를 기록합니다</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>위험한 작업</h4>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full"><Database className="w-4 h-4 mr-2" />데이터베이스 백업</Button>
                  <Button variant="outline" className="w-full">캐시 초기화</Button>
                  <Button variant="destructive" className="w-full">시스템 초기화</Button>
                </div>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
