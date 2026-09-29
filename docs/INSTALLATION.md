# Installation and upgrades

Emifoot has two runtime parts: static browser files and a single Node.js room
server. Solo play needs only static files. Multiplayer needs one room process
behind a WebSocket-capable reverse proxy. There is no database or runtime package
installation. Releases support Linux and macOS with Node.js 22.12+ or 24 and tar.

## Install a release

Clone the repository to obtain the installer. Install the GitHub CLI (`gh`) and
authenticate if the repository is private. From the checkout:

```bash
node scripts/install-release.mjs --prefix "$HOME/emifoot"
NODE_ENV=production node "$HOME/emifoot/current/server/index.js"
```

The installer downloads the latest stable release, verifies its SHA-256 checksum,
rejects archive links and unsafe paths, and installs into `releases/`. It atomically
points `current` at the installed version. `previous` preserves the prior version.
Use `--version v1.0.0` to select a tag, or `--repo owner/repository` for a fork.
Use `--archive /path/to/emifoot-1.0.0.tar.gz` for an offline install; the matching
`.tar.gz.sha256` file must be adjacent. Both files must come from a trusted release.

Releases use `/` as the browser base path. For a subdirectory or absolute social
metadata, build from the release tag as described below.

## Linux service and web server

Install Node.js at `/usr/bin/node`, GitHub CLI, and Caddy using their official
installation instructions. The checked-in examples use `/srv/emifoot`:

```bash
sudo useradd --system --home-dir /srv/emifoot --shell /usr/sbin/nologin emifoot
sudo install -d -m 755 -o "$USER" /srv/emifoot
node scripts/install-release.mjs --prefix /srv/emifoot
sudo install -m 644 deploy/emifoot.service /etc/systemd/system/emifoot.service
sudo systemctl daemon-reload
sudo systemctl enable --now emifoot
curl --fail http://127.0.0.1:8789/health
```

The service runs as an unprivileged user with read-only filesystem access.
Release directories must remain readable by that user and the web server.
Integrate [the Caddy example](../deploy/Caddyfile) into your own configuration;
it serves on port 8080 for local testing. For a public instance, replace `:8080`
with your DNS hostname so Caddy can obtain a TLS certificate. Validate the final
configuration with `caddy validate` before reloading Caddy. Keep the room port
bound to loopback. The proxy must overwrite `X-Real-IP`, never trust an incoming
client-supplied value. CDN deployments also need trusted-proxy configuration.

## Update and rollback

Updates are explicit because restarting the process discards multiplayer rooms.
Check `/health` and schedule the update when `rooms` is zero. Solo saves remain
in the browser and are migrated when loaded.

```bash
curl --fail http://127.0.0.1:8789/health
sudo systemctl stop emifoot
node scripts/install-release.mjs --prefix /srv/emifoot
sudo systemctl start emifoot
curl --fail http://127.0.0.1:8789/health
```

Check the returned version and open the game, including a multiplayer room.
To restore the previous application files:

```bash
sudo systemctl stop emifoot
node scripts/install-release.mjs --prefix /srv/emifoot --rollback
sudo systemctl start emifoot
```

Rollback restores application files, not multiplayer rooms or browser saves.
Review save-schema changes before downgrading across releases. Old release
directories are retained; remove only versions no longer referenced by `current`
or `previous`. An interrupted installer can leave `.install-lock`; remove that
directory only after confirming no installer is running.

For automated deployment, `--prepare` verifies and stages an archive without
activation and prints its release ID. Smoke-test that directory, then pass
`--activate RELEASE_ID`. Activation exchanges symlinks without deleting releases.
Service restart and health checks remain the deployment controller's responsibility.

## Build an installation-specific release

Use Node.js 24 and pnpm 10.12.1. Check out the desired release tag, then:

```bash
pnpm install --frozen-lockfile
pnpm verify
EMIFOOT_PUBLIC_URL=https://games.example.org/football/ pnpm build
pnpm build:server
pnpm release:package
```

Replace the example URL with your own. `EMIFOOT_BASE_PATH=/football/` sets the
path without canonical metadata, or overrides the path in `EMIFOOT_PUBLIC_URL`.
Set the same `EMIFOOT_BASE_PATH` in the server service. Proxy `/football/ws`,
serve the release's `web/` at `/football/`, and redirect `/football` to its
trailing-slash form. The invite page and image URLs follow the configured path.

The archive and checksum appear in `.artifacts/`. It contains `release.json`
and `web/build.json` with version, source revision, and installation path.
Never put secrets in `VITE_*` variables; they are embedded in browser JavaScript.

## Publishing a release

Update `package.json`, document changes in `CHANGELOG.md`, run verification and
browser tests, and push a matching `vX.Y.Z` tag. The release workflow repeats the
checks, packages both runtimes, and attaches the archive/checksum to a GitHub
release. The repository's visibility controls the visibility of those assets.
