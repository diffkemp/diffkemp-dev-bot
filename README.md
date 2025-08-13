# DiffKemp Dev Bot

GitHub Bot used in the DiffKemp development process.

Bot allows to evaluate impact of DiffKemp PRs, by comparing semantic comparison
results gained for selected experiments by using master version of DiffKemp
and PR version of DiffKemp.

## Requirements

- Node.js v22
- Podman

## Usage

Create comment on a PR in the repository containing `\evaluate` on a single
line (you need to have `write`/`admin` permissions to the repository).

It is possible to specify options to the `\evaluate` command:

### Options

- `--run <experiments...>`: Selection of experiments to be run (`eqbench`,
  `rhel-sysctl`, `rhel-functions`), by default all experiments are run.
- `--pr-cmp-opt <options...>`:  Allows adding options for `diffkemp compare`
  command which will be used when comparing experiments using a PR version
  of DiffKemp.
- `--cmp-opt <options...>`: Allows adding options for `diffkemp compare`
  command which will be used when comparing experiments using both a PR and
  master version of DiffKemp.
- `--rebuild`: Does not use cached snapshots from master branch instead of it,
  it builds them.

## About (behavior)

- The bot automatically compares experiments when a new push to a DiffKemp
  master occurs, caching the results of comparison and builded snapshots.
  For the comparison the master version of DiffKemp is used.
- Reviewer can [trigger evaluation](#usage) of a PR. Bot by default uses
  snapshots created on a master branch and compares them using PR version of
  DiffKemp. After the comparison is done bot posts comments on the PR informing
  about differences in experiments' results gained by master version of
  DiffKemp and PR version of DiffKemp.

## Development

0. Create a repository fork and clone the project.
1. Install the [requirements](#requirements).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create container image used for running experiments (this will take a while):

   ```bash
   ./create_image.sh
   ```

4. Build the bot (translate TypeScript to Javascript):

   ```bash
   npm run build
   ```

5. Run the bot:

   ```bash
   npm start
   ```

   go to <http://localhost:3000> and follow the instructions (*Register GitHub
   App*) for creating GitHub App and installing the Bot for your development
   purposes:
     - Register the App (the app is specified by app manifest in `app.yml`).
6. Restart the server in your terminal (press ctrl + c to stop the server, run
   `npm start`).

7. Install the [created application](https://github.com/settings/apps) to your
   fork of [DiffKemp](https://github.com/diffkemp/diffkemp) repository, where
   you will test the bot. Keep the bot running for some time -- it will run
   experiments on the master branch of your DiffKemp fork and cache the
   snapshots and results.

8. Try triggering the bot by creating a PR on your DiffKemp fork and running
   `\evaluate` command (see [usage](#usage)).

9. Develop new features:

   - Add new feature.
   - [Check and fix code style](#code-style-checking).
   - Add tests and [run them](#tests).
   - Test the feature manually on your fork of DiffKemp repository.
   - Test the feature [on the previous PRs](#running-past-prs-evaluation),
     review the results.
   - Update bot documentation.
   - Create pull request on the main bot repository.

### Code style checking

Linter:

```sh
npm run lint
```

Prettier (format checking):

```sh
# Checks format
npm run format:check
# Auto-corrects format
npm run format
```

### Automatic tests

Bot contains few tests that checks basic logic, they can be run following
command:

```bash
npm run test
```

### Running past PRs evaluation

By running:

```bash
npm run past-prs
```

selected previous PRs from DiffKemp main repository will be analyzed.
The results will be saved to `past-prs-logs-<DATE-AND-TIME>` directory.
The directory contains markdown file for each PR named by the PR number.
The files contain:

- master commit SHA,
- PR commit SHA,
- **verdict** - if the PR provides same or different results than the master,
- Detailed information which would be comment on the PR if the bot would be run
  on it.

The script caches lots of information (snapshots, results, results directories)
to simplify additional analysis. For this reason it can be useful to use
`--cache-dir` for specifying different caching directory than is used by default
which could be after running manually removed.

The PRs that should be evaluated are specified by a YAML file passed to
`--config-file` option. The YAML format is following:

```yaml
---
# PR numbers to compare
- 315
- 319
# Optionally specification of PR number/id to evaluate in object format
- id: 322
  # Additional options that will be used by `diffkemp compare` command when
  # comparing projects using PR version of DiffKemp.
  prCmpOpt:
    - "--enable-pattern=sequential-alu-ops"
```

### Logger

For logging is used [pino Logger](https://github.com/pinojs/pino), the used
logging level can be using `LOG_LEVEL` variable in `.env` file (`trace`, `info`,
`error`, `debug`, ...).

### Links

- Bot created using [Probot](https://probot.github.io/docs/) framework.
- Written in [TypeScript](https://www.typescriptlang.org/).
- Uses [typescript-eslint](https://typescript-eslint.io/) as linter.
- Uses [Prettier](https://prettier.io/) as formatter.
- [Octokit REST API](https://octokit.github.io/rest.js/v22/) for creating API
  requests.
- [GitHub webhooks docs](https://docs.github.com/en/webhooks/about-webhooks)
  for reacting on GitHub events.
- [GitHub REST API docs](https://docs.github.com/en/rest).
- [GitHub APP docs](https://docs.github.com/en/apps/overview).
- [pm2](https://www.npmjs.com/package/pm2) for running the bot in the
  production.
- [pino Logger](https://github.com/pinojs/pino).
