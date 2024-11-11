/**
 * Contains logic for creating labels on PRs.
 *
 * @author Lukas Petr
 */
import { Context } from "probot";
import {} from "../evaluation/experiments/eqbench.js";
import { ExperimentTitle } from "../evaluation/experiments/titles.js";

export enum LabelType {
  NEUTRAL = "Neutral",
  SUCCESS = "Success",
  FAILURE = "Failure",
  WARNING = "Warning",
}
/** Background color for GitHub labels based on the label type. */
const LabelColors: Record<LabelType, string> = {
  [LabelType.NEUTRAL]: "cfd3d7",
  [LabelType.SUCCESS]: "28a745",
  [LabelType.FAILURE]: "dc3545",
  [LabelType.WARNING]: "ffc107",
};
/** Class representing GitHub Label. */
export class Label {
  constructor(
    private readonly groupName: string,
    private readonly shortDescription: string,
    private readonly longDescription: string,
    private readonly type: LabelType,
  ) {}
  getLabelName(): string {
    return `${this.type}: ${this.groupName} ${this.shortDescription}`;
  }
  /** Background color for the label based on its type. */
  getColor(): string {
    return LabelColors[this.type];
  }
  getDescription() {
    return this.longDescription;
  }
  getType() {
    return this.type;
  }
  getGroupName() {
    return this.groupName;
  }
}

/** Interface for labels, different experiments provides different kinds of labels. */
export interface LabelGroup {
  STABLE: Label;
  MORE_FN_OR_FP?: Label;
  MORE_TN_OR_TP?: Label;
  MORE_NEQ_UNK_OR_ERR?: Label;
  MORE_EQ_OR_DIFF?: Label;
}

//
// Helper functions for creating labels for individual experiments.
//

function createEqBenchLabel(shortDescription: string, longDescription: string, type: LabelType) {
  return new Label(ExperimentTitle.EQBENCH, shortDescription, longDescription, type);
}
function createRHELFunctionLabel(
  shortDescription: string,
  longDescription: string,
  type: LabelType,
) {
  return new Label(ExperimentTitle.RHEL_FUNCTIONS, shortDescription, longDescription, type);
}
function createRHELSysctlLabel(shortDescription: string, longDescription: string, type: LabelType) {
  return new Label(ExperimentTitle.RHEL_SYSCTL, shortDescription, longDescription, type);
}

//
// Definition of labels
//

/** Group of labels for each kind of experiment. */
export const LabelGroups: Record<ExperimentTitle, LabelGroup> = {
  [ExperimentTitle.EQBENCH]: {
    STABLE: createEqBenchLabel(
      "stable",
      "EqBench experiment: same results were gained as on the master branch.",
      LabelType.SUCCESS,
    ),
    MORE_FN_OR_FP: createEqBenchLabel(
      "more FN/FP",
      "EqBench experiment: more false negatives/positives were found than on the master branch.",
      LabelType.FAILURE,
    ),
    MORE_TN_OR_TP: createEqBenchLabel(
      "more TN/TP",
      "EqBench experiment: more true negatives/positives were found than on the master branch.",
      LabelType.SUCCESS,
    ),
  },
  [ExperimentTitle.RHEL_FUNCTIONS]: {
    STABLE: createRHELFunctionLabel(
      "stable",
      "RHEL KABI functions: same results were gained as on the master branch.",
      LabelType.SUCCESS,
    ),
    MORE_NEQ_UNK_OR_ERR: createRHELFunctionLabel(
      "more NEQ/UNK/ERR",
      "RHEL KABI functions: more non-equal/unknown/error functions were gained than on the master branch.",
      LabelType.FAILURE,
    ),
    MORE_EQ_OR_DIFF: createRHELFunctionLabel(
      "more EQ/DIFF",
      "RHEL KABI functions: more equal/differing functions were gained than on the master branch.",
      LabelType.WARNING,
    ),
  },
  [ExperimentTitle.RHEL_SYSCTL]: {
    STABLE: createRHELSysctlLabel(
      "stable",
      "RHEL KABI sysctl: same results were gained as on the master branch.",
      LabelType.SUCCESS,
    ),
    MORE_NEQ_UNK_OR_ERR: createRHELSysctlLabel(
      "more NEQ/UNK/ERR",
      "RHEL KABI sysctl: more non-equal/unknown/error functions were gained than on the master branch.",
      LabelType.FAILURE,
    ),
    MORE_EQ_OR_DIFF: createRHELSysctlLabel(
      "more EQ/DIFF",
      "RHEL KABI sysctl more equal/differing functions were gained than on the master branch.",
      LabelType.WARNING,
    ),
  },
} as const;

/** Add labels to issue/PR. */
export async function createLabelsOnIssue(context: Context<"issues">, labels: Label[]) {
  for (const label of labels) {
    if (!(await labelExistsOnRepo(context, label.getLabelName()))) {
      await createLabelOnRepo(context, label);
    }
  }
  await context.octokit.issues.addLabels(
    context.issue({ labels: labels.map((l) => l.getLabelName()) }),
  );
}

/** Checks if the label exists on a repository. */
async function labelExistsOnRepo(context: Context<"repository">, label: string) {
  try {
    await context.octokit.issues.getLabel(context.repo({ name: label }));
    return true;
  } catch {
    return false;
  }
}

/** Crates label on a repository. */
export async function createLabelOnRepo(context: Context<"issues">, label: Label) {
  await context.octokit.issues.createLabel(
    context.repo({
      name: label.getLabelName(),
      color: label.getColor(),
      description: label.getDescription(),
    }),
  );
}

/** Removes labels from issue specified by LabelGroup. */
export async function removeLabelsOnIssue(context: Context<"issues">, labelGroup: LabelGroup) {
  const labels = (Object.values(labelGroup) as Label[]).flat();
  // Labels which are located in the group and which are on the issue.
  const labelsToRemove = new Array<string>();
  // Getting labels which are on the issue.
  const response = await context.octokit.issues.listLabelsOnIssue(context.issue());
  response.data.forEach((issueLabel) => {
    if (labels.some((label) => label.getLabelName() === issueLabel.name)) {
      labelsToRemove.push(issueLabel.name);
    }
  });
  // Removing labels.
  for (const label of labelsToRemove) {
    await context.octokit.issues.removeLabel(context.issue({ name: label }));
  }
}
