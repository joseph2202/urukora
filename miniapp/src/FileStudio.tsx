import { useState } from 'react';
import {
  downloadBlob, extractPdfPages, formatBytes, mergePdfs, processImage,
  validateImage, validatePdfFiles,
  type ImageOutput,
} from './fileOps';

export type FileActivity = {
  kind: 'pdf-merge' | 'pdf-extract' | 'image-convert';
  bytes: number;
  pages?: number;
};

interface Props {
  lang: 'ar' | 'en';
  tool: 'pdf' | 'images';
  onComplete: (result: FileActivity) => void;
}

const tr = {
  ar: {
    privacy: 'خصوصيتك أولاً: الملفات تنعالج داخل جهازك، بدون رفعها للسيرفر.',
    pdfTitle: 'استوديو PDF',
    imageTitle: 'استوديو الصور',
    merge: 'دمج PDF', extract: 'استخراج صفحات',
    chooseMerge: 'اختار ملفين إلى خمسة ملفات PDF بالترتيب المطلوب',
    chooseExtract: 'اختار ملف PDF واحد',
    picked: 'الملفات المختارة',
    pagesLabel: 'الصفحات المطلوبة',
    pagesHint: 'مثال: 1-3,5,8 — الأرقام تبدأ من 1.',
    mergeGo: 'دمج الملفات', extractGo: 'استخراج الصفحات',
    processing: 'جاري المعالجة...', complete: 'اكتملت العملية!',
    download: 'تنزيل الملف مرة ثانية',
    noFile: 'اختار الملفات أولاً.',
    pdfError: 'تعذرت معالجة PDF. تأكد أن الملف صالح وغير مشفّر وأن الحجم ضمن الحدود.',
    imageError: 'تعذر فتح أو تحويل الصورة. جرّب صيغة JPG أو PNG أو WebP.',
    max: 'حد الملف الواحد 12MB، والمجموع 36MB، وبحد أقصى 200 صفحة.',
    chooseImage: 'اختار صورة JPG أو PNG أو WebP (حد 12MB)',
    outputType: 'صيغة النتيجة', maxSize: 'أطول ضلع للصورة', quality: 'الجودة',
    convert: 'تحويل الصورة', sizeResult: 'حجم الملف الناتج',
    imageHint: 'الصورة المتحركة تتحول لإطار واحد؛ JPEG يحوّل الخلفية الشفافة إلى أبيض.',
    invalid: 'تحقق من الملفات أو الأرقام المدخلة.',
  },
  en: {
    privacy: 'Private by design: files are processed on your device, never uploaded to our server.',
    pdfTitle: 'PDF Studio',
    imageTitle: 'Image Studio',
    merge: 'Merge PDFs', extract: 'Extract pages',
    chooseMerge: 'Choose 2–5 PDFs in the intended order',
    chooseExtract: 'Choose one PDF',
    picked: 'Selected files',
    pagesLabel: 'Pages to extract',
    pagesHint: 'Example: 1-3,5,8 — pages start at 1.',
    mergeGo: 'Merge documents', extractGo: 'Extract pages',
    processing: 'Processing...', complete: 'Done!',
    download: 'Download again',
    noFile: 'Select your files first.',
    pdfError: 'Unable to process PDF. Check the format, encryption, and size limits.',
    imageError: 'Unable to open or convert the image. Use JPG, PNG or WebP.',
    max: 'Max 12MB per PDF, 36MB total, up to 200 resulting pages.',
    chooseImage: 'Select a JPG, PNG or WebP image (12MB max)',
    outputType: 'Output format', maxSize: 'Longest image edge', quality: 'Quality',
    convert: 'Convert image', sizeResult: 'Output file size',
    imageHint: 'Animated images become one frame; JPEG flattens transparency onto white.',
    invalid: 'Please check the files and entered values.',
  },
};

function errorMessage(e: unknown, lang: 'ar' | 'en', category: 'pdf' | 'image'): string {
  if (lang === 'en' && e instanceof Error) return e.message;
  return category === 'pdf' ? tr[lang].pdfError : tr[lang].imageError;
}

function PdfStudio({ lang, onComplete }: Omit<Props, 'tool'>) {
  const t = tr[lang];
  const [mode, setMode] = useState<'merge' | 'extract'>('merge');
  const [files, setFiles] = useState<File[]>([]);
  const [selection, setSelection] = useState('1-3');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<{ blob: Blob; filename: string; pages: number } | null>(null);

  function reset(nextMode: 'merge' | 'extract') {
    if (working) return;
    setMode(nextMode);
    setFiles([]);
    setFinished(null);
    setError('');
  }

  async function run() {
    if (working) return;
    setError('');
    setFinished(null);
    setWorking(true);
    try {
      validatePdfFiles(files, mode);
      const result = mode === 'merge'
        ? await mergePdfs(files)
        : await extractPdfPages(files[0], selection);
      const filename = mode === 'merge' ? 'urukora-merged.pdf' : 'urukora-extracted.pdf';
      setFinished({ ...result, filename });
      downloadBlob(result.blob, filename);
      onComplete({ kind: mode === 'merge' ? 'pdf-merge' : 'pdf-extract',
        pages: result.pages, bytes: result.blob.size });
    } catch (err) {
      setError(errorMessage(err, lang, 'pdf'));
    } finally {
      setWorking(false);
    }
  }

  return <section className="studio-card">
    <div className="studio-intro"><span className="studio-emblem">▤</span><div>
      <h2>{t.pdfTitle}</h2><p>{t.privacy}</p>
    </div></div>
    <div className="studio-toggle" role="group" aria-label={t.pdfTitle}>
      <button type="button" className={mode === 'merge' ? 'selected' : ''}
        onClick={() => reset('merge')} disabled={working}>{t.merge}</button>
      <button type="button" className={mode === 'extract' ? 'selected' : ''}
        onClick={() => reset('extract')} disabled={working}>{t.extract}</button>
    </div>
    <label className="studio-label" htmlFor="pdf-files">{mode === 'merge' ? t.chooseMerge : t.chooseExtract}</label>
    <input id="pdf-files" key={mode} className="studio-input" type="file"
      accept=".pdf,application/pdf" multiple={mode === 'merge'} disabled={working}
      onChange={e => { setFiles(Array.from(e.target.files ?? [])); setError(''); setFinished(null); }} />
    {files.length > 0 && <div className="studio-file-list">
      <strong>{t.picked}</strong>
      <ol>{files.map((file, i) => <li key={i} dir="auto">{file.name} <span>({formatBytes(file.size)})</span></li>)}</ol>
    </div>}
    {mode === 'extract' && <>
      <label htmlFor="page-range" className="studio-label">{t.pagesLabel}</label>
      <input className="studio-text-input" id="page-range" inputMode="text" dir="ltr"
        value={selection} onChange={e => { setSelection(e.target.value); setFinished(null); }}
        placeholder="1-3,5,8" maxLength={120} disabled={working}/>
      <p className="studio-hint">{t.pagesHint}</p>
    </>}
    <p className="studio-hint">{t.max}</p>
    <button type="button" className="primary studio-submit" disabled={working || !files.length}
      onClick={run}>{working ? t.processing : mode === 'merge' ? t.mergeGo : t.extractGo}</button>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {finished && <div className="studio-success" role="status">
      <strong>✓ {t.complete}</strong>
      <span>{finished.pages} {lang === 'ar' ? 'صفحة' : 'pages'} • {formatBytes(finished.blob.size)}</span>
      <button type="button" className="studio-download" onClick={() => downloadBlob(finished.blob, finished.filename)}>{t.download}</button>
    </div>}
  </section>;
}

function ImageStudio({ lang, onComplete }: Omit<Props, 'tool'>) {
  const t = tr[lang];
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<ImageOutput>('image/jpeg');
  const [maxDimension, setMaxDimension] = useState(1920);
  const [quality, setQuality] = useState(82);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<{ blob: Blob; filename: string } | null>(null);

  async function run() {
    if (working || !file) return;
    setWorking(true);
    setFinished(null);
    setError('');
    try {
      validateImage(file);
      const blob = await processImage(file, {
        format: output, maxDimension, quality: quality / 100,
      });
      const extension = output === 'image/jpeg' ? 'jpg' : output === 'image/png' ? 'png' : 'webp';
      const filename = `urukora-image.${extension}`;
      setFinished({ blob, filename });
      downloadBlob(blob, filename);
      onComplete({ kind: 'image-convert', bytes: blob.size });
    } catch (err) {
      setError(errorMessage(err, lang, 'image'));
    } finally {
      setWorking(false);
    }
  }

  return <section className="studio-card">
    <div className="studio-intro"><span className="studio-emblem">▧</span><div>
      <h2>{t.imageTitle}</h2><p>{t.privacy}</p>
    </div></div>
    <label className="studio-label" htmlFor="image-file">{t.chooseImage}</label>
    <input id="image-file" className="studio-input" type="file" accept="image/jpeg,image/png,image/webp"
      disabled={working} onChange={e => { setFile(e.target.files?.[0] ?? null); setFinished(null); setError(''); }}/>
    {file && <div className="studio-file-list" dir="auto">{file.name} ({formatBytes(file.size)})</div>}
    <div className="studio-fields">
      <label className="studio-label" htmlFor="output-format">{t.outputType}
        <select id="output-format" value={output} disabled={working}
          onChange={e => { setOutput(e.target.value as ImageOutput); setFinished(null); }}>
          <option value="image/jpeg">JPG</option>
          <option value="image/png">PNG</option>
          <option value="image/webp">WebP</option>
        </select>
      </label>
      <label className="studio-label" htmlFor="output-dimension">{t.maxSize}
        <select id="output-dimension" value={maxDimension} disabled={working}
          onChange={e => { setMaxDimension(Number(e.target.value)); setFinished(null); }}>
          <option value={640}>640 px</option>
          <option value={1280}>1280 px</option>
          <option value={1920}>1920 px</option>
          <option value={2560}>2560 px</option>
        </select>
      </label>
    </div>
    <label className="studio-label" htmlFor="image-quality">{t.quality}: {quality}%</label>
    <input className="studio-range" id="image-quality" type="range" min="50" max="100" step="1"
      value={quality} disabled={working || output === 'image/png'}
      onChange={e => { setQuality(Number(e.target.value)); setFinished(null); }}/>
    <p className="studio-hint">{t.imageHint}</p>
    <button className="primary studio-submit" type="button" disabled={working || !file}
      onClick={run}>{working ? t.processing : t.convert}</button>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {finished && <div className="studio-success" role="status">
      <strong>✓ {t.complete}</strong>
      <span>{t.sizeResult}: {formatBytes(finished.blob.size)}</span>
      <button type="button" className="studio-download" onClick={() => downloadBlob(finished.blob, finished.filename)}>{t.download}</button>
    </div>}
  </section>;
}

export default function FileStudio({ lang, tool, onComplete }: Props) {
  return tool === 'pdf'
    ? <PdfStudio lang={lang} onComplete={onComplete}/>
    : <ImageStudio lang={lang} onComplete={onComplete}/>;
}
