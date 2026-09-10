import { LiveBadge } from "@/components/LiveBadge";
import { Nav } from "@/components/Nav";
import { LocaleToggle } from "@/components/LocaleToggle";
import { getT } from "@/lib/i18n-server";

// Layout for the password-gated pages. It renders the header, which loads the gateway client (and
// therefore the demo key). Public pages sit outside this group and never load it.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <>
      <header className="px-6 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
        <div className="flex items-center gap-4">
          <div className="font-semibold">{t("brand.name")} <span className="muted font-normal">· {t("brand.live")}</span></div>
          <Nav />
        </div>
        <div className="flex items-center gap-3">
          <LocaleToggle />
          <LiveBadge />
        </div>
      </header>
      <main className="px-6 py-5 max-w-6xl mx-auto">{children}</main>
      <footer className="px-6 py-6 muted text-xs">{t("footer.note")}</footer>
    </>
  );
}
