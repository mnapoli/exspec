# exspec

**Executable specs** — run Gherkin feature files with an AI agent in the browser.

exspec parses `.feature` files, launches a Claude agent restricted to browser-only interaction (Playwright, headless), and produces a test report. Feature files can be written in any language supported by Gherkin (English, French, German, Spanish, [70+ languages](https://cucumber.io/docs/gherkin/languages/)).

## Install

```bash
npm install -D @mnapoli/exspec
```

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Usage

```bash
# Run all feature files in features/
npx exspec

# Run a specific file
npx exspec features/Auth/Login.feature

# Run all features in a directory
npx exspec features/Auth/

# Filter by scenario name
npx exspec features/Auth/Login.feature --filter "invalid password"

# Stop at first failure
npx exspec --fail-fast

# Run with visible browser (for debugging)
npx exspec --headed
```

## Configuration

### `exspec.md`

Create an `features/exspec.md` file. Its content is passed to the AI agent as context.

```markdown
# QA Configuration

URL: http://localhost:3000

## Application

This is an e-commerce app. The user is a store manager.
For detailed feature documentation, see the `docs/` directory.

## Authentication

Use the `test@example.com` / `password` credentials for authentication.

## Browser

Resolution: 1920x1080
```

The agent reads this file as context, so you can reference any project documentation here, or give it extra instructions.

### Environment variables

If your project has a `.env` file, exspec loads it automatically. You can then reference environment variables in `exspec.md` using `$VAR` or `${VAR}` syntax, they are resolved before the config is passed to the agent.

```markdown
URL: $APP_URL
```

This is useful for dynamic URLs across environments (e.g. with git worktrees). If a variable is not defined, the reference is left as-is.

## How it works

1. Loads `.env` (if present) and `exspec.md` (with variable expansion)
2. Discovers and parses `.feature` files (supports all Gherkin languages)
3. Groups scenarios by domain (subdirectory of `features/`)
4. For each domain, invokes Claude CLI with:
   - Only Playwright tools available (browser-only, no database or code access)
   - Playwright in headless mode (or headed with `--headed`)
   - Feature content + context docs + config as prompt
5. Parses results (PASS/FAIL/SKIP) and writes them to `features/exspec/`

## Results

Results are written to `features/exspec/{YYYY-MM-DD-HHmm}.md` with failure screenshots in the corresponding directory.

The CLI exits with code `1` if any tests fail (CI-friendly).

## Agent restrictions

The AI agent can ONLY use Playwright browser tools. It cannot:

- Access the database
- Read or modify source code
- Execute shell commands

If a scenario cannot be verified through the browser, it is marked as FAIL.
