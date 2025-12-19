import { $ } from 'bun';
import type { HWAccelInfo, HWAccelMethod } from './types.js';

const HW_ACCEL_CONFIGS: Record<Exclude<HWAccelMethod, 'software'>, HWAccelInfo> =
  {
    nvidia: {
      method: 'nvidia',
      displayName: 'NVIDIA NVENC',
      hevcEncoder: 'hevc_nvenc',
      vp9Encoder: 'libvpx-vp9', // NVIDIA doesn't have VP9 HW encoder
      hwaccelFlag: 'cuda',
      hwaccelOutputFormat: 'cuda',
      scaleFilter: 'scale_cuda',
    },
    qsv: {
      method: 'qsv',
      displayName: 'Intel Quick Sync',
      hevcEncoder: 'hevc_qsv',
      vp9Encoder: 'vp9_qsv', // Intel has VP9 HW on newer chips
      hwaccelFlag: 'qsv',
      hwaccelOutputFormat: 'qsv',
      scaleFilter: 'scale_qsv',
    },
    amf: {
      method: 'amf',
      displayName: 'AMD AMF',
      hevcEncoder: 'hevc_amf',
      vp9Encoder: 'libvpx-vp9', // AMD doesn't have VP9 HW encoder
      hwaccelFlag: 'auto',
      hwaccelOutputFormat: 'd3d11va',
      scaleFilter: 'scale',
    },
    vaapi: {
      method: 'vaapi',
      displayName: 'VA-API (Linux)',
      hevcEncoder: 'hevc_vaapi',
      vp9Encoder: 'vp9_vaapi',
      hwaccelFlag: 'vaapi',
      hwaccelOutputFormat: 'vaapi',
      scaleFilter: 'scale_vaapi',
    },
    videotoolbox: {
      method: 'videotoolbox',
      displayName: 'VideoToolbox (macOS)',
      hevcEncoder: 'hevc_videotoolbox',
      vp9Encoder: 'libvpx-vp9', // macOS doesn't have VP9 HW encoder
      hwaccelFlag: 'videotoolbox',
      hwaccelOutputFormat: 'videotoolbox_vld',
      scaleFilter: 'scale',
    },
  };

const SOFTWARE_CONFIG: HWAccelInfo = {
  method: 'software',
  displayName: 'Software (CPU)',
  hevcEncoder: 'libx265',
  vp9Encoder: 'libvpx-vp9',
  scaleFilter: 'scale',
};

async function getAvailableHWAccels(): Promise<string[]> {
  try {
    const output = await $`ffmpeg -hwaccels`.text();
    const lines = output.split('\n');
    // Skip the header line "Hardware acceleration methods:"
    return lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

async function getAvailableEncoders(): Promise<string[]> {
  try {
    const output = await $`ffmpeg -encoders`.text();
    return output.split('\n').map((l) => l.trim());
  } catch {
    return [];
  }
}

async function hasEncoder(encoders: string[], name: string): Promise<boolean> {
  return encoders.some((line) => line.includes(name));
}

export async function detectHWAcceleration(): Promise<HWAccelInfo[]> {
  const available: HWAccelInfo[] = [];

  const [hwAccels, encoders] = await Promise.all([
    getAvailableHWAccels(),
    getAvailableEncoders(),
  ]);

  // Check NVIDIA
  if (
    hwAccels.includes('cuda') &&
    (await hasEncoder(encoders, 'hevc_nvenc'))
  ) {
    available.push(HW_ACCEL_CONFIGS.nvidia);
  }

  // Check Intel QSV
  if (hwAccels.includes('qsv') && (await hasEncoder(encoders, 'hevc_qsv'))) {
    available.push(HW_ACCEL_CONFIGS.qsv);
  }

  // Check AMD AMF (Windows)
  if (
    (hwAccels.includes('d3d11va') || hwAccels.includes('dxva2')) &&
    (await hasEncoder(encoders, 'hevc_amf'))
  ) {
    available.push(HW_ACCEL_CONFIGS.amf);
  }

  // Check VAAPI (Linux)
  if (
    hwAccels.includes('vaapi') &&
    (await hasEncoder(encoders, 'hevc_vaapi'))
  ) {
    available.push(HW_ACCEL_CONFIGS.vaapi);
  }

  // Check VideoToolbox (macOS)
  if (
    hwAccels.includes('videotoolbox') &&
    (await hasEncoder(encoders, 'hevc_videotoolbox'))
  ) {
    available.push(HW_ACCEL_CONFIGS.videotoolbox);
  }

  // Always include software fallback
  available.push(SOFTWARE_CONFIG);

  return available;
}

export function getSoftwareAccel(): HWAccelInfo {
  return SOFTWARE_CONFIG;
}
