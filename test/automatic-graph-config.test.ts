import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ""),
}));

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  __resetEnvFileCache,
  isAutomaticGraphEnabled,
  isGraphExtractionEnabled,
} from "../src/config.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("automatic graph configuration", () => {
  beforeEach(() => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", undefined);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue("");
    __resetEnvFileCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetEnvFileCache();
  });

  it.each([
    { value: undefined, automatic: true, llm: false },
    { value: "true", automatic: true, llm: true },
    { value: "false", automatic: false, llm: false },
    { value: "0", automatic: true, llm: false },
    { value: "", automatic: true, llm: false },
  ])("uses exact false for automatic opt-out and exact true for LLM extraction with $value", async ({ value, automatic, llm }) => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", value);
    expect(isAutomaticGraphEnabled()).toBe(automatic);
    expect(isGraphExtractionEnabled()).toBe(llm);

    const sdk = mockSdk();
    registerApiTriggers(sdk as never, mockKV() as never);
    const response = await sdk.fns.get("api::config-flags")!({});
    expect(response).toMatchObject({
      body: {
        flags: expect.arrayContaining([expect.objectContaining({
          key: "GRAPH_EXTRACTION_ENABLED",
          enabled: automatic,
          default: true,
          needsLlm: false,
        })]),
      },
    });
  });

  it("reads the file-layer opt-out and lets a process-layer true override it", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("GRAPH_EXTRACTION_ENABLED=false\n");
    expect(isAutomaticGraphEnabled()).toBe(false);
    expect(isGraphExtractionEnabled()).toBe(false);

    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "true");
    expect(isAutomaticGraphEnabled()).toBe(true);
    expect(isGraphExtractionEnabled()).toBe(true);
  });
});
