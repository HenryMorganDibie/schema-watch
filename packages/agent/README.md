# schema-watch

Catch breaking API changes before your frontend breaks.

Schema-Watch watches the traffic your app already makes, learns the *shape* of
every response, and tells you when that shape changes. Not the values. The
shape: a field that disappeared, a `string` that became a `number`, a value
that started coming back `null`.

```bash
npx schema-watch init --target http://localhost:3001
npx schema-watch start
```

Point your frontend at the proxy, use your app, and open the dashboard. Every
endpoint you touch is now under contract.

**No account, no signup, nothing leaves your machine.** The proxy, the
database and the dashboard all run locally, and the CLI makes no network calls
unless you turn one on. Requires **Node 22.5 or newer** (it stores
captures with the built-in `node:sqlite`).

## The CI gate

The part that actually saves you. Run your integration tests through the proxy,
export what came back, and fail the build if the contract broke:

```bash
npx schema-watch export --out contract.json
npx schema-watch check --contract contract.json --baseline .schema-watch/baseline.json
```

`check` exits `1` on a breaking change and prints what broke. Add
`--frontend-src src` and it also names the files that read the changed field, so
the failure points at the code you have to fix rather than at a diff.

Add `--sarif results.sarif` to surface the same findings as GitHub code scanning
annotations, inline on the pull request.

There is a ready-made workflow in
[examples/github-action](https://github.com/HenryMorganDibie/schema-watch/tree/main/examples/github-action).

## Context for AI coding agents

```bash
npx schema-watch context --claude-md
```

Writes what your API actually returns, the breaking changes it has seen, and
which frontend files depend on them, into `CLAUDE.md`. Your agent stops guessing
at response shapes.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Write `schema-watch.config.json` in the current directory |
| `start` | Start the proxy and the dashboard |
| `export` | Write the captured contract to JSON |
| `check` | Compare against a baseline and exit `1` on a breaking change |
| `context` | Write an AI context brief |

Run `npx schema-watch --help` for the full flags.

## Local by default

The proxy, the database and the dashboard all run on your machine. Nothing is
uploaded and no account is needed. `check --baseline` is a local file
comparison.

Anonymous usage telemetry is **off by default**. `schema-watch telemetry status`
shows exactly what it would send, and `enable` turns it on if you want to tell
me the tool is being used by a person rather than a CI runner. The hosted service at
[schema-watch](https://github.com/HenryMorganDibie/schema-watch) is optional and
exists for teams that want a shared baseline across branches.

Apache-2.0.
