# Contributing to Dorisio SDK

We welcome contributions to the Dorisio SDK. Please follow these guidelines to ensure a smooth contribution process.

## How to File Issues

1. Check existing issues to avoid duplicates
2. Use descriptive titles that clearly summarize the problem or feature request
3. Provide as much context as possible:
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Environment details (OS, Node version, SDK version)
   - Code snippets or logs if relevant

## Branch Naming Conventions

We use a specific naming convention for branches to keep the repository organized:

- **feature/** - New features (e.g., eature/add-payment-retry)
- **bugfix/** - Bug fixes (e.g., ugfix/fix-wallet-validation)
- **docs/** - Documentation updates (e.g., docs/update-api-reference)

## Commit Message Format

We follow the Conventional Commits specification:

\\\
<type>(<scope>): <subject>

<body>

<footer>
\\\

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (whitespace, formatting)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process, dependencies, or tooling changes

### Examples

\\\
feat(wallet): add support for multi-signature transactions

Add ability to create and sign multi-signature transactions for enhanced security.

Closes #123
\\\

\\\
fix(payment): resolve race condition in payment confirmation

Previously, concurrent payment confirmations could cause duplicate entries.

Closes #456
\\\

## Which Repository to Contribute To

- **SDK Changes**: Contribute to the sdk repository for SDK functionality, utilities, and client libraries
- **Backend Changes**: Contribute to the ackend repository for server-side API, validation, and business logic
- **Documentation**: Submit documentation improvements to the appropriate repository

## Getting Started

1. Fork the repository
2. Create a new branch following our naming conventions
3. Make your changes
4. Ensure all tests pass: \
pm test\
5. Commit with descriptive, conventional commit messages
6. Push to your fork
7. Create a pull request with a clear description

## Pull Request Process

- Link related issues in your PR description
- Provide a clear summary of changes
- Include testing details
- Ensure your PR doesn't break existing tests
- Be responsive to review feedback

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read CODE_OF_CONDUCT.md for details.


## CLI scaffolding (`dorisio init`)

Scaffold Dorisio into an existing app (runs in the current working directory):

```bash
npx dorisio init
# or non-interactive:
npx dorisio init --framework react --auth jwt --database none --yes
```

Prompts (or flags):

- **Framework**: `react` / `next` / `vanilla`
- **Authentication**: `jwt` / `session` / `custom`
- **Database**: `none` / `postgres` / `sqlite`

Generated files:

- `src/config/dorisio.ts` — client factory + config
- `src/hooks/useCreator.ts` (React/Next) or `src/lib/creators.ts` (vanilla)
- `.env.example` and `.env.local`
- `DORISIO_SETUP.md` — short next-steps guide

The `create-dorisio-app` bin is an alias for the same CLI entrypoint.
