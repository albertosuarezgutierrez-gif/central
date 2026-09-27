// Abrir una OPORTUNIDAD desde el asistente de la correduría por Telegram (27/09/2026) — parte PURA
// (sin `@/` ni prisma → node --test). La parte con BD y red vive en `correduria-asistente-telegram.ts`.
//
// Caso fundacional: Alberto subió por Telegram la póliza de Línea Directa de un lead y escribió
// «seguro de un lead, añade en oportunidades». El documento se lo quedó el contable (buscó un cargo de
// 691,24€ que no existía) y el asistente contestó que no tenía cómo abrir oportunidades.
//
// Mismo principio que la corrección de ficha: la IA PROPONE, el servidor junta lo dictado con lo leído
// de los documentos recientes, lo enseña y Alberto lo abre con un botón de un solo uso. La escritura va
// por el mismo puerto que el botón «Abrir» de la ficha (`accion: 'crear'`), que vuelve a validar.
import { RAMOS_OPORTUNIDAD, type RamoOportunidad } from '@central/module-seguros'
import { rotuloRamo, textoAltaOportunidad, type LecturaDocumentoOportunidad } from './seguimiento-asegura.ts'
import { eur } from './dinero.ts'

/** Lo que llevan dentro los documentos que Alberto subió a Telegram hace poco. */
export const MINUTOS_DOCUMENTO_RECIENTE = 60
/** Días antes del vencimiento en que toca la primera llamada de una póliza de la competencia. */
export const DIAS_ANTES_VENCIMIENTO = 60

export type Alta = {
  ramo: RamoOportunidad
  aseguradora: string | null
  prima: number | null
  /** `null` = no consta (o lo leído ya había pasado: ver `venceDescartado`). */
  fechaFinVigencia: string | null
  numeroPoliza: string | null
  fechaTarea: string
  /** Vencimiento leído que ya pasó: no se usa (la póliza se habrá renovado) y se dice. */
  venceDescartado: string | null
  /** Cuántos documentos se leyeron bien / mal. `null` = no se pidió usarlos. */
  documentos: { leidos: number; fallidos: string[] } | null
}

export type PreparacionAlta = { ok: true; alta: Alta } | { ok: false; motivo: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fecha(v: unknown): string | null {
  if (typeof v !== 'string' || !FECHA.test(v.trim())) return null
  const s = v.trim()
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function texto(v: unknown, max = 120): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null
}

function prima(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

/**
 * El primer paso: una llamada {@link DIAS_ANTES_VENCIMIENTO} días antes de que venza su póliza actual,
 * que es cuando se le puede ofrecer algo; nunca antes de mañana. Sin vencimiento, mañana.
 */
export function fechaPrimerPaso(vence: string | null, hoy: string): string {
  const manana = sumarDias(hoy, 1)
  if (!vence) return manana
  const antes = sumarDias(vence, -DIAS_ANTES_VENCIMIENTO)
  return antes > manana ? antes : manana
}

/**
 * Lo dictado por Alberto (args de la IA) MANDA sobre lo leído de los documentos, igual que en el
 * formulario de la ficha: si él dijo la prima, esa vale más que la del papel. De los documentos se
 * toma el primer valor que traiga cada campo.
 */
export function prepararAlta(
  args: Record<string, unknown>,
  lecturas: readonly LecturaDocumentoOportunidad[] | null,
  hoy: string,
): PreparacionAlta {
  const leidas = (lecturas ?? []).flatMap((l) => (l.estado === 'ok' ? [l] : []))
  const primero = <K extends 'ramo' | 'compania' | 'numeroPoliza' | 'vence' | 'prima'>(k: K) =>
    leidas.map((l) => l[k]).find((v) => v !== null) ?? null

  const ramoDictado = RAMOS_OPORTUNIDAD.find((r) => r === args.ramo) ?? null
  if (args.ramo !== undefined && args.ramo !== null && args.ramo !== '' && !ramoDictado) {
    return { ok: false, motivo: `ramo no válido; usa uno de: ${RAMOS_OPORTUNIDAD.join(', ')}` }
  }
  const ramo = ramoDictado ?? primero('ramo')
  if (!ramo) {
    return {
      ok: false,
      motivo: lecturas && leidas.length === 0
        ? 'no he podido leer el ramo de ningún documento y Alberto no lo ha dicho: pregúntale de qué es el seguro (auto, hogar, vida…)'
        : 'falta el ramo: pregúntale a Alberto de qué es el seguro (auto, hogar, vida…)',
    }
  }

  if (args.vence !== undefined && args.vence !== null && args.vence !== '' && !fecha(args.vence)) {
    return { ok: false, motivo: 'la fecha de vencimiento no es válida (aaaa-mm-dd)' }
  }
  const venceBruto = fecha(args.vence) ?? primero('vence')
  const venceDescartado = venceBruto !== null && venceBruto < hoy ? venceBruto : null
  const vence = venceDescartado ? null : venceBruto

  const pasoDictado = fecha(args.fechaPrimerPaso)
  if (args.fechaPrimerPaso !== undefined && args.fechaPrimerPaso !== null && args.fechaPrimerPaso !== '' && !pasoDictado) {
    return { ok: false, motivo: 'la fecha del primer paso no es válida (aaaa-mm-dd)' }
  }
  if (pasoDictado && pasoDictado < hoy) return { ok: false, motivo: 'el primer paso no puede ser en el pasado' }

  return {
    ok: true,
    alta: {
      ramo,
      aseguradora: texto(args.compania) ?? primero('compania'),
      prima: prima(args.prima) ?? primero('prima'),
      fechaFinVigencia: vence,
      numeroPoliza: texto(args.numeroPoliza, 60) ?? primero('numeroPoliza'),
      fechaTarea: pasoDictado ?? fechaPrimerPaso(vence, hoy),
      venceDescartado,
      documentos: lecturas === null ? null : {
        leidos: leidas.length,
        fallidos: lecturas.flatMap((l) => (l.estado === 'error' ? [l.motivo] : [])),
      },
    },
  }
}

/** El cuerpo que espera el puerto de asegura (`accion: 'crear'`), el mismo que manda la ficha. */
export function cuerpoAlta(clienteId: string, a: Alta, actor: string): Record<string, unknown> {
  return {
    accion: 'crear', clienteId, ramo: a.ramo, estado: 'competencia',
    fechaFinVigencia: a.fechaFinVigencia, aseguradora: a.aseguradora, prima: a.prima,
    tipoTarea: 'llamada', fechaTarea: a.fechaTarea,
    nota: a.numeroPoliza ? `Póliza actual nº ${a.numeroPoliza} (desde Telegram)` : 'Alta desde Telegram',
    actor,
  }
}

const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** El mensaje con el botón. Lo que no consta se dice; nada se rellena para que quede bonito. */
export function textoAlta(nombreCliente: string, a: Alta): string {
  const l = [
    `🎯 ¿Abro esta oportunidad para <b>${escapar(nombreCliente)}</b>?`,
    `• Ramo: ${escapar(rotuloRamo(a.ramo))}`,
    `• Compañía actual: ${a.aseguradora ? escapar(a.aseguradora) : 'no consta'}`,
    `• Prima actual: ${a.prima !== null ? eur(a.prima) : 'no consta'}`,
    `• Vence: ${a.fechaFinVigencia ? fechaEs(a.fechaFinVigencia) : 'no consta'}`,
  ]
  if (a.numeroPoliza) l.push(`• Póliza actual nº ${escapar(a.numeroPoliza)}`)
  l.push(`• Primer paso: llamada el ${fechaEs(a.fechaTarea)}`)
  if (a.venceDescartado) {
    l.push(`⚠️ El documento dice que vencía el ${fechaEs(a.venceDescartado)}, que ya pasó: se habrá renovado, así que no lo pongo. Corrígelo en la ficha cuando lo sepas.`)
  }
  if (a.documentos) {
    if (a.documentos.leidos > 0) l.push(`📎 Datos leídos de ${a.documentos.leidos} documento${a.documentos.leidos === 1 ? '' : 's'} que subiste. Revísalos antes de abrir.`)
    for (const m of a.documentos.fallidos) l.push(`⚠️ Un documento no se ha podido leer: ${escapar(m)}.`)
  }
  l.push('Nace «por contactar». El documento NO se archiva en la ficha: súbelo en 📎 Documentos si lo quieres guardar.')
  return l.join('\n')
}

/** Qué se le dice a Alberto tras pulsar, con el enlace a la ficha. */
export function resultadoAlta(status: number, json: unknown, url: string): { estado: 'abierta' | 'duplicada' | 'rechazada' | 'incierta'; texto: string } {
  const t = textoAltaOportunidad(status, json)
  if (t.ok) return { estado: 'abierta', texto: `✅ ${escapar(t.texto)}\n${url}` }
  if (status === 409) return { estado: 'duplicada', texto: `ℹ️ ${escapar(t.texto)} No he abierto otra.\n${url}` }
  // Sin respuesta o con un 5xx el alta pudo guardarse: decir «no se ha abierto» invitaría a duplicarla.
  if (status === 0 || status >= 500) {
    return { estado: 'incierta', texto: `⚠️ No sé si se ha abierto (la cartera no ha contestado bien). Mira la ficha antes de repetirlo: si se guardó, al repetir te avisará de que ya existe.\n${url}` }
  }
  return { estado: 'rechazada', texto: `✋ No se ha abierto: ${escapar(t.texto)}\n${url}` }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
