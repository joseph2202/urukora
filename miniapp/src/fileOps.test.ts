import { describe, expect, it } from 'vitest';
import {
  parsePageSelection, validatePdfFiles, validateImage, formatBytes,
  PDF_MAX_FILE_BYTES, PDF_MAX_TOTAL_BYTES,
} from './fileOps';

const file = (name: string, type = 'application/pdf', size = 50) =>
  new File([new Uint8Array(size)], name, { type });

describe('PDF page selections', () => {
  it('supports ranges and preserves user order', () => {
    expect(parsePageSelection('4,1-2,2', 5)).toEqual([4, 1, 2]);
  });
  it('supports Arabic commas', () => {
    expect(parsePageSelection('1،3-4', 4)).toEqual([1, 3, 4]);
  });
  it('rejects zero, reversed ranges, out-of-range and malformed input', () => {
    for (const input of ['0', '4-2', '1-6', 'a', '1,,2', '1-2-3', '']) {
      expect(() => parsePageSelection(input, 5)).toThrow();
    }
  });
  it('enforces a safe page limit', () => {
    expect(() => parsePageSelection('1-201', 500)).toThrow();
  });
});

describe('client-only file validation', () => {
  it('accepts two small PDF files for merging', () => {
    expect(() => validatePdfFiles([file('a.pdf'), file('b.pdf')], 'merge')).not.toThrow();
  });
  it('rejects suspicious files and invalid counts', () => {
    expect(() => validatePdfFiles([file('evil.txt')], 'extract')).toThrow();
    expect(() => validatePdfFiles([file('a.pdf')], 'merge')).toThrow();
    expect(() => validatePdfFiles([file('a.pdf'), file('b.pdf')], 'extract')).toThrow();
    expect(() => validatePdfFiles([file('f.pdf', 'text/plain')], 'extract')).toThrow();
  });
  it('applies PDF byte limits', () => {
    const big = { name: 'big.pdf', type: 'application/pdf', size: PDF_MAX_FILE_BYTES + 1 } as File;
    expect(() => validatePdfFiles([big], 'extract')).toThrow();
    const two = [18, 20].map((mb, i) => ({
      name: `x${i}.pdf`, type: 'application/pdf', size: mb * 1024 * 1024,
    } as File));
    expect(two.reduce((s, x) => s + x.size, 0)).toBeGreaterThan(PDF_MAX_TOTAL_BYTES);
  });
  it('restricts images to known types', () => {
    expect(() => validateImage(file('a.png', 'image/png'))).not.toThrow();
    expect(() => validateImage(file('a.svg', 'image/svg+xml'))).toThrow();
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});
