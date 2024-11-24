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
