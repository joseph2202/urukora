import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import FileStudio, { type FileActivity } from './FileStudio';
import { formatBytes } from './fileOps';
import RemindersPanel from './RemindersPanel';

type Lang = 'ar' | 'en';
type Tab = 'home' | 'tools' | 'activity' | 'settings' | 'reminders';
type Tool = 'qr' | 'pdf' | 'images';
type ActivityItem = FileActivity & { id: number; at: number };
const HISTORY_KEY = 'urukora-local-activity-v2';

const translations = {
  ar: {
    tagline: 'جذور عريقة. إمكانيات بلا حدود.', welcome: 'كل أدواتك، بمكان واحد.',
    description: 'مساحة عمل ذكية داخل تيليجرام. سهلة، سريعة، وبلغتك.',
    services: 'خدمات أوروكورا', home: 'الرئيسية', tools: 'الأدوات', activity: 'النشاط',
    settings: 'الإعدادات', qr: 'إنشاء QR', qrDesc: 'حوّل أي نص أو رابط إلى رمز QR.',
    pdf: 'استوديو PDF', pdfDesc: 'دمج الملفات واستخراج صفحاتها على جهازك.',
    images: 'استوديو الصور', imageDesc: 'تحويل الصور وتغيير حجمها وضغطها.',
    reminders: 'التذكيرات', remindersDesc: 'أنشئ ونظّم تذكيراتك من داخل التطبيق.',
    reminderIntro: 'تگدر تنشئ وتلغي تذكيراتك من المحادثة الخاصة مع أوروكورا.',
    reminderExample: 'مثال لإنشاء تذكير بعد 10 دقائق:',
    reminderList: 'عرض التذكيرات المعلّقة:',
    reminderCancel: 'إلغاء تذكير برقم معيّن:',
    reminderNotice: 'حتى توصلك التذكيرات بوقتها لازم يكون البوت شغّال. إذا الماك مطفّي، تتأخر إلى أن ترجع تشغّله. الأوامر حالياً عبر المحادثة، مو الواجهة.',
    channels: 'إدارة القنوات', channelsDesc: 'جدولة المنشورات — قريباً',
    soon: 'قريباً', qrPlaceholder: 'اكتب نصاً أو رابطاً هنا...',
    generate: 'إنشاء الرمز', download: 'تنزيل PNG', qrRequired: 'اكتب نصاً أولاً.',
    qrError: 'تعذر إنشاء الرمز.',
    verified: 'متصل بتيليجرام', preview: 'وضع المعاينة المحلية', pending: 'جاري التحقق من الحساب...',
    authError: 'فشل التحقق. افتح التطبيق من الزر تحت رسالة البوت.',
    emptyActivity: 'ماكو عمليات محفوظة لحد الآن. جرّب إحدى أدوات الملفات.',
    activityNote: 'هذا سجل محلي للعمليات فقط؛ ما نخزن محتويات ملفاتك.',
    clearHistory: 'مسح السجل',
    mergeActivity: 'دمج PDF', extractActivity: 'استخراج صفحات PDF', imageActivity: 'تحويل صورة',
    language: 'لغة التطبيق',
    privacy: 'رمز QR والملفات تنعالج محلياً على جهازك. ما نرفع محتواها لخادمنا.',
    v: 'نسخة تجريبية 0.4',
  },
  en: {
    tagline: 'Ancient roots. Infinite possibilities.', welcome: 'Every tool. One workspace.',
    description: 'A smart, fast and friendly workspace inside Telegram.',
    services: 'URUKORA tools', home: 'Home', tools: 'Tools', activity: 'Activity',
    settings: 'Settings', qr: 'QR generator', qrDesc: 'Turn any text or URL into a QR code.',
    pdf: 'PDF Studio', pdfDesc: 'Merge PDFs or extract pages privately.',
    images: 'Image Studio', imageDesc: 'Resize and convert your images.',
    reminders: 'Reminders', remindersDesc: 'Create and manage reminders inside the app.',
    reminderIntro: 'Create, list and cancel your reminders in URUKORA’s private bot chat.',
    reminderExample: 'Example: remind me in 10 minutes:',
    reminderList: 'Show pending reminders:',
    reminderCancel: 'Cancel a reminder by its ID:',
    reminderNotice: 'The bot must be running for on-time delivery. If the Mac is off, delivery waits until restart. Commands work in the bot chat for now, not in this panel.',
    channels: 'Channel manager', channelsDesc: 'Schedule posts — coming soon',
    soon: 'Soon', qrPlaceholder: 'Type text or a URL...',
    generate: 'Generate QR', download: 'Download PNG', qrRequired: 'Enter text first.',
    qrError: 'Could not generate a QR code.',
    verified: 'Connected to Telegram', preview: 'Local preview mode', pending: 'Verifying Telegram account...',
    authError: 'Verification failed. Open the App from the button below the bot message.',
    emptyActivity: 'No local operations saved yet. Try a file tool.',
    activityNote: 'Only local operation metadata is saved; file contents are never stored.',
    clearHistory: 'Clear history',
    mergeActivity: 'Merged PDFs', extractActivity: 'Extracted PDF pages', imageActivity: 'Converted image',
    language: 'App language',
    privacy: 'QR codes and files are processed on this device. Their contents are not uploaded.',
    v: 'Preview v0.4',
  },
};

const API_BASE = ''; // Relative /api: same HTTPS origin, or proxied by Vite locally.

function loadHistory(): ActivityItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (Array.isArray(stored)) return stored.slice(0, 20);
  } catch { /* localStorage may be restricted by the webview */ }
  return [];
}

export default function App() {
  const tg = window.Telegram?.WebApp;
  const guessedLanguage: Lang = tg?.initDataUnsafe?.user?.language_code?.startsWith('ar') ? 'ar' : 'en';
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem('urukora-language');
      if (stored === 'ar' || stored === 'en') return stored;
    } catch { /* some browsers disable localStorage */ }
    return guessedLanguage;
  });
  const [tab, setTab] = useState<Tab>('home');
  const [selectedTool, setSelectedTool] = useState<Tool>('qr');
  const [auth, setAuth] = useState<'preview' | 'pending' | 'verified' | 'error'>(tg?.initData ? 'pending' : 'preview');
  const [qrText, setQrText] = useState('https://t.me/');
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [history, setHistory] = useState<ActivityItem[]>(loadHistory);
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('urukora-language', lang); } catch { /* ignore */ }
  }, [lang]);

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
  }, [history]);

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    if (!tg?.initData) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: tg.initData }),
    })
      .then(r => { if (!r.ok) throw new Error('Verification failed'); return r.json(); })
      .then(() => { if (!cancelled) setAuth('verified'); })
      .catch(() => { if (!cancelled) setAuth('error'); });
    return () => { cancelled = true; };
  }, []);

  function navigateTo(tool: Tool) {
    setSelectedTool(tool);
    setTab('tools');
  }

  function addActivity(result: FileActivity) {
    // Only basic metadata is stored on this device, not filenames or file bytes.
    setHistory(current => [{ ...result, at: Date.now(), id: Date.now() + Math.random() },
      ...current].slice(0, 20));
  }

  async function makeQR() {
    setQrError('');
    if (!qrText.trim()) {
      setQrError(t.qrRequired);
      return;
    }
    try {
      setQrUrl(await QRCode.toDataURL(qrText, {
        width: 360, margin: 2, errorCorrectionLevel: 'M',
        color: { dark: '#101827', light: '#ffffff' },
      }));
    } catch {
      setQrError(t.qrError);
    }
  }

  const services: {
    id: Tool | 'reminders' | 'channels';
    icon: string;
    label: string;
    desc: string;
    ready: boolean;
  }[] = [
    { id: 'pdf', icon: '▤', label: t.pdf, desc: t.pdfDesc, ready: true },
    { id: 'images', icon: '▧', label: t.images, desc: t.imageDesc, ready: true },
    { id: 'qr', icon: '▦', label: t.qr, desc: t.qrDesc, ready: true },
    { id: 'reminders', icon: '◷', label: t.reminders, desc: t.remindersDesc, ready: true },
    { id: 'channels', icon: '◉', label: t.channels, desc: t.channelsDesc, ready: false },
  ];
  const nav: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: t.home, icon: '⌂' },
    { id: 'tools', label: t.tools, icon: '▦' },
    { id: 'activity', label: t.activity, icon: '◷' },
    { id: 'settings', label: t.settings, icon: '⚙' },
  ];

  return <div className="shell">
    <header className="header">
      <div className="mark" aria-hidden="true">U</div>
      <div className="brand"><strong>URUKORA</strong><span>أوروكورا</span></div>
      <span className="header-meta">v0.4</span>
    </header>
    <main>
      {auth === 'verified' && <div className="status success">● {t.verified}</div>}
      {auth === 'preview' && <div className="status preview">○ {t.preview}</div>}
      {auth === 'pending' && <div className="status preview">◌ {t.pending}</div>}
      {auth === 'error' && <div className="status error">● {t.authError}</div>}
      {tab === 'home' && <>
        <section className="hero">
          <div className="eyebrow">{t.tagline}</div>
          <h1>{t.welcome}</h1><p>{t.description}</p>
          <button type="button" className="primary" onClick={() => setTab('tools')}>{t.tools} <span>←</span></button>
        </section>
        <h2>{t.services}</h2>
        <div className="service-grid">{services.map(s => <button type="button" key={s.id}
          className="service" disabled={!s.ready} onClick={() => { if (s.id === 'reminders') setTab('reminders'); else if (s.ready) navigateTo(s.id as Tool); }}>
          <span className="service-icon">{s.icon}</span><strong>{s.label}</strong>
          <small>{s.desc}</small>{!s.ready && <em>{t.soon}</em>}
        </button>)}</div>
      </>}
      {tab === 'tools' && <>
        <h1 className="section-title">{t.tools}</h1>
        <div className="tool-selector" role="group" aria-label={t.tools}>
          <button className={selectedTool === 'qr' ? 'active' : ''} onClick={() => setSelectedTool('qr')}>{t.qr}</button>
          <button className={selectedTool === 'pdf' ? 'active' : ''} onClick={() => setSelectedTool('pdf')}>{t.pdf}</button>
          <button className={selectedTool === 'images' ? 'active' : ''} onClick={() => setSelectedTool('images')}>{t.images}</button>
        </div>
        {selectedTool === 'qr' && <section className="tool-card">
          <div className="tool-heading"><span className="service-icon">▦</span><div><h2>{t.qr}</h2><p>{t.qrDesc}</p></div></div>
          <textarea value={qrText} onChange={e => { setQrText(e.target.value); setQrUrl(''); }}
            maxLength={1000} rows={3} placeholder={t.qrPlaceholder}/>
          <button className="primary" onClick={makeQR}>{t.generate}</button>
          {qrError && <p className="error-text">{qrError}</p>}
          {qrUrl && <div className="qr-result"><img src={qrUrl} alt="Generated QR"/>
            <a className="secondary" href={qrUrl} download="urukora-qr.png">{t.download}</a></div>}
          <p className="studio-hint">{t.privacy}</p>
        </section>}
        {(selectedTool === 'pdf' || selectedTool === 'images') &&
          <FileStudio lang={lang} tool={selectedTool} onComplete={addActivity}/>}
      </>}
      {tab === 'reminders' && <>
        <h1 className="section-title">{t.reminders}</h1>
        <RemindersPanel lang={lang} initData={tg?.initData ?? ''} verified={auth === 'verified'} />
      </>}
      {tab === 'activity' && <>
        <h1 className="section-title">{t.activity}</h1>
        <p className="studio-hint">{t.activityNote}</p>
        {history.length === 0
          ? <div className="empty">◷<p>{t.emptyActivity}</p></div>
          : <>
            <button className="activity-clear" onClick={() => setHistory([])}>{t.clearHistory}</button>
            {history.map(item => <div className="activity-item" key={item.id}>
              <div><strong>{item.kind === 'pdf-merge' ? t.mergeActivity
                : item.kind === 'pdf-extract' ? t.extractActivity : t.imageActivity}</strong>
                <div><small>{new Date(item.at).toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-US')}</small></div>
              </div>
              <span>{formatBytes(item.bytes)}</span>
            </div>)}
          </>}
      </>}
      {tab === 'settings' && <>
        <h1 className="section-title">{t.settings}</h1>
        <section className="tool-card"><h2>{t.language}</h2>
          <div className="switch-row">
            <button className={lang === 'ar' ? 'chosen' : ''} onClick={() => setLang('ar')}>العربية</button>
            <button className={lang === 'en' ? 'chosen' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </section>
        <p className="privacy">{t.privacy}</p>
        <p className="studio-hint">{t.v}</p>
      </>}
    </main>
    <nav className="bottom-nav" aria-label="Navigation">{nav.map(item =>
      <button key={item.id} className={tab === item.id ? 'active' : ''}
        onClick={() => setTab(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}
    </nav>
  </div>;
}
