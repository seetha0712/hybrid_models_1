"use client";
import { useRouter } from "next/navigation";
import { useLocale, setLocaleCookie, type Locale } from "@/lib/i18n";

export function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pick = (l: Locale) => {
    if (l === locale) return;
    setLocaleCookie(l);
    document.documentElement.lang = l;
    router.refresh();
  };
  const base = { padding: "0.15rem 0.55rem", borderRadius: 6, fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)" } as const;
  const on = { ...base, background: "var(--series-1)", color: "#fff", borderColor: "var(--series-1)" } as const;
  const off = { ...base, background: "var(--surface-1)", color: "var(--text-secondary)" } as const;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      <button onClick={() => pick("en")} style={locale === "en" ? on : off} aria-pressed={locale === "en"}>EN</button>
      <button onClick={() => pick("ja")} style={locale === "ja" ? on : off} aria-pressed={locale === "ja"}>日本語</button>
    </div>
  );
}
