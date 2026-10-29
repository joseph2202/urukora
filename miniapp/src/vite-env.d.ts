/// <reference types="vite/client" />

interface TelegramUserPreview {
  id: number;
  first_name?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: TelegramUserPreview };
  ready: () => void;
  expand: () => void;
  colorScheme?: 'light' | 'dark';
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}
