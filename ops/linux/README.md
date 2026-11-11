# Linux host operations

## Install order

1. Clone the public repository to `/home/noroot/CODE/Ochestration`; create `/home/noroot/.config/ochestration/alert.env` with `SLACK_WEBHOOK_URL` and mode 600. Keep credentials in host-local files only.
2. Create the NAS sentinel on the mounted NAS and ensure `/home/noroot/logs/host` exists and is writable by `noroot`; install the user crontab from `crontab.noroot`. The `docker_watchdog.sh` cron entry is commented out and must be installed only after cutover.
3. Set `DOCKER_GID` to the host Docker group numeric GID, for example `getent group docker | cut -d: -f3`, when bringing up the logging compose project.
4. Install `nas-health.service` and `.timer` under `/etc/systemd/system`, reload systemd, enable the timer. Install `linkcollect-tunnel.service` only after placing `LINKCOLLECT_USER_HOST`, `LINKCOLLECT_KEY`, and optional `LINKCOLLECT_BIND` in its EnvironmentFile.
5. Run Vector config validation and then start the logging compose project. Schedule and exercise the NAS scripts after the mount guard passes.

### Commands requiring sudo

```sh
sudo install -m 0644 ops/linux/systemd/nas-health.service /etc/systemd/system/nas-health.service
sudo install -m 0644 ops/linux/systemd/nas-health.timer /etc/systemd/system/nas-health.timer
sudo install -m 0644 ops/linux/systemd/linkcollect-tunnel.service /etc/systemd/system/linkcollect-tunnel.service
sudo systemctl daemon-reload
sudo systemctl enable --now nas-health.timer
sudo systemctl enable --now linkcollect-tunnel.service
```

Run the LinkCollect enable command only after the local EnvironmentFile and key are installed with restrictive permissions.

## Test each component

- `bash -n scripts/migrate/*.sh scripts/linux/*.sh`; run `tests/migrate/run_all.sh` on a development machine with PATH stubs.
- `scripts/migrate/verify_tree.sh SRC DEST` reports any content or metadata-independent checksum differences.
- Run `volume_snapshot.sh` only against stopped-container volumes; use `volume_restore.sh` only in a rehearsal environment with intentionally empty volumes.
- Run `nas_health.sh` with temporary `NAS_MOUNT`, `NAS_BASE`, `STATE_DIR`, and stub `findmnt`/`timeout` commands; verify alert and recovery records.
- Run `docker_watchdog.sh` with stub `docker` and a temporary HOME; check engine, container, heartbeat, PAUSE, and disk alerts.
- Validate Vector using `docker run --rm -v "$PWD/ops/linux/vector/vector.yaml:/etc/vector/vector.yaml:ro" timberio/vector:0.61.0-debian validate /etc/vector/vector.yaml`, then `docker compose -f ops/linux/docker-compose.logging.yml config` before deployment.
- `nas_backup.sh` requires the real NFS mount, sentinel, and service sources; use a dedicated rehearsal NAS path before scheduling it.

## Pull-based auto-deploy

The five-minute cron job fetches `origin/main` and deploys when it finds new commits that change files outside `trading/*` and `docker-compose.trading.yml`. The trading compose file is excluded on purpose; live real-money bots are deployed manually. Create `$HOME/.local/state/ochestration/deploy/PAUSE` (on the host, `/home/noroot/.local/state/ochestration/deploy/PAUSE`) to pause checks. A failed deployment records its commit in `failed-sha` and will not retry that commit until `origin/main` advances. Logs are written to `/home/noroot/logs/host/auto-deploy.log`.
