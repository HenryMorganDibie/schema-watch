# Privacy

Schema-Watch collects minimal product telemetry, only from Schema-Watch Cloud,
to understand whether the product is being used. This page states exactly what
that is.

## The local tool sends nothing unless you turn it on

The proxy, dashboard, CLI and MCP server run entirely on your machine. By
default they make **no network calls of their own**, and nothing about your
traffic, your code or your usage reaches us.

There are exactly three ways the local tool can reach the network, and all
three are things you switch on yourself:

1. **`sync`**, enabled in `schema-watch.config.json` with an API key.
2. **`schema-watch check`** run against the cloud gate with `--project` and
   `--api-key`, rather than the default local `--baseline`.
3. **Opt-in telemetry**, described below, off until you run
   `schema-watch telemetry enable`.

The MCP server has no network path at all, in any configuration. That is why
the operator dashboard reports MCP usage as *unavailable* rather than as a
number: there is no mechanism by which it could know.

## Opt-in CLI telemetry

npm reports downloads, but a download is not a developer: CI runners, mirrors,
Docker builds and registry caches all install packages. Telemetry exists to
answer whether a person is actually running this, and nothing more.

It is **off by default**. There is no pre-ticked box and no prompt that
defaults to yes. Enable it with `schema-watch telemetry enable`, see exactly
what it would send with `schema-watch telemetry status`, and turn it off again
with `schema-watch telemetry disable`.

When enabled, one request per command carries exactly:

| Field | Example | Why |
| --- | --- | --- |
| `installId` | a random UUID | Tells one machine from another. Not derived from hostname, MAC address or username. |
| `event` | `cli_check` | Which command ran. |
| `version` | `0.1.0` | Which release is in use. |
| `nodeMajor` | `22` | Whether the Node floor can move. |
| `platform` | `darwin` | Which platforms need testing. |
| `environment` | `local` or `ci` | So a pipeline is never counted as a person. |

Never sent: your target URL, endpoint paths, schemas, payloads, headers, file
paths, project names, directory names, or anything derived from captured
traffic. IP addresses are not recorded on these events.

**In CI, nothing is sent** unless you set `SCHEMA_WATCH_TELEMETRY=1` there
yourself. `DO_NOT_TRACK=1` disables it everywhere, as does
`SCHEMA_WATCH_TELEMETRY=0`.

Optionally, `schema-watch telemetry link --api-key <key>` associates an
installation with your Cloud account, so your laptop and your CI runner count
as one developer instead of two installations. Linking is never required:
telemetry works fully without a Cloud account, and no attempt is made to infer
that two anonymous machines belong to the same person.

The settings live in `~/.schema-watch/telemetry.json`, in your home directory
rather than the project, so the choice is yours and is never committed to a
repository or made on a teammate's behalf.

## Never collected

- **Source code.** Affected-file detection scans your files locally and sends
  only file *paths*, and only when you have enabled cloud sync.
- **API request or response payloads.** The agent infers a *shape* - types,
  optionality, nullability - and only that shape is ever transmitted. Values
  never leave your machine.
- **Secrets, API keys, passwords or tokens.**
- **IP addresses.** Not stored on analytics events.
- **User agents or device fingerprints.** No fingerprinting of any kind.
- **Full referrer URLs.** Only the host, so `linkedin.com` is recorded and the
  path, query string and any token in it are discarded.

## What is collected, and why

Most numbers on the operator dashboard are counted from records that already
exist because you used the product: users, projects, snapshots, contract
changes. No separate tracking is involved.

Events are recorded only for things those records cannot answer:

| Event | Why it cannot be derived |
| --- | --- |
| `page_view` | Anonymous browsing leaves no record |
| `try_cloud_clicked` | Arriving from an external link leaves no record |
| `signup_started` | Opening the form is not an account |
| `email_verification_started` | Opening the link is not a verification |
| `email_verification_completed` | The user row has a flag, not a timestamp |
| `login` | Sessions are stateless; no login row exists |
| `agent_connected` | First cloud sync for a project |
| `ci_check_run` | A CI check leaves no row of its own |

Each row holds: event name, timestamp, an anonymous visitor id, a session id,
the route, the referrer host, and - when the person is signed in - their user
id and the project involved.

## Anonymous visitor identifiers

A random identifier generated in your browser and kept in `localStorage`, used
only to tell one visitor from another and to group a visit into a session. It
is not derived from anything about you or your device, and clearing site data
makes you a genuinely new visitor.

The operator dashboard never displays raw visitor identifiers; anonymous
activity is shown as "Anonymous visitor".

## Who can see it

Analytics are private to Schema-Watch operators. The endpoints require an
authenticated platform administrator and return 404 to everyone else, enforced
on the server rather than by hiding the page. Nothing is exposed through the
public API.

## GitHub repository traffic

The operator dashboard can also show GitHub's own traffic numbers for the
public repository: views, clones and referring sites. That data is produced by
GitHub, about the repository, and it is read with a `GITHUB_TRAFFIC_TOKEN`.

It says nothing about any user of this service. It cannot be joined to a
visitor, an account or a session, and it is not merged into the first-party
metrics. It is shown in its own panel, labelled as GitHub's, for that reason.
Clone counts in particular are counts of machines, not of people: CI runners,
mirrors and crawlers all clone.

Without `GITHUB_TRAFFIC_TOKEN`, the panel reports itself unavailable.

## Self-hosting

If you self-host, the analytics tables are yours and nothing is reported to
anyone else. Setting no `PLATFORM_ADMIN_EMAILS` leaves the dashboard closed to
everybody.
