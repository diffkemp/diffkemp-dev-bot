/** Tests for DiffKemp. */
import { expect, test } from "vitest";
import { Container } from "../src/container.js";
import { DiffKemp } from "../src/diffkemp.js";
import { parse } from "yaml";
import { readFileSync } from "fs";
import { join } from "path";
import { Differences, DiffKempOutputFormat } from "../src/differences.js";

test("it should be able to setup DiffKemp", { timeout: 600_000 }, async () => {
  using container = new Container();
  const diffkemp = new DiffKemp(container, "diffkemp/diffkemp", "master");
  await diffkemp.setup();
  const bin = diffkemp.getPathToBin();
  const output = await diffkemp.runInDevelopmentEnv(`${bin} --help`);
  expect(output).toMatch(/^usage/);
  // Test also if it is possible to get llvm version
  expect(Number(await diffkemp.getLlvmVersion())).not.toBeNaN();
});

test("it should be able to extract statistics from a comparison output", () => {
  const output = `...
Differences stored in diff-8.0-8.1/

Statistics
----------
Total symbols: 796
Equal:         653 (82%)
Not equal:     36 (5%)
(empty diff):  1 (0%)
Unknown:       103 (13%)
Errors:        4 (0%)

Elapsed time:            882.41 s
Functions compared:      5654
Lines compared:          63392
Instructions compared:   191886
1:1 equal instructions:  191508 (100%)

Total differences:       28
In functions:            26 (93%)
In types:                0 (0%)
In macros:               2 (7%)
In inline assembly code: 0 (0%)
Empty diffs:             1 (4%)`;
  const stats = DiffKemp.getComparisonStatistics(output);
  expect(stats.equal).toEqual(653);
  expect(stats.notEqual).toEqual(36);
  expect(stats.unknown).toEqual(103);
  expect(stats.errors).toEqual(4);
  expect(stats.runtime).toEqual(882.41);
  expect(stats.totalDifferences).toEqual(28);
});

test("it should be able to extract differing functions from diffkemp-out.yaml", () => {
  const diffkempOutYamlExample = readFileSync(join(__dirname, "examples", "diffkemp-out.yaml"), {
    encoding: "utf-8",
  });
  const yaml = parse(diffkempOutYamlExample) as DiffKempOutputFormat;
  const map = Differences.fromDiffKempOut(yaml);
  expect([...map.comparedDiffering.entries()]).toEqual([
    ["__alloc_pages_nodemask", ["__alloc_pages_slowpath", "pv_queued_spin_unlock"]],
    ["__alloc_skb", ["__alloc_skb"]],
    ["__alloc_workqueue_key", ["pv_queued_spin_unlock"]],
  ]);
});
