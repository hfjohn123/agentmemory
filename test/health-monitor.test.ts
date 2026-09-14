import { expect, it, vi } from "vitest";
import { getHeapStatistics } from "node:v8";
import { totalmem } from "node:os";
import { registerHealthMonitor } from "../src/health/monitor.js";
import type { ISdk } from "iii-sdk";
import type { StateKV } from "../src/state/kv.js";
import type { HealthSnapshot } from "../src/types.js";

it("publishes the real V8 heap limit and host or container RSS budget", async () => {
  let snapshot: HealthSnapshot | undefined;
  const kv = {
    set: vi.fn(async (_scope, key, value) => {
      if (key === "latest") snapshot = value;
    }),
    get: vi.fn(async () => ({})),
  };
  const sdk = { on: vi.fn(), trigger: vi.fn(async () => ({ workers: [] })) };
  const monitor = registerHealthMonitor(
    sdk as unknown as ISdk,
    kv as unknown as StateKV,
  );
  try {
    await vi.waitFor(() => expect(snapshot).toBeDefined());
    expect(snapshot!.memory.heapSizeLimit).toBe(
      getHeapStatistics().heap_size_limit,
    );
    expect(snapshot!.memory.rssBudget).toBe(
      Math.min(totalmem(), process.constrainedMemory?.() || Infinity),
    );
    expect(snapshot!.memory.heapUsed).toBeGreaterThan(0);
  } finally {
    monitor.stop();
  }
});
