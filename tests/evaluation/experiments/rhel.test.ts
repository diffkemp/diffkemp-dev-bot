/** Tests for RHEL experiments. */
import { Container } from "../../../src/container.js";
import { describe, expect, test } from "vitest";
import { ComparisonStatistics, DiffKemp } from "../../../src/diffkemp.js";
import { RHELRunner } from "../../../src/evaluation/experiments/rhel.js";
import { DefaultResult, DefaultResults } from "../../../src/evaluation/experiments/default.js";
import { LabelGroups } from "../../../src/utils/labels.js";
import { ExperimentTitle } from "../../../src/evaluation/experiments/titles.js";
import { Differences } from "../../../src/differences.js";

describe("RHELRunner", () => {
  test(
    "it should be possible to compare a RHEL kernel function",
    { timeout: 600_000 },
    async () => {
      const container = new Container();
      try {
        const diffkemp = new DiffKemp(container, "diffkemp/diffkemp", "master");
        await diffkemp.setup();
        const runner = new RHELRunner(diffkemp, {
          versions: ["8.0-8.1"],
          symbolList: ["__alloc_pages_nodemask"],
        });
        await expect(runner.run({})).resolves.toBeDefined();
      } finally {
        container[Symbol.dispose]();
      }
    },
  );
  test(
    "results should be returned even if time limit was reached when building",
    { timeout: 1_200_000 },
    async () => {
      const container = new Container();
      try {
        const diffkemp = new DiffKemp(container, "diffkemp/diffkemp", "master");
        await diffkemp.setup();
        const runner = new RHELRunner(diffkemp, {
          versions: ["8.0-8.1"],
          symbolList: ["__alloc_pages_nodemask"],
          build_timeout: 10000,
        });
        const result = await runner.run({});
        expect(result).toBeInstanceOf(DefaultResults);
        expect((result as DefaultResults).getResults()).toEqual(new Map());
      } finally {
        container[Symbol.dispose]();
      }
    },
  );
  test(
    "it should be possible to compare a RHEL kernel sysctl parameters",
    { timeout: 300_000 },
    async () => {
      const container = new Container();
      try {
        const diffkemp = new DiffKemp(container, "diffkemp/diffkemp", "master");
        await diffkemp.setup();
        const runner = new RHELRunner(diffkemp, {
          versions: ["8.0-8.1"],
          symbolList: ["kernel.acct"],
          sysctl: true,
        });
        await expect(runner.run({})).resolves.toBeDefined();
      } finally {
        container[Symbol.dispose]();
      }
    },
  );
});

describe("Labels", () => {
  const createResult = (
    title: ExperimentTitle,
    stats: ComparisonStatistics,
    stats2: ComparisonStatistics,
  ) => {
    return new DefaultResults(title, [
      new DefaultResult("8.0-8.1", stats, new Differences(new Map<string, string[]>())),
      new DefaultResult("8.1-8.2", stats2, new Differences(new Map<string, string[]>())),
      new DefaultResult("8.2-8.3", stats, new Differences(new Map<string, string[]>())),
    ]);
  };
  const getDefaultStats = (): ComparisonStatistics => {
    return {
      equal: 20,
      notEqual: 20,
      errors: 20,
      totalDifferences: 20,
      unknown: 20,
      runtime: 20,
    };
  };
  const getEditedStats = ({
    equal,
    notEqual,
    errors,
    totalDifferences,
    unknown,
  }: Partial<ComparisonStatistics>) => {
    const newStats = getDefaultStats();
    if (errors) {
      newStats.errors += errors;
    }
    if (unknown) {
      newStats.unknown += unknown;
    }
    if (notEqual) {
      newStats.notEqual += notEqual;
    }
    if (equal) {
      newStats.equal += equal;
    }
    if (totalDifferences) {
      newStats.totalDifferences += totalDifferences;
    }
    return newStats;
  };
  test("it should be possible to get correct labels for RHEL functions", () => {
    const stats = getDefaultStats();
    const baseResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, stats);

    let prResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, stats);
    let differences = prResults.compare(baseResults);
    let labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_FUNCTIONS].STABLE);

    let newStats = getEditedStats({
      errors: +4,
      unknown: +1,
      notEqual: +1,
      equal: +2,
      totalDifferences: +1,
    });
    prResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_FUNCTIONS].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      unknown: +4,
      notEqual: +1,
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_FUNCTIONS].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      notEqual: +1,
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_FUNCTIONS].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_FUNCTIONS, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_FUNCTIONS].MORE_EQ_OR_DIFF);
  });

  test("it should be possible to get correct labels for RHEL sysctl", () => {
    const stats = getDefaultStats();
    const baseResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, stats);

    let prResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, stats);
    let differences = prResults.compare(baseResults);
    let labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_SYSCTL].STABLE);

    let newStats = getEditedStats({
      errors: +4,
      unknown: +1,
      notEqual: +1,
      equal: +2,
      totalDifferences: +1,
    });
    prResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_SYSCTL].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      unknown: +4,
      notEqual: +1,
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_SYSCTL].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      notEqual: +1,
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_SYSCTL].MORE_NEQ_UNK_OR_ERR);

    newStats = getEditedStats({
      equal: +2,
    });
    prResults = createResult(ExperimentTitle.RHEL_SYSCTL, stats, newStats);
    differences = prResults.compare(baseResults);
    labels = differences.getLabels();
    expect(labels).toHaveLength(1);
    expect(labels).toContainEqual(LabelGroups[ExperimentTitle.RHEL_SYSCTL].MORE_EQ_OR_DIFF);
  });
});
