/** Tests for EqBench experiment. */
import { mock } from "vitest-mock-extended";
import { Container, IContainer } from "../../../src/container.js";
import { describe, expect, test } from "vitest";
import {
  EqBenchCachedResult,
  EqBenchCachedResults,
  EqBenchDifference,
  EqBenchResult,
  EqBenchResults,
  EqBenchRunner,
} from "../../../src/evaluation/experiments/eqbench.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { DiffKemp } from "../../../src/diffkemp.js";
import { ExperimentTitle } from "../../../src/evaluation/experiments/titles.js";
import { LabelGroups } from "../../../src/utils/labels.js";

describe("EqBenchRunner", () => {
  test(
    "it should be possible to compare a program in EqBench dataset",
    { timeout: 600_000 },
    async () => {
      const container = new Container();
      try {
        const diffkemp = new DiffKemp(container, "diffkemp/diffkemp", "master");
        await diffkemp.setup();
        const runner = new EqBenchRunner(diffkemp, {
          program: "airy/airy/Eq",
          default: true,
          O2: false,
        });
        await expect(runner.run({})).resolves.toBeDefined();
      } finally {
        container[Symbol.dispose]();
      }
    },
  );
});

/* Mocking container for testing purposes so it does not have to spawn a container. */
const mockContainer = mock<IContainer>();
mockContainer.readFile.mockImplementation(async (path) => {
  if (path === "/eqbench-result/eqbench-results.csv") {
    return readFile(join(__dirname, "../../examples/eqbench/eqbench-results.csv"), {
      encoding: "utf8",
    });
  } else if (path === "/eqbench-result/result.json") {
    return readFile(join(__dirname, "../../examples/eqbench/result.json"), { encoding: "utf8" });
  }
  return "";
});

describe("EqBenchResult", () => {
  test("it should be able to extract result from output directory", async () => {
    const result = await EqBenchResult.fromOutputDir("default", mockContainer, "/eqbench-result");
    expect(result.comparisonRuntime).toBe(90.42082452774048);
    expect([...result.perProgram.FP.values()]).toEqual([
      "CLEVER/LoopUnreach15/Eq",
      "CLEVER/LoopUnreach10/Eq",
    ]);
    expect([...result.perProgram.FN.values()]).toEqual(["airy/airy/Neq"]);
    expect([...result.perProgram.TN.values()]).toEqual(["CLEVER/Const/Eq"]);
    expect([...result.perProgram.TP.values()]).toEqual(["ej_hash/hashCode/Neq"]);
  });

  test("it should be able to serialize to JSON and deserialize back", async () => {
    const originalResult = await EqBenchResult.fromOutputDir(
      "test description",
      mockContainer,
      "/eqbench-result",
    );
    const json = JSON.stringify(originalResult);
    const recoveredResult = EqBenchResult.fromJSON(JSON.parse(json) as EqBenchCachedResult);
    expect(recoveredResult).toStrictEqual(originalResult);
  });
});

describe("EqBench results", () => {
  test("it should be possible to compare EqBenchResults correctly", async () => {
    const baseResult = await EqBenchResult.fromOutputDir(
      "default",
      mockContainer,
      "/eqbench-result",
    );
    baseResult.perProgram.TP.add("benchmark/program/version1");
    const prResult = await EqBenchResult.fromOutputDir("default", mockContainer, "/eqbench-result");
    prResult.perProgram.TN.add("benchmark/program/version3");
    prResult.perProgram.FN.add("benchmark/program/version4");
    prResult.perProgram.FN.add("benchmark/program/version5");
    prResult.comparisonRuntime += 2;

    const baseResults = new EqBenchResults(ExperimentTitle.EQBENCH, [baseResult]);
    const prResults = new EqBenchResults(ExperimentTitle.EQBENCH, [prResult]);

    const differences = prResults.compare(baseResults);
    const difference = differences.get("default") as EqBenchDifference;
    expect(difference).toBeDefined();
    expect(difference.total.TN).toBe(1);
    expect(difference.total.FP).toBe(0);
    expect(difference.total.TP).toBe(-1);
    expect(difference.total.FN).toBe(2);
    expect(difference.comparisonRuntime).toBe(2);

    const reportLine = difference.reportLine();
    expect(reportLine[0]).toEqual("default");
    // TN
    expect(reportLine[1]).toMatch(/^\D*1\D*green\D*\+\D*1\D*$/);
    // FP
    expect(reportLine[2]).toMatch(/^\D*2\D*$/);
    // TP
    expect(reportLine[3]).toMatch(/^\D*2\D*red\D*-1\D*$/);
    // FN
    expect(reportLine[4]).toMatch(/^\D*1\D*red\D*\+2\D*$/);
    // comparison time
    expect(reportLine[5]).toMatch(/^\D*90\D*red\D*\+2\D*$/);
    // Test labels
    expect(differences.getLabels()).contains(LabelGroups[ExperimentTitle.EQBENCH].MORE_FN_OR_FP);
    expect(differences.getLabelGroup()).toBe(LabelGroups[ExperimentTitle.EQBENCH]);
  });

  test("it should be able to serialize results and back deserialize them", async () => {
    const result1 = await EqBenchResult.fromOutputDir("default", mockContainer, "/eqbench-result");
    const result2 = await EqBenchResult.fromOutputDir("default", mockContainer, "/eqbench-result");
    const results = new EqBenchResults(ExperimentTitle.EQBENCH, [result1, result2]);
    const serializedResults = JSON.stringify(results);
    const deserializedResults = EqBenchResults.fromJSON(
      JSON.parse(serializedResults) as EqBenchCachedResults,
    );
    expect(deserializedResults).toStrictEqual(results);
  });
});
