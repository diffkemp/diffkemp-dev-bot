/** Tests for RHEL experiments. */
import { Container } from "../../../src/container.js";
import { describe, expect, test } from "vitest";
import { DiffKemp } from "../../../src/diffkemp.js";
import { RHELRunner } from "../../../src/evaluation/experiments/rhel.js";

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
