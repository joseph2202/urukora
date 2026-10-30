import { useEffect, useRef, useState } from 'react';

type Lang = 'ar' | 'en';
type Unit = 'm' | 'h' | 'd';

interface ReminderItem {
  id: number;
  message: string;
  due_at: number;
  lang: Lang;
}

interface Props {
  lang: Lang;
  initData: string;
  verified: boolean;
}

const words = {
  ar: {
    title: 'تذكيراتي',
    info: 'اكتب تذكيرك وحدد بعد شكد تريد توصلك رسالة من البوت.',
    placeholder: 'مثلاً: أراجع مشروع أوروكورا',
    after: 'ذكّرني بعد',
    minutes: 'دقيقة',
    hours: 'ساعة',
    days: 'يوم',
    add: 'إضافة تذكير',
    saved: 'انحفظ التذكير بنجاح.',
    list: 'تذكيراتي القادمة',
    reload: 'تحديث القائمة',
    empty: 'ما عندك تذكيرات معلّقة.',
    cancel: 'إلغاء',
    due: 'موعد الإرسال',
    preview: 'افتح أوروكورا من الزر الموجود تحت رسالة البوت حتى تگدر تستخدم التذكيرات.',
    expired: 'انتهت صلاحية تسجيل الدخول. أغلق التطبيق وافتحه من زر البوت حتى تتحدث بيانات الدخول.',
    invalid: 'اكتب رسالة من 1 إلى 280 حرف، وحدد مدة من دقيقة إلى 30 يوم.',
    failed: 'ما تمت العملية. تأكد من الاتصال وحاول مجدداً.',
    offline: 'التذكير يوصل بوقته فقط إذا البوت شغّال على السيرفر. إذا الماك مطفّي، راح يتأخر.',
    active: 'الحد الأقصى: 20 تذكير معلّق.',
    count: 'حرف',
    creating: 'جاري الحفظ...',
  },
  en: {
    title: 'My reminders',
    info: 'Write a message and choose when the bot should remind you.',
    placeholder: 'Example: Review my URUKORA project',
    after: 'Remind me in',
    minutes: 'minutes',
    hours: 'hours',
    days: 'days',
    add: 'Add reminder',
    saved: 'Reminder saved.',
    list: 'Upcoming reminders',
    reload: 'Refresh list',
    empty: 'No pending reminders.',
    cancel: 'Cancel',
    due: 'Scheduled for',
    preview: 'Open URUKORA using the button under the bot message to manage your reminders.',
    expired: 'Telegram login expired. Close and reopen the Mini App from the bot button.',
    invalid: 'Enter 1–280 characters and a duration between 1 minute and 30 days.',
    failed: 'Could not complete your request. Check your connection and retry.',
    offline: 'On-time delivery requires the bot server to be running. With the Mac off, reminders arrive late.',
    active: 'Up to 20 active reminders per account.',
    count: 'characters',
    creating: 'Saving...',
  },
} as const;

function makeRequestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function callApi<T>(route: string, initData: string, data: object = {}): Promise<T> {
  const response = await fetch(`/api/v1/reminders/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ init_data: initData, ...data }),
  });
  if (!response.ok) {
    const err = new Error(`API error ${response.status}`);
    err.name = response.status === 401 ? 'LoginExpired' : 'ApiError';
    throw err;
  }
  return response.json() as Promise<T>;
}

export default function RemindersPanel({ lang, initData, verified }: Props) {
  const t = words[lang];
  const [message, setMessage] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [unit, setUnit] = useState<Unit>('m');
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Reuse the same request key on a retry if the first response was lost.
  const lastRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const requestInFlight = useRef(false);

  function reportError(reason: unknown) {
    setError(reason instanceof Error && reason.name === 'LoginExpired' ? t.expired : t.failed);
  }

  async function loadItems() {
    if (!verified || !initData) return;
    setLoading(true);
    try {
      const result = await callApi<{ items: ReminderItem[] }>('list', initData);
      setItems(result.items);
      setError('');
    } catch (reason) {
      reportError(reason);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!verified || !initData) return;
    let active = true;
    callApi<{ items: ReminderItem[] }>('list', initData)
      .then(response => { if (active) setItems(response.items); })
      .catch(reason => {
        if (active) setError(
          reason instanceof Error && reason.name === 'LoginExpired' ? words[lang].expired : words[lang].failed
        );
      });
    return () => { active = false; };
  }, [verified, initData, lang]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current || !verified || !initData) return;
    const amount = Number(quantity);
    const multiplier = unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    const delay = amount * multiplier;
    if (!Number.isSafeInteger(amount) || !/^\d+$/.test(quantity) ||
        amount < 1 || delay < 60 || delay > 2592000 ||
        message.trim().length < 1 || message.trim().length > 280) {
      setError(t.invalid);
      return;
    }
    const fingerprint = JSON.stringify([message.trim(), delay, lang]);
    if (!lastRequest.current || lastRequest.current.fingerprint !== fingerprint) {
      lastRequest.current = { fingerprint, key: makeRequestKey() };
    }
    requestInFlight.current = true;
    setWorking(true);
    setSuccess('');
    setError('');
    try {
      await callApi('create', initData, {
        message: message.trim(),
        lang,
        delay_seconds: delay,
        request_key: lastRequest.current.key,
      });
      lastRequest.current = null;
      setMessage('');
      setSuccess(t.saved);
      await loadItems();
    } catch (reason) {
      reportError(reason);
    } finally {
      requestInFlight.current = false;
      setWorking(false);
    }
  }

  async function cancel(id: number) {
    if (requestInFlight.current || !verified || !initData) return;
    requestInFlight.current = true;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await callApi('cancel', initData, { reminder_id: id });
      await loadItems();
    } catch (reason) {
      reportError(reason);
    } finally {
      requestInFlight.current = false;
      setWorking(false);
    }
  }

  return <section className="studio-card reminder-panel">
    <div className="studio-intro">
      <span className="studio-emblem">◷</span>
      <div><h2>{t.title}</h2><p>{t.info}</p></div>
    </div>
    {!verified || !initData
      ? <p className="studio-hint">{t.preview}</p>
      : <>
        <form onSubmit={save} className="reminder-form">
          <textarea
            className="reminder-message" rows={3} maxLength={280}
            placeholder={t.placeholder} value={message}
            disabled={working} onChange={e => { setMessage(e.target.value); setSuccess(''); }}
            aria-label={t.title}
          />
          <div className="reminder-limit">{message.length}/280 {t.count}</div>
          <label htmlFor="reminder-amount" className="studio-label">{t.after}</label>
          <div className="reminder-duration">
            <input id="reminder-amount" type="number" min="1" max="2592000"
              inputMode="numeric" value={quantity}
              disabled={working} onChange={e => setQuantity(e.target.value)}
              aria-label={t.after}/>
            <select value={unit} disabled={working}
              onChange={e => setUnit(e.target.value as Unit)} aria-label={t.after}>
              <option value="m">{t.minutes}</option>
              <option value="h">{t.hours}</option>
              <option value="d">{t.days}</option>
            </select>
          </div>
          <p className="studio-hint">{t.active}</p>
          <button type="submit" className="primary studio-submit" disabled={working}>
            {working ? t.creating : t.add}
          </button>
        </form>
        {success && <p className="reminder-success" role="status">✓ {success}</p>}
        {error && <p className="studio-error" role="alert">{error}</p>}
        <div className="reminder-list-heading">
          <h2>{t.list} ({items.length})</h2>
          <button className="studio-download" type="button" disabled={working || loading}
            onClick={() => void loadItems()}>{loading ? '…' : t.reload}</button>
        </div>
        {items.length === 0
          ? <p className="studio-hint">{t.empty}</p>
          : <div className="reminder-items">{items.map(item =>
            <div className="reminder-item" key={item.id}>
              <div className="reminder-body">
                <strong dir="auto">{item.message}</strong>
                <small>{t.due}: {new Date(item.due_at * 1000)
                  .toLocaleString(lang === 'ar' ? 'ar-IQ' : 'en-US')}</small>
              </div>
              <button type="button" disabled={working}
                onClick={() => void cancel(item.id)}>{t.cancel}</button>
            </div>
          )}</div>}
      </>}
    <p className="studio-hint reminder-disclaimer">{t.offline}</p>
  </section>;
}
