import { describe, expect, it } from "vitest";
import { buildAnalysis, insightsFor } from "./analysis";
import { DEMOS, renderDemo } from "./demo";
import { analyzePcm } from "./dsp";

describe("demos", () => {
  const run = (id: string) => {
    const spec = DEMOS.find((d) => d.id === id)!;
    const an = buildAnalysis(analyzePcm(renderDemo(spec)), { name: spec.name, source: "demo", demoId: id });
    return { an, ins: insightsFor(an) };
  };

  it("slow build reads as a build", () => {
    const { ins } = run("slow-build");
    expect(ins.shape).toBe("builds");
  });

  it("drop & return dips in the middle", () => {
    const { ins } = run("drop-and-return");
    expect(ins.shape).toBe("dip");
    expect(ins.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("stillness stays low", () => {
    const { an } = run("stillness");
    expect(an.overall.arousal).toBeLessThan(4.5);
  });
});
