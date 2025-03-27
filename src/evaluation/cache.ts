/**
 * Contains class for caching.
 *
 * @author Lukas Petr
 */
import { existsSync } from "fs";
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { IContainer } from "../container.js";
import { SuccessfulExperimentResults } from "./experiments/experiment.js";

/** Class for caching files and restoring them. */
export class Cache {
  static CACHE_DIR = ".cache/";
  static cacheOnlyLastSnapshot = true;
  /** Caches results of experiment. */
  static async cacheResults(key: string, results: SuccessfulExperimentResults) {
    const dir = join(Cache.CACHE_DIR, "results", key);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const NUMBER_OF_SPACES = 2;
    await writeFile(
      join(dir, `${results.getTitle()}.json`),
      JSON.stringify(results, null, NUMBER_OF_SPACES),
    );
  }
  /** Caching directory containing comparison results. */
  static async cacheDetailedResults(key: string, container: IContainer) {
    const dir = join(Cache.CACHE_DIR, "results", key);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await container.copyFrom("/experiments/results", dir);
  }
  /** Return cached results, returns null if results are not cached. */
  static async restoreResults(key: string): Promise<SuccessfulExperimentResults[] | null> {
    try {
      const dir = join(Cache.CACHE_DIR, "results", key);
      if (!existsSync(dir)) {
        return null;
      }
      const resultFiles = await readdir(dir);
      const results = Array<SuccessfulExperimentResults>();
      for (const fileName of resultFiles) {
        if (!fileName.endsWith(".json")) {
          continue;
        }
        const file = join(dir, fileName);
        const fileContent = await readFile(file, { encoding: "utf-8" });
        const json = JSON.parse(fileContent) as object;
        results.push(await SuccessfulExperimentResults.createFromJSON(json));
      }
      return results;
    } catch (e) {
      throw new Error(`Error: Unsuccessful restoration of results for ${key}`, { cause: e });
    }
  }
  /**
   * Caches snapshots from the container.
   *
   * @param key Key for retrieving the snapshots.
   * @param container Container to cache snapshots from.
   */
  static async cacheSnapshots(key: string, container: IContainer) {
    const dir = join(Cache.CACHE_DIR, "snapshots", key);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    } else {
      // Already cached
      return;
    }
    await container.copyFrom("/experiments/snapshots", dir);
    if (Cache.cacheOnlyLastSnapshot) {
      await Cache.removeSnapshots(key);
    }
  }
  /** Removes all snapshots except the one specified by key. */
  private static async removeSnapshots(key: string) {
    // Leaving only current snapshot
    const dirNames = await readdir(join(Cache.CACHE_DIR, "snapshots"));
    for (const dirName of dirNames) {
      if (dirName !== key) {
        const path = join(Cache.CACHE_DIR, "snapshots", dirName);
        await rm(path, { recursive: true });
      }
    }
  }
  /**
   * Tries to restore snapshots from the cache to the container.
   *
   * @param key Key for retrieving snapshots.
   * @param container Container where the snapshots will be restored.
   * @returns True if the restoration was successful.
   */
  static async restoreSnapshots(key: string, container: IContainer): Promise<boolean> {
    const dir = join(Cache.CACHE_DIR, "snapshots", key, "snapshots");
    if (existsSync(dir)) {
      await container.copyTo(dir, "/experiments");
      return true;
    }
    return false;
  }
}
