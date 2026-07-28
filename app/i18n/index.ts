import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";

const STORAGE_KEY = "language";

function detectLanguage(): string {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh-CN" || stored === "en") return stored;
  return navigator.language.startsWith("zh") ? "zh-CN" : "en";
}

function syncDocumentLang(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng.startsWith("zh") ? "zh-CN" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
}).then(() => {
  syncDocumentLang(i18n.language);
});

i18n.on("languageChanged", syncDocumentLang);

export function setLanguage(lng: "en" | "zh-CN") {
  localStorage.setItem(STORAGE_KEY, lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
