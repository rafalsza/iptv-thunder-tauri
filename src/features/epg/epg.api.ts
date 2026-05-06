// =========================
// 📅 EPG API
// =========================
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerEPG } from '@/types';
import { invoke } from '@tauri-apps/api/core';

export const getChannelEPG = async (
  client: StalkerClient, 
  channelId: number, 
  _from?: number, 
  _to?: number
): Promise<StalkerEPG[]> => {
  // Always use short EPG - get_epg endpoint is disabled
  return client.getEPG(channelId);
};

export const getChannelsEPG = async (
  client: StalkerClient,
  channelIds: number[],
  _from?: number,
  _to?: number
): Promise<Record<number, StalkerEPG[]>> => {
  const epgData: Record<number, StalkerEPG[]> = {};

  // Fetch EPG in batches to avoid overwhelming the portal
  const BATCH = 5;
  for (let i = 0; i < channelIds.length; i += BATCH) {
    const batch = channelIds.slice(i, i + BATCH);
    const promises = batch.map(async (channelId) => {
      try {
        const epg = await client.getEPG(channelId);
        return { channelId, epg };
      } catch (error) {
        console.error(`Failed to fetch EPG for channel ${channelId}:`, error);
        return { channelId, epg: [] };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ channelId, epg }) => {
      epgData[channelId] = epg;
    });
  }

  return epgData;
};

export const getCurrentProgram = (epg: StalkerEPG[]): StalkerEPG | null => {
  const now = Math.floor(Date.now() / 1000);
  
  return epg.find(program => {
    const startTime = Number.parseInt(program.start_time);
    const endTime = Number.parseInt(program.end_time);
    return startTime <= now && endTime > now;
  }) || null;
};

export const getNextProgram = (epg: StalkerEPG[]): StalkerEPG | null => {
  const now = Math.floor(Date.now() / 1000);
  
  return epg.find(program => {
    const startTime = Number.parseInt(program.start_time);
    return startTime > now;
  }) || null;
};

export const getProgramsForTimeRange = (
  epg: StalkerEPG[], 
  from: number, 
  to: number
): StalkerEPG[] => {
  return epg.filter(program => {
    const startTime = Number.parseInt(program.start_time);
    const endTime = Number.parseInt(program.end_time);
    return (startTime >= from && startTime < to) || 
           (endTime > from && endTime <= to) ||
           (startTime <= from && endTime >= to);
  });
};

export const formatEPGTime = (timestamp: string | number): string => {
  const date = new Date(Number.parseInt(timestamp.toString()) * 1000);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

export const formatEPGDate = (timestamp: string | number): string => {
  const date = new Date(Number.parseInt(timestamp.toString()) * 1000);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric' 
  });
};

export const getEPGTimeRange = (hours: number = 24): { from: number; to: number } => {
  const now = Math.floor(Date.now() / 1000);
  // Round to 5-minute intervals to keep query key stable and prevent constant refetching
  const roundedNow = Math.floor(now / 300) * 300;
  const from = roundedNow - (2 * 3600); // 2 hours ago
  const to = roundedNow + (hours * 3600); // X hours from now
  return { from, to };
};

// Simple XML parser for external EPG (XMLTV format)
// Maps URLs to full XML data and caches results
const epgCache = new Map<string, { data: string; timestamp: number }>();
const epgParsedCache = new Map<string, { data: StalkerEPG[]; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_EPG_CACHE = 50;

const cleanupEPGCache = () => {
  if (epgCache.size <= MAX_EPG_CACHE) return;

  const sorted = Array.from(epgCache.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp)
    .slice(-MAX_EPG_CACHE);

  epgCache.clear();
  sorted.forEach(([k, v]) => epgCache.set(k, v));
};

const getCacheKey = (url: string): string => url;
const getParsedCacheKey = (url: string, channelId: number): string => `${url}_${channelId}`;

// Helper to clean IPTV channel names for better matching
const cleanChannelName = (name: string): string => {
  return name
    .replace(/^[^a-zA-Z0-9]+/, '') // Remove leading non-alphanumeric (like "JOYN|")
    .replaceAll(/[ᴿᴬᵂᴴᴰᵁ]+/g, '') // Remove superscript chars (ᴿᴬᵂ etc.)
    .replaceAll(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase();
};

// Common generic terms that shouldn't be used for matching alone
const GENERIC_TERMS = new Set(['international', 'channel', 'tv', 'television', 'network', 'hd', 'sd', 'raw', 'live', 'news', 'sports', 'movies', 'music']);

const parseXMLTV = (xmlText: string, channelId: number, channelName?: string): StalkerEPG[] => {
  const programs: StalkerEPG[] = [];
  
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // First, build a map of channel IDs to find matching channel
    const channels = xmlDoc.getElementsByTagName('channel');
    let targetChannelId: string | null = null;
    let bestMatchScore = 0;
    
    const cleanedIptvName = channelName ? cleanChannelName(channelName) : '';
    const iptvWords = new Set(cleanedIptvName.split(' ').filter(w => w.length > 2 && !GENERIC_TERMS.has(w)));
    
    
    Array.from(channels).forEach((ch) => {
      const id = ch.getAttribute('id');
      const displayName = ch.getElementsByTagName('display-name')[0]?.textContent || '';
      
      // Clean XMLTV name too
      const cleanedXmltvName = cleanChannelName(displayName);
      const xmltvWords = new Set(cleanedXmltvName.split(' ').filter(w => w.length > 2 && !GENERIC_TERMS.has(w)));
      
      // Match by cleaned channel name
      if (id && cleanedIptvName && cleanedXmltvName) {
        let score = 0;
        
        // Exact match = highest score
        if (cleanedIptvName === cleanedXmltvName) {
          score = 1000;
        }
        // One contains the other fully (e.g., "cnn" in "cnn international")
        else if (cleanedXmltvName.includes(cleanedIptvName) || cleanedIptvName.includes(cleanedXmltvName)) {
          // Prefer shorter/more specific matches (CNN should beat "CNN International News HD")
          score = 100 + Math.max(cleanedIptvName.length, cleanedXmltvName.length) - Math.abs(cleanedIptvName.length - cleanedXmltvName.length);
        }
        // Word-by-word match for non-generic terms
        else {
          const matchingWords = Array.from(iptvWords).filter(word => xmltvWords.has(word));
          if (matchingWords.length >= 2 || (matchingWords.length === 1 && iptvWords.size === 1)) {
            // Score by number of matching specific words
            score = matchingWords.length * 10;
          }
        }
        
        // Prefer shorter, more specific channel names (CNN beats "1+1 CNN International HD")
        if (score > 0) {
          score -= cleanedXmltvName.length * 0.1;
        }
        
        if (score > bestMatchScore) {
          bestMatchScore = score;
          targetChannelId = id;
        }
      }
    });
    
    // If no channel name match, try direct ID match
    targetChannelId ??= channelId.toString();
    
    
    // Find programme elements for this channel only
    const programmes = xmlDoc.getElementsByTagName('programme');
    
    Array.from(programmes).forEach((prog) => {
      const progChannel = prog.getAttribute('channel');
      
      // Filter by channel
      if (progChannel && progChannel !== targetChannelId) {
        return;
      }
      
      const start = prog.getAttribute('start');
      const stop = prog.getAttribute('stop');
      const title = prog.querySelector('title')?.textContent || 'Unknown';
      const desc = prog.querySelector('desc')?.textContent || '';
      
      if (start && stop) {
        const startTime = parseXMLTVTime(start);
        const stopTime = parseXMLTVTime(stop);
        
        programs.push({
          id: `${channelId}_${startTime}` as unknown as number,
          name: title,
          start_time: startTime.toString(),
          end_time: stopTime.toString(),
          description: desc,
          channel_id: channelId,
        });
      }
    });
    
    
  } catch (error) {
    console.error('Failed to parse external EPG:', error);
  }
  
  return programs;
};

// Parse XMLTV timestamp format
const parseXMLTVTime = (timeStr: string): number => {
  // Format: 20260126180000 +0100 or 20260126180000
  const cleaned = timeStr.split(' ')[0]; // Remove timezone offset
  const year = Number.parseInt(cleaned.substring(0, 4));
  const month = Number.parseInt(cleaned.substring(4, 6)) - 1; // JS months are 0-based
  const day = Number.parseInt(cleaned.substring(6, 8));
  const hour = Number.parseInt(cleaned.substring(8, 10));
  const minute = Number.parseInt(cleaned.substring(10, 12));
  const second = Number.parseInt(cleaned.substring(12, 14));
  
  return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
};

// Check if URL ends with .gz
const isGzippedUrl = (url: string): boolean => url.toLowerCase().endsWith('.gz');

const checkParsedCache = (parsedCacheKey: string, from?: number, to?: number): StalkerEPG[] | null => {
  const now = Date.now();
  const parsedCached = epgParsedCache.get(parsedCacheKey);
  
  if (!parsedCached || (now - parsedCached.timestamp) >= CACHE_TTL_MS) {
    return null;
  }
  
  const programs = parsedCached.data;
  
  if (from && to) {
    return programs.filter(prog => {
      const start = Number.parseInt(prog.start_time);
      const end = Number.parseInt(prog.end_time);
      return (start >= from && start <= to) || (end >= from && end <= to);
    });
  }
  
  return programs;
};

const checkRawCache = (cacheKey: string): string | null => {
  const now = Date.now();
  const cached = epgCache.get(cacheKey);
  
  if (!cached || (now - cached.timestamp) >= CACHE_TTL_MS) {
    return null;
  }
  
  return cached.data;
};

const fetchXmlData = async (url: string): Promise<string | null> => {
  try {
    if (isGzippedUrl(url)) {
      return await invoke('fetch_epg_gz', { url });
    }
    
    const acceptHeader = 'Accept: application/xml';
    const response = await invoke('stalker_request', {
      url: url,
      method: 'GET',
      headers: [acceptHeader],
      body: null,
    });

    const responseBody = typeof response === 'string' ? response : (response as any)?.body;

    if (!responseBody || (typeof responseBody === 'string' && responseBody.trim() === '')) {
      return null;
    }

    if (typeof responseBody !== 'string') {
      return null;
    }
    
    return responseBody;
  } catch (error) {
    return null;
  }
};

const filterByTimeRange = (programs: StalkerEPG[], from?: number, to?: number): StalkerEPG[] => {
  if (!from || !to) {
    return programs;
  }
  
  return programs.filter(prog => {
    const start = Number.parseInt(prog.start_time);
    const end = Number.parseInt(prog.end_time);
    return (start >= from && start <= to) || (end >= from && end <= to);
  });
};

export const fetchExternalEPG = async (
  url: string,
  channelId: number,
  from?: number,
  to?: number,
  channelName?: string
): Promise<StalkerEPG[]> => {
  try {
    const cacheKey = getCacheKey(url);
    const parsedCacheKey = getParsedCacheKey(url, channelId);

    // Check parsed cache first
    const cachedPrograms = checkParsedCache(parsedCacheKey, from, to);
    if (cachedPrograms) {
      return cachedPrograms;
    }

    // Check raw cache or fetch new data
    let xmlData = checkRawCache(cacheKey);
    
    if (!xmlData) {
      xmlData = await fetchXmlData(url);
      if (!xmlData) {
        return [];
      }
      
      // Cache the raw XML data
      epgCache.set(cacheKey, { data: xmlData, timestamp: Date.now() });
      cleanupEPGCache();
    }

    // Parse and filter by channel
    const programs = parseXMLTV(xmlData, channelId, channelName);
    
    // Cache the parsed results for this channel
    epgParsedCache.set(parsedCacheKey, { data: programs, timestamp: Date.now() });

    return filterByTimeRange(programs, from, to);
  } catch (error) {
    return [];
  }
};
