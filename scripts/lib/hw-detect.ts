import { $ } from 'bun';
import type { HWAccelInfo, HWAccelMethod, HybridHWAccel } from './types.js';

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
      supportsVP9HW: false,
      supportsHEVC10bit: true, // Pascal and newer
      supportsVP910bit: false, // No VP9 HW at all
    },
    qsv: {
      method: 'qsv',
      displayName: 'Intel Quick Sync',
      hevcEncoder: 'hevc_qsv',
      vp9Encoder: 'vp9_qsv', // Intel has VP9 HW on newer chips (Coffee Lake+)
      hwaccelFlag: 'qsv',
      hwaccelOutputFormat: 'qsv',
      scaleFilter: 'scale_qsv',
      supportsVP9HW: true, // Coffee Lake+ (UHD 630+)
      supportsHEVC10bit: true,
      supportsVP910bit: false, // VP9 encode is 8-bit only on Intel
    },
    amf: {
      method: 'amf',
      displayName: 'AMD AMF',
      hevcEncoder: 'hevc_amf',
      vp9Encoder: 'libvpx-vp9', // AMD doesn't have VP9 HW encoder
      hwaccelFlag: 'auto',
      hwaccelOutputFormat: 'd3d11va',
      scaleFilter: 'scale',
      supportsVP9HW: false,
      supportsHEVC10bit: true,
      supportsVP910bit: false,
    },
    vaapi: {
      method: 'vaapi',
      displayName: 'VA-API (Linux)',
      hevcEncoder: 'hevc_vaapi',
      vp9Encoder: 'vp9_vaapi',
      hwaccelFlag: 'vaapi',
      hwaccelOutputFormat: 'vaapi',
      scaleFilter: 'scale_vaapi',
      supportsVP9HW: true, // Depends on GPU, assuming modern Intel
      supportsHEVC10bit: true,
      supportsVP910bit: false,
    },
    videotoolbox: {
      method: 'videotoolbox',
      displayName: 'VideoToolbox (macOS)',
      hevcEncoder: 'hevc_videotoolbox',
      vp9Encoder: 'libvpx-vp9', // macOS doesn't have VP9 HW encoder
      hwaccelFlag: 'videotoolbox',
      hwaccelOutputFormat: 'videotoolbox_vld',
      scaleFilter: 'scale',
      supportsVP9HW: false,
      supportsHEVC10bit: true,
      supportsVP910bit: false,
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

/**
 * Build the best hybrid configuration from available HW accelerators.
 * Uses the best HW for each codec:
 * - HEVC: Prefer NVIDIA > QSV > AMF > VAAPI > VideoToolbox > Software
 * - VP9: Prefer QSV > VAAPI (HW VP9) > Software (since NVIDIA/AMD don't have VP9 HW)
 *
 * Returns null if hybrid mode doesn't provide benefit over single HW.
 */
export function buildHybridConfig(
  available: HWAccelInfo[]
): HybridHWAccel | null {
  // Find best HEVC encoder (prefer NVIDIA for quality/speed)
  const hevcPriority: HWAccelMethod[] = [
    'nvidia',
    'qsv',
    'amf',
    'vaapi',
    'videotoolbox',
    'software',
  ];

  // Find best VP9 encoder (prefer HW encoders)
  const vp9Priority: HWAccelMethod[] = ['qsv', 'vaapi', 'software'];

  let bestHevc: HWAccelInfo | null = null;
  let bestVP9: HWAccelInfo | null = null;

  // Find best HEVC encoder
  for (const method of hevcPriority) {
    const accel = available.find((a) => a.method === method);
    if (accel) {
      bestHevc = accel;
      break;
    }
  }

  // Find best VP9 encoder (only consider ones with HW VP9 support)
  for (const method of vp9Priority) {
    const accel = available.find((a) => a.method === method);
    if (accel) {
      // For VP9, prefer HW encoders
      if (accel.supportsVP9HW || accel.method === 'software') {
        bestVP9 = accel;
        break;
      }
    }
  }

  // Fallback to software for VP9 if no HW VP9 found
  if (!bestVP9) {
    bestVP9 = available.find((a) => a.method === 'software') || SOFTWARE_CONFIG;
  }

  if (!bestHevc) {
    bestHevc = SOFTWARE_CONFIG;
  }

  // Only return hybrid if different HW is used for each codec
  // AND it provides actual benefit (i.e., VP9 gets HW acceleration)
  if (bestHevc.method !== bestVP9.method && bestVP9.supportsVP9HW) {
    return {
      hevc: bestHevc,
      vp9: bestVP9,
    };
  }

  return null;
}

/**
 * Create a display-friendly HWAccelInfo for hybrid mode.
 * This is used for the HW selection UI.
 */
export function createHybridDisplayInfo(hybrid: HybridHWAccel): HWAccelInfo {
  return {
    method: 'software', // Placeholder, actual routing happens per-codec
    displayName: `Hybrid: ${hybrid.hevc.displayName} (HEVC) + ${hybrid.vp9.displayName} (VP9)`,
    hevcEncoder: hybrid.hevc.hevcEncoder,
    vp9Encoder: hybrid.vp9.vp9Encoder,
    scaleFilter: 'scale', // Will be overridden per-codec
    supportsVP9HW: hybrid.vp9.supportsVP9HW,
    supportsHEVC10bit: hybrid.hevc.supportsHEVC10bit,
    supportsVP910bit: hybrid.vp9.supportsVP910bit,
  };
}
