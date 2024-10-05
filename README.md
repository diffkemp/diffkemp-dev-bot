# DiffKemp Dev Bot

GitHub Bot used in the DiffKemp development process.

## Requirements

- Node.js v22

## Setup to run the bot

```sh
# Install dependencies
npm install
# Translate TypeScript to JavaScript
npm run build
# Run the bot
npm start
```

## Usage

1. Install the bot application to a repository.
2. Create comment on a PR in the repository containing `\evaluate` on a single line.

## Development

- Bot created using [Probot](https://probot.github.io/docs/) framework.
- Written in [TypeScript](https://www.typescriptlang.org/).
- Uses [typescript-eslint](https://typescript-eslint.io/) as linter.
- Uses [Prettier](https://prettier.io/) as formatter.

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
