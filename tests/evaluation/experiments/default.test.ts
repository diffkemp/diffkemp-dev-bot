/** Tests for default experiment classes. */
import { describe, expect, test } from "vitest";
import { ComparisonStatistics } from "../../../src/diffkemp.js";
import {
  DefaultCachedResult,
  DefaultCachedResults,
  DefaultDifference,
  DefaultResult,
  DefaultResults,
} from "../../../src/evaluation/experiments/default.js";
import { ExperimentTitle } from "../../../src/evaluation/experiments/titles.js";
import { SuccessfulExperimentDifferences } from "../../../src/evaluation/experiments/experiment.js";
import { Differences } from "../../../src/differences.js";

const createResult = () => {
  const stats: ComparisonStatistics = {
    equal: 20,
    errors: 1,
    notEqual: 3,
    runtime: 5.5,
    totalDifferences: 3,
    unknown: 4,
  };
  const differences = new Map<string, string[]>();
  differences.set("__alloc_pages_nodemask", ["__alloc_pages_slowpath", "pv_queued_spin_unlock"]);
  differences.set("__alloc_skb", ["__alloc_skb"]);
  differences.set("__alloc_workqueue_key", ["pv_queued_spin_unlock"]);
  const definitions = {
    __alloc_skb: {
      old: {
        line: 327,
        file: "old.c",
        "end-line": 358,
      },
      new: {
        line: 367,
        file: "new.c",
        "end-line": 398,
      },
    },
  };
  return new DefaultResult("8.0-8.1", stats, new Differences(differences, definitions));
};

describe("DefaultResult", () => {
  test("it should be able to serialize to JSON and deserialize back", () => {
    const originalResult = createResult();
    const json = JSON.stringify(originalResult);
    const recoveredResult = DefaultResult.fromJSON(JSON.parse(json) as DefaultCachedResult);
    expect(recoveredResult).toStrictEqual(originalResult);
  });

  test("`getDifferingCompared` should return compared function which are differing", () => {
    const compared = createResult().differences.getCompared();
    expect(compared).toEqual(["__alloc_pages_nodemask", "__alloc_skb", "__alloc_workqueue_key"]);
  });

  test("`getDiffering` should return all differing functions", () => {
    const differing = createResult().differences.getDiffering();
    expect(differing).toEqual(["__alloc_pages_slowpath", "__alloc_skb", "pv_queued_spin_unlock"]);
  });
});

describe("DefaultResults", () => {
  test("it should be possible to compare DefaultResults correctly", () => {
    // Setup
    const baseResults = new DefaultResults(ExperimentTitle.RHEL_FUNCTIONS, [createResult()]);
    const stats: ComparisonStatistics = {
      equal: 20 + 1 - 2,
      errors: 1 - 1,
      notEqual: 3 - 1 + 2,
      runtime: 5.5 + 15,
      totalDifferences: 3 - 1 + 3,
      unknown: 4 - 3,
    };
    const resultDifferences = new Map<string, string[]>();
    resultDifferences.set("__alloc_pages_nodemask", [
      "__alloc_pages_slowpath",
      "pv_queued_spin_unlock",
      "bar",
      "x",
    ]);
    resultDifferences.set("__alloc_workqueue_key", ["pv_queued_spin_unlock"]);
    resultDifferences.set("foo1", ["bar", "baz"]);
    resultDifferences.set("foo2", ["bar", "baz"]);
    const prResults = new DefaultResults(ExperimentTitle.RHEL_FUNCTIONS, [
      new DefaultResult("8.0-8.1", stats, new Differences(resultDifferences)),
    ]);
    const differences = prResults.compare(baseResults);
    const difference = (differences as SuccessfulExperimentDifferences).get(
      "8.0-8.1",
    ) as DefaultDifference;
    expect(difference).toBeDefined();
    expect(difference.statistics.equal).toBe(-1);
    expect(difference.statistics.errors).toBe(-1);
    expect(difference.statistics.notEqual).toBe(1);
    expect(difference.statistics.runtime).toBe(15);
    expect(difference.statistics.totalDifferences).toBe(2);
    expect(difference.statistics.unknown).toBe(-3);

    const reportLine = difference.reportLine();
    expect(reportLine[0]).toEqual("8.0-8.1");
    // equal
    expect(reportLine[1]).toMatch(/^\D*20\D*red\D*-\D*1\D*$/);
    // not equal
    expect(reportLine[2]).toMatch(/^\D*3\D*red\D*\+\D*1\D*$/);
    // unknown
    expect(reportLine[3]).toMatch(/^\D*4\D*green\D*-3\D*$/);
    // errors
    expect(reportLine[4]).toMatch(/^\D*1\D*green\D*-1\D*$/);
    // total differences
    expect(reportLine[5]).toMatch(/^\D*3\D*red\D*\+2\D*$/);
    // runtime
    expect(reportLine[6]).toMatch(/^\D*6\D*red\D*\+15\D*$/);

    expect(difference.differencesCmp.compareNeqFun()).toEqual({
      onlyInPr: ["foo1", "foo2"],
      onlyInBase: ["__alloc_skb"],
    });
    expect(difference.differencesCmp.compareDiffering()).toEqual({
      onlyInPr: [
        { differing: "bar", compared: new Set(["__alloc_pages_nodemask", "foo1", "foo2"]) },
        { differing: "x", compared: new Set(["__alloc_pages_nodemask"]) },
        { differing: "baz", compared: new Set(["foo1", "foo2"]) },
      ],
      onlyInBase: [
        {
          differing: "__alloc_skb",
          compared: new Set(["__alloc_skb"]),
          definition: {
            old: {
              line: 327,
              file: "old.c",
              "end-line": 358,
            },
            new: {
              line: 367,
              file: "new.c",
              "end-line": 398,
            },
          },
        },
      ],
    });
  });

  test("it should be able to serialize results and deserialize them back", () => {
    const results = new DefaultResults(ExperimentTitle.RHEL_FUNCTIONS, [
      createResult(),
      createResult(),
    ]);
    const serializedResults = JSON.stringify(results);
    const deserializedResults = DefaultResults.fromJSON(
      JSON.parse(serializedResults) as DefaultCachedResults,
    );
    expect(deserializedResults).toStrictEqual(results);
  });
});
