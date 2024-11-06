/**
 * File containing class for working with a container.
 *
 * @author Lukas Petr
 */
import { execFile, execSync } from "child_process";
import { join } from "path";
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
  /** Rebuilds container image. */
  public static async rebuildImage() {
    await execFilePromisify(join(import.meta.dirname, "../create_image.sh"));
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
    await execFilePromisify("podman", ["cp", srcPath, `${this.id}:${destPath}`]);
  }
  /** Copies file from container */
  async copyFrom(srcPath: string, destPath: string = srcPath) {
    await execFilePromisify("podman", ["cp", `${this.id}:${srcPath}`, destPath]);
  }
  /** Creates temporary directory in the container and returns path to it. */
  async mkdtemp(): Promise<string> {
    return (await this.run("mktemp -d")).trim();
  }
  /** Stops and removes the container after `using` variable is out of scope. */
  [Symbol.dispose]() {
    execSync(`podman stop ${this.id}`);
    execSync(`podman rm ${this.id}`);
  }
}

export interface IContainer {
  run(command: string | string[]): Promise<string>;
  readFile(path: string): Promise<string>;
  copyTo(from: string, to: string): Promise<void>;
  copyFrom(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdtemp(): Promise<string>;
}
