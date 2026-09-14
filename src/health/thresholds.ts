import type { HealthSnapshot } from "../types.js";

interface ThresholdConfig {
  eventLoopLagWarnMs: number;
  eventLoopLagCriticalMs: number;
  cpuWarnPercent: number;
  cpuCriticalPercent: number;
  memoryWarnPercent: number;
  memoryCriticalPercent: number;
}

const DEFAULTS: ThresholdConfig = {
  eventLoopLagWarnMs: 100,
  eventLoopLagCriticalMs: 500,
  cpuWarnPercent: 80,
  cpuCriticalPercent: 90,
  memoryWarnPercent: 80,
  memoryCriticalPercent: 95,
};

type MemoryStreaks = Record<"heap" | "rss", { warn: number; critical: number }>;

export function createHealthEvaluator() {
  const streaks: MemoryStreaks = {
    heap: { warn: 0, critical: 0 },
    rss: { warn: 0, critical: 0 },
  };
  return (snapshot: HealthSnapshot) => evaluateHealth(snapshot, {}, streaks);
}

export function evaluateHealth(
  snapshot: HealthSnapshot,
  config: Partial<ThresholdConfig> = {},
  streaks?: MemoryStreaks,
): {
  status: "healthy" | "degraded" | "critical";
  alerts: string[];
  notes: string[];
} {
  const cfg = { ...DEFAULTS, ...config };
  const alerts: string[] = [];
  const notes: string[] = [];
  let critical = false;
  let degraded = false;

  if (
    snapshot.connectionState === "disconnected" ||
    snapshot.connectionState === "failed"
  ) {
    alerts.push(`connection_${snapshot.connectionState}`);
    critical = true;
  } else if (snapshot.connectionState === "reconnecting") {
    alerts.push("connection_reconnecting");
    degraded = true;
  }

  if (snapshot.eventLoopLagMs > cfg.eventLoopLagCriticalMs) {
    alerts.push(
      `event_loop_lag_critical_${Math.round(snapshot.eventLoopLagMs)}ms`,
    );
    critical = true;
  } else if (snapshot.eventLoopLagMs > cfg.eventLoopLagWarnMs) {
    alerts.push(`event_loop_lag_warn_${Math.round(snapshot.eventLoopLagMs)}ms`);
    degraded = true;
  }

  if (snapshot.cpu.percent > cfg.cpuCriticalPercent) {
    alerts.push(`cpu_critical_${Math.round(snapshot.cpu.percent)}%`);
    critical = true;
  } else if (snapshot.cpu.percent > cfg.cpuWarnPercent) {
    alerts.push(`cpu_warn_${Math.round(snapshot.cpu.percent)}%`);
    degraded = true;
  }

  const memMb = Math.round(snapshot.memory.rss / (1024 * 1024));
  for (const metric of ["heap", "rss"] as const) {
    const used =
      metric === "heap" ? snapshot.memory.heapUsed : snapshot.memory.rss;
    const limit =
      metric === "heap"
        ? snapshot.memory.heapSizeLimit
        : snapshot.memory.rssBudget;
    const valid =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0;
    const percent = valid ? (used / limit) * 100 : 0;
    const high = percent > cfg.memoryWarnPercent;
    const veryHigh = percent > cfg.memoryCriticalPercent;
    const count = streaks?.[metric];
    if (count) {
      count.warn = high ? Math.min(3, count.warn + 1) : 0;
      count.critical = veryHigh ? Math.min(3, count.critical + 1) : 0;
    }
    if (!valid) {
      notes.push(
        metric === "heap"
          ? "memory_heap_limit_unavailable"
          : "memory_rss_budget_unavailable",
      );
    } else if (veryHigh && (!count || count.critical >= 3)) {
      alerts.push(
        `memory_${metric}_critical_${Math.round(percent)}%_rss${memMb}mb`,
      );
      critical = true;
    } else if (high && (!count || count.warn >= 3)) {
      alerts.push(
        `memory_${metric}_warn_${Math.round(percent)}%_rss${memMb}mb`,
      );
      degraded = true;
    } else if (high) {
      notes.push(`memory_${metric}_pending_${Math.round(percent)}%`);
    }
  }

  const status = critical ? "critical" : degraded ? "degraded" : "healthy";
  return { status, alerts, notes };
}
