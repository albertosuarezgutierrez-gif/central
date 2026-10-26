/**
 * Qué enseña el formulario del enlace de datos (26/10/2026). PURO, para poder probarlo sin navegador.
 *
 * - Dos niveles: primero los ESENCIALES (lo mínimo para dar precio), luego el aviso «Con esto ya podemos calcular tu
 *   precio…» y los OPCIONALES. Enviar solo los esenciales completa igual.
 * - Hogar: lo que da el Catastro no se pregunta, se enseña en la tarjeta «¿Es esta tu vivienda?». Las preguntas
 *   `catastro` aparecen si el Catastro no lo da, si aún no ha contestado, o si el cliente pulsa «Corregir».
 * - Rejas (`ventanas`): solo en un bajo o en una casa; en un piso alto, no. Sin tipo conocido, se pregunta.
 */
import { CLAVE_NO_LO_SE, claveDireccion, subclavesDeCampo, type CampoSolicitud } from '@central/module-seguros'
import type { ViviendaCatastroPublica } from './vivienda-catastro.ts'

export type ContextoVista = {
  /** Lo que dijo el Catastro de la dirección; `null` = aún no hay respuesta (o no se ha podido consultar). */
  catastro: ViviendaCatastroPublica | null
  /** Respuesta de la tarjeta: `true` = «Sí, es correcta»; `false` = «Corregir»; `null` = sin contestar. */
  confirmado: boolean | null
  /** Tipo de vivienda que ha elegido el cliente (si lo ha elegido). */
  tipoElegido: string | null
}

// «Último piso» NO es «ático» (26/10/2026): el Catastro solo dice «ático» si la planta es AT; un último piso numérico es «Piso».
const TIPO_TEXTO: Record<string, string> = { piso: 'Piso', planta_baja: 'Bajo', atico: 'Ático', unifamiliar: 'Casa' }

/** «Piso · 2º · 85 m² · 1998». `null` = no hay nada que enseñar (no sale la tarjeta). */
export function textoTarjetaVivienda(v: ViviendaCatastroPublica | null, planta: string): string | null {
  if (!v || v.estado !== 'ok') return null
  const p = planta.trim()
  const partes = [
    v.tipo ? TIPO_TEXTO[v.tipo] : null,
    v.tipo && v.tipo !== 'unifamiliar' && v.tipo !== 'planta_baja' && p ? (/^\d+$/.test(p) ? `${Number(p)}º` : p) : null,
    v.metros !== null ? `${String(Math.round(v.metros)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m²` : null,
    v.anio !== null ? String(v.anio) : null,
  ].filter((x): x is string => x !== null)
  return partes.length > 0 ? partes.join(' · ') : null
}

/** ¿Se enseña este campo, según lo que dice el Catastro? (El `siMarcado` lo mira quien llama.) */
export function visibleSegunCatastro(c: CampoSolicitud, ctx: ContextoVista, planta: string): boolean {
  const v = ctx.catastro?.estado === 'ok' ? ctx.catastro : null
  const confirmado = ctx.confirmado === true
  switch (c.catastro) {
    case undefined: return true
    case 'tarjeta': return textoTarjetaVivienda(v, planta) !== null
    // Confirmado un piso/bajo/ático: no se pregunta. Casa: solo adosada o independiente (`opcionesVisibles`).
    case 'tipo_vivienda': return !(confirmado && v?.tipo && v.tipo !== 'unifamiliar')
    case 'metros': return !(confirmado && v?.metros !== null && v?.metros !== undefined)
    case 'anio': return !(confirmado && v?.anio !== null && v?.anio !== undefined)
    case 'ventanas': {
      // Lo del Catastro solo cuenta si lo CONFIRMÓ. Si pulsó «Corregir» (o aún no ha contestado la tarjeta), solo vale lo
      // que ha declarado él; hasta que elija el tipo, las rejas se preguntan.
      const tipo = ctx.tipoElegido ?? (confirmado ? v?.tipo ?? null : null)
      return !(tipo === 'piso' || tipo === 'atico')
    }
  }
}

/** Opciones del tipo de vivienda: si el Catastro dice «casa», solo las de casa. */
export function opcionesVisibles(c: CampoSolicitud, ctx: ContextoVista): CampoSolicitud['opciones'] {
  if (c.catastro !== 'tipo_vivienda' || !c.opciones) return c.opciones
  if (ctx.catastro?.estado === 'ok' && ctx.catastro.tipo === 'unifamiliar' && ctx.confirmado !== false) {
    return c.opciones.filter((o) => o.valor === 'adosada' || o.valor === 'independiente')
  }
  return c.opciones
}

const TIPOS_CATASTRO_OPCION = new Set(['piso', 'planta_baja', 'atico'])

/**
 * Lo que el cliente VIO en la tarjeta del Catastro y CONFIRMÓ (26/10/2026): viaja con `confirmaCatastro` para que asegura
 * no dependa de volver a consultar el Catastro. Solo las preguntas `catastro` que quedaron OCULTAS por la confirmación
 * (las visibles las contesta él) y solo lo que la tarjeta enseñaba. `unifamiliar` no es una opción (adosada o
 * independiente la elige el cliente): no viaja.
 */
export function valoresConfirmadosCatastro(campos: readonly CampoSolicitud[], ctx: ContextoVista, planta: string): Record<string, string> {
  const v = ctx.catastro?.estado === 'ok' ? ctx.catastro : null
  if (ctx.confirmado !== true || !v) return {}
  const out: Record<string, string> = {}
  for (const c of campos) {
    if (visibleSegunCatastro(c, ctx, planta)) continue
    if (c.catastro === 'tipo_vivienda' && v.tipo && TIPOS_CATASTRO_OPCION.has(v.tipo)) out[c.clave] = v.tipo
    else if (c.catastro === 'metros' && v.metros !== null && v.metros > 0) out[c.clave] = String(Math.round(v.metros))
    else if (c.catastro === 'anio' && v.anio !== null) out[c.clave] = String(v.anio)
  }
  return out
}

/**
 * Esenciales visibles sin contestar (ni «No lo sé»): el formulario no se envía y los marca. Los obligatorios los vuelve a
 * mirar el servidor; esto cubre los esenciales que dependen del Catastro (que el servidor no puede exigir).
 */
export function esencialesPendientes(visibles: readonly CampoSolicitud[], valores: Record<string, unknown>, noLoSe: ReadonlySet<string>): string[] {
  return visibles
    .filter((c) => c.nivel === 'esencial' && c.tipo !== 'direccion' && c.tipo !== 'vehiculo_catalogo' && !c.obligatorio)
    .filter((c) => !noLoSe.has(c.clave))
    .filter((c) => valores[c.clave] === undefined || valores[c.clave] === '' || valores[c.clave] === null)
    .map((c) => c.clave)
}

// ─── Borrador (guardado automático, 26/10/2026) ──────────────────────────────

/** Una dirección como la lleva el formulario (`DireccionCp` + número, planta y puerta). */
export type DireccionBorrador = {
  cp: string; provincia: string; municipio: string; direccion: string
  viaOficial: { tipo: string; nombre: string } | null
  numero: string; planta: string; puerta: string
}

export type EstadoInicial = {
  valores: Record<string, string | boolean>
  noLoSe: string[]
  direcciones: Record<string, DireccionBorrador>
}

/**
 * El borrador guardado → estado inicial del formulario. Sin borrador, lo que trae la ficha (`actual`: DNI y
 * nacimiento). Con borrador, lo escrito por el cliente MANDA sobre `actual` (es lo último que tecleó él).
 * Las direcciones se rehacen desde sus subclaves; la calle oficial solo si vienen tipo y nombre.
 */
export function estadoDesdeBorrador(campos: readonly CampoSolicitud[], borrador: Record<string, string | boolean | string[]> | null): EstadoInicial {
  const valores: Record<string, string | boolean> = Object.fromEntries(campos.flatMap((c) => (c.actual ? [[c.clave, c.actual]] : [])))
  const direcciones: Record<string, DireccionBorrador> = {}
  if (!borrador) return { valores, noLoSe: [], direcciones }
  const claves = new Set(campos.map((c) => c.clave))
  const noLoSe = Array.isArray(borrador[CLAVE_NO_LO_SE]) ? (borrador[CLAVE_NO_LO_SE] as string[]).filter((k) => claves.has(k)) : []
  for (const c of campos) {
    if (c.tipo === 'direccion') {
      const t = (sub: Parameters<typeof claveDireccion>[1]) => { const v = borrador[claveDireccion(c.clave, sub)]; return typeof v === 'string' ? v : '' }
      if (!['Cp', 'Provincia', 'Municipio', 'Calle', 'Numero', 'Planta', 'Puerta'].some((sub) => t(sub as 'Cp') !== '')) continue
      const tipo = t('ViaTipo'), nombre = t('ViaNombre')
      direcciones[c.clave] = {
        cp: t('Cp'), provincia: t('Provincia'), municipio: t('Municipio'), direccion: t('Calle'),
        viaOficial: tipo && nombre ? { tipo, nombre } : null,
        numero: t('Numero'), planta: t('Planta'), puerta: t('Puerta'),
      }
      continue
    }
    if (c.tipo === 'vehiculo_catalogo') {
      // El buscador del catálogo: sus subclaves (ids de la versión) vuelven tal cual.
      for (const k of subclavesDeCampo(c) ?? []) { const x = borrador[k]; if (typeof x === 'string') valores[k] = x }
      continue
    }
    const v = borrador[c.clave]
    if (noLoSe.includes(c.clave)) { delete valores[c.clave]; continue }
    if (typeof v === 'string' || typeof v === 'boolean') valores[c.clave] = v
  }
  return { valores, noLoSe, direcciones }
}

/** ¿Hay algo que guardar? Un formulario en blanco (o solo con lo que traía la ficha) no crea borrador. */
export function borradorConContenido(campos: readonly CampoSolicitud[], borrador: Record<string, unknown>): boolean {
  const actual = new Map(campos.flatMap((c) => (c.actual ? [[c.clave, c.actual] as const] : [])))
  return Object.entries(borrador).some(([k, v]) => {
    if (Array.isArray(v)) return v.length > 0
    if (v === '' || v === null || v === undefined) return false
    return actual.get(k) !== v
  })
}
