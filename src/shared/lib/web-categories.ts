import type { Json } from '@/shared/types/database'

/**
 * Categorias de sitios web. Cada una expande a una lista de dominios que se
 * fusiona con `web.blocked_domains` al servir la politica al agente, de modo que
 * el bloqueo se aplica igual que cualquier dominio (via archivo hosts) sin que el
 * agente tenga que entender de categorias. Las listas son representativas, no
 * exhaustivas: cubren los sitios mas comunes de cada categoria.
 */
export const WEB_CATEGORIES: Record<string, { label: string; domains: string[] }> = {
  social: {
    label: 'Redes sociales',
    domains: [
      'facebook.com',
      'instagram.com',
      'twitter.com',
      'x.com',
      'tiktok.com',
      'snapchat.com',
      'reddit.com',
    ],
  },
  streaming: {
    label: 'Streaming / video',
    domains: ['youtube.com', 'netflix.com', 'twitch.tv', 'disneyplus.com', 'primevideo.com'],
  },
  gambling: {
    label: 'Apuestas',
    domains: ['bet365.com', 'betano.com', 'codere.com', 'rushbet.co', 'wplay.co', 'stake.com'],
  },
  adult: {
    label: 'Contenido adulto',
    domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'onlyfans.com'],
  },
}

/** Devuelve los dominios de las categorias dadas, sin duplicados. */
export function domainsForCategories(categories: string[]): string[] {
  const set = new Set<string>()
  for (const c of categories) {
    for (const d of WEB_CATEGORIES[c]?.domains ?? []) set.add(d)
  }
  return [...set]
}

/**
 * Devuelve una copia de la config con `web.blocked_domains` ampliado con los
 * dominios de `web.blocked_categories`. Se usa al servir la politica al agente.
 * Tolerante a formas raras: si algo no encaja, devuelve la config sin tocar.
 */
export function expandWebCategories(config: Json): Json {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config
  const web = (config as Record<string, unknown>).web
  if (!web || typeof web !== 'object' || Array.isArray(web)) return config
  const w = web as Record<string, unknown>
  const cats = Array.isArray(w.blocked_categories)
    ? (w.blocked_categories.filter((c) => typeof c === 'string') as string[])
    : []
  if (cats.length === 0) return config
  const manual = Array.isArray(w.blocked_domains)
    ? (w.blocked_domains.filter((d) => typeof d === 'string') as string[])
    : []
  const merged = [...new Set([...manual, ...domainsForCategories(cats)])]
  return {
    ...(config as Record<string, unknown>),
    web: { ...w, blocked_domains: merged },
  } as unknown as Json
}
