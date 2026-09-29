// Precio de HOGAR desde el asistente de Telegram (29/09/2026). Puro: lo que dicta Alberto («tiene alarma»,
// «es un chalet», «ladrillo») → los `resueltos`/`correcciones` que la pantalla de hogar nuevo manda a
// asegura, con los MISMOS nombres y valores que `Formulario.tsx` (CAMPO_A_RESUELTO + deTexto). Un valor
// que no casa con una sola opción del catálogo no se elige a ojo: se devuelve la lista para preguntar.
import type { Fila, Opcion, PrecalificacionHogar } from './hogar-nuevo-asegura'

/** Campo de la fila → clave de `resueltos` (copia de `hogar-nuevo/Formulario.tsx`; lo vigila su test). */
export const CAMPO_A_RESUELTO: Readonly<Record<string, string>> = {
  municipioId: 'municipioId',
  estadoCivil: 'estadoCivilId',
  tipoViaId: 'tipoViaId',
  propietarioEsTomador: 'propietarioEsTomador',
  tipoVivienda: 'tipoVivienda',
  uso: 'uso',
  ocupacion: 'ocupacion',
  ubicacion: 'ubicacion',
  material: 'material',
  calidad: 'calidad',
  alarma: 'alarma',
  puertasSecundarias: 'puertasSecundarias',
  asentamiento: 'asentamiento',
}

/** Los nueve campos de catálogo cuya «letra pequeña» viaja como supuesto (copia de `Formulario.tsx`). */
export const CAMPOS_CATALOGO_9 = [
  'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento',
] as const

export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function opcionesDe(pre: PrecalificacionHogar, f: Fila): Opcion[] {
  if (f.control === 'municipio' || f.catalogo === 'municipios') return pre.municipios
  if (f.catalogo === 'vias') return pre.vias
  if (f.catalogo === 'estadosCiviles') return pre.estadosCiviles
  return f.catalogo ? pre.catalogos[f.catalogo] ?? [] : []
}

/** Una sola opción que case (id, nombre exacto, o el único nombre que lo contiene); si no, las candidatas. */
export function elegirOpcion(opciones: readonly Opcion[], dicho: string): { id: string } | { candidatas: string[] } {
  const d = normalizar(dicho)
  const exacta = opciones.filter((o) => o.id === dicho.trim() || normalizar(o.nombre) === d)
  if (exacta.length === 1) return { id: exacta[0].id }
  const contiene = opciones.filter((o) => normalizar(o.nombre).includes(d) || (d.length >= 4 && d.includes(normalizar(o.nombre))))
  if (contiene.length === 1) return { id: contiene[0].id }
  return { candidatas: (contiene.length > 1 ? contiene : opciones).slice(0, 15).map((o) => o.nombre) }
}

function siNo(v: unknown): boolean | null | undefined {
  if (typeof v === 'boolean') return v
  const t = normalizar(String(v ?? ''))
  if (['si', 'sí', 'true', 'tiene', 'con'].includes(t)) return true
  if (['no', 'false', 'sin', 'no tiene'].includes(t)) return false
  if (['no se', 'nose', 'no lo se', 'desconocido'].includes(t)) return null
  return undefined
}

export type Aplicado = { resueltos: Record<string, unknown>; correcciones: Record<string, unknown>; errores: string[] }

/**
 * Aplica lo dictado sobre lo que ya se había resuelto. Cada clave de `datos` es el `campo` de una fila
 * (o su etiqueta). Lo que no se entiende va a `errores` y NO se aplica: la IA se lo pregunta a Alberto.
 */
export function aplicarDatosHogar(
  pre: PrecalificacionHogar, datos: Record<string, unknown>,
  previos: { resueltos?: Record<string, unknown>; correcciones?: Record<string, unknown> } = {},
): Aplicado {
  const resueltos = { ...(previos.resueltos ?? {}) }
  const correcciones = { ...(previos.correcciones ?? {}) }
  const errores: string[] = []
  for (const [k, v] of Object.entries(datos)) {
    const f = pre.resumen.filas.find((x) => x.campo === k) ?? pre.resumen.filas.find((x) => normalizar(x.etiqueta) === normalizar(k))
    if (!f) { errores.push(`«${k}» no es un dato de la ficha de hogar`); continue }
    if (!f.editable) { errores.push(`${f.etiqueta}: no se puede cambiar (sale de ${f.procedencia ?? 'la ficha'})`); continue }
    let valor: unknown
    if (f.control === 'opcion' || f.control === 'municipio') {
      const opciones = opcionesDe(pre, f)
      if (opciones.length === 0) { errores.push(`${f.etiqueta}: no he podido leer sus opciones`); continue }
      const r = elegirOpcion(opciones, String(v ?? ''))
      if ('candidatas' in r) { errores.push(`${f.etiqueta}: «${String(v)}» no casa con una sola opción. Opciones: ${r.candidatas.join(' · ')}`); continue }
      valor = f.control === 'municipio' ? Number(r.id) : r.id
    } else if (f.control === 'siNo' || f.control === 'siNoNoSe') {
      const b = siNo(v)
      if (b === undefined || (b === null && f.control === 'siNo')) { errores.push(`${f.etiqueta}: dime sí o no`); continue }
      valor = b
    } else if (f.control === 'numero' || f.control === 'euros') {
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(n) || String(v ?? '').trim() === '') { errores.push(`${f.etiqueta}: «${String(v)}» no es un número`); continue }
      valor = n
    } else {
      const t = String(v ?? '').trim()
      if (!t) { errores.push(`${f.etiqueta}: vacío`); continue }
      valor = t
    }
    const clave = CAMPO_A_RESUELTO[f.campo]
    if (clave) resueltos[clave] = valor
    else correcciones[f.campo] = valor
  }
  return { resueltos, correcciones, errores }
}

/** El `resueltos` que se manda al cotizar: lo dicho + qué campos de catálogo van como supuesto (igual que la pantalla). */
export function resueltosFinales(pre: PrecalificacionHogar, resueltos: Record<string, unknown>): Record<string, unknown> {
  const porCampo = new Map(pre.resumen.filas.map((f) => [f.campo, f]))
  const supuestos: Record<string, boolean> = {}
  for (const campo of CAMPOS_CATALOGO_9) {
    supuestos[campo] = !(campo in resueltos) && porCampo.get(campo)?.procedencia === 'supuesto'
  }
  supuestos.tipoVia = !('tipoViaId' in resueltos) && porCampo.get('tipoViaId')?.procedencia === 'supuesto'
  return { ...resueltos, supuestos }
}

/** Lo que le falta a la ficha, con las opciones de cada desplegable para que la IA pregunte bien. */
export function faltanHogar(pre: PrecalificacionHogar): string[] {
  return pre.resumen.faltan.map((f) => {
    const ops = f.control === 'opcion' ? opcionesDe(pre, f).slice(0, 12).map((o) => o.nombre) : []
    return `${f.etiqueta} (campo ${f.campo})${f.falta ? `: ${f.falta}` : ''}${ops.length ? ` — opciones: ${ops.join(' · ')}` : ''}`
  })
}

/** Resumen para Alberto antes de pedir: qué se cotiza y, sobre todo, lo SUPUESTO que abarata. */
export function textoPropuestaHogar(pre: PrecalificacionHogar, autonomo: boolean, esc: (t: string) => string): string {
  const c = pre.catastro
  const vivienda = [c.direccionLegible, c.metrosCuadrados ? `${c.metrosCuadrados} m²` : null, c.anioConstruccion ? `año ${c.anioConstruccion}` : null]
    .filter(Boolean).join(' · ')
  const sup = pre.resumen.supuestos.map((f) => `• ${esc(f.etiqueta)}: ${esc(f.legible)}${f.optimista ? ' ⚠️ abarata' : ''}`)
  return [
    `🏠 <b>Precio de hogar</b> para <b>${esc(pre.etiquetaCliente || 'cliente')}</b>`,
    vivienda ? esc(vivienda) : null,
    sup.length ? `Se supone (si no es así, el precio cambia):\n${sup.join('\n')}` : null,
    pre.resumen.optimistas.length ? `⚠️ ${pre.resumen.optimistas.length} supuesto(s) abaratan: si el cliente los desmiente, el precio sube.` : null,
    autonomo ? '💶 Lo pido ya (0,50€); el precio te llega en un mensaje aparte.' : null,
  ].filter(Boolean).join('\n')
}
