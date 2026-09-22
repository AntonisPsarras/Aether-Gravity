import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const README_PATH = path.join(ROOT, 'README.md');
const MAIN_MENU_PATH = path.join(ROOT, 'docs', 'screenshots', 'main-menu.png');

const localReadmeImages = (markdown: string): string[] => {
  const markdownImages = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)]
    .map((match) => match[1]);
  const htmlImages = [...markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  return [...markdownImages, ...htmlImages]
    .filter((target) => !/^(?:https?:|data:)/i.test(target));
};

describe('repository documentation assets', () => {
  it('keeps every local README image target present', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    const images = localReadmeImages(readme);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(existsSync(path.resolve(ROOT, image)), `Missing README image: ${image}`).toBe(true);
    }
  });

  it('keeps the canonical main-menu screenshot as a 1440 by 900 PNG', () => {
    const png = readFileSync(MAIN_MENU_PATH);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(1440);
    expect(png.readUInt32BE(20)).toBe(900);
  });

  it('does not advertise missing web-manifest icons', () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8')) as {
      icons?: Array<{ src: string }>;
    };
    for (const icon of manifest.icons ?? []) {
      const relativePath = icon.src.replace(/^\/+/, '');
      expect(existsSync(path.join(ROOT, 'public', relativePath)), `Missing manifest icon: ${icon.src}`).toBe(true);
    }
  });
});
