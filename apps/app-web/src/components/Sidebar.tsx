import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  FileSearch,
  BarChart3,
  CheckSquare,
  Network,
  Package,
  Plug,
  ShieldCheck,
  FileText,
  BookOpen,
  Settings,
  User,
  Moon,
  Sun,
  Building2,
  LogOut,
  Code,
  GitCompareArrows,
  FileJson,
  PackageOpen,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/contexts/ThemeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  path: string;
}

const ORGANIZATIONS = [
  { id: 'Miraeasset', label: '미래에셋 퇴직연금', labelEn: 'Miraeasset Pension' },
  { id: 'org-mirae-pension', label: '미래에셋 (분석)', labelEn: 'Miraeasset (Analyzed)' },
  { id: 'LPON', label: 'LPON 온누리상품권', labelEn: 'LPON Gift Certificate' },
  { id: 'org-001', label: '파일럿', labelEn: 'Pilot' },
] as const;

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationId, setOrganizationId } = useOrganization();
  const { user, logout } = useAuth();

  const userName = user?.userName ?? '게스트';
  const userRole = user?.label ?? '미인증';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems: MenuItem[] = [
    {
      icon: <LayoutDashboard className="w-5 h-5" />,
      label: '대시보드',
      labelEn: 'Dashboard',
      path: '/',
    },
    {
      icon: <BookOpen className="w-5 h-5" />,
      label: '이용 가이드',
      labelEn: 'User Guide',
      path: '/guide',
    },
    {
      icon: <Upload className="w-5 h-5" />,
      label: '문서 업로드',
      labelEn: 'Document Upload',
      path: '/upload',
    },
    {
      icon: <FileSearch className="w-5 h-5" />,
      label: '분석 결과',
      labelEn: 'Analysis',
      path: '/analysis',
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      label: '분석 리포트',
      labelEn: 'Analysis Report',
      path: '/analysis-report',
    },
    {
      icon: <Code className="w-5 h-5" />,
      label: '소스코드 업로드',
      labelEn: 'Source Upload',
      path: '/source-upload',
    },
    {
      icon: <GitCompareArrows className="w-5 h-5" />,
      label: '팩트 체크',
      labelEn: 'Fact Check',
      path: '/fact-check',
    },
    {
      icon: <FileJson className="w-5 h-5" />,
      label: 'Spec 카탈로그',
      labelEn: 'Spec Catalog',
      path: '/specs',
    },
    {
      icon: <PackageOpen className="w-5 h-5" />,
      label: 'Export 센터',
      labelEn: 'Export Center',
      path: '/export',
    },
    {
      icon: <CheckSquare className="w-5 h-5" />,
      label: 'HITL 검토',
      labelEn: 'HITL Review',
      path: '/hitl',
    },
    {
      icon: <Network className="w-5 h-5" />,
      label: '온톨로지',
      labelEn: 'Ontology',
      path: '/ontology',
    },
    {
      icon: <Package className="w-5 h-5" />,
      label: 'Skill 카탈로그',
      labelEn: 'Skill Catalog',
      path: '/skills',
    },
    {
      icon: <Plug className="w-5 h-5" />,
      label: 'API 연결',
      labelEn: 'API Console',
      path: '/api-console',
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      label: '신뢰도 대시보드',
      labelEn: 'Trust Dashboard',
      path: '/trust',
    },
    {
      icon: <FileText className="w-5 h-5" />,
      label: '감사 로그',
      labelEn: 'Audit Log',
      path: '/audit',
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: '설정',
      labelEn: 'Settings',
      path: '/settings',
    },
  ];

  const isActive = (item: MenuItem) => {
    return location.pathname === item.path;
  };

  const { darkMode, toggleDarkMode } = useTheme();

  return (
    <aside className="w-60 h-screen flex flex-col border-r" style={{ backgroundColor: 'var(--primary)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
      {/* Logo */}
      <div className="p-6 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <Link to="/" className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <span className="text-xl font-bold" style={{ color: 'var(--accent-foreground)' }}>
              AI
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--primary-foreground)' }}>
              AI Foundry
            </h1>
            <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
              Enterprise Platform
            </p>
          </div>
        </Link>
      </div>

      {/* Organization Selector */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-2 px-1">
          <Building2 className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          <span className="text-xs font-medium" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            조직 선택
          </span>
        </div>
        <Select value={organizationId} onValueChange={setOrganizationId}>
          <SelectTrigger
            className="w-full border-white/20 text-sm"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--primary-foreground)',
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIZATIONS.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                <div>
                  <div className="text-sm">{org.label}</div>
                  <div className="text-xs text-muted-foreground">{org.labelEn}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 overflow-auto">
        <ul className="space-y-1">
          {menuItems.map((item, index) => {
            const active = isActive(item);
            return (
              <li key={index}>
                <Link
                  to={item.path}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'var(--accent-foreground)' : 'var(--primary-foreground)',
                    boxShadow: active ? '0 2px 8px rgba(246, 173, 85, 0.3)' : 'none',
                  }}
                >
                  <span style={{ color: active ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.8)' }}>
                    {item.icon}
                  </span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div
                      className="text-xs"
                      style={{ color: active ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.5)' }}
                    >
                      {item.labelEn}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div
          className="flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-white/5"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <Avatar>
            <AvatarFallback style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
              <User className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: 'var(--primary-foreground)' }}>
              {userName}
            </div>
            <Badge
              className="mt-1 text-xs"
              style={{
                backgroundColor: 'rgba(246, 173, 85, 0.2)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              {userRole}
            </Badge>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md transition-colors hover:bg-white/10"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          </button>
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="p-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-white/5"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--primary-foreground)',
          }}
          onClick={toggleDarkMode}
        >
          <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
            {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </span>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">{darkMode ? '다크 모드' : '라이트 모드'}</div>
            <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
};
