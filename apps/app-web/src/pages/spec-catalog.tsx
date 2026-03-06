import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Search,
  RefreshCw,
  Sparkles,
  FileJson,
  Database,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { classifySpecs, fetchClassified } from '@/api/spec';
import type { ApiSpecItem, TableSpecItem, ClassifiedSpecs } from '@/api/spec';
import { CoverageCard } from '@/components/factcheck/CoverageCard';
import { SpecCard } from '@/components/spec/SpecCard';
import { useOrganization } from '@/contexts/OrganizationContext';

export default function SpecCatalogPage() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const [data, setData] = useState<ClassifiedSpecs | null>(null);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassification, setFilterClassification] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchClassified(organizationId);
      if (res.success) setData(res.data);
    } catch {
      toast.error('Failed to load specs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [organizationId]);

  const handleClassify = async () => {
    setClassifying(true);
    try {
      const res = await classifySpecs(organizationId);
      if (res.success) {
        toast.success(`Classification complete: ${res.data.classified} specs classified`);
        await loadData();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('Classification failed');
    } finally {
      setClassifying(false);
    }
  };

  const filterSpec = <T extends ApiSpecItem | TableSpecItem>(specs: T[]): T[] => {
    return specs.filter((s) => {
      if (filterClassification !== 'all' && s.classification !== filterClassification) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if ('endpoint' in s) {
          const api = s as ApiSpecItem;
          if (!api.endpoint.toLowerCase().includes(q) && !api.httpMethod.toLowerCase().includes(q)) return false;
        } else {
          const tbl = s as TableSpecItem;
          if (!tbl.tableName.toLowerCase().includes(q)) return false;
        }
      }
      return true;
    });
  };

  const filteredApiSpecs = useMemo(
    () => (data ? filterSpec(data.apiSpecs) : []),
    [data, searchQuery, filterClassification],
  );

  const filteredTableSpecs = useMemo(
    () => (data ? filterSpec(data.tableSpecs) : []),
    [data, searchQuery, filterClassification],
  );

  const apiCoverage = data && data.totalApiSpecs > 0
    ? Math.round((data.coreApiCount / data.totalApiSpecs) * 100)
    : 0;
  const tableCoverage = data && data.totalTableSpecs > 0
    ? Math.round((data.coreTableCount / data.totalTableSpecs) * 100)
    : 0;

  const classificationOptions = ['all', 'core', 'non-core', 'unknown'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Spec Catalog
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            API Specs and Table Specs with classification and coverage
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1${loading ? ' animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => void handleClassify()} disabled={classifying}>
            <Sparkles className="w-4 h-4 mr-2" />
            {classifying ? 'Classifying...' : 'Classify Specs'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
          <CoverageCard
            label="API Coverage"
            labelEn="Core API Rate"
            value={apiCoverage}
            target={80}
            pass={apiCoverage >= 80}
            icon={<FileJson className="w-10 h-10" />}
          />
          <CoverageCard
            label="Table Coverage"
            labelEn="Core Table Rate"
            value={tableCoverage}
            target={80}
            pass={tableCoverage >= 80}
            icon={<Database className="w-10 h-10" />}
          />
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total API Specs</div>
                  <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{data.totalApiSpecs}</div>
                </div>
                <FileJson className="w-10 h-10" style={{ color: '#3B82F6', opacity: 0.2 }} />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Table Specs</div>
                  <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{data.totalTableSpecs}</div>
                </div>
                <Target className="w-10 h-10" style={{ color: '#22C55E', opacity: 0.2 }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <Input
                placeholder="Search specs by name or endpoint..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-1">
              {classificationOptions.map((c) => (
                <button
                  key={c}
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={{
                    backgroundColor: filterClassification === c ? 'var(--primary)' : 'transparent',
                    color: filterClassification === c ? '#fff' : 'var(--text-secondary)',
                    borderColor: filterClassification === c ? 'var(--primary)' : 'var(--border)',
                  }}
                  onClick={() => setFilterClassification(c)}
                >
                  {c === 'all' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: API Specs / Table Specs */}
      <Tabs defaultValue="api">
        <TabsList>
          <TabsTrigger value="api">
            <FileJson className="w-4 h-4 mr-1" />
            API Specs
            <Badge variant="outline" className="ml-1 text-[10px]">{filteredApiSpecs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="table">
            <Database className="w-4 h-4 mr-1" />
            Table Specs
            <Badge variant="outline" className="ml-1 text-[10px]">{filteredTableSpecs.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          {filteredApiSpecs.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="p-8 text-center">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No API specs found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredApiSpecs.map((spec) => (
                <SpecCard
                  key={spec.specId}
                  spec={spec}
                  type="api"
                  onClick={() => navigate(`/specs/${spec.specId}?type=api`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table">
          {filteredTableSpecs.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="p-8 text-center">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No table specs found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTableSpecs.map((spec) => (
                <SpecCard
                  key={spec.specId}
                  spec={spec}
                  type="table"
                  onClick={() => navigate(`/specs/${spec.specId}?type=table`)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
