import { describe, expect, it } from "vitest";
import { canonicalModelName, currentLayerProgress, formatBytes, isActive, mergeTask, validateEndpoint } from "./format";
import type { DownloadTask } from "./types";

function task(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return { taskId: "task-1", attemptId: "attempt-1", endpoint: "http://127.0.0.1:11434", modelName: "model:latest", state: "running", phase: "pulling layer", layers: [], currentDigest: null, bytesPerSecond: null, error: null, createdAt: 1, updatedAt: 1, sequence: 1, ...overrides };
}

describe("model names and loopback addresses", () => {
  it("normalizes a missing tag and preserves a namespace", () => {
    expect(canonicalModelName("  org/model  ")).toBe("org/model:latest");
    expect(canonicalModelName("model:Q4_K_M")).toBe("model:Q4_K_M");
  });
  it.each(["", "a b", "../model", "a//b", "https://ollama.com/a", "a:", "a:tag:tag", "a:cloud"])("rejects invalid or cloud input %s", (name) => {
    expect(() => canonicalModelName(name)).toThrow();
  });
  it.each(["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434"])("accepts local endpoint %s", (value) => {
    expect(validateEndpoint(`${value}/`)).toBe(value);
  });
  it.each(["https://localhost:11434", "http://example.com", "http://localhost/path", "http://u:p@localhost", "http://localhost?token=x", "http://localhost:0"])("rejects unsafe endpoint %s", (value) => {
    expect(() => validateEndpoint(value)).toThrow();
  });
});

describe("download progress", () => {
  it("does not guess a total for unknown layers", () => {
    expect(currentLayerProgress(task())).toBeNull();
    expect(currentLayerProgress(task({ currentDigest: "a", layers: [{ digest: "a", total: 0, completed: 50 }] }))).toBeNull();
  });
  it("uses only the current layer and bounds server counters", () => {
    expect(currentLayerProgress(task({ currentDigest: "b", layers: [{ digest: "a", total: 100, completed: 100 }, { digest: "b", total: 200, completed: 50 }] }))).toBe(25);
    expect(currentLayerProgress(task({ currentDigest: "b", layers: [{ digest: "b", total: 20, completed: 30 }] }))).toBe(100);
  });
  it("ignores stale progress across retries, even with identical timestamps", () => {
    const retry = task({ attemptId: "attempt-2", sequence: 20 });
    const merged = mergeTask([retry], task({ attemptId: "attempt-1", sequence: 19, state: "completed" }));
    expect(merged[0]).toEqual(retry);
    expect(mergeTask([retry], task({ attemptId: "attempt-2", sequence: 21, state: "completed" }))[0].state).toBe("completed");
  });
  it("marks only queued, running, and cancelling tasks as active", () => {
    expect(["queued", "running", "cancelling"].every((value) => isActive(value as DownloadTask["state"]))).toBe(true);
    expect(["completed", "failed", "cancelled", "interrupted"].some((value) => isActive(value as DownloadTask["state"]))).toBe(false);
  });
});

describe("byte units", () => {
  it("uses binary units and handles absent or invalid values", () => {
    expect(formatBytes(1024 ** 3 * 1.5)).toBe("1.5 GiB");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });
});
