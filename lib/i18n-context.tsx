"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import enMessages from "../messages/en.json";
import viMessages from "../messages/vi.json";

type Locale = "vi" | "en";

const messages = {
  en: enMessages,
  vi: viMessages,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("vi");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && (saved === "vi" || saved === "en")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  };

  const t = (key: string): string => {
    const keys = key.split(".");
    let value: unknown = messages[locale];
    for (const k of keys) {
      if (value && typeof value === "object" && k in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    return typeof value === "string" ? value : key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
