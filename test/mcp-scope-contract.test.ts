import { describe, expect, it } from "vitest";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("MCP session and project scope contract", () => {
  const expected: Record<string, string[]> = {
    memory_save: ["project", "sessionId"],
    memory_action_create: ["project", "sessionId"],
    memory_lesson_save: ["project", "sessionId"],
    memory_smart_search: ["project", "sessionId"],
  };

  for (const [name, fields] of Object.entries(expected)) {
    it(`${name} exposes optional scope fields and rejects unknown properties`, () => {
      const tool = getAllTools().find((candidate) => candidate.name === name);
      expect(tool).toBeDefined();
      for (const field of fields) expect(tool?.inputSchema.properties).toHaveProperty(field);
      expect(tool?.inputSchema.required ?? []).not.toContain("project");
      expect(tool?.inputSchema.required ?? []).not.toContain("sessionId");
      expect(tool?.inputSchema.additionalProperties).toBe(false);
    });
  }
});

describe("daemon MCP scope propagation", () => {
  it("preserves the snapshot skip result and explains the paused backup contract", async () => {
    const sdk = mockSdk();
    const skipped = {
      success: false,
      skipped: true,
      reason: "automatic-graph-disabled",
      error: "Full snapshots paused; previous backup unchanged",
    };
    sdk.registerFunction("mem::snapshot-create", async () => skipped);
    registerMcpEndpoints(sdk as never, mockKV() as never);

    const response = await sdk.fns.get("mcp::tools::call")!({ body: {
      name: "memory_snapshot_create",
      arguments: { message: "Graph off" },
    } }) as { body: { content: Array<{ text: string }> } };

    expect(JSON.parse(response.body.content[0].text)).toEqual(skipped);
    expect(getAllTools().find((tool) => tool.name === "memory_snapshot_create")?.description)
      .toMatch(/GRAPH_EXTRACTION_ENABLED=false.*automatic-graph-disabled.*previous backup unchanged/);
  });

  it("forwards exact session and project values to persistence handlers", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    const received = new Map<string, unknown>();
    for (const id of ["mem::remember", "mem::action-create", "mem::lesson-save", "mem::smart-search"]) {
      sdk.registerFunction(id, async (payload) => {
        received.set(id, payload);
        return { success: true, payload };
      });
    }
    registerMcpEndpoints(sdk as never, kv as never);
    const call = sdk.fns.get("mcp::tools::call")!;
    const cases = [
      ["memory_save", "mem::remember", { content: "saved" }],
      ["memory_action_create", "mem::action-create", { title: "action" }],
      ["memory_lesson_save", "mem::lesson-save", { content: "lesson" }],
      ["memory_smart_search", "mem::smart-search", { query: "search" }],
    ] as const;

    for (const [tool, downstream, required] of cases) {
      const response = await call({ body: {
        name: tool,
        arguments: { ...required, project: "ANT-835", sessionId: "ses_mcp_835" },
      } }) as { status_code: number; body: unknown };
      expect(response.status_code).toBe(200);
      expect(received.get(downstream)).toMatchObject({
        project: "ANT-835", sessionId: "ses_mcp_835",
      });
    }
  });

  it("returns 400 for unknown contract-tool fields", async () => {
    const sdk = mockSdk();
    registerMcpEndpoints(sdk as never, mockKV() as never);
    const response = await sdk.fns.get("mcp::tools::call")!({ body: {
      name: "memory_save",
      arguments: { content: "saved", sessoinId: "typo" },
    } }) as { status_code: number; body: { error: string } };
    expect(response.status_code).toBe(400);
    expect(response.body.error).toMatch(/unknown.*sessoinId/i);
  });
});
