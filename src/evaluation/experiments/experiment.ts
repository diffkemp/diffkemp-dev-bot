/**
 * File contains abstract class representing experiments and things connected with it.
 *
 * @author Lukas Petr
 */

export interface ExperimentRunner {
  run(options?: ExperimentRunnerOptions): Promise<ExperimentResult>;
}
export interface ExperimentRunnerOptions {
  cmpOpts?: string[];
}

/** Represents a result of an experiment. */
export interface ExperimentResult {
  compare(base: ExperimentResult): ExperimentDifference;
}

/**
 * Abstract class representing difference between results of a experiment run on two version of
 * DiffKemp.
 */
export abstract class ExperimentDifference {
  /**
   * Styles value representing differences between programs using color.
   *
   * @param val Value to format.
   * @param correct True if the value is connected with number of correctly evaluated programs.
   * @returns Returns styled value.
   * @note
   *   Having less (val<0) false positives (!correct) is good thing -> green color.
   */
  protected style(val: number, correct: boolean) {
    if (val < 0 && correct) return `$$\\color{red}${val}$$`;
    else if (val > 0 && correct) return `$$\\color{green}+${val}$$`;
    else if (val > 0 && !correct) return `$$\\color{red}+${val}$$`;
    else if (val < 0 && !correct) return `$$\\color{green}${val}$$`;
    return "";
  }
}
