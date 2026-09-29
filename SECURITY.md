# Security policy

## Supported code

Security fixes target the latest stable release and the `main` branch. Install
the latest stable release before reporting a problem with an older version.

## Reporting a vulnerability

Use GitHub's **Security → Report a vulnerability** for a private report when
available. If private reporting is not available, request a private contact
channel from the repository owner without posting exploit details publicly.
Include the affected commit, reproducible steps, expected and actual behavior,
and the impact. Never include live reconnect tokens or other credentials.

Test against your own local instance and disposable rooms. Do not probe other
players' rooms or overload a public service.

## Security boundaries

The multiplayer server owns scores, club state, timers, seat permissions, and
gameplay commands. A room code is an invitation, not an authentication secret.
Reconnect tokens authorize existing seats and must stay out of URLs, logs, chat,
and public snapshots. Browser storage is trusted only for the user's local
career; it is not authoritative for multiplayer.

The service is designed for one process with disposable in-memory rooms, behind
a TLS reverse proxy. See [operations](docs/MULTIPLAYER.md) for network limits,
proxy trust, and process restart behavior. Client-side `VITE_*` configuration is
public and must never contain secrets.

Full game snapshots expose deterministic simulation state. A modified client
can predict AI bidding and match outcomes; the current protocol is designed
for casual play. See [multiplayer boundaries](docs/MULTIPLAYER.md#casual-multiplayer).
