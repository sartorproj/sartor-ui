# Sartor UI

Modern React frontend for the Sartor Kubernetes resource optimization platform.

## Features

- 📊 **Dashboard** - Overview of Tailorings, Cuts, and system status
- ✂️ **Tailorings** - Manage resource optimization for workloads
- 🔀 **Cuts** - View Git PRs and commits created by Sartor
- ✨ **Fit Profiles** - Manage optimization profiles with strategy-specific configurations
- ⚙️ **Atelier** - View global configuration and connection status

## Getting Started

### Prerequisites

- **Bun** (recommended) - Install from [bun.sh](https://bun.sh)
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
  Or use npm/node as fallback (Node.js 18+)
- Sartor API server running (default: http://localhost:8080)

### Installation

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Edit .env and set your API URL
# VITE_API_URL=http://localhost:8080
```

### Development

```bash
# Start development server
bun run dev
```

The UI will be available at http://localhost:5173

### Build

```bash
# Build for production
bun run build

# Preview production build
bun run preview
```

## Configuration

By default the UI calls the API on its own origin (`/api/...`). In development, Vite proxies `/api` to http://localhost:8080; in the container image, nginx proxies it to `SARTOR_API_URL`.

Build time (baked into the public JS bundle, so never put secrets here):

- `VITE_API_URL` - Optional absolute URL of the Sartor API server, only if it is served from another origin (default: same origin)

Container runtime (nginx image), read when the container starts:

- `SARTOR_API_URL` - Upstream for `/api/`, as `scheme://host[:port]` with no path, for example `http://sartor-server.sartor-system.svc.cluster.local:8080`. There is no default. If it is unset, invalid, or the host does not resolve, nginx still starts and serves the UI, and `/api/` returns 502.
  Use a fully qualified host name: nginx resolves it per request through the DNS servers in the container's `/etc/resolv.conf`, and those lookups skip DNS search domains, so a short name such as `sartor-server` only works where the DNS server itself answers it (for example Docker's embedded DNS on a user-defined network).
- `SARTOR_API_KEY` - Optional API key that nginx adds as `X-API-Key` on proxied requests; mount it from a Secret. Allowed characters: letters, digits and `._~+/=-`. When unset, no key is sent, and a key supplied by the browser is never forwarded.

Deploy the UI on a private network or behind an authenticating proxy; the server-side key proxy gives the API to anyone who can reach the UI. Never expose it publicly.

```bash
docker run --read-only --tmpfs /tmp -p 5173:5173 \
  -e SARTOR_API_URL=http://sartor-server.example.com:8080 \
  -e SARTOR_API_KEY=change-me \
  ghcr.io/sartorproj/sartor-ui:latest
```

The image runs as UID 101 and supports `readOnlyRootFilesystem: true` when `/tmp` is writable (for example an `emptyDir`). HTTP/2 and HTTP/3 are disabled.

`tests/image-smoke.sh <image>` checks this behaviour against a built image (CI runs it on every pull request).

## Tech Stack

- **Bun** - Package manager and runtime (faster than npm)
- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool
- **React Router 7** - Routing
- **TanStack Query 5** - Data fetching and caching
- **Tailwind CSS 3.4** - Styling
- **shadcn/ui** - Component library (Radix UI primitives)
- **Recharts** - Resource usage charts and visualizations
- **Axios** - HTTP client
- **Lucide React** - Icons
- **next-themes** - Dark/light mode support
- **date-fns** - Date formatting

## Using npm instead of Bun

If you prefer to use npm instead of Bun, you can replace `bun` with `npm` in all commands. The project is compatible with both package managers.

## Project Structure

```
src/
├── components/     # Reusable components
│   └── Layout.tsx  # Main layout with sidebar
├── pages/          # Page components
│   ├── Dashboard.tsx
│   ├── Tailorings.tsx
│   ├── Cuts.tsx
│   ├── FitProfiles.tsx
│   └── Atelier.tsx
├── lib/            # Utilities and API client
│   └── api.ts      # API client and types
├── App.tsx         # Main app component
└── main.tsx        # Entry point
```

## API Integration

The UI connects to the Sartor API server. Make sure the API server is running and accessible at the configured URL.

API endpoints used:
- `GET /api/v1/tailorings` - List Tailorings
- `GET /api/v1/cuts` - List Cuts
- `GET /api/v1/fitprofiles` - List Fit Profiles
- `GET /api/v1/atelier` - Get Atelier configuration
- `GET /api/v1/dashboard/stats` - Get dashboard statistics

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.
