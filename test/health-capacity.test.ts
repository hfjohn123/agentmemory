import { describe, expect, it } from "vitest";
import {
  createHealthEvaluator,
  evaluateHealth,
} from "../src/health/thresholds.js";
import type { HealthSnapshot } from "../src/types.js";

const MiB = 1024 * 1024;
function snap(memory: Partial<HealthSnapshot["memory"]> = {}): HealthSnapshot {
  return {
    connectionState: "connected",
    workers: [],
    memory: {
      heapUsed: 490 * MiB,
      heapTotal: 500 * MiB,
      heapSizeLimit: 4096 * MiB,
      rss: 836 * MiB,
      rssBudget: 16384 * MiB,
      external: 0,
      ...memory,
    },
    cpu: { userMicros: 0, systemMicros: 0, percent: 0 },
    eventLoopLagMs: 0,
    uptimeSeconds: 1,
    status: "healthy",
    alerts: [],
  };
}

describe("memory capacity alerts", () => {
  it("does not confuse 98% allocated heap occupancy with exhausted capacity", () => {
    expect(evaluateHealth(snap()).status).toBe("healthy");
  });
  it.each([
    [85, "degraded"],
    [97, "critical"],
  ])("detects %s percent of the actual heap limit", (percent, status) => {
    const result = evaluateHealth(
      snap({
        heapUsed: Number(percent) * MiB,
        heapTotal: 100 * MiB,
        heapSizeLimit: 100 * MiB,
        rss: 200 * MiB,
      }),
    );
    expect(result.status).toBe(status);
    expect(result.alerts[0]).toContain("memory_heap_");
  });
  it("detects native RSS pressure even with a mostly empty heap", () => {
    const result = evaluateHealth(
      snap({ rss: 980 * MiB, rssBudget: 1000 * MiB }),
    );
    expect(result.status).toBe("critical");
    expect(result.alerts).toEqual(["memory_rss_critical_98%_rss980mb"]);
  });
  it.each([undefined, 0, -1, Number.NaN, Infinity])(
    "does not invent capacity when limits are %s",
    (limit) => {
      const result = evaluateHealth(
        snap({ heapSizeLimit: limit, rssBudget: limit }),
      );
      expect(result.status).toBe("healthy");
      expect(result.notes).toContain("memory_heap_limit_unavailable");
      expect(result.notes).toContain("memory_rss_budget_unavailable");
    },
  );
});

describe("sustained memory pressure", () => {
  it("requires three high samples, clears on recovery, and resets the streak", () => {
    const evaluate = createHealthEvaluator();
    const high = snap({ heapUsed: 3900 * MiB });
    expect(evaluate(high).status).toBe("healthy");
    expect(evaluate(high).status).toBe("healthy");
    expect(evaluate(high).status).toBe("critical");
    expect(evaluate(snap()).status).toBe("healthy");
    expect(evaluate(high).status).toBe("healthy");
  });
  it("does not combine alternating heap and RSS spikes", () => {
    const evaluate = createHealthEvaluator();
    for (let i = 0; i < 4; i++) {
      expect(evaluate(snap({ heapUsed: 3900 * MiB })).status).toBe("healthy");
      expect(evaluate(snap({ rss: 16000 * MiB })).status).toBe("healthy");
    }
  });
  it("does not promote a sustained warning to critical on one spike", () => {
    const evaluate = createHealthEvaluator();
    const warn = snap({ heapUsed: 3500 * MiB });
    evaluate(warn);
    evaluate(warn);
    expect(evaluate(warn).status).toBe("degraded");
    expect(evaluate(snap({ heapUsed: 4000 * MiB })).status).toBe("degraded");
  });
  it("reports connection, CPU and event loop failures immediately", () => {
    for (const change of [
      { connectionState: "failed" },
      { cpu: { percent: 99, userMicros: 0, systemMicros: 0 } },
      { eventLoopLagMs: 1000 },
    ]) {
      expect(createHealthEvaluator()({ ...snap(), ...change }).status).toBe(
        "critical",
      );
    }
  });
});
