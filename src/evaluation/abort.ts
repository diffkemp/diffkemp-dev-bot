/**
 * Error representing that the evaluation was aborted.
 *
 * @author Lukas Petr
 */
export class EvaluationAbort extends Error {
  constructor(message: string) {
    super(message);
  }
}
