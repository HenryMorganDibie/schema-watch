# Privacy

Schema-Watch collects minimal product telemetry, only from Schema-Watch Cloud,
to understand whether the product is being used. This page states exactly what
that is.

## The local tool sends nothing

The proxy, dashboard, CLI, and MCP server run entirely on your machine and make
**no network calls of their own**. Nothing about your traffic, your code, or
your usage of the local tool reaches us. That is why the operator dashboard
reports MCP usage as *unavailable* rather than as a number: there is no
mechanism by which it could know.

The agent reaches the network only if you explicitly enable `sync` with an API
key, or run `schema-watch check` against the cloud gate.

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
