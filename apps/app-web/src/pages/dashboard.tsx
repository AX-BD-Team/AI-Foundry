import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Upload,
  FileSearch,
  CheckSquare,
  Package,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchSkills } from '@/api/skill';
import { fetchAuditLogs } from '@/api/security';
import type { AuditRow } from '@/api/security';
import { useOrganization } from '@/contexts/OrganizationContext';

interface SystemStat {
  label: string;
  value: string;
  color: string;
  icon: LucideIcon;
}

export default function DashboardPage() {
  const { organizationId } = useOrganization();
  const [stats, setStats] = useState<SystemStat[]>([
    { label: '처리 중인 문서', value: '—', color: '#3B82F6', icon: FileSearch },
    { label: '검토 대기', value: '—', color: 'var(--accent)', icon: AlertCircle },
    { label: '활성 Skill', value: '—', color: 'var(--success)', icon: ShieldCheck },
    { label: '감사 이벤트', value: '—', color: '#6B7280', icon: TrendingUp },
  ]);
  const [recentActivities, setRecentActivities] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [skillsRes, auditRes] = await Promise.allSettled([
          fetchSkills(organizationId, { limit: 100 }),
          fetchAuditLogs(organizationId, { limit: 10 }),
        ]);

        if (cancelled) return;

        const skillCount = skillsRes.status === 'fulfilled' && skillsRes.value.success
          ? skillsRes.value.data.skills.length : 0;
        const auditData = auditRes.status === 'fulfilled' && auditRes.value.success
          ? auditRes.value.data : null;

        setStats([
          { label: '처리 중인 문서', value: '—', color: '#3B82F6', icon: FileSearch },
          { label: '검토 대기', value: '—', color: 'var(--accent)', icon: AlertCircle },
          { label: '활성 Skill', value: `${skillCount}개`, color: 'var(--success)', icon: ShieldCheck },
          { label: '감사 이벤트', value: `${auditData?.pagination.total ?? 0}건`, color: '#6B7280', icon: TrendingUp },
        ]);

        if (auditData) {
          setRecentActivities(auditData.items.slice(0, 4));
        }
      } catch {
        // graceful fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, []);

  const quickActions = [
    { icon: Upload, label: '문서 업로드', path: '/upload', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
    { icon: FileSearch, label: '분석 결과', path: '/analysis', color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    { icon: CheckSquare, label: 'HITL 검토', path: '/hitl', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.1)' },
    { icon: Package, label: 'Skill 카탈로그', path: '/skills', color: '#9333EA', bg: 'rgba(147, 51, 234, 0.1)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          대시보드 Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI Foundry 플랫폼 통합 관리
        </p>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} style={{ borderRadius: 'var(--radius-lg)' }}>
            <CardContent className="p-6">
              <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{stat.label}</div>
              <div className="text-3xl font-bold" style={{ color: stat.color }}>
                {loading ? '...' : stat.value}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                <stat.icon className="w-4 h-4 inline-block" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card style={{ borderRadius: 'var(--radius-lg)' }}>
        <CardHeader>
          <CardTitle>빠른 실행 Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Link key={index} to={action.path}>
                  <Card className="cursor-pointer transition-all hover:shadow-lg" style={{ borderRadius: 'var(--radius-lg)' }}>
                    <CardContent className="p-6 flex flex-col items-center text-center">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: action.bg }}>
                        <Icon className="w-8 h-8" style={{ color: action.color }} />
                      </div>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{action.label}</div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activities + Notifications */}
      <div className="grid grid-cols-2 gap-6">
        <Card style={{ borderRadius: 'var(--radius-lg)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              최근 활동 Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivities.length > 0 ? recentActivities.map((item) => (
                <div key={item.audit_id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(item.occurred_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {item.action} — {item.resource}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      by {item.user_id}
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {loading ? '불러오는 중...' : '최근 활동 없음'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card style={{ borderRadius: 'var(--radius-lg)' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              알림 Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-3 rounded-lg border-l-4" style={{ backgroundColor: 'rgba(246, 173, 85, 0.05)', borderColor: 'var(--accent)' }}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>검토 대기 중</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>정책이 검토를 기다리고 있습니다</div>
              </div>
              <div className="p-3 rounded-lg border-l-4" style={{ backgroundColor: 'var(--success-light)', borderColor: 'var(--success)' }}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>시스템 정상 작동</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>모든 서비스가 정상적으로 운영 중입니다</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
