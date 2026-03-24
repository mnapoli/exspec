# exspec

AI-powered executable specs. Runs Gherkin feature files in a real browser using a Claude agent with Playwright — no step definitions, no glue code.

## Architecture

- `src/cli.ts` — CLI entry point, orchestrates discovery → setup → execution → reporting
- `src/runner.ts` — spawns a Claude agent (`claude -p`) with Playwright MCP tools, streams JSON output
- `src/gherkin.ts` — parses `.feature` files, groups scenarios by domain (subdirectory)
- `src/prompt.ts` — builds the prompt from `prompt-template.md` + user config + features
- `src/reporter.ts` — writes markdown result files to `features/exspec/`
- `src/config.ts` — parses `features/exspec.md` (YAML frontmatter + markdown)
- `src/setup.ts` — runs setup commands from frontmatter before tests

## Development

```bash
npm run build        # tsc + shebang
npm run dev          # tsx (no build needed)
npm test             # vitest
npm run lint         # eslint
npm run format       # prettier
```

## Fixtures

Test the CLI on example features written in `fixtures/features/`. They target https://example.com (no auth, no setup).

```bash
npm run fixtures     # build + run exspec on fixtures/
```

This runs the local build against simple scenarios to verify CLI output and end-to-end behavior. These features intentionally contain failing scenarios to test reporting of failures.

## Releasing

The version in `package.json` is managed by CI — never set it manually.

1. Push to `main`
2. Create a GitHub release (the tag becomes the version)
3. A GitHub Actions workflow updates `package.json` with the tag version and publishes to NPM
