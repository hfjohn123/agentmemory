import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe("build asset packaging", () => {
  it("copies required viewer assets and optional runtime configs", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-build-assets-"));
    sandboxes.push(root);
    mkdirSync(join(root, "src", "viewer"), { recursive: true });

    const fixtures = new Map([
      ["src/viewer/index.html", "<html>agentmemory viewer</html>"],
      ["src/viewer/favicon.svg", "<svg></svg>"],
      ["iii-config.yaml", "config: default"],
      ["iii-config.docker.yaml", "config: docker"],
      ["docker-compose.yml", "services: {}"],
      [".env.example", "AGENTMEMORY_PORT=3111"],
    ]);

    for (const [relativePath, contents] of fixtures) {
      writeFileSync(join(root, relativePath), contents, "utf-8");
    }

    const result = spawnSync(
      process.execPath,
      [resolve("scripts/copy-build-assets.mjs"), root],
      { encoding: "utf-8" },
    );

    expect(result.status, result.stderr).toBe(0);
    for (const [relativePath, contents] of fixtures) {
      const destination = relativePath.startsWith("src/viewer/")
        ? join(root, "dist", "viewer", relativePath.split("/").at(-1)!)
        : join(root, "dist", relativePath);
      expect(existsSync(destination), destination).toBe(true);
      expect(readFileSync(destination, "utf-8")).toBe(contents);
    }
  });
});
