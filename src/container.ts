/**
 * File containing class for working with a container.
 *
 * @author Lukas Petr
 */
import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFilePromisify = promisify(execFile);

/**
 * Class allowing to spawn a container and run commands in it.
 *
 * @note Make sure you are not waiting for any promise running in container before leaving using scope.
 */
export class Container implements Disposable, IContainer {
  /** Container ID. */
  readonly id;
  /** Creates new container. */
  constructor() {
    this.id = execSync("podman run -di diffkemp-prs:latest", {
      encoding: "utf-8",
    }).trim();
  }
  /**
   * Runs command inside the container.
   *
   * @returns Promise containing stdout output of the command.
   */
  async run(command: string | string[]) {
    if (command instanceof Array) {
      command = command.join(" ");
    }
    const { stdout } = await execFilePromisify("podman", ["exec", this.id, "bash", "-c", command], {
      encoding: "utf-8",
    });
    return stdout;
  }
  /** Stops and removes the container after `using` variable is out of scope. */
  [Symbol.dispose]() {
    execSync(`podman stop ${this.id}`);
    execSync(`podman rm ${this.id}`);
  }
}

export interface IContainer {
  run(command: string | string[]): Promise<string>;
}
