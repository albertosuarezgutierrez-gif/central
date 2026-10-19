// lib/correo/lead-correduria-avant2.ts — 💶 «Avant2 (0,50€)» para un lead de COCHE o MOTO cuyos bots no dieron precio
// (19/10/2026, decisión de Alberto: opción B). PURO: sin red, sin BD, sin env (test al lado).
//
// Avant2 no tarifica desde el texto libre del lead: necesita CÓDIGOS de catálogo (vehículo, municipio…). Por eso el botón
// `clp_cds:<p>:<auto|moto>` NO paga: ENTREGA la oportunidad al asistente de tarificación de siempre (`proponer_tarificacion`
// → resumen con «💶 Pedir precio (0,50€)», un solo uso, tope diario, interruptor). La IA propone el vehículo del catálogo y
// Alberto CONFIRMA con ese segundo botón. Ningún cobro sin ese segundo clic.
//   · Se ofrece SOLO en coche/moto, y solo cuando ningún bot llega a precio: el aviso del fallo de un bot (asegura, junto a
//     📝 `clp_fal`), «ningún bot llega a precio» tras 🤖, y el aviso «Listo para tarificar» sin 🤖.
//   · Un solo uso por hilo y ramo: fila `cds:<hilo>:<ramo>` en `correduria_pendiente_tg` (ON CONFLICT DO NOTHING).
// 🚨 Ni el texto de Telegram ni lo que se le pasa a la IA llevan datos personales: ids (uuid) y el ramo.
import type { Boton } from '@central/core-telegram'
import { PREFIJO_CLP, esRamoAvant2, type RamoAvant2 } from './lead-correduria-peticion.ts'
import type { Revision } from './lead-correduria-tarificar.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const RAMO_TXT: Record<RamoAvant2, string> = { auto: 'coche', moto: 'moto' }

/**
 * Los ramos a los que se ofrece 💶 tras la revisión de asegura: coche/moto evaluados (o sin bot) donde NINGUNA compañía
 * llega a precio. Con una discrepancia sin elegir, nada (el expediente no está completo). Orden estable, sin repetidos. PURA.
 */
export function ramosAvant2(r: Extract<Revision, { estado: 'ok' }>): RamoAvant2[] {
  if (r.oportunidades.some((o) => o.estado === 'discrepancias')) return []
  const out: RamoAvant2[] = []
  for (const o of r.oportunidades) {
    if (!esRamoAvant2(o.ramo) || out.includes(o.ramo)) continue
    if (o.estado !== 'evaluada' && o.estado !== 'sin_bot') continue
    if (o.companias.some((c) => c.estado === 'lista')) continue
    out.push(o.ramo)
  }
  return out
}

/** Un botón por ramo de coche/moto (cualquier otro ramo se cae aquí). `callback_data` ≤ 64 bytes y sin datos personales. PURA. */
export function botonesAvant2(id: number | string, ramos: readonly string[]): Boton[][] {
  const validos = [...new Set(ramos.filter(esRamoAvant2))]
  return validos.map((r) => [{
    texto: validos.length > 1 ? `💶 Avant2 ${RAMO_TXT[r]} (0,50€)` : '💶 Avant2 (0,50€)',
    callback: `${PREFIJO_CLP}_cds:${id}:${r}`,
  }])
}

/** La línea que acompaña al botón (HTML seguro: no lleva nada del cliente). PURA. */
export function textoOfertaAvant2(ramos: readonly RamoAvant2[]): string {
  const que = ramos.map((r) => RAMO_TXT[r]).join(' y ')
  return `💶 Ningún bot ha dado precio de ${que}. Con «Avant2» paso el lead al asistente: te propone el vehículo del catálogo y`
    + ' el resumen con «💶 Pedir precio (0,50€)». <b>No se paga nada hasta que pulses ese segundo botón.</b>'
}

/** Lo que se lee del pendiente (sin datos personales): la ficha y sus oportunidades. `null` = ilegible, no se hace nada. PURA. */
export function leerDatosAvant2(v: unknown): { clienteId: string; oportunidadIds: string[]; hilo: string | null } | null {
  const o = obj(v)
  const clienteId = typeof o.clienteId === 'string' && UUID.test(o.clienteId) ? o.clienteId : null
  const ops = Array.isArray(o.oportunidadIds) ? o.oportunidadIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 10) : []
  if (!clienteId || !ops.length) return null
  return { clienteId, oportunidadIds: [...new Set(ops)], hilo: typeof o.hilo === 'string' && o.hilo.trim() ? o.hilo.trim() : null }
}

/** La marca de un solo uso: un hilo y un ramo = una entrega al asistente. PURA. */
export function claveAvant2(hilo: string, ramo: RamoAvant2): string {
  return `cds:${hilo}:${ramo}`.slice(0, 300)
}

/**
 * De las oportunidades del pendiente, la de ESE ramo y ESE tomador (la que el asistente tiene que tarificar). Ninguna o más
 * de una = `null`: no se adivina (dos de coche son dos riesgos distintos). PURA.
 */
export function oportunidadAvant2(leidas: readonly { id: string; ramo: string; tomador: string }[], clienteId: string, ramo: RamoAvant2): string | null {
  const casan = leidas.filter((l) => l.ramo === ramo && l.tomador === clienteId)
  return casan.length === 1 ? casan[0].id : null
}

/**
 * Lo que se le pasa al asistente (va a la IA): SOLO ids y el ramo, nunca un dato personal (las herramientas los leen en el
 * servidor). No nombra a los «bots» ni al «tarificador» a propósito: eso lo mandaría al modo bots, que no pide Avant2. PURA.
 */
export function instruccionAvant2(a: { clienteId: string; oportunidadId: string; ramo: RamoAvant2 }): string {
  return [
    `Pide precio de ${RAMO_TXT[a.ramo]} a Avant2 para un lead que llegó por correo (clienteId ${a.clienteId}, oportunidadId ${a.oportunidadId}, ramo ${a.ramo}).`,
    'Lo que dio el cliente está en el riesgo: léelo con ver_riesgo y no me preguntes lo que ya pone.',
    'Busca el vehículo con vehiculo_catalogo y llama a proponer_tarificacion con esa oportunidadId para que me llegue el resumen con su botón.',
    'Si falta algún dato, dime exactamente cuál. No des de alta a nadie ni cambies la ficha, y nunca digas que ya has pedido el precio.',
  ].join(' ')
}
