import { describe, expect, it } from "vitest";
import { translate } from "./i18n";
import { formatDate, phaseLabel, taskLabels } from "./format";
import english from "./en.json";

describe("language switching", () => {
  it("keeps Chinese intact and replaces parameters in both languages", () => {
    expect(translate("zh-CN", "{name} 已加载", { name: "qwen3:0.6b" })).toBe("qwen3:0.6b 已加载");
    expect(translate("en-US", "{name} 已加载", { name: "qwen3:0.6b" })).toBe("qwen3:0.6b loaded");
    expect(translate("en-US", "将从本机 Ollama 中删除 {name}。需要再次使用时须重新下载。", { name: "test:latest" })).toContain("test:latest");
  });

  it("translates all download states and preserves unknown server content", () => {
    for (const state of Object.values(taskLabels)) expect(translate("en-US", state)).not.toMatch(/[\u4e00-\u9fff]/);
    expect(translate("en-US", phaseLabel("pulling abc"))).toBe("Transferring model layer");
    expect(translate("en-US", "upstream error: abc")).toBe("upstream error: abc");
    expect(translate("en-US", "toString")).toBe("toString");
  });

  it("preserves every interpolation token in the English catalog", () => {
    for (const [key, value] of Object.entries(english)) {
      expect(value, key).not.toMatch(/[\u4e00-\u9fff]/);
      expect([...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), key).toEqual([...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
    }
  });

  it("formats dates with the selected locale", () => {
    const date = new Date(2026, 10, 5, 9, 10);
    for (const locale of ["zh-CN", "en-US"] as const) {
      const expected = new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
      expect(formatDate(date.valueOf(), locale)).toBe(expected);
    }
  });
});
