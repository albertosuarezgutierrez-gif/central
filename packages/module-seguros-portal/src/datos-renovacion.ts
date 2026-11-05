// SOLICITUD DE DATOS DE LA RENOVACIÓN por la app (05/11/2026, Alberto). PURO: sin BD ni red.
//
// Para tarificar una renovación con NUESTROS bots (gratis) cuando al riesgo le faltan datos, Alberto prepara desde la póliza
// una solicitud con SOLO las preguntas que el bot echa en falta; con su ✅ (Telegram) le llega al cliente a la campana del
// portal (y el correo de aviso, sin datos). Este fichero decide QUIÉN la ve y la contesta, y es la ÚNICA regla para los dos
// lados: asegura (el puente que da los campos y guarda las respuestas) y el portal (la campana y la página).
//
// Quién (la misma regla que la renovación con alternativas, `renovacion-eleccion.ts`):
//   1. El TOMADOR: una identidad del portal vinculada a SU ficha con nivel de OPERAR (`gestionar`/`administrar`). Una vista
//      de corredor nunca cuenta. Quien solo ve (`tarjeta`, `completo`) no contesta.
//   2. Un AUTORIZADO por el tomador con Gestión o Total, VIGENTE, sobre esa póliza o sobre toda la ficha
//      (`identidadesQueEligenRenovacion`). Caso real: tomadora = cónyuge; quien usa la app es él.
// Cualquier otra persona (otra ficha, solo consulta, autorización revocada o de otra póliza, sin vínculo) → `null`: ni ve
// el aviso ni abre la página (404, nunca 403). Fail-closed en todo lo desconocido.

import { nivelPuedeOperar } from './acceso.ts'
import { identidadesQueEligenRenovacion, type FilaAutorizacionRenovacion } from './renovacion-eleccion.ts'

/** `solicitud_datos.motivo` de una solicitud de datos de renovación (CHECK de la migración 2026-11-05d). */
export const MOTIVO_SOLICITUD_RENOVACION = 'renovacion_poliza'

/** Texto de la campana (lo pidió Alberto así). Sin compañía, póliza, dirección ni importes. */
export const TITULO_AVISO_DATOS_RENOVACION = 'Estamos revisando la renovación de tu seguro de hogar; necesitamos unos datos'
export const DETALLE_AVISO_DATOS_RENOVACION = 'Son unas pocas preguntas sobre la vivienda para buscarte el mejor precio. Contestarlas no contrata nada.'

/** El vínculo de la identidad con la ficha del TOMADOR (`portal_vinculo`). `null` = no hay. */
export type VinculoTomador = { nivel: string; origen: string } | null

export type QuienContestaDatos =
  | { papel: 'tomador' }
  | { papel: 'autorizado'; nombre: string | null }

/**
 * ¿Puede ESTA identidad ver y contestar la solicitud de la póliza `polizaId` del tomador? `vinculo` = su vínculo con la ficha del
 * tomador; `filas` = las autorizaciones del tomador que llegan a ESTA identidad (las que lee cada lado). `null` = nadie: no se
 * enseña ni se acepta nada.
 */
export function quienContestaDatosRenovacion(e: {
  identidadId: string
  vinculo: VinculoTomador
  filas: readonly FilaAutorizacionRenovacion[]
  polizaId: string | null
  ahora: Date
}): QuienContestaDatos | null {
  const identidad = typeof e.identidadId === 'string' ? e.identidadId.trim() : ''
  if (identidad === '') return null
  if (e.vinculo && e.vinculo.origen !== 'corredor' && nivelPuedeOperar(e.vinculo.nivel)) return { papel: 'tomador' }
  // Solo las filas de ESTA identidad: una fila de otra persona no le abre nada a esta.
  const suyas = e.filas.filter((f) => f.identidadId === identidad)
  const aut = identidadesQueEligenRenovacion(suyas, e.polizaId, e.ahora).get(identidad)
  return aut ? { papel: 'autorizado', nombre: aut.nombre } : null
}

/** Para el historial y el Telegram: quién contestó, sin DNI ni dirección (nombre de pila como mucho). */
export function textoQuienContesto(q: QuienContestaDatos): string {
  if (q.papel === 'tomador') return 'el tomador, por la app'
  const n = q.nombre?.trim().split(/\s+/)[0]
  return `${n ? n : 'una persona'} (autorizado por el tomador con Gestión o Total), por la app`
}

/** Lo que la campana necesita de una solicitud publicada y pendiente. Sin más datos: el detalle está en la página. */
export type DatosRenovacionParaAviso = { id: string }

/** Enlace de la página del portal donde se contesta. */
export function hrefDatosRenovacion(id: string): string {
  return `/boveda/datos-renovacion/${encodeURIComponent(id)}`
}
