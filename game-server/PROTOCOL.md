# Local multiplayer protocol

Run `npm run server` from this directory. The service binds only to `127.0.0.1` by default (`PORT` changes the port, not the bind address); it rejects non-loopback bind addresses. Browser clients default to same-origin `/api` and `/ws`, which supports both the Vite proxy and a production reverse proxy. Optional `VITE_LIVE_API_URL` and `VITE_LIVE_WS_URL` overrides can point clients at explicit API and WebSocket URLs. `GET /health` reports readiness; WebSocket JSON messages use `/ws`. No account, external service, database, or sample execution is involved. Rooms and race state live in memory and disappear when the server stops.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact `http://` or `https://` origins, including non-default ports when present. Entries must be origins only, without a path or trailing slash. Loopback browser origins remain allowed automatically. The same policy checks HTTP `Origin` and WebSocket handshake `Origin`; absent Origin is accepted for non-browser local clients. Wildcards, `null`, suffix matches, and malformed origins are rejected.

## Production reverse proxy

Keep the game server bound to loopback and terminate TLS at the reverse proxy. Preserve the browser `Origin` on both HTTP and WebSocket requests. Add the public site origin to `CORS_ALLOWED_ORIGINS` before starting the backend; a same-origin proxy still needs this for WebSocket handshake validation. Example Nginx locations:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8765/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
}

location = /ws {
    proxy_pass http://127.0.0.1:8765/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 60s;
}
```

For example, set `CORS_ALLOWED_ORIGINS=https://tools.example.com` for that site's origin. If frontend and API intentionally use different origins, configure both exact origins and set `VITE_LIVE_API_URL` plus `VITE_LIVE_WS_URL` at frontend build time. Do not configure `0.0.0.0` or expose port 8765 directly.

For Vite development, `/api`, `/ws`, and `/health` proxy to `http://127.0.0.1:8765`. Set `LIVE_GAME_SERVER_URL` only when the local backend uses another loopback URL. Leave `VITE_LIVE_*` unset to use the same-origin Vite proxy.

## Local game rankings

`GET /api/leaderboards/snake`, `/api/leaderboards/minesweeper?difficulty=beginner|intermediate|expert`, and `/api/leaderboards/reflex-test` return `{ game, difficulty?, direction, entries }`. `POST` the same URLs with JSON `{ "nickname":"Name", "score":123 }`; Minesweeper POST also requires `difficulty` in the body or query string. Snake scores sort high to low; Minesweeper completion times and Reflex Test average times sort low to high. Reflex Test times are milliseconds and accepted from 1 through 5,000. A nickname keeps only its best score per game and, for Minesweeper, difficulty. Names are limited to 20 sanitized characters; scores must be nonnegative safe integers up to 1,000,000,000. The response adds `updated` to indicate whether that result is now the nickname's best. Up to 100 best entries per board are persisted at `server/data/leaderboards.json` with restrictive local file permissions. Browser origins are accepted from localhost/127.0.0.1 or exact entries in `CORS_ALLOWED_ORIGINS`; the service itself binds to loopback.

Each connection receives `hello` with its stable-for-that-connection `id`, protocol version, and passage-bank counts, then the current `gomoku.rooms` list and `race.lobby` snapshot. The ID is the server's connection UUID and matches the participant `id` used in game and race events; it is regenerated after reconnecting. Clients should key the current player and race results by this ID, not by nickname, since nicknames are not unique. Invalid input returns `{ "type":"error", "code":"...", "message":"..." }`. Nicknames are trimmed, control characters and angle brackets removed, then limited to 20 characters.

## Gomoku

Send `gomoku.rooms.list` to refresh room listings. Send `gomoku.room.create` with `nickname` to create a numbered room such as `#0001`. Send `gomoku.room.join` with `roomId` and `nickname` to join a waiting room. Rooms hold two players. Send `gomoku.move` with an integer `cell` from 0 through 224 (or `x` and `y`, each 0 through 14) to place a stone on the 15×15 board. The server enforces turn order, empty cells, and five-in-a-row wins. Send `gomoku.room.leave` to leave. State is returned in `gomoku.room`; room listings arrive as `gomoku.rooms`.

## Typing race

Send `race.join` with `nickname` to enter the shared lobby. Up to 10 clients can enter a race. The first participant in an empty lobby becomes its host; only that connection may send `race.start` with `locale` set to `en` or `ko`. The server chooses one original practice passage for the round and broadcasts that exact passage in `race.started`, along with its `source` tag and `hostId`. The host identity is included in each `race.lobby`; if the host leaves, the earliest remaining participant becomes host. `race.started` includes the shared future `startsAt` epoch timestamp and `countdownMs` (3 seconds by default). The race enters `countdown`; at `startsAt`, all clients receive `race.go` with the authoritative `startedAt` timestamp and the lobby changes to `running`. Progress received during countdown is rejected. Clients should leave the text area focusable and read-only during countdown, then accept input only after `race.go`. Clients should use the same server timestamp to start the visual timer; the server calculates WPM and duration from it, so participant measurements share one clock. Send `race.progress` with the full text typed so far; updates are limited to ten per second per participant. Send `race.finish` with the full passage after completing it. The server calculates correctness, accuracy, WPM, duration, and final `race.results`. A client cannot join after a round starts. The bank contains original English and Korean passages, authored for this project; no TypeRacer copy or quotations are used.

`race.lobby` carries the current status, round, selected passage, source tag, authoritative `startsAt`, countdown length, and player progress. The bank currently contains 51 original English and 52 original Korean passages. Supported locales are deliberately limited to `en` and `ko`; unsupported or omitted locale values fall back to English.

Run `npm run test:server` for pure state and persistence tests plus localhost WebSocket integration tests for room create/join/move and race start/countdown/progress. The integration test skips only when the execution environment blocks loopback socket binding.
