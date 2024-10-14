/**
 * Contains class for working with DiffKemp.
 *
 * @author Lukas Petr
 */

import { join } from "path";
import { IContainer } from "./container.js";

/** Class for working with DiffKemp inside a container. */
export class DiffKemp {
  /** Owner name and repository name. */
  private repo: string;
  /** Branch name. */
  private branch: string;
  /** Path to directory with cloned DiffKemp. */
  private directory = "/diffkemp";
  /** Path to directory containing DiffKemp executable. */
  private pathToBinDir = "/diffkemp-bin";
  /** Container in which is DiffKemp setup. */
  readonly container;
  /**
   * @param container Container where will be DiffKemp setup.
   * @param repo <owner-name/repository-name>
   * @param ref Branch name.
   * @note It is necessary to be careful with the repo and ref values,
   *   because these are created by user and could be potential way of injection attack.
   */
  constructor(container: IContainer, repo: string, ref: string) {
    this.repo = repo;
    this.branch = ref;
    this.container = container;
  }
  /**
   * Setups DiffKemp in the container.
   *
   * @param token App installation token (necessary for private repos).
   */
  async setup(token?: string) {
    await this._clone(token);
    await this._build();
  }
  /** Clones DiffKemp repository with specified branch. */
  private async _clone(token?: string) {
    const command = ["git", "clone", "--depth", "1", "-b", this.branch];
    if (token) {
      // Private repo, use token for cloning.
      command.push(`https://x-access-token:${token}@github.com/${this.repo}`);
    } else {
      command.push(`https://github.com/${this.repo}`);
    }
    command.push(this.directory);
    await this.container.run(command.join(" "));
  }
  /** Builds DiffKemp. */
  private async _build() {
    await this.container.run(`nix build ${this.directory} -o ${this.pathToBinDir}`);
  }
  /** Returns path to DiffKemp executable. */
  getPathToBin() {
    return join(this.pathToBinDir, "bin/diffkemp");
  }
  /**
   * Runs command in DiffKemp development environment.
   *
   * @returns Promise that resolves when the command finishes. The promise contains stdout output of
   *   the command.
   */
  async runInDevelopmentEnv(command: string | string[]) {
    if (command instanceof Array) {
      command = command.join(" ");
    }
    return this.container.run(`nix develop ${this.directory} --command bash -c '${command}'`);
  }
}
