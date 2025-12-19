import type { Rendition, RenditionQuality, VideoInfo } from './types.js';

// Rendition ladder based on common streaming standards
const RENDITION_LADDER: Rendition[] = [
  {
    quality: '2160p',
    width: 3840,
    height: 2160,
    vp9Bitrate: 13500, // 13.5 Mbps
    hevcBitrate: 11000, // 11 Mbps
    maxrate: 20000,
    bufsize: 27000,
    preserveHDR: true,
  },
  {
    quality: '1440p',
    width: 2560,
    height: 1440,
    vp9Bitrate: 9000, // 9 Mbps
    hevcBitrate: 7000, // 7 Mbps
    maxrate: 13500,
    bufsize: 18000,
    preserveHDR: true,
  },
  {
    quality: '1080p',
    width: 1920,
    height: 1080,
    vp9Bitrate: 6000, // 6 Mbps
    hevcBitrate: 5000, // 5 Mbps
    maxrate: 9000,
    bufsize: 12000,
    preserveHDR: true,
  },
  {
    quality: '720p',
    width: 1280,
    height: 720,
    vp9Bitrate: 3250, // 3.25 Mbps
    hevcBitrate: 2500, // 2.5 Mbps
    maxrate: 5000,
    bufsize: 6500,
    preserveHDR: false, // Tone-map to SDR
  },
  {
    quality: '480p',
    width: 854,
    height: 480,
    vp9Bitrate: 1500, // 1.5 Mbps
    hevcBitrate: 1150, // 1.15 Mbps
    maxrate: 2250,
    bufsize: 3000,
    preserveHDR: false, // Tone-map to SDR
  },
];

export function buildRenditionLadder(sourceVideo: VideoInfo): Rendition[] {
  // Only include renditions at or below source quality
  // Check both width and height to handle ultrawide/non-standard aspect ratios
  return RENDITION_LADDER.filter(
    (rendition) =>
      rendition.height <= sourceVideo.height ||
      rendition.width <= sourceVideo.width
  );
}

export function getAllRenditions(): Rendition[] {
  return [...RENDITION_LADDER];
}

export function getRenditionByQuality(
  quality: RenditionQuality
): Rendition | undefined {
  return RENDITION_LADDER.find((r) => r.quality === quality);
}

export function filterRenditions(
  renditions: Rendition[],
  selectedQualities: RenditionQuality[]
): Rendition[] {
  return renditions.filter((r) => selectedQualities.includes(r.quality));
}

export function getRenditionLabel(rendition: Rendition): string {
  const labels: Record<RenditionQuality, string> = {
    '2160p': '4K Ultra HD',
    '1440p': '2K QHD',
    '1080p': 'Full HD',
    '720p': 'HD',
    '480p': 'SD',
  };
  return `${rendition.quality} (${labels[rendition.quality]})`;
}
