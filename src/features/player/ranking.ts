export function rankUrls(urls: string[], stats: any) {
  return urls
    .map(url => {
      const s = stats[url] || {
        successRate: 0.5,
        lastSuccess: 0,
        fails: 0
      };

      const score =
        s.successRate * 0.7 +
        (s.lastSuccess ? 0.2 : 0) +
        (s.fails > 3 ? -0.3 : 0);

      return { url, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.url);
}