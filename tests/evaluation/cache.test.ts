/** Tests for caching. */

import { expect, test } from "vitest";
import { Cache } from "../../src/evaluation/cache.js";

test("it should be possible to create snapshot key", () => {
  const key = Cache.createSnapshotKey("948243737c02839be4e01848e3e8fb7f0962acaf", "16");
  expect(key).toEqual("948243737c02839be4e01848e3e8fb7f0962acaf-llvm16");
});

test("is should be possible extract SHA and llvm version from snapshot key", () => {
  const res = Cache.extractFromSnapshotKey("948243737c02839be4e01848e3e8fb7f0962acaf-llvm16");
  expect(res.commitSHA).toBe("948243737c02839be4e01848e3e8fb7f0962acaf");
  expect(res.llvmVersion).toBe("16");
});
