import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { fetchClassified } from '@/api/spec';
import type { ApiSpecItem, TableSpecItem } from '@/api/spec';
import { ApiSpecView } from '@/components/spec/ApiSpecView';
import { TableSpecView } from '@/components/spec/TableSpecView';
import { useOrganization } from '@/contexts/OrganizationContext';

export default function SpecDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const specType = searchParams.get('type') ?? 'api';
  const navigate = useNavigate();
  const { organizationId } = useOrganization();

  const [apiSpec, setApiSpec] = useState<ApiSpecItem | null>(null);
  const [tableSpec, setTableSpec] = useState<TableSpecItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void fetchClassified(organizationId).then((res) => {
      if (res.success) {
        if (specType === 'api') {
          const found = res.data.apiSpecs.find((s) => s.specId === id);
          if (found) {
            setApiSpec(found);
          } else {
            setNotFound(true);
          }
        } else {
          const found = res.data.tableSpecs.find((s) => s.specId === id);
          if (found) {
            setTableSpec(found);
          } else {
            setNotFound(true);
          }
        }
      }
      setLoading(false);
    });
  }, [id, organizationId, specType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/specs')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Catalog
        </Button>
        <Card className="shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Spec Not Found</p>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
              The spec with ID &quot;{id}&quot; was not found.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const classificationColor: Record<string, { bg: string; color: string }> = {
    core: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563EB' },
    'non-core': { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280' },
    unknown: { bg: 'rgba(249, 115, 22, 0.1)', color: '#EA580C' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/specs')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {specType === 'api' && apiSpec
                  ? `${apiSpec.httpMethod} ${apiSpec.endpoint}`
                  : tableSpec?.tableName ?? 'Spec Detail'}
              </h1>
              {(() => {
                const classification = specType === 'api' ? apiSpec?.classification : tableSpec?.classification;
                if (!classification) return null;
                const cc = classificationColor[classification] ?? classificationColor["unknown"] ?? { bg: 'rgba(251, 146, 60, 0.1)', color: '#EA580C' };
                return (
                  <Badge className="text-[10px]" style={{ backgroundColor: cc.bg, color: cc.color, border: 'none' }}>
                    {classification}
                  </Badge>
                );
              })()}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {specType === 'api' ? 'API Spec Detail' : 'Table Spec Detail'}
            </p>
          </div>
        </div>
      </div>

      {/* Spec View */}
      {specType === 'api' && apiSpec && <ApiSpecView spec={apiSpec} />}
      {specType === 'table' && tableSpec && <TableSpecView spec={tableSpec} />}
    </div>
  );
}
