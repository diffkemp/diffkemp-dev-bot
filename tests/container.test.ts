/** Tests for container. */
import { expect, test } from "vitest";
import { Container } from "../src/container.js";
import { execSync } from "child_process";

test("it should be able to spawn a container", () => {
  const container = new Container();
  try {
    const id = container.getId();
    const runningContainers = execSync("podman ps -q --no-trunc", { encoding: "utf-8" });
    expect(runningContainers).toContain(id);
  } finally {
    container[Symbol.dispose]();
  }
});
test("it should be able to run commands in the container", async () => {
  const container = new Container();
  try {
    const stdout = await container.run("echo test");
    expect(stdout).toContain("test");
  } finally {
    container[Symbol.dispose]();
  }
});
test("out of `using` scope the container should not exist", () => {
  let id;
  {
    using container = new Container();
    id = container.getId();
  }
  expect(execSync("podman ps -aq --no-trunc ", { encoding: "utf-8" })).not.toContain(id);
});

test("it should be able to abort container", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 1000);
  using container = new Container(ac.signal);
  await expect(container.run("sleep 15")).rejects.toThrow();
});

test("aborting after container is out of scope should not throw error", () => {
  const ac = new AbortController();
  {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    using _ = new Container(ac.signal);
  }
  ac.abort();
});

test("it should be possible to create diff", async () => {
  using container = new Container();
  const diff = await container.createDiff(
    1660,
    1687,
    "/experiments/sources/kernel/functions/linux-4.18.0-80.el8/mm/slub.c",
    1654,
    1676,
    "/experiments/sources/kernel/functions/linux-4.18.0-147.el8/mm/slub.c",
  );
  const diffWithoutHeader = diff.split("\n").slice(2).join("\n");
  expect(diffWithoutHeader).toBe(`@@ -1673,7 +1667,2 @@
 
-	mod_lruvec_page_state(page,
-		(s->flags & SLAB_RECLAIM_ACCOUNT) ?
-		NR_SLAB_RECLAIMABLE : NR_SLAB_UNRECLAIMABLE,
-		-pages);
-
 	__ClearPageSlabPfmemalloc(page);
@@ -1684,3 +1673,3 @@
 		current->reclaim_state->reclaimed_slab += pages;
-	memcg_uncharge_slab(page, order, s);
+	uncharge_slab_page(page, order, s);
 	__free_pages(page, order);
`);
});
