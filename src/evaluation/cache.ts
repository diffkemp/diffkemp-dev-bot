/**
 * Contains class for caching.
 *
 * @author Lukas Petr
 */
import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { IContainer } from "../container.js";
import { ExperimentResults } from "./experiments/experiment.js";

/** Class for caching files and restoring them. */
export class Cache {
  static readonly CACHE_DIR = ".cache/";
  /** Caches results of experiment. */
  static async cacheResults(key: string, results: ExperimentResults) {
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
  /** Return cached results, returns null if results are not cached. */
  static async restoreResults(key: string): Promise<ExperimentResults[] | null> {
    const dir = join(Cache.CACHE_DIR, "results", key);
    if (!existsSync(dir)) {
      return null;
    }
    const resultFiles = await readdir(dir);
    const results = Array<ExperimentResults>();
    for (const fileName of resultFiles) {
      if (!fileName.endsWith(".json")) {
        continue;
      }
      const file = join(dir, fileName);
      const fileContent = await readFile(file, { encoding: "utf-8" });
      const json = JSON.parse(fileContent) as object;
      results.push(await ExperimentResults.createFromJSON(json));
    }
    return results;
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
