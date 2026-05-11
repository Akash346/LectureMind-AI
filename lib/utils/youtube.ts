export function extractYouTubeId(url: string) {
  const patterns = [
    /youtube\.com\/watch\?v=([^&?/]+)/,
    /youtu\.be\/([^&?/]+)/,
    /youtube\.com\/embed\/([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function isValidYouTubeUrl(url: string) {
  return Boolean(extractYouTubeId(url));
}

export function getYouTubeThumbnail(url: string) {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}
