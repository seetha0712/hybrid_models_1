"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [["/", "Overview"], ["/spectrum", "Spectrum"], ["/router", "Router"], ["/guardrail", "Guardrail"], ["/batch", "Batch"], ["/underwrite", "Underwrite"]];
export function Nav() {
  const p = usePathname();
  return <nav className="pill-nav flex gap-1">{items.map(([href, label]) => <Link key={href} href={href} aria-current={p === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
