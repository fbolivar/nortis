/**
 * Exportacion a CSV para reportes de auditoria.
 *
 * Se genera en el cliente a partir de datos que ya estan en la pagina: no se
 * pide nada al servidor al exportar, asi el boton responde al instante y el CSV
 * refleja exactamente lo que el analista tiene delante (los mismos filtros).
 */

/** Escapa un valor segun RFC 4180: comillas dobladas y campo entrecomillado si
 *  contiene coma, comilla o salto de linea. */
function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Convierte filas (objetos) en CSV, usando `columns` para fijar orden y titulos. */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(',')).join('\r\n')
  // BOM UTF-8: sin el, Excel en Windows abre los acentos y la ñ como mojibake.
  return '﻿' + head + '\r\n' + body
}

/** Dispara la descarga de un CSV en el navegador. */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
