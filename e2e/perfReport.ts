import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PerfReport } from '../utils/testBridge';

const PERF_METRICS_PATH = path.join(process.cwd(), 'perf-metrics-report.json');

export interface PerfRunMeta {
  testName: string;
  fixture: string;
  soakMs: number;
  profile?: string;
}

interface PerfRunRecord extends PerfRunMeta {
  recordedAt: string;
  report: PerfReport;
}

interface PerfMetricsFile {
  generatedAt: string;
  soakMs: number;
  runs: PerfRunRecord[];
}

const runBuffer: PerfRunRecord[] = [];

function formatPerfSummary(meta: PerfRunMeta, report: PerfReport): string {
  const lines = [
    '',
    '─'.repeat(60),
    `[perf] ${meta.testName}`,
    `  fixture: ${meta.fixture}${meta.profile ? ` · profile: ${meta.profile}` : ''}`,
    `  soak: ${meta.soakMs} ms · samples: ${report.sampleCount} · bodies: ${report.bodyCount}`,
    `  Average FPS: ${report.fps.avg.toFixed(1)}`,
    `  FPS p50 / p95 / min: ${report.fps.p50.toFixed(1)} / ${report.fps.p95.toFixed(1)} / ${report.fps.min.toFixed(1)}`,
    `  Frame time avg / p95: ${report.frameTimeMs.avg.toFixed(2)} ms / ${report.frameTimeMs.p95.toFixed(2)} ms`,
    `  JS heap start / peak / end: ${report.jsHeapMb.start.toFixed(1)} / ${report.jsHeapMb.peak.toFixed(1)} / ${report.jsHeapMb.end.toFixed(1)} MB`,
    `  Retained heap after GC start / end / delta: ${report.retainedJsHeapMb?.start.toFixed(1) ?? 'n/a'} / ${report.retainedJsHeapMb?.end.toFixed(1) ?? 'n/a'} / ${report.retainedJsHeapMb?.delta.toFixed(1) ?? 'n/a'} MB`,
    `  device tier: ${report.deviceTier} · context lost: ${report.contextLostCount}`,
    '─'.repeat(60),
  ];
  return lines.join('\n');
}

/** Log a readable summary to the Playwright worker terminal. */
export function logPerfSummary(meta: PerfRunMeta, report: PerfReport): void {
  console.log(formatPerfSummary(meta, report));
}

/** Buffer one run; call flushPerfMetricsReport() once after the suite. */
export function bufferPerfRun(meta: PerfRunMeta, report: PerfReport): void {
  runBuffer.push({
    ...meta,
    recordedAt: new Date().toISOString(),
    report,
  });
}

export async function flushPerfMetricsReport(soakMs: number): Promise<void> {
  const payload: PerfMetricsFile = {
    generatedAt: new Date().toISOString(),
    soakMs,
    runs: [...runBuffer],
  };

  await writeFile(PERF_METRICS_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n[perf] Wrote metrics report → ${PERF_METRICS_PATH}\n`);
}

export function resetPerfRunBuffer(): void {
  runBuffer.length = 0;
}
