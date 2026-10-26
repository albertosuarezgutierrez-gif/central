/**
 * Qué enseña el formulario del enlace de datos (26/10/2026). PURO, para poder probarlo sin navegador.
 *
 * - Dos niveles: primero los ESENCIALES (lo mínimo para dar precio), luego el aviso «Con esto ya podemos calcular tu
 *   precio…» y los OPCIONALES. Enviar solo los esenciales completa igual.
 * - Hogar: lo que da el Catastro no se pregunta, se enseña en la tarjeta «¿Es esta tu vivienda?». Las preguntas
 *   `catastro` aparecen si el Catastro no lo da, si aún no ha contestado, o si el cliente pulsa «Corregir».
 * - Rejas (`ventanas`): solo en un bajo o en una casa; en un piso alto, no. Sin tipo conocido, se pregunta.
 */
import type { CampoSolicitud } from '@central/module-seguros'
import type { ViviendaCatastroPublica } from './vivienda-catastro.ts'

export type ContextoVista = {
  /** Lo que dijo el Catastro de la dirección; `null` = aún no hay respuesta (o no se ha podido consultar). */
  catastro: ViviendaCatastroPublica | null
  /** Respuesta de la tarjeta: `true` = «Sí, es correcta»; `false` = «Corregir»; `null` = sin contestar. */
  confirmado: boolean | null
  /** Tipo de vivienda que ha elegido el cliente (si lo ha elegido). */
  tipoElegido: string | null
}

const TIPO_TEXTO: Record<string, string> = { piso: 'Piso', planta_baja: 'Bajo', atico: 'Ático o último piso', unifamiliar: 'Casa' }

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
      const tipo = ctx.tipoElegido ?? v?.tipo ?? null
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

/**
 * Esenciales visibles sin contestar (ni «No lo sé»): el formulario no se envía y los marca. Los obligatorios los vuelve a
 * mirar el servidor; esto cubre los esenciales que dependen del Catastro (que el servidor no puede exigir).
 */
export function esencialesPendientes(visibles: readonly CampoSolicitud[], valores: Record<string, unknown>, noLoSe: ReadonlySet<string>): string[] {
  return visibles
    .filter((c) => c.nivel === 'esencial' && c.tipo !== 'direccion' && !c.obligatorio)
    .filter((c) => !noLoSe.has(c.clave))
    .filter((c) => valores[c.clave] === undefined || valores[c.clave] === '' || valores[c.clave] === null)
    .map((c) => c.clave)
}
