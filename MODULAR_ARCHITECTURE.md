# 🧱 Complete Modular Architecture Implementation

## 📁 Structure Overview

The application has been refactored into a feature-based modular architecture with comprehensive IPTV functionality.

```
src/
├── features/
│   ├── tv/
│   │   ├── TVList.tsx          # TV channel list component with virtualization
│   │   ├── tv.api.ts           # TV API layer
│   │   └── tv.hooks.ts         # TV-specific React hooks
│   ├── movies/
│   │   ├── MovieList.tsx        # Movies list with categories and pagination
│   │   ├── movies.api.ts       # Movies API layer (VOD integration)
│   │   └── movies.hooks.ts     # Movies-specific React hooks
│   ├── series/
│   │   ├── SeriesList.tsx       # Series list with seasons/episodes
│   │   ├── series.api.ts        # Series API layer (VOD integration)
│   │   └── series.hooks.ts     # Series-specific React hooks
│   ├── epg/
│   │   ├── EPGTimeline.tsx      # Electronic Program Guide timeline view
│   │   ├── epg.api.ts          # EPG API layer
│   │   └── epg.hooks.ts        # EPG-specific React hooks
│   └── player/
│       ├── Player.tsx           # Video player component
│       └── player.hooks.ts     # Player-specific React hooks
├── components/
│   └── ui/
│       ├── Navigation.tsx       # Main navigation component
│       └── MediaCard.tsx        # Reusable media card component
├── store/
│   └── app.store.ts            # Global Zustand store
├── hooks/
│   ├── useSecureStorage.ts     # 🔐 Stronghold - encrypted auth storage
│   ├── useDatabase.ts          # 🗄️ SQLite - channels/VOD/EPG data
│   ├── useImageCache.ts        # 📁 FS - image file cache
│   ├── useSettings.ts         # ⚙️ Store - app settings
│   ├── useDebounce.ts         # Utility hooks
│   └── index.ts               # Unified storage exports
├── lib/                        # External libraries and utilities
├── App-modular.tsx             # Basic modular app
└── App-complete.tsx            # Complete app with all features
```

## 🏗️ Architecture Principles

### 1. **Feature-Based Organization**
- Each feature (TV, Player, Movies, Series) has its own directory
- Related components, hooks, and API calls are co-located
- Clear separation of concerns

### 2. **Dependency Injection**
- Components receive dependencies via props
- Easy to test and mock
- Loose coupling between modules

### 3. **Global State Management**
- Zustand for simple, efficient state management
- **Stronghold** for secure auth persistence
- **SQLite** for content data
- Type-safe with TypeScript

### 4. **Data Fetching**
- React Query for server state management
- Automatic caching, refetching, and error handling
- Prefetching for better UX

## 💾 Modern Tauri 2 Storage Architecture

| Data Type | Technology | Purpose |
|-----------|-----------|---------|
| **Auth/Security** | 🔐 Stronghold | Encrypted storage for tokens, MAC, credentials |
| **Content Data** | 🗄️ SQLite | VOD, channels, EPG - searchable structured data |
| **Image Cache** | 📁 File System | Binary poster/icon files with native access |
| **Settings** | ⚙️ Store | App configuration, preferences |

### 🔐 Stronghold (Secure Storage)
```typescript
import { secureStorage } from '@/hooks';

// Save auth securely (encrypted)
await secureStorage.saveAuthData({
  macAddress: '00:1A:79:...',
  token: 'bearer_token',
  serverUrl: 'http://portal...'
});

// Retrieve auth
data = await secureStorage.getAuthData();
```
**Features:**
- Hardware-backed encryption
- Anti-tampering protection
- Secure vault isolated from app
- 32-byte password hashing

### 🗄️ SQLite (Structured Data)
```typescript
import { saveChannels, getChannels, searchVod } from '@/hooks';

// Save thousands of channels
await saveChannels(channelList);

// Fast queries with indexes
const channels = await getChannels(genreId);
const results = await searchVod('Action Movie');
```
**Schema:**
- `channels` - Live TV channels with genres
- `vod` - Movies with metadata
- `series` / `series_seasons` / `series_episodes` - TV series
- `epg` - Electronic program guide data

### 📁 File System (Image Cache)
```typescript
import { useImageCache } from '@/hooks';

const { fetchAndCacheImage, getImageBlobUrl } = useImageCache();

// Cache and retrieve images
const blobUrl = await getImageBlobUrl(posterUrl);
<img src={blobUrl} />
```
**Features:**
- Binary data storage
- Persistent cache across sessions
- Fast local file access

### ⚙️ Store (Settings)
```typescript
import { useSettings } from '@/hooks';

const { setSetting, getSetting } = useSettings();

// Save preferences
await setSetting('theme', 'dark');
await setSetting('volume', 0.8);
```

### ❌ Why Not localStorage?
- No encryption (security risk for tokens)
- 5MB limit (too small for IPTV data)
- Synchronous (blocks UI)
- String-only (inefficient for binary)

## 🚀 Key Features

### TV Feature
- **TVList.tsx**: Virtualized channel list with responsive grid
- **tv.api.ts**: Clean API abstraction over StalkerClient
- **tv.hooks.ts**: Reusable data fetching hooks with caching

### Movies Feature
- **MovieList.tsx**: Movies grid with categories, search, and pagination
- **movies.api.ts**: VOD integration for movies content
- **movies.hooks.ts**: Movie-specific data management with prefetching

### Series Feature
- **SeriesList.tsx**: Series browser with seasons and episodes
- **series.api.ts**: VOD integration for TV series content
- **series.hooks.ts**: Series data management with episode grouping

### EPG (Electronic Program Guide)
- **EPGTimeline.tsx**: Interactive timeline view with current program highlighting
- **epg.api.ts**: EPG data fetching and time utilities
- **epg.hooks.ts**: Real-time EPG updates and caching

### Player Feature
- **Player.tsx**: Modal video player with controls
- **player.hooks.ts**: Player state management for all content types

### Shared Components
- **Navigation.tsx**: Main navigation with active state
- **MediaCard.tsx**: Reusable card for all media types

### Global Store
- **app.store.ts**: Favorites management with persistence

## 🔄 Data Flow

### TV Channels Flow
1. **App Component** → Creates StalkerClient and QueryClient
2. **TVList Component** → Uses useChannels hook to fetch data
3. **Channel Selection** → Triggers player hook to fetch stream URL
4. **Player Component** → Renders video with fetched URL

### Movies Flow
1. **MovieList Component** → Uses useMoviesWithPagination for paginated data
2. **Category Selection** → Filters movies by category
3. **Movie Selection** → Triggers player hook with movie stream URL
4. **Player Component** → Renders movie content

### Series Flow
1. **SeriesList Component** → Fetches series and episodes
2. **Series Selection** → Shows seasons and episodes panel
3. **Episode Selection** → Triggers player hook with episode stream URL
4. **Player Component** → Renders episode content

### EPG Flow
1. **EPGTimeline Component** → Fetches EPG data for multiple channels
2. **Time Navigation** → Updates date range and refetches data
3. **Program Selection** → Triggers TV channel selection
4. **Timeline View** → Shows current/next programs with real-time updates

## 🛠️ Usage Examples

### Basic Modular App
```tsx
import { App } from './App-modular';
import { StalkerAccount } from '@/types';

const account: StalkerAccount = {
  id: 'user-123',
  login: 'user',
  password: 'pass',
  portalUrl: 'http://portal.example.com/',
  mac: '00:1A:79:84:1A:AB',
  token: '',
  expiresAt: new Date(),
};

function MyApp() {
  return <App activeAccount={account} />;
}
```

### Complete App with All Features
```tsx
import { AppComplete } from './App-complete';
import { StalkerAccount } from '@/types';

const account: StalkerAccount = {
  id: 'user-123',
  login: 'user',
  password: 'pass',
  portalUrl: 'http://portal.example.com/',
  mac: '00:1A:79:84:1A:AB',
  token: '',
  expiresAt: new Date(),
};

function MyApp() {
  return <AppComplete activeAccount={account} />;
}
```
```

## 📋 Benefits

✅ **Complete IPTV Solution**: TV, Movies, Series, and EPG in one app  
✅ **Scalable**: Easy to add new features following the same pattern  
✅ **Maintainable**: Clear separation of concerns and modular structure  
✅ **Performant**: Virtualization, caching, and lazy loading  
✅ **User-Friendly**: Intuitive navigation and responsive design  
✅ **Type-Safe**: Full TypeScript support throughout  
✅ **Reusable**: Shared components and hooks  
✅ **Real-time**: EPG updates and current program tracking  

## 🎯 Features Implemented

### 📡 Live TV
- Virtualized channel list with responsive grid
- Real-time channel switching
- Channel favorites management
- Search and filtering

### 🎬 Movies
- Categories and genre filtering
- Pagination for large catalogs
- Movie details and poster support
- Stream prefetching on hover

### 📺 Series
- Series browser with seasons
- Episode grouping and organization
- Expandable season views
- Episode-level favorites

### 📅 Electronic Program Guide
- Interactive timeline view
- Current program highlighting
- Date navigation
- Multiple time range views
- Real-time updates

### 🎮 Media Player
- Unified player for all content types
- Modal overlay with controls
- Buffering states
- Keyboard shortcuts

## 🔧 Next Steps

1. **Settings & Preferences**: User configuration
2. **Theme System**: Dark/light mode support
3. **Internationalization**: Multi-language support
4. **Recording**: DVR functionality
5. **Advanced Search**: Filters and sorting options
6. **Profile Management**: Multiple user profiles

## 📦 Dependencies

All required dependencies are already installed:
- `@tanstack/react-query` - Data fetching
- `@tanstack/react-virtual` - List virtualization
- `zustand` - State management
- `react` & `react-dom` - UI framework
