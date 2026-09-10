"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import type { MsgKey } from "@/lib/messages";

const items: [string, MsgKey][] = [["/", "nav.overview"], ["/spectrum", "nav.spectrum"], ["/router", "nav.router"], ["/guardrail", "nav.guardrail"], ["/batch", "nav.batch"], ["/underwrite", "nav.underwrite"], ["/extraction-scenario", "nav.extraction"], ["/architecture", "nav.architecture"], ["/research", "nav.paper"]];
export function Nav() {
  const p = usePathname();
  const t = useT();
  return <nav className="pill-nav flex gap-1">{items.map(([href, key]) => <Link key={href} href={href} aria-current={p === href ? "page" : undefined}>{t(key)}</Link>)}</nav>;
}
