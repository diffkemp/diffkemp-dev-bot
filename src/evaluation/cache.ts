/**
 * Contains class for caching.
 *
 * @author Lukas Petr
 */
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { IContainer } from "../container.js";
import { EqBenchCachedResults, EqBenchResults } from "./experiments/eqbench.js";

/** Class for caching files and restoring them. */
export class Cache {
  static readonly CACHE_DIR = ".cache/";
  /** Caches EqBench results. */
  static async cacheResults(key: string, results: EqBenchResults) {
    const dir = join(Cache.CACHE_DIR, "results", key);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const NUMBER_OF_SPACES = 2;
    await writeFile(join(dir, "eqbench.json"), JSON.stringify(results, null, NUMBER_OF_SPACES));
  }
  /** Return cached EqBench results or null if result is not cached. */
  static async restoreResults(key: string): Promise<EqBenchResults | null> {
    const dir = join(Cache.CACHE_DIR, "results", key);
    const file = join(dir, "eqbench.json");
    if (!existsSync(dir)) {
      return null;
    }
    const json = JSON.parse(await readFile(file, { encoding: "utf-8" })) as EqBenchCachedResults;
    return EqBenchResults.fromJSON(json);
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
