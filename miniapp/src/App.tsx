import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Lang = 'ar' | 'en';
type Tab = 'home' | 'tools' | 'activity' | 'settings';

const translations = {
  ar: {
    tagline: 'جذور عريقة. إمكانيات بلا حدود.', welcome: 'كل أدواتك، بمكان واحد.',
    description: 'مساحة عمل ذكية داخل تيليجرام. سهلة، سريعة، وبلغتك.',
    services: 'خدمات أوروكورا', home: 'الرئيسية', tools: 'الأدوات', activity: 'النشاط',
    settings: 'الإعدادات', qr: 'إنشاء QR', qrDesc: 'حوّل أي نص أو رابط إلى رمز QR.',
    pdf: 'ملفات PDF', pdfDesc: 'معالجة الملفات — قريباً',
    reminders: 'التذكيرات', remindersDesc: 'تنظيم مهامك — قريباً',
    channels: 'إدارة القنوات', channelsDesc: 'جدولة المنشورات — قريباً',
    soon: 'قريباً', qrPlaceholder: 'اكتب نصاً أو رابطاً هنا...',
    generate: 'إنشاء الرمز', download: 'تنزيل PNG',
    verified: 'متصل بتيليجرام', preview: 'وضع المعاينة المحلية',
    authError: 'فشل التحقق. افتح التطبيق من البوت وجرب مرة ثانية.',
    emptyActivity: 'ماكو عمليات محفوظة حالياً. سجل النشاط راح نفعّله بالمرحلة القادمة.',
    language: 'لغة التطبيق', privacy: 'رمز QR يُنشأ محلياً على جهازك ولا يُرسل محتواه للخادم.',
  },
  en: {
    tagline: 'Ancient roots. Infinite possibilities.', welcome: 'Every tool. One workspace.',
    description: 'A smart, fast and friendly workspace inside Telegram.',
    services: 'URUKORA tools', home: 'Home', tools: 'Tools', activity: 'Activity',
    settings: 'Settings', qr: 'QR generator', qrDesc: 'Turn any text or URL into a QR code.',
    pdf: 'PDF tools', pdfDesc: 'File processing — coming soon',
    reminders: 'Reminders', remindersDesc: 'Organize your day — coming soon',
    channels: 'Channel manager', channelsDesc: 'Schedule posts — coming soon',
    soon: 'Soon', qrPlaceholder: 'Type text or a URL...',
    generate: 'Generate QR', download: 'Download PNG',
    verified: 'Connected to Telegram', preview: 'Local preview mode',
    authError: 'Telegram verification failed. Reopen this app through the bot.',
    emptyActivity: 'No operations saved yet. Activity history is planned for the next phase.',
    language: 'App language', privacy: 'QR input remains on your device; generation is local.',
  },
};

// Relative URL: Vite dev mode proxies /api to FastAPI; production uses one HTTPS origin.
const API_BASE = '';

export default function App() {
  const tg = window.Telegram?.WebApp;
  const guessedLanguage: Lang = tg?.initDataUnsafe?.user?.language_code?.startsWith('ar') ? 'ar' : 'en';
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('urukora-language');
    return stored === 'ar' || stored === 'en' ? stored : guessedLanguage;
  });
  const [tab, setTab] = useState<Tab>('home');
  const [auth, setAuth] = useState<'preview' | 'pending' | 'verified' | 'error'>(tg?.initData ? 'pending' : 'preview');
  const [qrText, setQrText] = useState('https://t.me/');
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('urukora-language', lang);
  }, [lang]);

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

  async function makeQR() {
    setQrError('');
    if (!qrText.trim()) {
      setQrError(lang === 'ar' ? 'اكتب النص أولاً.' : 'Enter text first.');
      return;
    }
    try {
      setQrUrl(await QRCode.toDataURL(qrText, {
        width: 360, margin: 2, errorCorrectionLevel: 'M',
        color: { dark: '#101827', light: '#ffffff' },
      }));
    } catch {
      setQrError(lang === 'ar' ? 'تعذر إنشاء الرمز.' : 'Could not generate QR code.');
    }
  }

  const services = [
    { icon: '▦', label: t.qr, desc: t.qrDesc, ready: true },
    { icon: '▤', label: t.pdf, desc: t.pdfDesc, ready: false },
    { icon: '◷', label: t.reminders, desc: t.remindersDesc, ready: false },
    { icon: '◉', label: t.channels, desc: t.channelsDesc, ready: false },
  ];
  const nav: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: t.home, icon: '⌂' },
    { id: 'tools', label: t.tools, icon: '▦' },
    { id: 'activity', label: t.activity, icon: '◷' },
    { id: 'settings', label: t.settings, icon: '⚙' },
  ];

  return (
    <div className="shell">
      <header className="header">
        <div className="mark" aria-hidden="true">U</div>
        <div className="brand"><strong>URUKORA</strong><span>أوروكورا</span></div>
        <span className="header-meta">v0.1</span>
      </header>
      <main>
        {auth === 'verified' && <div className="status success">● {t.verified}</div>}
        {auth === 'preview' && <div className="status preview">○ {t.preview}</div>}
        {auth === 'error' && <div className="status error">● {t.authError}</div>}
        {tab === 'home' && <>
          <section className="hero">
            <div className="eyebrow">{t.tagline}</div>
            <h1>{t.welcome}</h1><p>{t.description}</p>
            <button className="primary" onClick={() => setTab('tools')}>{t.tools} <span>←</span></button>
          </section>
          <h2>{t.services}</h2>
          <div className="service-grid">{services.map(s => <button key={s.label} className="service" disabled={!s.ready} onClick={() => setTab('tools')}>
            <span className="service-icon">{s.icon}</span><strong>{s.label}</strong>
            <small>{s.desc}</small>{!s.ready && <em>{t.soon}</em>}
          </button>)}</div>
        </>}
        {tab === 'tools' && <>
          <h1 className="section-title">{t.tools}</h1>
          <section className="tool-card">
            <div className="tool-heading"><span className="service-icon">▦</span><div><h2>{t.qr}</h2><p>{t.qrDesc}</p></div></div>
            <textarea value={qrText} onChange={e => { setQrText(e.target.value); setQrUrl(''); }} maxLength={1000} rows={3} placeholder={t.qrPlaceholder}/>
            <button className="primary" onClick={makeQR}>{t.generate}</button>
            {qrError && <p className="error-text">{qrError}</p>}
            {qrUrl && <div className="qr-result"><img src={qrUrl} alt="Generated QR"/><a className="secondary" href={qrUrl} download="urukora-qr.png">{t.download}</a></div>}
          </section>
          <div className="service-grid muted">{services.slice(1).map(s => <div key={s.label} className="service"><span className="service-icon">{s.icon}</span><strong>{s.label}</strong><small>{s.desc}</small><em>{t.soon}</em></div>)}</div>
        </>}
        {tab === 'activity' && <><h1 className="section-title">{t.activity}</h1><div className="empty">◷<p>{t.emptyActivity}</p></div></>}
        {tab === 'settings' && <><h1 className="section-title">{t.settings}</h1><section className="tool-card"><h2>{t.language}</h2><div className="switch-row"><button className={lang === 'ar' ? 'chosen' : ''} onClick={() => setLang('ar')}>العربية</button><button className={lang === 'en' ? 'chosen' : ''} onClick={() => setLang('en')}>English</button></div></section><p className="privacy">{t.privacy}</p></>}
      </main>
      <nav className="bottom-nav" aria-label="Navigation">{nav.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
    </div>
  );
}
