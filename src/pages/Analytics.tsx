import { useState, useEffect } from 'react';
import { useAuth } from '@/src/lib/store';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Brain, TrendingDown, Layers, Settings2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const LAYER_COLORS: Record<string, string> = {
  'gemini-2.5-flash': '#10b981', // Emerald
  'gemini-2.0-flash': '#3b82f6', // Blue
  'gemini-2.0-flash-lite': '#8b5cf6', // Purple
  'openrouter/qwen/qwen-2.5-vl-72b-instruct:free': '#f59e0b', // Amber
  'openrouter/meta-llama/llama-3.2-90b-vision-instruct:free': '#ef4444', // Red
};

const LAYER_LABELS: Record<string, string> = {
  'gemini-2.5-flash': 'Layer 1 — Gemini 2.5 Flash',
  'gemini-2.0-flash': 'Layer 2 — Gemini 2.0 Flash',
  'gemini-2.0-flash-lite': 'Layer 3 — Gemini Flash Lite',
  'openrouter/qwen/qwen-2.5-vl-72b-instruct:free': 'Fallback A — Qwen 2.5 VL',
  'openrouter/meta-llama/llama-3.2-90b-vision-instruct:free': 'Fallback B — LLaMA 3.2 Vision',
};

export default function Analytics() {
  const { workspaceId, workspaceRole } = useAuth();
  const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';

  const [corrections, setCorrections] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState({ layer1: 85, layer2: 80, layer3a: 75 });
  const [editThresholds, setEditThresholds] = useState({ layer1: 85, layer2: 80, layer3a: 75 });
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Load corrections log
  useEffect(() => {
    if (!workspaceId) return;
    const q = query(
      collection(db, `workspaces/${workspaceId}/corrections_log`),
      orderBy('occurrence_count', 'desc'),
      limit(200)
    );
    return onSnapshot(q, snap => {
      setCorrections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'corrections_log'));
  }, [workspaceId]);

  // Load invoices for layer distribution chart
  useEffect(() => {
    if (!workspaceId) return;
    const q = query(
      collection(db, `workspaces/${workspaceId}/invoices`),
      orderBy('uploadedAt', 'desc'),
      limit(500)
    );
    return onSnapshot(q, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'invoices'));
  }, [workspaceId]);

  // Load pipeline settings
  useEffect(() => {
    if (!workspaceId) return;
    const settingsRef = doc(db, `workspaces/${workspaceId}/settings/pipeline`);
    return onSnapshot(settingsRef, snap => {
      if (snap.exists()) {
        const t = snap.data()?.thresholds || {};
        const loaded = {
          layer1:  typeof t.layer1  === 'number' ? t.layer1  : 85,
          layer2:  typeof t.layer2  === 'number' ? t.layer2  : 80,
          layer3a: typeof t.layer3a === 'number' ? t.layer3a : 75,
        };
        setThresholds(loaded);
        setEditThresholds(loaded);
      }
    });
  }, [workspaceId]);

  // --- Computed Analytics ---

  // Field correction frequency
  const fieldFrequency: Record<string, number> = {};
  corrections.forEach(c => {
    const f = c.field_name || 'unknown';
    fieldFrequency[f] = (fieldFrequency[f] || 0) + (c.occurrence_count || 1);
  });
  const fieldChartData = Object.entries(fieldFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([field, count]) => ({ field, count }));

  // Layer distribution
  const layerCounts: Record<string, number> = {};
  invoices.forEach(inv => {
    const layer = inv.extractionLayer || inv.modelVariant || 'unknown';
    layerCounts[layer] = (layerCounts[layer] || 0) + 1;
  });
  const layerChartData = Object.entries(layerCounts).map(([layer, count]) => ({ layer, count }));

  // Average confidence per field (from confidenceScores map)
  const fieldConfSum: Record<string, { sum: number; count: number }> = {};
  invoices.forEach(inv => {
    const cs = inv.confidenceScores;
    if (!cs || typeof cs !== 'object') return;
    Object.entries(cs as Record<string, number>).forEach(([field, score]) => {
      if (!fieldConfSum[field]) fieldConfSum[field] = { sum: 0, count: 0 };
      fieldConfSum[field].sum += score;
      fieldConfSum[field].count++;
    });
  });
  const fieldConfAvg = Object.entries(fieldConfSum)
    .map(([field, { sum, count }]) => ({ field, avg: Math.round(sum / count) }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 10);

  const handleSaveThresholds = async () => {
    if (!workspaceId) return;
    setSavingThresholds(true);
    try {
      await setDoc(doc(db, `workspaces/${workspaceId}/settings/pipeline`), {
        thresholds: editThresholds,
        updatedAt: Date.now(),
      }, { merge: true });
      toast.success('Pipeline thresholds saved!');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'settings/pipeline');
    } finally {
      setSavingThresholds(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col items-start gap-1">
        <div className="text-indigo-600 font-bold text-[10px] tracking-widest uppercase mb-1">Admin</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Pipeline Analytics</h1>
        <p className="text-gray-500 text-sm">Monitor OCR extraction quality, correction patterns, and configure pipeline thresholds.</p>
      </div>

      {/* Access guard for non-admins */}
      {!isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="text-amber-500 w-5 h-5 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">Analytics and threshold settings are restricted to admin and owner roles.</p>
          </CardContent>
        </Card>
      )}

      {/* Layer Distribution */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            <CardTitle>OCR Layer Distribution</CardTitle>
          </div>
          <p className="text-sm text-gray-500">Which extraction layer handled each invoice (last 500).</p>
        </CardHeader>
        <CardContent>
          {layerChartData.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">No extraction layer data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={layerChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="layer"
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => LAYER_LABELS[v] || v}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number) => [val, 'Invoices']}
                    labelFormatter={l => LAYER_LABELS[l] || l}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {layerChartData.map((entry) => (
                      <Cell key={entry.layer} fill={LAYER_COLORS[entry.layer] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-4">
                {layerChartData.map(({ layer, count }) => (
                  <div key={layer} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: LAYER_COLORS[layer] || '#94a3b8' }} />
                    <span>{LAYER_LABELS[layer] || layer}:</span>
                    <span className="font-bold text-gray-800">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Field Correction Frequency */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-rose-500" />
            <CardTitle>Most Corrected Fields</CardTitle>
          </div>
          <p className="text-sm text-gray-500">Fields most frequently corrected by reviewers — reveals systematic AI errors.</p>
        </CardHeader>
        <CardContent>
          {fieldChartData.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">No correction data yet. Approve some invoices first.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={fieldChartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="field" type="category" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => [val, 'Corrections']} />
                  <Bar dataKey="count" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-Field Confidence Heatmap */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-500" />
            <CardTitle>Fields with Lowest Average Confidence</CardTitle>
          </div>
          <p className="text-sm text-gray-500">Average AI confidence per field across all invoices — lower scores indicate problem areas.</p>
        </CardHeader>
        <CardContent>
          {fieldConfAvg.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">No confidence score data yet.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase">Field</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase">Avg Confidence</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldConfAvg.map(({ field, avg }) => (
                    <TableRow key={field}>
                      <TableCell className="font-medium font-mono text-sm text-gray-700">{field}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-32">
                            <div
                              className={`h-2 rounded-full transition-all ${avg >= 85 ? 'bg-emerald-500' : avg >= 60 ? 'bg-amber-400' : 'bg-red-500'}`}
                              style={{ width: `${avg}%` }}
                            />
                          </div>
                          <span className={`text-sm font-bold ${avg >= 85 ? 'text-emerald-700' : avg >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                            {avg}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${avg >= 85 ? 'bg-emerald-100 text-emerald-700' : avg >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {avg >= 85 ? 'Good' : avg >= 60 ? 'Needs Attention' : 'Poor'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
