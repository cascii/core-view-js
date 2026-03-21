import {FrameColors} from './color';

export interface ProjectDetails {
  version?: string;
  frames?: number;
  luminance?: number;
  font_ratio?: number;
  columns?: number;
  fps?: number;
  output?: string;
  audio?: boolean;
  background_color?: string;
  color?: string;
}

export function parseDetailsToml(s: string): ProjectDetails {
  const details: ProjectDetails = {};

  for (const line of s.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip quotes from string values
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case 'version':          details.version = value; break;
      case 'frames':           details.frames = parseInt(value, 10); break;
      case 'luminance':        details.luminance = parseInt(value, 10); break;
      case 'font_ratio':       details.font_ratio = parseFloat(value); break;
      case 'columns':          details.columns = parseInt(value, 10); break;
      case 'fps':              details.fps = parseInt(value, 10); break;
      case 'output':           details.output = value; break;
      case 'audio':            details.audio = value === 'true'; break;
      case 'background_color': details.background_color = value; break;
      case 'color':            details.color = value; break;
    }
  }

  return details;
}

export function detailsFrameColors(details: ProjectDetails): FrameColors {
  return FrameColors.fromStrings(details.color ?? 'white', details.background_color ?? 'black');
}
