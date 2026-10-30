"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const CELL = 3;
const GAP = 2;
const STEP = CELL + GAP;
/** Skip cell when hash is below this — higher = sparser field */
const DOT_SKIP_THRESHOLD = 0.2;

type ThemeName = "light" | "dark";

type Rgb = [number, number, number];

type Palette = {
  bg: Rgb;
  dotLo: Rgb;
  dotHi: Rgb;
  shell: string;
};

type PaletteSource = {
  bg: Rgb;
  dotLo: string;
  dotHi: string;
  shell: string;
};

/** Neutral field + Namespace-style electric blue (#1c32ff / #1423b4) */
const PALETTE_SOURCES: Record<ThemeName, PaletteSource> = {
  light: {
    bg: [247, 247, 249],
    dotLo: "#1423b4",
    dotHi: "#1c32ff",
    shell: "#f7f7f9",
  },
  dark: {
    bg: [20, 20, 24],
    dotLo: "#1423b4",
    dotHi: "#4d68ec",
    shell: "#141418",
  },
};

let colorProbe: HTMLCanvasElement | null = null;

function colorToRgb(color: string): Rgb {
  if (!colorProbe) {
    colorProbe = document.createElement("canvas");
    colorProbe.width = 1;
    colorProbe.height = 1;
  }
  const ctx = colorProbe.getContext("2d");
  if (!ctx) return [128, 128, 128];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function resolvePalette(theme: ThemeName): Palette {
  const src = PALETTE_SOURCES[theme];
  return {
    bg: src.bg,
    dotLo: colorToRgb(src.dotLo),
    dotHi: colorToRgb(src.dotHi),
    shell: src.shell,
  };
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function hash(x: number, y: number) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function paintStaticField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
) {
  const cols = Math.ceil(width / STEP) + 1;
  const rows = Math.ceil(height / STEP) + 1;

  const [bgR, bgG, bgB] = palette.bg;
  ctx.fillStyle = `rgb(${bgR} ${bgG} ${bgB})`;
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (hash(x + 3, y + 7) < DOT_SKIP_THRESHOLD) continue;

      const brightness = 0.25 + hash(x, y) * 0.75;
      const mix = 0.15 + hash(x + 5, y + 13) * 0.85 * brightness;
      const [r, g, b] = lerpRgb(palette.dotLo, palette.dotHi, mix);
      const alpha = 0.12 + hash(x + 73, y + 11) * 0.55;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r} ${g} ${b})`;
      ctx.fillRect(x * STEP, y * STEP, CELL, CELL);
    }
  }

  ctx.globalAlpha = 1;
}

type GrainFieldProps = {
  className?: string;
};

export function GrainField({ className }: GrainFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const theme: ThemeName = resolvedTheme === "dark" ? "dark" : "light";
    const palette = resolvePalette(theme);
    shell.style.backgroundColor = palette.shell;

    let cancelled = false;

    const rebuild = () => {
      const width = shell.clientWidth;
      const height = shell.clientHeight;
      if (width < 2 || height < 2) return;

      canvas.width = width;
      canvas.height = height;
      paintStaticField(ctx, width, height, palette);
    };

    rebuild();

    const resizeObserver = new ResizeObserver(() => {
      if (!cancelled) rebuild();
    });
    resizeObserver.observe(shell);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
    };
  }, [resolvedTheme]);

  return (
    <div
      ref={shellRef}
      className={cn("relative overflow-hidden", className)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
