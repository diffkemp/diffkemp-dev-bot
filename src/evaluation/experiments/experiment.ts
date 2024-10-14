/**
 * File contains abstract class representing experiments and things connected with it.
 *
 * @author Lukas Petr
 */

export interface ExperimentRunner {
  run(): Promise<ExperimentResult>;
}

/** Represents a result of an experiment. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExperimentResult {}
