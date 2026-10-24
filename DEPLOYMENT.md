# Deploy Reverse Escape with Dokploy

Deploy this repository as **one Node application**, serving the built game, HTTP API and Socket.IO on the same origin. The Dockerfile builds both frontend and server, removes development dependencies, runs as the unprivileged `node` user, and exposes port **3001**. Production does not require `tsx`, Vite, or a second frontend process.

## Dokploy Application (recommended)

1. Create a project in your Dokploy dashboard and add an **Application**.
2. Connect `https://github.com/noel-ult/revescape.git`, branch `main`.
3. Choose **Dockerfile** as the build type. Use `Dockerfile` at the repository root with build context `.`. No custom start command is needed.
4. Add environment variables:

   ```env
   NODE_ENV=production
   PORT=3001
   PUBLIC_ORIGIN=https://your-game-domain.example
   ```

   Replace the example with the exact browser origin, without a trailing slash. The origin check applies to WebSocket handshakes as well as HTTP polling. Do not put reconnect tokens or secrets into frontend environment variables.
5. Add your domain in Dokploy's **Domains** tab. Set **Container Port: 3001**, **Path: /**, and enable HTTPS with the appropriate certificate. Point the domain's DNS at your Dokploy server. Keep `/socket.io/` on the same routed service as `/` and `/api/health`; it must support WebSocket upgrades.
6. Keep **one replica**. Deploy, check the build/runtime logs, and wait for the container health check to pass. The Docker health check requests `/api/health`.
7. Open the HTTPS game URL in two separate browsers/devices. Choose **Live escape race**, create a lobby, copy the invite URL, join on the second device, and ready both players. Confirm both positions and the sector checkpoint update. Also verify **Architect duel** still completes a build/AI/results round.

Dokploy routes the domain to the container port through Traefik; a public host-port mapping is unnecessary. See the official [Application domains guide](https://docs.dokploy.com/docs/core/domains) and [Applications guide](https://docs.dokploy.com/docs/core/applications).

## Optional Dokploy Compose setup

`compose.yaml` provides the same single `game` service. Select a **Docker Compose** project using that file, set `PUBLIC_ORIGIN`, and add a domain for service **game**, port **3001**, through Dokploy's Domains tab. If you use manual networking instead, connect the service to the appropriate Dokploy network. Do not add a second static-site deployment for the frontend. Follow [Dokploy Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains) for your dashboard's routing/network mode.

## Verify a deployment

From a local checkout with dependencies installed:

```bash
npm run smoke -- https://your-game-domain.example
```

This checks health, the HTML response, two independent WebSocket connections, lobby join, the synchronized race start, and an authoritative move received by the rival. It creates a temporary test room, then disconnects. Browser testing remains necessary for 3D rendering and touch input.

For local production verification:

```bash
npm ci
npm test
npm run build
npm start
# In another terminal:
npm run smoke -- http://localhost:3001
npm run test:e2e
```

To test against a clean production process while another preview is using port 3001:

```bash
E2E_PORT=3002 npm run test:e2e
```

To test the actual image on a machine with Docker:

```bash
docker build -t revescape .
docker run --rm -p 3001:3001 -e PUBLIC_ORIGIN=http://localhost:3001 revescape
```

The GitHub Actions workflow runs unit/browser tests, builds the same Docker image, and runs the two-client smoke check against the container on every push to `main`. Check that workflow before deploying a new revision. This does not publish the game or configure your Dokploy domain.

## Operational behavior

- Rooms and race progress are stored in the running Node process. Browser refresh/reconnect restores a seat while that process is alive; **restarts and deploys lose active rooms**. The client handles expired invites and lets players create a new lobby.
- Solo expedition completion is stored locally in the browser. It is not an online account or a cloud save.
- Do not scale to multiple replicas without shared match storage, server-side synchronization, a Socket.IO adapter, and appropriate routing. Sticky sessions alone do not share game state.
- Deploy between matches. SIGTERM stops match timers, signals connected clients, closes sockets, and exits within ten seconds. Dokploy should allow at least 15 seconds before forced termination.
- The first finisher wins a live race. Architect scoring and all competitive movement are server-controlled. Players cannot submit their own coordinates, progression, or winning score.
- The server limits payload sizes, message rates and room capacity, hides opponent reconnect tokens, checks socket ownership, and expires abandoned rooms. These are game-session controls, not persistent user authentication.
- Set the domain's exact HTTPS origin before opening the service publicly. If you change domains, update `PUBLIC_ORIGIN` and redeploy.

This repository supplies deployment configuration. A live public URL is verified only after you deploy it in your Dokploy instance and run the checks above.

## Optional Luna Decisions configuration

Add these **runtime** variables in the Dokploy Application's Environment tab, then redeploy:

```env
LUNA_ENABLED=true
OPENAI_API_KEY=<your OpenAI project API key>
```

Keep the key in Dokploy's secret/environment settings, out of Git and all frontend `VITE_` variables. Both settings are required; leave `LUNA_ENABLED=false` until you have a key. Compose forwards the same variables to `game`. The production server uses Node's built-in fetch, so no SDK or second service is required. It needs outbound HTTPS access to `api.openai.com`.

In the solo studio choose **Luna Decisions + A***, then launch. Confirm **Luna choices** is greater than zero before claiming that the deployed model is working. Without a key, the replay should show zero Luna choices, fallback events, and a playable deterministic scout. No provider call is attempted in that case. Timeouts (1.2 seconds/call), refusals, invalid responses and API errors open a fallback circuit. The two attempts share an eight-call/eight-second budget; remaining choices use the baseline. The server allows two concurrent solo launches, one per IP per 30 seconds, and 60 provider calls/minute plus 1,000/day per process. Restart resets in-memory limits: set project spending controls in your OpenAI account as well. Human races and competitive scoring never depend on an external model.

## If Cloudflare returns 502

This application's production HTTP service listens on `PORT`, default **3001**. In Dokploy **Domains → Edit**, the **Container Port** must match it. Do not leave the domain on the dashboard's default **3000** while the process listens on **3001**. Keep Path and Internal Path at `/`. After saving, request `https://your-domain/api/health` and run the two-client smoke script above. A reachable static homepage alone does not prove WebSockets work.

If it still fails, inspect application logs for `Listening on port 3001`, confirm the container health check is passing, then inspect the Traefik service/network route. Avoid changing TLS/DNS blindly when Cloudflare already reports an origin-side error. See [Cloudflare's 502 troubleshooting](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-502-504/).

On 2026-10-25 (Asia/Kolkata), the live `revescape.noelbiju.in` route was observed pointing at 3000. Changing its Dokploy domain Container Port to 3001 restored HTTP 200 health and passed the public two-client WebSocket race/movement smoke test. This observation verifies that deployment revision's routing; it does not verify live Luna access or future releases.
