import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  parsePageSelection, validatePdfFiles, validateImage, formatBytes,
  mergePdfs, extractPdfPages,
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
    const four = Array.from({ length: 4 }, (_, i) => ({
      name: `x${i}.pdf`, type: 'application/pdf', size: PDF_MAX_FILE_BYTES,
    } as File));
    expect(four.reduce((s, x) => s + x.size, 0)).toBeGreaterThan(PDF_MAX_TOTAL_BYTES);
    expect(() => validatePdfFiles(four, 'merge')).toThrow();
  });
  it('restricts images to known types', () => {
    expect(() => validateImage(file('a.png', 'image/png'))).not.toThrow();
    expect(() => validateImage(file('a.svg', 'image/svg+xml'))).toThrow();
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});


describe('real PDF transformations', () => {
  async function makeDocument(name: string, pages: number): Promise<File> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
    const bytes = await doc.save();
    return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
  }

  it('merges actual PDFs then loads the output successfully', async () => {
    const [first, second] = await Promise.all([
      makeDocument('one.pdf', 1), makeDocument('two.pdf', 2),
    ]);
    const merged = await mergePdfs([first, second]);
    expect(merged.pages).toBe(3);
    const result = await PDFDocument.load(await merged.blob.arrayBuffer());
    expect(result.getPageCount()).toBe(3);
  });

  it('extracts requested pages from a real PDF in the chosen order', async () => {
    const input = await makeDocument('source.pdf', 4);
    const output = await extractPdfPages(input, '4,2-3');
    expect(output.pages).toBe(3);
    const document = await PDFDocument.load(await output.blob.arrayBuffer());
    expect(document.getPageCount()).toBe(3);
  });

  it('rejects files claiming to be PDF without the PDF signature', async () => {
    await expect(extractPdfPages(file('fake.pdf'), '1')).rejects.toThrow('not a valid PDF');
  });
});
