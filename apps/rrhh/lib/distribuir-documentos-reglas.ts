// Reglas PURAS de «Distribuir documentos desde PDF» (sin BD, IA ni Storage): agrupar páginas
// consecutivas del mismo empleado, ids de envío deterministas (re-subida idempotente), nombres
// de los documentos resultantes y verificación en código de lo que la IA dice de cada página.
import { createHash } from 'node:crypto'
import { normalizarNif, normalizarTexto } from '@/lib/asistente-subida'

export type GrupoPaginas = {
  /** null = página sin identificar con seguridad: NO se asigna a nadie. */
  empleado_id: string | null
  desde: number
  hasta: number
}

/**
 * Agrupa páginas CONSECUTIVAS del mismo empleado en un documento (un contrato de 3 páginas = 1 doc).
 * Las no identificadas (null) quedan siempre como grupos sueltos de 1 página: nunca se funden con las
 * vecinas (no se adivina que una página sin nombre sea continuación del documento anterior).
 */
export function agruparPaginas(ids: (string | null)[]): GrupoPaginas[] {
  const out: GrupoPaginas[] = []
  ids.forEach((id, i) => {
    const n = i + 1
    const ult = out[out.length - 1]
    if (id !== null && ult && ult.empleado_id === id && ult.hasta === n - 1) ult.hasta = n
    else out.push({ empleado_id: id, desde: n, hasta: n })
  })
  return out
}

/**
 * uuid determinista por (empresa, contenido del PDF, carpeta, páginas, empleado): subir DOS veces el mismo PDF
 * produce los mismos `envio_id` y el índice único `(envio_id, empleado_id)` impide la segunda copia.
 */
export function idEnvioDeterminista(p: { empresaId: string; pdfHash: string; carpeta: string; desde: number; hasta: number; empleadoId: string }): string {
  const h = createHash('sha256').update(['distribuir-docs-v1', p.empresaId, p.pdfHash, p.carpeta, p.desde, p.hasta, p.empleadoId].join('|')).digest('hex')
  const v = h.slice(0, 32).split('')
  v[12] = '4'
  v[16] = '89ab'[parseInt(v[16], 16) % 4]
  const s = v.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

/** Nombre de archivo por grupo identificado. Se añade «(pág. N)» solo si el empleado recibe más de un documento. */
export function nombresDocumentos(titulo: string, grupos: GrupoPaginas[]): string[] {
  const base = titulo.trim().replace(/[\\/]+/g, '-').replace(/\.pdf$/i, '')
  const cuenta = new Map<string, number>()
  for (const g of grupos) if (g.empleado_id) cuenta.set(g.empleado_id, (cuenta.get(g.empleado_id) ?? 0) + 1)
  return grupos.map(g => {
    if (!g.empleado_id || (cuenta.get(g.empleado_id) ?? 0) < 2) return `${base}.pdf`
    return `${base} (${g.desde === g.hasta ? `pág. ${g.desde}` : `págs. ${g.desde}-${g.hasta}`}).pdf`
  })
}

/**
 * La IA dice a quién pertenece una página; el CÓDIGO lo comprueba: el texto debe contener el DNI/NIE del
 * empleado o su nombre completo (≥2 palabras, nombre+apellidos o apellidos+nombre). Solo el nombre de pila
 * no basta. Si no se puede comprobar → false → «no identificado» (nunca se adivina).
 */
export function paginaMencionaEmpleado(texto: string, e: { nombre: string; apellidos: string | null; dni: string | null }): boolean {
  const dni = normalizarNif(e.dni)
  if (dni && texto.toUpperCase().replace(/[\s.\-]/g, '').includes(dni)) return true
  const t = ` ${normalizarTexto(texto)} `
  const nom = normalizarTexto(e.nombre)
  const ape = normalizarTexto(e.apellidos ?? '')
  const variantes = [normalizarTexto(`${nom} ${ape}`), ape ? normalizarTexto(`${ape} ${nom}`) : ''].filter(v => v.split(' ').length >= 2)
  return variantes.some(v => t.includes(` ${v} `))
}
