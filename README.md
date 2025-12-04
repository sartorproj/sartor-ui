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

Set the following environment variables:

- `VITE_API_URL` - URL of the Sartor API server (default: http://localhost:8080)
- `VITE_API_KEY` - Optional API key for authentication

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
