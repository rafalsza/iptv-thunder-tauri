// =========================
// 🖼️ CHANNEL LOGO (with timeout)
// =========================
import React, { useState, useEffect } from 'react';
import { getImageUrl } from '@/hooks/useImageCache';

// Cache resolved URLs to avoid re-fetching when virtualizer remounts items
const logoUrlCache = new Map<string, string>();

interface ChannelLogoProps {
  logo: string;
  name: string;
}

export const ChannelLogo: React.FC<ChannelLogoProps> = ({ logo, name }) => {
  const [src, setSrc] = useState<string | null>(logoUrlCache.get(logo) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Return immediately if we already have a cached URL
    const cached = logoUrlCache.get(logo);
    if (cached) {
      setSrc(cached);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout - longer than image cache timeout

    getImageUrl(logo, '', controller.signal)
      .then(url => {
        if (!controller.signal.aborted && url) {
          logoUrlCache.set(logo, url);
          setSrc(url);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
        }
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [logo]);

  if (error || !src) return null;

  return (
    <img 
      src={src} 
      alt={name}
      className="w-full h-16 object-contain mt-2"
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
    />
  );
};
