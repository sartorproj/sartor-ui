import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeftRight, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { asList, asRecord, type Tailoring } from '@/lib/api';
import { formatMemory } from '@/lib/quantity';
import {
  conflictText,
  formatPeakToBaseline,
  formatPercentTarget,
  formatReplicaBounds,
  normalizeAutoscalers,
  normalizeConditions,
  normalizeScaling,
  parseAutoscalerRef,
  replicaSourceLabel,
  scalingConflicts,
  scalingPointShift,
  shortKind,
  sizingLabel,
  type ContainerScalingView,
  type DetectedAutoscalerView,
  type ResourceScalingView,
  type ResourceValuesView,
  type ScalingConflictView,
  type ScalingSummaryView,
  type VPARecommendationView,
} from '@/lib/scaling';

export const SCALING_UNAVAILABLE_NOTE =
  'The last analysis did not report how the recommendation accounts for autoscalers. This needs a newer Sartor server.';

const DASH = '—';
const th = 'py-2 px-3 text-left font-medium';
const td = 'py-2 px-3 align-top';

const formatQuantity = (resource: 'cpu' | 'memory', value: string | undefined) =>
  !value ? DASH : resource === 'memory' ? formatMemory(value) : value;

function containerNames(status: Partial<Tailoring['status']>): string[] {
  const analysis = asRecord(status.lastAnalysis);
  return asList(analysis.containers)
    .map((c) => asRecord(c).name)
    .filter((n): n is string => typeof n === 'string' && n !== '');
}

/**
 * How the last recommendation accounts for the workload's autoscalers
 * (status.scaling and status.autoscalers). Renders nothing before the first
 * analysis.
 */
export function ScalingSection({ status }: { status: Partial<Tailoring['status']> | undefined }) {
  const s = asRecord(status) as Partial<Tailoring['status']>;
  const scaling = normalizeScaling(s.scaling);
  const detected = normalizeAutoscalers(s.autoscalers);
  const conditions = normalizeConditions(s.conditions);
  const analyzed = !!s.lastAnalysis && typeof s.lastAnalysis === 'object';
  if (!scaling && !analyzed) return null;

  const conflicts = scalingConflicts(scaling, conditions);
  const shift = scalingPointShift(conditions);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5" />
          Scaling
        </CardTitle>
        <CardDescription>How the last recommendation accounts for the workload's autoscalers and usage pattern</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {conflicts.length > 0 && <ConflictsWarning conflicts={conflicts} />}
        {shift && (
          <Note tone="warn" title="Scaling point shifted">
            {shift}
          </Note>
        )}
        {scaling ? (
          <ScalingDetails scaling={scaling} detected={detected} analyzedContainers={containerNames(s)} />
        ) : (
          <>
            <Note tone="info">{SCALING_UNAVAILABLE_NOTE}</Note>
            {detected.length > 0 && <DetectedAutoscalers autoscalers={detected} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Note({ tone, title, children }: { tone: 'warn' | 'info'; title?: string; children: ReactNode }) {
  const classes =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
      : 'border-dashed border-border text-muted-foreground';
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div role={tone === 'warn' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-4 py-3 text-sm ${classes}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

function ConflictsWarning({ conflicts }: { conflicts: ScalingConflictView[] }) {
  const title = conflicts.length === 1 ? 'Autoscaler conflict' : `${conflicts.length} autoscaler conflicts`;
  return (
    <Note tone="warn" title={title}>
      <ul className="mt-1 space-y-1">
        {conflicts.map((c, i) => (
          <li key={i}>
            {c.resource && (
              <Badge variant="outline" className="mr-1 border-amber-400 font-mono text-[11px] dark:border-amber-700">
                {c.resource}
              </Badge>
            )}
            {c.autoscalers.length > 0 && <span className="font-mono text-xs">{c.autoscalers.join(' + ')}: </span>}
            {c.autoscalers.length > 0 ? c.message ?? 'act on the same resource.' : conflictText(c)}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs opacity-80">Sartor flags conflicts and leaves the autoscalers as they are.</p>
    </Note>
  );
}

function AutoscalerBadge({ kind, name }: { kind: string; name?: string }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <span className="font-semibold">{shortKind(kind) || 'Unknown'}</span>
      {name && <span className="font-mono text-xs">{name}</span>}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function ScalingDetails({
  scaling,
  detected,
  analyzedContainers,
}: {
  scaling: ScalingSummaryView;
  detected: DetectedAutoscalerView[];
  analyzedContainers: string[];
}) {
  const sized = new Set(scaling.containers.map((c) => c.name));
  const withoutScaling = analyzedContainers.filter((n) => !sized.has(n));
  const hasKEDA = scaling.autoscalers.some((ref) => parseAutoscalerRef(ref).kind === 'ScaledObject');
  const r = scaling.replicas;
  const value = (n: number | undefined) => (n === undefined ? DASH : String(n));

  return (
    <>
      {scaling.reason && <p className="text-sm">{scaling.reason}</p>}
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Autoscalers">
          {scaling.autoscalers.length === 0 ? (
            <span className="text-muted-foreground font-normal">None detected</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {scaling.autoscalers.map((ref) => {
                const { kind, name } = parseAutoscalerRef(ref);
                return <AutoscalerBadge key={ref} kind={kind} name={name} />;
              })}
            </div>
          )}
        </Field>
        <Field label="Replica range (min / typical / max)">
          {r ? (
            <>
              <span className="font-mono">
                {value(r.min)} / {value(r.typical)} / {value(r.max)}
              </span>
              {r.source && <span className="ml-2 text-xs font-normal text-muted-foreground">from {replicaSourceLabel(r.source)}</span>}
            </>
          ) : (
            <span className="text-muted-foreground font-normal">Not reported</span>
          )}
        </Field>
        <Field label="Sized for an HPA utilization target">
          {scaling.alignedResources.length === 0 ? (
            <span className="text-muted-foreground font-normal">No resource</span>
          ) : (
            <>
              <span className="font-mono">{scaling.alignedResources.join(', ')}</span>
              {hasKEDA && (
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  Raw write-back does not rescale the matching ScaledObject Utilization triggers.
                </p>
              )}
            </>
          )}
        </Field>
      </dl>
      {detected.length > 0 && <DetectedAutoscalers autoscalers={detected} />}
      <ContainerSizing containers={scaling.containers} withoutScaling={withoutScaling} />
      {scaling.vpa.map((vpa, i) => (
        <VPABounds key={vpa.name ?? i} vpa={vpa} />
      ))}
    </>
  );
}

function targetText(a: DetectedAutoscalerView): string {
  if (a.utilizationTargets.length > 0) {
    return a.utilizationTargets
      .map((t) => `${t.resource || '?'} ${formatPercentTarget(t.averageUtilization)}${t.container ? ` (container ${t.container})` : ''}`)
      .join(', ');
  }
  if (a.utilizationResources.length > 0) return `${a.utilizationResources.join(', ')} (Utilization)`;
  return DASH;
}

function DetectedAutoscalers({ autoscalers }: { autoscalers: DetectedAutoscalerView[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Detected autoscalers</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className={th}>Autoscaler</th>
              <th className={th}>Replicas</th>
              <th className={th}>Utilization targets</th>
              <th className={th}>Also scales on</th>
              <th className={th}>Update mode</th>
            </tr>
          </thead>
          <tbody>
            {autoscalers.map((a, i) => (
              <tr key={`${a.kind}/${a.name ?? i}`} className="border-b border-border/50">
                <td className={td}>
                  <AutoscalerBadge kind={a.kind} name={a.name} />
                  {a.managedBy && <div className="mt-1 text-xs text-muted-foreground">managed by ScaledObject {a.managedBy}</div>}
                </td>
                <td className={`${td} font-mono`}>{formatReplicaBounds(a.minReplicas, a.maxReplicas) ?? DASH}</td>
                <td className={td}>{targetText(a)}</td>
                <td className={td}>{a.otherMetrics.length > 0 ? a.otherMetrics.join(', ') : DASH}</td>
                <td className={td}>{a.updateMode ?? DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SIZING_CLASSES: Record<string, string> = {
  HPAUtilization: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  VPABaseline: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
};

function ResourceRow({ container, resource, rs, first }: { container: string; resource: 'cpu' | 'memory'; rs: ResourceScalingView; first: boolean }) {
  const changed = !!rs.perPodRequest && !!rs.request && rs.perPodRequest !== rs.request;
  const sizingClass = rs.sizing && Object.hasOwn(SIZING_CLASSES, rs.sizing) ? SIZING_CLASSES[rs.sizing] : '';
  return (
    <tr className={first ? 'border-t border-border' : ''}>
      <td className={`${td} font-medium`}>{first ? container || <span className="italic text-muted-foreground">(unnamed)</span> : ''}</td>
      <td className={td}>{resource === 'cpu' ? 'CPU' : 'Memory'}</td>
      <td className={td}>
        <Badge variant="outline" className={`font-normal ${sizingClass}`}>
          {sizingLabel(rs.sizing)}
        </Badge>
      </td>
      <td className={`${td} font-mono`}>{formatQuantity(resource, rs.perPodRequest)}</td>
      <td className={`${td} font-mono ${changed ? 'font-semibold' : ''}`}>{formatQuantity(resource, rs.request)}</td>
      <td className={`${td} font-mono`}>{formatPercentTarget(rs.targetUtilization)}</td>
      <td className={`${td} font-mono`}>{formatQuantity(resource, rs.perPodUsage)}</td>
      <td className={`${td} whitespace-nowrap`}>
        <span className="font-mono">{formatPeakToBaseline(rs.peakToBaseline)}</span>
        {rs.spiky && (
          <Badge variant="outline" className="ml-2 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200">
            Spiky
          </Badge>
        )}
      </td>
      <td className={`${td} max-w-md text-xs text-muted-foreground`}>{rs.reason ?? DASH}</td>
    </tr>
  );
}

function ContainerSizing({ containers, withoutScaling }: { containers: ContainerScalingView[]; withoutScaling: string[] }) {
  const rows = containers.flatMap((c) =>
    (['cpu', 'memory'] as const)
      .filter((res) => c[res])
      .map((res, i) => ({ container: c.name, resource: res, rs: c[res]!, first: i === 0, key: `${c.name}/${res}` })),
  );
  if (rows.length === 0 && withoutScaling.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Request sizing per container</h4>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className={th}>Container</th>
                <th className={th}>Resource</th>
                <th className={th}>Sizing</th>
                <th className={th}>Per-pod request</th>
                <th className={th}>Final request</th>
                <th className={th}>Target utilization</th>
                <th className={th}>Per-pod usage</th>
                <th className={th}>Peak / baseline</th>
                <th className={th}>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, ...row }) => (
                <ResourceRow key={key} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {withoutScaling.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No scaling details for: {withoutScaling.join(', ')}</p>
      )}
    </div>
  );
}

function valuesText(v: ResourceValuesView | undefined): string {
  if (!v) return DASH;
  return [v.cpu && `cpu ${v.cpu}`, v.memory && `memory ${formatMemory(v.memory)}`].filter(Boolean).join(' · ') || DASH;
}

function VPABounds({ vpa }: { vpa: VPARecommendationView }) {
  const off = vpa.updateMode === 'Off';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">VPA bounds</h4>
        <AutoscalerBadge kind="VerticalPodAutoscaler" name={vpa.name} />
        <Badge variant="outline" className="font-normal">
          updateMode {vpa.updateMode ?? DASH}
        </Badge>
        {vpa.writeBack ? (
          <Badge variant="outline" className="border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
            Applied by write-back
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {off ? 'Recommendation only (updateMode Off)' : 'Recommendation only, not written back'}
          </Badge>
        )}
      </div>
      {vpa.containers.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className={th}>Container</th>
                <th className={th}>Recommended minAllowed</th>
                <th className={th}>Recommended maxAllowed</th>
                <th className={th}>Current minAllowed</th>
                <th className={th}>Current maxAllowed</th>
              </tr>
            </thead>
            <tbody>
              {vpa.containers.map((c, i) => (
                <tr key={c.name || i} className="border-b border-border/50">
                  <td className={`${td} font-medium`}>{c.name || <span className="italic text-muted-foreground">(unnamed)</span>}</td>
                  <td className={`${td} font-mono`}>{valuesText(c.minAllowed)}</td>
                  <td className={`${td} font-mono`}>{valuesText(c.maxAllowed)}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>{valuesText(c.currentMinAllowed)}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>{valuesText(c.currentMaxAllowed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No container bounds recommended.</p>
      )}
      {vpa.reason && <p className="text-xs text-muted-foreground">{vpa.reason}</p>}
    </div>
  );
}
