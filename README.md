# IPTV Thunder - Modern IPTV Client

[![GitHub](https://img.shields.io/badge/GitHub-iptv--thunder--tauri-blue?logo=github)](https://github.com/rafalsza/iptv-thunder-tauri)

A modern, feature-rich IPTV client built with Tauri 2, React 19, and TypeScript. Supports Stalker Middleware portals with integrated video player and comprehensive VOD (Movies/Series) support.

## Features

### Core Functionality
- **Multi-Account Management**: Manage up to 15 IPTV portal accounts
- **Quick Account Switching**: Fast switching between portals via navbar dropdown
- **Stalker API Integration**: Full support for Stalker Middleware portals
- **Built-in Video Player**: Integrated player with HLS/MP4/MPEG-TS support
- **Favorites & History**: Global favorites and watch history across accounts
- **Import/Export**: Backup and restore accounts via JSON files

### Content Features
- **Live TV**: Virtualized channel list with categories, search, and filtering
- **Movies (VOD)**: Movie catalog with categories, pagination, and details
- **Series (VOD)**: TV series browser with seasons and episodes
- **EPG**: Electronic Program Guide with interactive timeline view
- **Favorites Management**: Favorite channels, movies, and series with persistence

### Technology Stack

#### Backend (Tauri 2)
- **Rust**: Native performance and system integration
- **SQLite Database**: Local storage with Drizzle ORM
- **Shell Plugin**: External process execution capabilities

#### Frontend (React 19)
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and development server
- **Tailwind CSS v4**: Modern utility-first styling
- **shadcn/ui**: Beautiful, accessible UI components
- **Radix UI**: Primitive components for complex interactions
- **Zustand**: Lightweight state management with persistence
- **TanStack Query**: Server state management and caching
- **TanStack Virtual**: List virtualization for performance
- **Framer Motion**: Smooth animations and transitions
- **Lucide React**: Modern icon library
- **Video.js & HLS.js**: Video playback support

## Installation

### Prerequisites
- Node.js 18+
- Rust toolchain
- MPV media player (optional, for external playback)

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/rafalsza/iptv-thunder-tauri.git
cd iptv-thunder-tauri
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run tauri dev
```

### Building for Production

```bash
npm run build
npm run tauri build
```

## Usage

### Adding Accounts

1. Click "Add Account" on the main screen
2. Fill in account details:
   - **Account Name**: Display name (e.g., "Provider EU 4K")
   - **Portal URL**: Stalker portal URL (e.g., `http://example.com:8080/c/`)
   - **MAC Address**: Valid MAC address format (XX:XX:XX:XX:XX:XX)
3. Test connection to verify portal accessibility
4. Save the account

### Content Navigation

- **Live TV**: Browse channels by category, search, and filter
- **Movies**: Browse VOD movie catalog with genre filtering
- **Series**: Browse TV series with season/episode navigation
- **EPG**: View program guide with timeline navigation
- **Favorites**: Access favorite channels, movies, and series

### Player Controls

- **Play/Pause**: Space bar or click
- **Fullscreen**: Double-click or F11
- **Volume**: Mouse wheel or controls
- **Channel Switching**: Arrow keys or on-screen controls

## Architecture

### Feature-Based Modular Structure
```
src/
├── features/
│   ├── tv/                 # Live TV feature
│   │   ├── TVList.tsx
│   │   ├── tv.api.ts
│   │   ├── tv.hooks.ts
│   │   ├── ChannelCategoriesList.tsx
│   │   ├── FavoriteChannelsList.tsx
│   │   └── FavoriteCategoriesList.tsx
│   ├── movies/             # Movies VOD feature
│   │   ├── MovieList.tsx
│   │   ├── MovieDetails.tsx
│   │   ├── movies.api.ts
│   │   ├── movies.hooks.ts
│   │   ├── MovieCategoriesList.tsx
│   │   └── FavoriteMovieCategoriesList.tsx
│   ├── series/             # Series VOD feature
│   │   ├── SeriesList.tsx
│   │   ├── series.api.ts
│   │   └── series.hooks.ts
│   ├── epg/                # EPG feature
│   │   ├── EPGTimeline.tsx
│   │   ├── epg.api.ts
│   │   └── epg.hooks.ts
│   ├── player/             # Video player feature
│   │   ├── Player.tsx
│   │   └── player.hooks.ts
│   └── portals/            # Portal management
├── components/
│   └── ui/                 # Shared UI components
├── store/                  # Global state management
├── lib/                    # Utilities and services
├── hooks/                  # Shared React hooks
└── types/                  # TypeScript definitions
```

### State Management
```typescript
// Zustand store for global state
interface AppStore {
  favorites: {
    channels: string[];
    movies: string[];
    series: string[];
  };
  // Actions...
}
```

### Data Fetching
- **TanStack Query**: Server state with caching and background updates
- **Feature-specific hooks**: `useChannels`, `useMovies`, `useSeries`, `useEPG`
- **Prefetching**: Hover-based stream URL prefetching

## Configuration

### Application Settings
- **Theme**: Light/dark/system
- **Language**: UI language preference
- **MPV Path**: Custom MPV executable path (optional)
- **Auto-connect**: Connect to last used account on startup

### Account Settings
- **Portal URL**: Stalker middleware endpoint
- **MAC Address**: Client identifier
- **Authentication Token**: Stored securely after handshake
- **Token Expiry**: Automatic token refresh

## Development

### Project Structure Principles

1. **Feature-Based Organization**: Each feature (TV, Movies, Series, EPG, Player) has its own directory with components, hooks, and API co-located
2. **Dependency Injection**: Components receive dependencies via props for testability
3. **Clean API Layer**: Each feature has dedicated `.api.ts` files abstracting StalkerClient
4. **Type Safety**: Full TypeScript coverage with shared types

### Adding New Features

1. Create feature directory in `/src/features/`
2. Add API layer (`{feature}.api.ts`)
3. Add hooks (`{feature}.hooks.ts`)
4. Create main component (`{Feature}List.tsx`)
5. Update navigation in `App-complete.tsx`

### Available Scripts

```bash
npm run dev           # Start Vite dev server
npm run build         # Build for production
npm run tauri dev     # Start Tauri in dev mode
npm run tauri build   # Build Tauri application
npm test              # Run Jest tests
npm run test:watch    # Run tests in watch mode
```

## Contributing

1. Follow existing code style and patterns
2. Use TypeScript for all new code
3. Add proper error handling and loading states
4. Test with multiple portal configurations
5. Update documentation for new features

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please use the GitHub issue tracker.
