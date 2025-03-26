/**
 * Contains class having detailed information about found semantic differences in a project.
 *
 * @author Lukas Petr
 */
import { mkdtemp, readFile, rm } from "fs/promises";
import { IContainer } from "./container.js";
import { join } from "path";
import { tmpdir } from "os";
import { parse } from "yaml";

/**
 * Class containing information about differing functions identified in project by DiffKemp compare
 * command and loaded from `diffkemp-out.yaml` file.
 */
export class Differences {
  /**
   * Map, where keys are names of compared functions which were evaluated as non-equal and values
   * list of differing functions for the given compared function. The compared functions are
   * inserted to the map in sorted order, also the array with differing functions is sorted.
   */
  public comparedDiffering = new Map<string, string[]>();
  /** Reverse map, mapping differing function to list of compared where it belongs. */
  private differingCompared = new Map<string, Set<string>>();
  /** Maps name of differing function with location in old file and new file. */
  private differingDefs = new Map<string, DKOutDefinition>();

  constructor(comparedDiffering: Map<string, string[]>, definitions?: DKOutDefinitions) {
    this.comparedDiffering = comparedDiffering;
    comparedDiffering.forEach((diffs, compared) => {
      diffs.forEach((diff) => {
        if (this.differingCompared.has(diff)) {
          this.differingCompared.get(diff)?.add(compared);
        } else {
          this.differingCompared.set(diff, new Set([compared]));
        }
      });
    });
    if (!definitions) {
      return;
    }
    for (const differing of this.differingCompared.keys()) {
      if (definitions[differing]) {
        this.differingDefs.set(differing, definitions[differing]);
      }
    }
  }
  /** Extracts info about differing functions from output directory of DiffKemp compare command. */
  public static async fromContainer(container: IContainer, outDir: string): Promise<Differences> {
    const dir = await mkdtemp(join(tmpdir(), "diffkemp-out"));
    try {
      await container.copyFrom(`/${outDir}/diffkemp-out.yaml`, dir);
      const fileContent = await readFile(join(dir, "diffkemp-out.yaml"), { encoding: "utf8" });
      const yaml = parse(fileContent) as DiffKempOutputFormat;
      return Differences.fromDiffKempOut(yaml);
    } finally {
      await rm(dir, { recursive: true });
    }
  }
  /** Extract info from diffkemp-out.yaml loaded to JSON as object (yaml). */
  static fromDiffKempOut(yaml: DiffKempOutputFormat) {
    yaml.results.sort((result1, result2) => result1.function.localeCompare(result2.function));
    const comparedDiffering = new Map<string, string[]>();
    yaml.results.forEach((result) => {
      const cmpFun = result.function;
      const differingFuns = result.diffs.map((diff) => diff.function).sort();
      comparedDiffering.set(cmpFun, differingFuns);
    });
    return new Differences(comparedDiffering, yaml.definitions);
  }
  public toJSON(): DifferencesCached {
    return {
      comparedDiffering: Object.fromEntries(this.comparedDiffering.entries()),
      differingDefinitions: Object.fromEntries(this.differingDefs.entries()),
    };
  }
  public static fromJSON(json: DifferencesCached) {
    const comparedDiffering = new Map(Object.entries(json.comparedDiffering));
    return new Differences(comparedDiffering, json.differingDefinitions);
  }
  /**
   * Returns array of compared symbols which were evaluated as non-equal. The symbols are placed in
   * sorted order.
   */
  public getCompared() {
    return [...this.comparedDiffering.keys()];
  }
  /** Returns array of all differing symbols. The symbols are in sorted order. */
  public getDiffering() {
    return Array.from(new Set([...this.comparedDiffering.values()].flat())).sort();
  }
  public getDifferingCompared() {
    return this.differingCompared;
  }
  /** Returns definition of function for function which is differing. */
  public getDefinitionForDiffering(differing: string): DKOutDefinition | undefined {
    return this.differingDefs.get(differing);
  }
}

export interface DifferencesCached {
  comparedDiffering: Record<string, string[]>;
  differingDefinitions: Record<string, DKOutDefinition>;
}

/**
 * Class allowing to compare semantic differences of the same project gained using two versions of
 * DiffKemp.
 */
export class DifferencesComparator {
  pr: Differences;
  base: Differences;
  /**
   * Creates comparator.
   *
   * @param pr Differences in pull request.
   * @param base Differences in base branch.
   */
  constructor(base: Differences, pr: Differences) {
    this.pr = pr;
    this.base = base;
  }
  /**
   * Compares non equal functions in pr with non equal functions in base.
   *
   * @returns Returns names of functions that are non equal only in pr x base.
   */
  public compareNeqFun() {
    return DifferencesComparator.compare(this.pr.getCompared(), this.base.getCompared());
  }
  /**
   * Compares differing functions in pr with differing functions in base.
   *
   * @returns Returns Array with info about differing functions that are only in base or only in
   *   pr..
   */
  public compareDiffering() {
    const onlyInPr = new Array<DifferingInfo>();
    const onlyInBase = new Array<DifferingInfo>();
    const baseDC = this.base.getDifferingCompared();
    const prDC = this.pr.getDifferingCompared();
    const allDiffering = new Set(baseDC.keys());
    for (const differing of prDC.keys()) {
      allDiffering.add(differing);
    }
    for (const differing of allDiffering) {
      const inBase = baseDC.has(differing);
      const inPr = prDC.has(differing);
      if (inBase && inPr) {
        continue;
      } else {
        const arr = inBase ? onlyInBase : onlyInPr;
        const dc = inBase ? baseDC : prDC;
        const side = inBase ? this.base : this.pr;
        arr.push({
          differing,
          compared: dc.get(differing)!,
          definition: side.getDefinitionForDiffering(differing),
        });
      }
    }
    return { onlyInPr, onlyInBase };
  }
  /** Returns symbols which are only located in pr and base array. Expects the arrays to be sorted. */
  private static compare(pr: string[], base: string[]) {
    const prSet = new Set(pr);
    const baseSet = new Set(base);
    const onlyInPr = pr.filter((symbol) => !baseSet.has(symbol));
    const onlyInBase = base.filter((symbol) => !prSet.has(symbol));
    return { onlyInPr, onlyInBase };
  }
  /** Returns true if there is/are difference/s between the results. */
  public hasDifferences(): boolean {
    const { onlyInPr: comparedInPr, onlyInBase: comparedInBase } = this.compareNeqFun();
    const { onlyInPr: differingInPr, onlyInBase: differingInBase } = this.compareDiffering();
    return (
      differingInPr.length > 0 ||
      differingInBase.length > 0 ||
      comparedInPr.length > 0 ||
      comparedInBase.length > 0
    );
  }
  /** Returns report about differing functions. */
  public reportDiffering() {
    const { onlyInPr, onlyInBase } = this.compareDiffering();
    return `
${onlyInPr.length > 0 ? "#### New differing symbols" : ""}

${this._reportDiffering(onlyInPr)}

${onlyInBase.length > 0 ? "#### Eliminated differing symbols" : ""}

${this._reportDiffering(onlyInBase)}
`;
  }
  /**
   * Reports differing for base or pr.
   *
   * @returns Returns string in format `- differing [old.c:start:end, new.c:start:end] (in cmp1,
   *   cmp2, cmp3)`;
   */
  private _reportDiffering(differings: DifferingInfo[]) {
    const formatDefinition = (def?: { file?: string; line?: number; ["end-line"]?: number }) =>
      def ? `${def.file}:${def.line}:${def["end-line"]}` : "";
    return differings
      .map(({ differing, compared, definition }) => {
        const comparedList = Array.from(compared)
          .map((name) => `\`${name}\``)
          .join(", ");

        const oldDef = formatDefinition(definition?.old);
        const newDef = formatDefinition(definition?.new);
        return `- \`${differing}\` [${oldDef}, ${newDef}] (in ${comparedList})`;
      })
      .join("\n");
  }
}

/** Info about for which compared functions was the differing function differing. */
export interface DifferingInfo {
  /** Name of differing function. */
  differing: string;
  /** Name of compared functions. */
  compared: Set<string>;
  /** Definition for differing functions. */
  definition?: DKOutDefinition;
}

/** Format of `diffkemp-out.yaml` file, contains only used fields. */
export interface DiffKempOutputFormat {
  results: {
    // Compared function name
    function: string;
    diffs: {
      // Differing function name
      function: string;
    }[];
  }[];
  definitions?: DKOutDefinitions;
}

/** Format of definitions of functions from diffkemp-out.yaml. */
type DKOutDefinitions = Record<string, DKOutDefinition>;
/** Format of definition of old/new function from diffkemp-out.yaml. */
export interface DKOutDefinition {
  old?: {
    file?: string;
    line?: number;
    ["end-line"]?: number;
  };
  new?: {
    file?: string;
    line?: number;
    ["end-line"]?: number;
  };
}
