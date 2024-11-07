/** Tests for container. */
import { expect, test } from "vitest";
import { Container } from "../src/container.js";
import { execSync } from "child_process";

test("it should be able to spawn a container", () => {
  const container = new Container();
  try {
    const id = container.id;
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
    id = container.id;
  }
  expect(execSync("podman ps -aq --no-trunc ", { encoding: "utf-8" })).not.toContain(id);
});
