import type { Config } from "@netlify/functions"

// Proxies Pinterest API v5 "Search partner Pins" so the access token never reaches the browser.
// Env var (Functions scope): PINTEREST_ACCESS_TOKEN. Optional: PINTEREST_COUNTRY (default "IN"), PINTEREST_LOCALE (default "en-US").
const API = "https://api.pinterest.com/v5/search/partner/pins"

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": status === 200 ? "public, max-age=300" : "no-store" } })

type Img = { url?: string; width?: number; height?: number }

function pickImages(media: any): { thumb?: string; full?: string } {
  const imgs: Record<string, Img> = media?.images ?? {}
  const list = Object.values(imgs).filter((i): i is Img => !!i?.url && i.url.startsWith("https://"))
  if (!list.length) return {}
  const byWidth = [...list].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const thumb = byWidth.find((i) => (i.width ?? 0) >= 236) ?? byWidth[byWidth.length - 1]
  const full = byWidth[byWidth.length - 1]
  return { thumb: thumb.url, full: full.url }
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const term = (url.searchParams.get("q") ?? "").trim().slice(0, 100)
  const bookmark = (url.searchParams.get("bookmark") ?? "").slice(0, 500)
  if (!term) return json({ error: "missing_query", message: "Type a name to search." }, 400)

  const token = Netlify.env.get("PINTEREST_ACCESS_TOKEN")
  if (!token) {
    return json({ error: "not_configured", message: "Pinterest search is not set up yet: no Pinterest access token is configured on this site." }, 503)
  }

  const qs = new URLSearchParams({
    term,
    country_code: Netlify.env.get("PINTEREST_COUNTRY") ?? "IN",
    locale: Netlify.env.get("PINTEREST_LOCALE") ?? "en-US",
    limit: "25",
  })
  if (bookmark) qs.set("bookmark", bookmark)

  let res: Response
  try {
    res = await fetch(`${API}?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
  } catch {
    return json({ error: "upstream_unreachable", message: "Pinterest could not be reached. Please try again." }, 502)
  }

  if (res.status === 401 || res.status === 403) {
    return json({ error: "no_access", message: "This Pinterest app does not have access to Pinterest search (or its token has expired)." }, 403)
  }
  if (res.status === 429) return json({ error: "rate_limited", message: "Pinterest search is busy right now. Try again in a minute." }, 429)
  if (!res.ok) return json({ error: "upstream_error", message: `Pinterest returned an error (${res.status}).` }, 502)

  const data: any = await res.json().catch(() => ({}))
  const items = (Array.isArray(data?.items) ? data.items : [])
    .map((p: any) => {
      const { thumb, full } = pickImages(p?.media)
      const id = String(p?.id ?? "")
      if (!thumb || !full || !/^\d+$/.test(id)) return null
      return {
        id,
        thumb,
        full,
        title: String(p?.title || p?.description || term).slice(0, 140),
        pinUrl: `https://www.pinterest.com/pin/${id}/`,
      }
    })
    .filter(Boolean)

  return json({ items, bookmark: typeof data?.bookmark === "string" ? data.bookmark : null })
}

export const config: Config = {
  path: "/api/pinterest",
  method: "GET",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
