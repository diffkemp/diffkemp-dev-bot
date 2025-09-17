/**
 * Tests for EvaluationConfig class.
 *
 * @author Lukas Petr
 */
import { expect, test, vi } from "vitest";
import { EvaluationConfig } from "../../src/evaluation/config.js";
import { pino } from "pino";
import { ProbotOctokit } from "probot";
import { Cache } from "../../src/evaluation/cache.js";

test("determineCacheBaseSnapshots should work correctly for closed/merged PRs", async () => {
  Cache.cacheOnlyLastSnapshot = true;
  Cache.getSnapshotKeys = vi.fn(() =>
    Promise.resolve(["b404d301880ad0f43baa0b5031ccdd444a0745d6-llvm14"]),
  );

  const octokit = new ProbotOctokit();
  const config = new EvaluationConfig({
    octokit: octokit,
    logger: pino({ level: "silent" }),
    baseBranch: "2d9b1f13d2d45be77ceb2b161f88dd4d028824cd",
    baseRepo: `diffkemp/diffkemp`,
    baseRepoPrivate: false,
    cacheBaseSnapshots: true,
    baseSHA: "2d9b1f13d2d45be77ceb2b161f88dd4d028824cd",
    baseRepoId: 114360782,
  });
  // Note: Calling private method, omitting TypeScript check by accessing the method dynamically
  // eslint-disable-next-line @typescript-eslint/dot-notation
  await config["determineCacheBaseSnapshots"]();
  expect(config.cacheBaseSnapshots).toBeFalsy();
});

test("determineCacheBaseSnapshots should work correctly for new push to master branch", async () => {
  Cache.cacheOnlyLastSnapshot = true;
  Cache.getSnapshotKeys = vi.fn(() =>
    Promise.resolve(["2d9b1f13d2d45be77ceb2b161f88dd4d028824cd-llvm14"]),
  );

  const octokit = new ProbotOctokit();
  const config = new EvaluationConfig({
    octokit: octokit,
    logger: pino({ level: "silent" }),
    baseBranch: "b404d301880ad0f43baa0b5031ccdd444a0745d6",
    baseRepo: `diffkemp/diffkemp`,
    baseRepoPrivate: false,
    cacheBaseSnapshots: true,
    baseSHA: "b404d301880ad0f43baa0b5031ccdd444a0745d6",
    baseRepoId: 114360782,
  });
  // Note: Calling private method, omitting TypeScript check by accessing the method dynamically
  // eslint-disable-next-line @typescript-eslint/dot-notation
  await config["determineCacheBaseSnapshots"]();
  expect(config.cacheBaseSnapshots).toBeTruthy();
});

test("determineCacheBaseSnapshots should work correctly for closed/merged PRs when caching multiple snapshots is enabled", async () => {
  Cache.cacheOnlyLastSnapshot = false;
  Cache.getSnapshotKeys = vi.fn(() =>
    Promise.resolve(["b404d301880ad0f43baa0b5031ccdd444a0745d6-llvm14"]),
  );

  const octokit = new ProbotOctokit();
  const config = new EvaluationConfig({
    octokit: octokit,
    logger: pino({ level: "silent" }),
    baseBranch: "2d9b1f13d2d45be77ceb2b161f88dd4d028824cd",
    baseRepo: `diffkemp/diffkemp`,
    baseRepoPrivate: false,
    cacheBaseSnapshots: true,
    baseSHA: "2d9b1f13d2d45be77ceb2b161f88dd4d028824cd",
    baseRepoId: 114360782,
  });
  // Note: Calling private method, omitting TypeScript check by accessing the method dynamically
  // eslint-disable-next-line @typescript-eslint/dot-notation
  await config["determineCacheBaseSnapshots"]();
  expect(config.cacheBaseSnapshots).toBeTruthy();
});
