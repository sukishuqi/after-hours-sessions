'use client';
import { useSyncExternalStore } from 'react';
import { translations } from './translations';
let language: 'zh' | 'en' = 'zh';
const subscribers = new Set<() => void>();
function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
function snapshot() {
  return language;
}
function switchLanguage(lang: 'zh' | 'en') {
  language = lang;
  try {
    localStorage.setItem('ah-language', lang);
  } catch {}
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  subscribers.forEach((fn) => fn());
}
if (typeof window !== 'undefined') {
  try {
    language = localStorage.getItem('ah-language') === 'en' ? 'en' : 'zh';
  } catch {}
}
export function translate(zh: string, en?: string) {
  return language === 'en' ? en || translations[zh] || zh : zh;
}
export function useLocale() {
  const lang = useSyncExternalStore(subscribe, snapshot, () => 'zh' as const);
  return {
    lang,
    t: (zh: string, en?: string) =>
      lang === 'en' ? en || translations[zh] || zh : zh,
  };
}
export function LanguageSwitch() {
  const { lang } = useLocale();
  return (
    <div className="language" aria-label="Language / 语言">
      <button
        type="button"
        aria-pressed={lang === 'zh'}
        onClick={() => switchLanguage('zh')}
      >
        中文
      </button>
      <span>/</span>
      <button
        type="button"
        aria-pressed={lang === 'en'}
        onClick={() => switchLanguage('en')}
      >
        EN
      </button>
    </div>
  );
}
