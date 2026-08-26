/**
 * Clasificacion de datos POR PATRON (Fase A).
 *
 * Etiqueta una ruta de archivo mirando su extension y palabras clave de la ruta,
 * sin abrir el contenido. Es determinista y barato: se ejecuta sobre cada evento
 * de archivo del panel. La Fase B (por contenido) anadira etiquetas que el agente
 * detecta inspeccionando el archivo; conviven en la misma clasificacion.
 */

export type Classification = {
  id: string
  name: string
  color: string
  extensions: string[]
  path_keywords: string[]
  sort_order: number
}

/** Etiqueta para lo que no casa con ninguna regla. */
export const UNCLASSIFIED = { name: 'Sin clasificar', color: '#94a3b8' } as const

/** Extension en minusculas con el punto (".py"), o '' si no tiene. */
function extensionOf(path: string): string {
  const base = path.slice(path.replace(/\\/g, '/').lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/**
 * Devuelve el nombre y color de la PRIMERA clasificacion que casa con la ruta
 * (por extension o por palabra clave), respetando `sort_order`. Si ninguna casa,
 * devuelve "Sin clasificar".
 */
export function classifyPath(
  path: string,
  classifications: Classification[],
): { name: string; color: string } {
  const lower = path.toLowerCase()
  const ext = extensionOf(lower)
  const ordered = [...classifications].sort((a, b) => a.sort_order - b.sort_order)

  for (const c of ordered) {
    if (ext && c.extensions.some((e) => e.toLowerCase() === ext)) {
      return { name: c.name, color: c.color }
    }
    if (c.path_keywords.some((k) => k && lower.includes(k.toLowerCase()))) {
      return { name: c.name, color: c.color }
    }
  }
  return { name: UNCLASSIFIED.name, color: UNCLASSIFIED.color }
}
