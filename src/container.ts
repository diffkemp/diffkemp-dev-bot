/**
 * File containing class for working with a container.
 *
 * @author Lukas Petr
 */
import { execFile, execSync } from "child_process";
import { join } from "path";
import { promisify } from "util";

const execFilePromisify = promisify(execFile);

/** Error thrown by the container because timeout of command was reached. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Class allowing to spawn a container and run commands in it.
 *
 * @note Make sure you are not waiting for any promise running in container before leaving using scope.
 */
export class Container implements Disposable, IContainer {
  /** Container ID. */
  private id: string | null;
  private abortSignal?: AbortSignal;
  /** Event called when abort signal is 'send'. */
  private abortEvent: EventListener;

  /**
   * Creates new container.
   *
   * @param abortSignal Signal for aborting/killing container.
   */
  constructor(abortSignal?: AbortSignal) {
    this.id = execSync("podman run -di diffkemp-prs:latest", {
      encoding: "utf-8",
    }).trim();
    this.abortSignal = abortSignal;
    this.abortEvent = () => {
      this.killContainer();
    };
    abortSignal?.addEventListener("abort", this.abortEvent, { once: true });
  }
  public getId() {
    return this.id;
  }
  /** Rebuilds container image. */
  public static async rebuildImage() {
    await execFilePromisify(join(import.meta.dirname, "../create_image.sh"));
  }
  /**
   * Runs command inside the container.
   *
   * @returns Promise containing stdout output of the command.
   */
  async run(command: string | string[], options?: { timeout?: number }) {
    if (command instanceof Array) {
      command = command.join(" ");
    }
    const startTime = Date.now();
    try {
      const { stdout } = await execFilePromisify(
        "podman",
        ["exec", this.id!, "bash", "-c", command],
        {
          encoding: "utf-8",
          timeout: options?.timeout,
        },
      );
      return stdout;
    } catch (e) {
      this.abortSignal?.throwIfAborted();
      if (options?.timeout && Date.now() - startTime >= options.timeout) {
        throw new TimeoutError(`Error: Time for command exceeded (${command.toString()})`);
      }
      throw new Error(
        `Error when running command (${command.toString()}) in container ${this.id}`,
        { cause: e },
      );
    }
  }
  /** Returns promise with a content of a file from the container. */
  async readFile(path: string) {
    return this.run(`cat ${path}`);
  }
  /**
   * Check if file exists in the container.
   *
   * @returns Promise that resolves as true if the file exists.
   */
  async exists(path: string) {
    return (await this.run(`test -e ${path} && echo 'true' || echo 'false'`)).trim() === "true";
  }
  /** Copies file to container */
  async copyTo(srcPath: string, destPath: string = srcPath) {
    try {
      await execFilePromisify("podman", ["cp", srcPath, `${this.id}:${destPath}`]);
    } catch (e) {
      this.abortSignal?.throwIfAborted();
      throw e;
    }
  }
  /** Copies file from container */
  async copyFrom(srcPath: string, destPath: string = srcPath) {
    try {
      await execFilePromisify("podman", ["cp", `${this.id}:${srcPath}`, destPath]);
    } catch (e) {
      this.abortSignal?.throwIfAborted();
      throw e;
    }
  }
  /** Creates temporary directory in the container and returns path to it. */
  async mkdtemp(): Promise<string> {
    return (await this.run("mktemp -d")).trim();
  }
  /** Stops and removes the container after `using` variable is out of scope. */
  [Symbol.dispose]() {
    this.abortSignal?.removeEventListener("abort", this.abortEvent);
    if (this.id) {
      execSync(`podman kill ${this.id}`);
      execSync(`podman rm -f ${this.id}`);
    }
  }
  killContainer() {
    execSync(`podman kill ${this.id}`);
    execSync(`podman rm -f ${this.id}`);
    this.id = null;
  }
}

export interface IContainer {
  run(command: string | string[], options?: { timeout?: number }): Promise<string>;
  readFile(path: string): Promise<string>;
  copyTo(from: string, to: string): Promise<void>;
  copyFrom(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdtemp(): Promise<string>;
}
