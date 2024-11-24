/** Testing of evaluation. */
import nock from "nock";
import { Probot, ProbotOctokit } from "probot";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EvaluationManager } from "../../src/evaluation/evaluation_manager.js";
import { Evaluation } from "../../src/evaluation/evaluation.js";
import { EvaluationResults } from "../../src/evaluation/evaluation_results.js";
import { EvaluationConfig } from "../../src/evaluation/config.js";
import { pino } from "pino";

/** Creates payload for comment created event with given comment. */
const createIssueCommentPayload = (comment: string) => ({
  event: "issue_comment",
  payload: {
    action: "created",
    issue: {
      title: "Test PR bot",
      user: {
        login: "User1234",
        type: "User",
        user_view_type: "public",
        site_admin: false,
      },
      pull_request: {},
    },
    comment: {
      author_association: "OWNER",
      user: {
        login: "User1234",
        type: "User",
        user_view_type: "public",
        site_admin: false,
      },
      body: comment,
      events: ["issue_comment", "push"],
    },
    repository: {
      owner: {
        login: "diffkemp",
      },
      name: "diffkemp",
      full_name: "diffkemp/diffkemp",
      private: false,
      default_branch: "master",
    },
    sender: {
      login: "User1234",
      type: "User",
      user_view_type: "public",
      site_admin: false,
    },
    installation: {
      id: 55627600,
      node_id: "MDIzOkludGVncmF0aW9uSW5zdGFsbGF0aW9uNTU2Mjc2MDA=",
    },
  },
});

const createPushPayload = (timestamp: string) => ({
  event: "push",
  payload: {
    ref: "refs/heads/master",
    before: "b0f2bcc72347462b5d83780ba6193e0e538f3e72",
    after: "78df8672d6ecd9f363dbfedc480e059162aacf32",
    repository: {
      name: "diffkemp",
      full_name: "diffkemp/diffkemp",
      default_branch: "master",
      master_branch: "master",
      isPrivate: false,
      fork: false,
    },
    sender: {
      login: "User1234",
      type: "User",
      user_view_type: "public",
      site_admin: false,
    },
    installation: { id: 55627600, node_id: "MDIzOkludGVncmF0aW9uSW5zdGFsbGF0aW9uNTU2Mjc2MDA=" },
    commits: [
      {
        message: "Commit message",
        timestamp,
        added: [],
        removed: [],
        modified: [],
      },
    ],
    head_commit: {
      message: "Commit message",
      timestamp,
      added: [],
      removed: [],
      modified: [],
    },
  },
});

describe("Evaluation initiation", async () => {
  nock.disableNetConnect();
  const evaluatePrMock = vi
    .spyOn(EvaluationManager.prototype, "evaluatePr")
    .mockImplementation(async () => Promise.resolve());
  const probot = new Probot({
    githubToken: "test",
    Octokit: ProbotOctokit.defaults((instanceOptions: unknown) => {
      return {
        ...instanceOptions!,
        retry: { enabled: false },
        throttle: { enabled: false },
      };
    }),
  });
  const { default: app } = await import("../../src/index.js");
  app(probot);

  test("evaluation should not be run for user with read permission", async () => {
    const permissionResponse = {
      permission: "read",
      user: {
        login: "UserReader",
        type: "User",
        user_view_type: "public",
        site_admin: false,
        permissions: {
          admin: false,
          maintain: false,
          push: false,
          triage: false,
          pull: true,
        },
        role_name: "read",
      },
      role_name: "read",
    };
    nock("https://api.github.com/")
      .get("/repos/diffkemp/diffkemp/collaborators/User1234/permission")
      .reply(200, permissionResponse);
    await probot.receive({
      name: "issue_comment",
      payload: createIssueCommentPayload("\\evaluate").payload,
    } as never);
    await expect.poll(() => evaluatePrMock).not.toBeCalled();
  });

  test("evaluation should be run for user with write permission", async () => {
    const permissionResponse = {
      permission: "write",
      user: {
        login: "UserWriter",
        permissions: {
          admin: false,
          maintain: false,
          push: true,
          triage: true,
          pull: true,
        },
        role_name: "write",
      },
      role_name: "write",
    };
    nock("https://api.github.com/")
      .get("/repos/diffkemp/diffkemp/collaborators/User1234/permission")
      .reply(200, permissionResponse);
    await probot.receive({
      name: "issue_comment",
      payload: createIssueCommentPayload("\\evaluate").payload,
    } as never);
    await expect.poll(() => evaluatePrMock).toBeCalled();
  });

  test("evaluation should be run for user with admin permission", async () => {
    const permissionResponse = {
      permission: "admin",
      user: {
        login: "UserAdmin",
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
        role_name: "admin",
      },
      role_name: "admin",
    };
    nock("https://api.github.com/")
      .get("/repos/diffkemp/diffkemp/collaborators/User1234/permission")
      .reply(200, permissionResponse);
    await probot.receive({
      name: "issue_comment",
      payload: createIssueCommentPayload("\\evaluate").payload,
    } as never);
    await expect.poll(() => evaluatePrMock).toBeCalled();
  });

  test("evaluation should be run if it does not contain word evaluation", async () => {
    const permissionResponse = {
      permission: "admin",
      user: {
        login: "UserAdmin",
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
        role_name: "admin",
      },
      role_name: "admin",
    };
    nock("https://api.github.com/")
      .get("/repos/diffkemp/diffkemp/collaborators/User1234/permission")
      .reply(200, permissionResponse);
    await probot.receive({
      name: "issue_comment",
      payload: createIssueCommentPayload("test").payload,
    } as never);
    await expect.poll(() => evaluatePrMock).not.toBeCalled();
  });

  test("on push evaluation should be run", async () => {
    vi.spyOn(EvaluationConfig, "fromPushToMaster").mockImplementation(() =>
      Promise.resolve(
        new EvaluationConfig({
          baseBranch: "master",
          baseRepo: "diffkemp/diffkemp",
          baseSHA: "",
          logger: pino(),
        }),
      ),
    );
    const evaluationMock = vi
      .spyOn(Evaluation.prototype, "runOnlyBase")
      .mockImplementation(async () => Promise.resolve(new EvaluationResults([])));

    await probot.receive({
      name: "push",
      payload: createPushPayload("2024-11-24T09:58:53+01:00").payload,
    } as never);

    await expect.poll(() => evaluationMock).toBeCalled();
  });

  afterEach(() => {
    evaluatePrMock.mockClear();
    nock.cleanAll();
    nock.enableNetConnect();
  });
});
