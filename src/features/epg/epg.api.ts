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
  
  // Fetch EPG for each channel in parallel - always use short EPG
  const promises = channelIds.map(async (channelId) => {
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
// Maps channel IDs and caches results
const epgCache = new Map<string, { data: StalkerEPG[]; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const getCacheKey = (url: string, channelId: number): string => `${url}_${channelId}`;

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
    const channels = xmlDoc.querySelectorAll('channel');
    let targetChannelId: string | null = null;
    let bestMatchScore = 0;
    
    const cleanedIptvName = channelName ? cleanChannelName(channelName) : '';
    const iptvWords = new Set(cleanedIptvName.split(' ').filter(w => w.length > 2 && !GENERIC_TERMS.has(w)));
    
    channels.forEach((ch) => {
      const id = ch.getAttribute('id');
      const displayName = ch.querySelector('display-name')?.textContent || '';
      
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
    const programmes = xmlDoc.querySelectorAll('programme');
    
    programmes.forEach((prog) => {
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
  
  const timestamp = Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
  
  return timestamp;
};

export const fetchExternalEPG = async (
  url: string,
  channelId: number,
  from?: number,
  to?: number,
  channelName?: string
): Promise<StalkerEPG[]> => {
  try {
    const cacheKey = getCacheKey(url, channelId);
    const now = Date.now();
    
    // Check cache first
    const cached = epgCache.get(cacheKey);
    let programs: StalkerEPG[];
    
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      programs = cached.data;
    } else {
      // Use Tauri HTTP to bypass CORS
      const response = await invoke<string>('stalker_request', {
        url: url,
        method: 'GET',
        headers: ['Accept: application/xml'],
        body: null,
      });
      
      if (!response || response.trim() === '') {
        console.warn('Empty response from external EPG');
        return [];
      }
      
      // Parse and filter by channel
      programs = parseXMLTV(response, channelId, channelName);
      
      // Cache the results
      epgCache.set(cacheKey, { data: programs, timestamp: now });
    }
    
    // Filter by time range if provided
    if (from && to) {
      return programs.filter(prog => {
        const start = Number.parseInt(prog.start_time);
        const end = Number.parseInt(prog.end_time);
        return (start >= from && start <= to) || (end >= from && end <= to);
      });
    }
    
    return programs;
  } catch (error) {
    console.error('Failed to fetch external EPG:', error);
    return [];
  }
};
