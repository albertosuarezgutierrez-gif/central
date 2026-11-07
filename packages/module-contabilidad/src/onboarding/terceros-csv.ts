// Onboarding · importar TERCEROS (clientes, proveedores, acreedores) desde un CSV con el NIF VALIDADO. PURO.
// El algoritmo del NIF/CIF vive en `@central/core-fiscal`; este núcleo no depende de ningún país: lo recibe inyectado (`validarNif`).
// Columnas: `nif`, `nombre`, `tipo` (cliente|proveedor|acreedor); opcionales `email`, `telefono`. Un NIF vacío es ERROR (aquí no es opcional).
// Un tercero es único por (NIF normalizado, tipo): el repetido en el fichero se rechaza, no se funde con otro (identidad por NIF, nunca por nombre).
import { tablaCsv } from './csv.ts'

export type TipoTercero = 'cliente' | 'proveedor' | 'acreedor'
export const TIPOS_TERCERO: readonly TipoTercero[] = ['cliente', 'proveedor', 'acreedor']
export type ValidadorNif = (nif: string) => { ok: boolean; motivo?: string }
export type TerceroImportado = { nif: string; nombre: string; tipo: TipoTercero; email: string | null; telefono: string | null }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const normalizarNifTercero = (v: string) => v.toUpperCase().replace(/[\s.\-]/g, '')

export function importarTercerosCsv(texto: string, validarNif: ValidadorNif): { terceros: TerceroImportado[]; errores: { linea: number; motivo: string }[] } {
  const t = tablaCsv(texto, { nif: ['cif', 'nifcif', 'dni'], nombre: ['razonsocial', 'denominacion'], tipo: ['clase'], email: ['correo', 'mail'], telefono: ['tel', 'movil'] }, ['nif', 'nombre', 'tipo'])
  if (!t.ok) return { terceros: [], errores: t.errores.map((motivo) => ({ linea: 1, motivo })) }
  const errores: { linea: number; motivo: string }[] = []
  const terceros: TerceroImportado[] = []
  const vistos = new Set<string>()
  for (const { linea, valores: v } of t.filas) {
    const nif = normalizarNifTercero(v.nif)
    if (!nif) { errores.push({ linea, motivo: 'NIF vacío' }); continue }
    if (!/^[A-Z0-9]{8,12}$/.test(nif)) { errores.push({ linea, motivo: `NIF «${v.nif}» con formato no válido` }); continue }
    const val = validarNif(nif)
    if (!val.ok) { errores.push({ linea, motivo: `NIF ${nif}: ${val.motivo ?? 'no válido'}` }); continue }
    const tipo = v.tipo.trim().toLowerCase() as TipoTercero
    if (!TIPOS_TERCERO.includes(tipo)) { errores.push({ linea, motivo: `tipo «${v.tipo}» no reconocido (cliente, proveedor o acreedor)` }); continue }
    if (!v.nombre || v.nombre.length > 200) { errores.push({ linea, motivo: `NIF ${nif}: nombre vacío o de más de 200 caracteres` }); continue }
    const email = v.email ? v.email.toLowerCase() : null
    if (email && (!EMAIL_RE.test(email) || email.length > 200)) { errores.push({ linea, motivo: `NIF ${nif}: email no válido` }); continue }
    const clave = `${nif}|${tipo}`
    if (vistos.has(clave)) { errores.push({ linea, motivo: `NIF ${nif} repetido como ${tipo}` }); continue }
    vistos.add(clave)
    terceros.push({ nif, nombre: v.nombre, tipo, email, telefono: v.telefono ? v.telefono.slice(0, 40) : null })
  }
  return { terceros, errores }
}
