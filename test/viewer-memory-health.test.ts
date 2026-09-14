import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const viewer = readFileSync("src/viewer/index.html", "utf8");
const start = viewer.indexOf("          var heapUsed =");
const end = viewer.indexOf("          if (snap.memory.external)", start);
const render = viewer.slice(start, end);

it("renders actual capacity and uses confirmed alerts for memory colors", () => {
  const MiB = 1024 * 1024;
  const context = {
    html: "",
    snap: {
      memory: {
        heapUsed: 490 * MiB,
        heapTotal: 500 * MiB,
        heapSizeLimit: 4096 * MiB,
        rss: 836 * MiB,
        rssBudget: 16384 * MiB,
      },
      alerts: [] as string[],
    },
  };
  runInNewContext(render, context);
  expect(context.html).toContain("490 / 4096 MB");
  expect(context.html).toContain("836 / 16384 MB");
  expect(context.html).toContain("width:12%;background:var(--green)");
  context.snap.alerts = ["memory_heap_critical_97%_rss836mb"];
  context.html = "";
  runInNewContext(render, context);
  expect(context.html).toContain("background:var(--red)");
});

it("shows unknown capacities without a red gauge for legacy snapshots", () => {
  const context = {
    html: "",
    snap: {
      memory: {
        heapUsed: 490 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024,
        rss: 836 * 1024 * 1024,
      },
      alerts: [],
    },
  };
  runInNewContext(render, context);
  expect(context.html).toContain("490 / unknown MB");
  expect(context.html).not.toContain("var(--red)");
});
