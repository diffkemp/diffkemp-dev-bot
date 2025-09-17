/**
 * Tests comparison of commits.
 *
 * @author Lukas Petr
 */
import { expect, test } from "vitest";
import { isCommitBeforeCommit } from "../../src/utils/commits.js";
import { ProbotOctokit } from "probot";

test("isCommitBeforeCommit should return true if the first commit was committed before the second one", async () => {
  const res = await isCommitBeforeCommit(
    new ProbotOctokit(),
    "diffkemp",
    "diffkemp",
    "42fe44ff225441fe1b9fb43cafed33792d509b2f",
    "947770a61caa80c36201f8117144244d6a69d923",
  );
  expect(res).toBeTruthy();
});

test("isCommitBeforeCommit should return false if the first commit was committed after the second one", async () => {
  const res = await isCommitBeforeCommit(
    new ProbotOctokit(),
    "diffkemp",
    "diffkemp",
    "947770a61caa80c36201f8117144244d6a69d923",
    "42fe44ff225441fe1b9fb43cafed33792d509b2f",
  );
  expect(res).toBeFalsy();
});

test("isCommitBeforeCommit should return true if the first commit was committed before the second one (even if the second commit is not merged)", async () => {
  // 64613b3c38c783e5c6af125653f177dba50e3ff0 is from unmerged PR #1
  const res = await isCommitBeforeCommit(
    new ProbotOctokit(),
    "diffkemp",
    "diffkemp",
    "e14689b6dd00822bd273f610abbcb78d5dcea0b1",
    "64613b3c38c783e5c6af125653f177dba50e3ff0",
  );
  expect(res).toBeTruthy();
});
