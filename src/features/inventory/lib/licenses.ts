/**
 * Catalogo de software licenciable (de pago). El inventario de la flota se cruza
 * contra este catalogo para saber cuantas instalaciones hay de cada producto y en
 * que equipos — control de cumplimiento de licencias y de costos.
 *
 * Solo se listan productos que REQUIEREN licencia. El software gratuito (Chrome,
 * VLC, 7-Zip, Firefox…) no aparece: no hay nada que licenciar.
 */
export interface LicenseProduct {
  /** Nombre que se muestra. */
  product: string
  /** Fabricante. */
  vendor: string
  /** Palabras clave (minusculas) que, si aparecen en el nombre, identifican el producto. */
  keywords: string[]
}

/**
 * Catalogo. El orden importa: se devuelve la PRIMERA coincidencia, asi que los
 * productos mas especificos van antes que los genericos del mismo fabricante.
 */
export const LICENSE_CATALOG: LicenseProduct[] = [
  { product: 'Microsoft Project', vendor: 'Microsoft', keywords: ['microsoft project'] },
  { product: 'Microsoft Visio', vendor: 'Microsoft', keywords: ['microsoft visio', 'visio'] },
  { product: 'Microsoft Office / 365', vendor: 'Microsoft', keywords: ['microsoft office', 'microsoft 365', 'office 16', 'office professional', 'office standard'] },
  { product: 'Microsoft SQL Server', vendor: 'Microsoft', keywords: ['sql server'] },
  { product: 'Windows Server', vendor: 'Microsoft', keywords: ['windows server'] },
  { product: 'Adobe Acrobat', vendor: 'Adobe', keywords: ['acrobat'] },
  { product: 'Adobe Photoshop', vendor: 'Adobe', keywords: ['photoshop'] },
  { product: 'Adobe Illustrator', vendor: 'Adobe', keywords: ['illustrator'] },
  { product: 'Adobe Creative Cloud', vendor: 'Adobe', keywords: ['creative cloud', 'adobe cc'] },
  { product: 'Autodesk AutoCAD', vendor: 'Autodesk', keywords: ['autocad', 'autodesk'] },
  { product: 'CorelDRAW', vendor: 'Corel', keywords: ['coreldraw', 'corel'] },
  { product: 'VMware Workstation', vendor: 'VMware', keywords: ['vmware workstation'] },
  { product: 'WinRAR', vendor: 'win.rar GmbH', keywords: ['winrar'] },
  { product: 'WinZip', vendor: 'Corel', keywords: ['winzip'] },
  { product: 'Nitro Pro', vendor: 'Nitro', keywords: ['nitro pro', 'nitro pdf'] },
  { product: 'Foxit PDF Editor', vendor: 'Foxit', keywords: ['foxit phantom', 'foxit pdf editor'] },
  { product: 'TeamViewer', vendor: 'TeamViewer', keywords: ['teamviewer'] },
  { product: 'AnyDesk', vendor: 'AnyDesk', keywords: ['anydesk'] },
  { product: 'Camtasia', vendor: 'TechSmith', keywords: ['camtasia'] },
  { product: 'SnagIt', vendor: 'TechSmith', keywords: ['snagit'] },
  { product: 'QuickBooks', vendor: 'Intuit', keywords: ['quickbooks'] },
  { product: 'Siigo', vendor: 'Siigo', keywords: ['siigo'] },
  { product: 'ContaPyme', vendor: 'ContaPyme', keywords: ['contapyme'] },
  { product: 'World Office', vendor: 'World Office', keywords: ['world office'] },
  { product: 'Kaspersky', vendor: 'Kaspersky', keywords: ['kaspersky'] },
  { product: 'ESET', vendor: 'ESET', keywords: ['eset', 'nod32'] },
  { product: 'Norton', vendor: 'Gen Digital', keywords: ['norton'] },
  { product: 'SAP', vendor: 'SAP', keywords: ['sap gui', 'sap business', 'saplogon'] },
]

/** Devuelve el producto licenciable que coincide con `name`, o null si es libre/no catalogado. */
export function matchLicense(name: string): LicenseProduct | null {
  const n = name.toLowerCase()
  for (const p of LICENSE_CATALOG) {
    if (p.keywords.some((k) => n.includes(k))) return p
  }
  return null
}
