# Contributing to claude-widget

Thank you for taking the time to contribute! This document covers everything you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Submitting Changes](#submitting-changes)
- [Commit Convention](#commit-convention)
- [Code Style](#code-style)
- [Good First Issues](#good-first-issues)

---

## Code of Conduct

Be respectful, constructive, and welcoming. Harassment of any kind will not be tolerated.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (comes with Node.js)

### Fork & Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/your-username/claude-widget.git
cd claude-widget
npm install
```

### Run in Development Mode

```bash
npm run dev
```

The widget will appear in the bottom-right corner of your screen and hot-reload on file changes.

---

## Development Workflow

1. **Create a branch** off `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — keep files under 200 lines, split logic into focused modules when needed

3. **Verify your work**:
   ```bash
   npm run typecheck   # TypeScript checks
   npm run lint        # ESLint
   npm test            # Vitest unit tests
   ```

4. **Build** to catch any packaging issues:
   ```bash
   npm run build:mac   # or build:win / build:linux
   ```

---

## Submitting Changes

1. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```

2. Open a **Pull Request** against `main` on this repo

3. In the PR description, include:
   - What changed and why
   - Steps to test the change manually
   - Screenshots if the UI is affected

PRs are reviewed as time allows. Please keep them focused — one feature or fix per PR.

---

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short summary>
```

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Dependency updates, tooling, config |
| `refactor` | Code restructure with no behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |

**Examples:**
```
feat: add keyboard shortcut to toggle widget visibility
fix: correct cache-read token cost calculation
chore: update claude-sonnet-4-6 pricing
docs: add screenshot to README
```

No AI references in commit messages. Keep the summary under 72 characters.

---

## Code Style

- **TypeScript** everywhere — no `any` unless unavoidable
- **Functional React** components with hooks
- **Kebab-case** file names (`usage-parser.ts`, `file-watcher.ts`)
- **No comments** unless the *why* is non-obvious
- Keep individual files under **200 lines**; split by concern when they grow
- Run `npm run format` before committing (Prettier)

---

## Good First Issues

Looking for somewhere to start? These are well-scoped contributions:

- Add a new Claude model's pricing to `src/shared/types.ts`
- Add a keyboard shortcut to show/hide the widget
- Support a config file for custom pricing overrides
- Improve token count formatting (e.g. `1.2B` for billions)
- Add a right-click context menu with "Quit" option
- Write additional unit tests for `usage-parser.ts`

---

## Questions?

Open a [GitHub Discussion](https://github.com/your-username/claude-widget/discussions) or file an issue — happy to help.
