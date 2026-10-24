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
