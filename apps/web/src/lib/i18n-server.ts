// Server-side locale access for server components. Reads the `locale` cookie set by the toggle.
import { cookies } from "next/headers";
import { translate, type Locale, type MsgKey } from "./messages";

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  return c.get("locale")?.value === "ja" ? "ja" : "en";
}

export async function getT() {
  const locale = await getLocale();
  return (key: MsgKey) => translate(locale, key);
}
