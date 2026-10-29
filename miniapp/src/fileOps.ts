/**
 * Browser-only file operations. No uploads, tracking or API calls.
 * PDF processing uses pdf-lib, loaded only when a PDF operation is requested.
 */
export const PDF_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const PDF_MAX_TOTAL_BYTES = 36 * 1024 * 1024;
export const PDF_MAX_FILES = 5;
export const PDF_MAX_PAGES = 200;
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 24_000_000;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One-based PDF page numbers; keeps the user's specified order and removes duplicates. */
export function parsePageSelection(input: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('Invalid PDF page count');
  const parts = input.replace(/،/g, ',').split(',').map(v => v.trim());
  if (!parts.length || parts.some(part => !part)) throw new Error('Enter a page number or range');
  const chosen = new Set<number>();
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error('Invalid range format. Use 1-3,5');
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 1 || end < start || end > pageCount) {
      throw new Error('Page range is outside this PDF');
    }
    if (end - start + 1 > PDF_MAX_PAGES) throw new Error('Too many pages');
    for (let page = start; page <= end; page++) {
      chosen.add(page);
      if (chosen.size > PDF_MAX_PAGES) throw new Error('Too many pages');
    }
  }
  if (!chosen.size) throw new Error('No pages selected');
  return Array.from(chosen);
}

export function validatePdfFiles(files: File[], mode: 'merge' | 'extract'): void {
  if (!files.length) throw new Error('Select a PDF file');
  if (mode === 'extract' && files.length !== 1) throw new Error('Select one PDF file');
  if (mode === 'merge' && (files.length < 2 || files.length > PDF_MAX_FILES)) {
    throw new Error(`Select 2-${PDF_MAX_FILES} PDFs`);
  }
  if (files.some(file =>
    !file.name.toLowerCase().endsWith('.pdf') ||
    (file.type !== '' && file.type !== 'application/pdf') ||
    file.size === 0 || file.size > PDF_MAX_FILE_BYTES
  )) throw new Error(`Only nonempty PDFs up to ${formatBytes(PDF_MAX_FILE_BYTES)} each`);
  if (files.reduce((total, file) => total + file.size, 0) > PDF_MAX_TOTAL_BYTES) {
    throw new Error(`Combined files exceed ${formatBytes(PDF_MAX_TOTAL_BYTES)}`);
  }
}

export function validateImage(file: File): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use JPG, PNG or WebP images');
  }
  if (!file.size || file.size > IMAGE_MAX_BYTES) {
    throw new Error(`Image must be below ${formatBytes(IMAGE_MAX_BYTES)}`);
  }
}

async function pdfBytes(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // PDF signature validation avoids trusting extension or mime alone.
  const signature = String.fromCharCode(...bytes.subarray(0, 5));
  if (signature !== '%PDF-') throw new Error('This file is not a valid PDF');
  return bytes;
}

export async function mergePdfs(files: File[]): Promise<{ blob: Blob; pages: number }> {
  validatePdfFiles(files, 'merge');
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  let totalPages = 0;
  for (const file of files) {
    const source = await PDFDocument.load(await pdfBytes(file), { updateMetadata: false });
    const count = source.getPageCount();
    totalPages += count;
    if (totalPages > PDF_MAX_PAGES) throw new Error('Combined PDFs contain too many pages');
    const copies = await merged.copyPages(source, source.getPageIndices());
    for (const copy of copies) merged.addPage(copy);
  }
  const saved = await merged.save();
  return { blob: new Blob([new Uint8Array(saved)], { type: 'application/pdf' }), pages: totalPages };
}

export async function extractPdfPages(file: File, selection: string): Promise<{ blob: Blob; pages: number }> {
  validatePdfFiles([file], 'extract');
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await pdfBytes(file), { updateMetadata: false });
  const selected = parsePageSelection(selection, source.getPageCount());
  const result = await PDFDocument.create();
  const copies = await result.copyPages(source, selected.map(n => n - 1));
  for (const copy of copies) result.addPage(copy);
  const saved = await result.save();
  return { blob: new Blob([new Uint8Array(saved)], { type: 'application/pdf' }), pages: selected.length };
}

export type ImageOutput = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageOptions {
  format: ImageOutput;
  maxDimension: number;
  quality: number;
}

/** Converts a single static image without sending the pixels to a server. */
export async function processImage(file: File, options: ImageOptions): Promise<Blob> {
  validateImage(file);
  if (![640, 1280, 1920, 2560].includes(options.maxDimension) ||
      !Number.isFinite(options.quality) || options.quality < 0.5 || options.quality > 1 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(options.format)) {
    throw new Error('Invalid conversion settings');
  }
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cannot open this image'));
      image.src = sourceUrl;
    });
    const w = image.naturalWidth, h = image.naturalHeight;
    if (w < 1 || h < 1 || w * h > IMAGE_MAX_PIXELS) {
      throw new Error('Image dimensions are too large');
    }
    const scale = Math.min(1, options.maxDimension / Math.max(w, h));
    const targetWidth = Math.max(1, Math.round(w * scale));
    const targetHeight = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    // JPEG lacks transparency. White background prevents black backgrounds.
    if (options.format === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Conversion failed')),
        options.format, options.quality);
    });
    // Safari may silently fall back to PNG for unsupported output formats.
    if (blob.type !== options.format) throw new Error('Output format unsupported by this browser');
    return blob;
  } finally {
    image.src = '';
    URL.revokeObjectURL(sourceUrl);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Delay revocation for mobile browsers to complete the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
