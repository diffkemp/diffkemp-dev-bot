# Experiments

Folder containing definition of experiments.

- `eqbench.ts`: Experiment running DiffKemp on [EqBench dataset](https://github.com/shrBadihi/EqBench).

## Classes

- _Experiment_`Runner`: Class for running a specific experiment.
- _Experiment_`Result`: Class containing results for an experiment.
- _Experiment_`Difference`: Class containing differences between results of an experiment using default (`master`) DiffKemp and PR-version of DiffKemp.
- _Experiment_`Results`: Class containing results for the same experiment, contains results for multiple versions of the experiment (used different options or versions).
- _Experiment_`Differences`: Class containing differences for multiple versions of an experiment.
- `EvaluationResults`: Class containing results for multiple experiments done on one version (PR or base) of DiffKemp.
- `EvaluationDifferences`: Class taking base results and pr results for multiple experiments, comparing the results and recording differences between the two DiffKemp versions and reporting them.
