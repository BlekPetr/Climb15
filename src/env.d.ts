/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Base URL of the reminder Worker, e.g. https://climb15-reminder.example.workers.dev */
  readonly VITE_REMINDER_API?: string;
}
