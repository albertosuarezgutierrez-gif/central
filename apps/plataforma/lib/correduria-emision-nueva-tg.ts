// Emitir por Telegram una póliza NUEVA (cliente sin póliza que sustituir, 29/09/2026) — parte PURA
// (sin `@/` ni prisma → node --test). La parte con BD y red vive en `correduria-asistente-telegram.ts`.
//
// Hermana de `correduria-emision-tg.ts` (que emite un proyecto hecho a mano en Avant2 para una póliza
// de la cartera). Aquí el proyecto es NUESTRO: la tarificación guardada del cliente. El camino es el
// mismo que la pantalla de emisión: confirmar precio (`/oferta`, ReRate) → resumen → botón → `/emitir`.
// Principio que no cambia: **la IA nunca emite ni escribe el resumen**; lo construye esto con lo que
// devuelve asegura, y el único camino a `/emitir` es el botón de un solo uso que pulsa Alberto.
import { createHash } from 'node:crypto'
import type { CambioFiguras, FiguraExigida, Precio } from './retarificar-asegura.ts'
import { ETIQUETA_CAMPO_FIGURA } from './figuras-emision-texto.ts'
import { MINUTOS_PROPUESTA } from './correduria-emision-tg.ts'

export type RamoNuevo = 'auto' | 'moto'

export function ramoNuevoValido(v: unknown): RamoNuevo | null {
  return v === 'auto' || v === 'moto' ? v : null
}

const normal = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export type EleccionPrecio =
  | { tipo: 'uno'; precio: Precio }
  | { tipo: 'no'; motivo: string }
  | { tipo: 'elegir'; precios: Precio[] }

/**
 * Qué precio de la tarificación guardada quiere Alberto. Por compañía y, si la da, por texto de
 * modalidad/categoría/producto; la prima desempata («la de 200»). Nunca por posición: con varios
 * candidatos se pregunta. Solo precios con compañía, categoría y prima legibles.
 */
export function elegirPrecioNuevo(precios: Precio[], compania: string, texto: string | null, primaEur: number | null): EleccionPrecio {
  const c = normal(compania)
  if (!c) return { tipo: 'no', motivo: 'falta la compañía' }
  const validos = precios.filter((p) => p.compania && p.categoria && typeof p.primaEur === 'number')
  let candidatos = validos.filter((p) => normal(p.compania).includes(c))
  if (candidatos.length === 0) return { tipo: 'no', motivo: `la tarificación guardada no tiene precios de ${compania}` }
  const t = normal(texto)
  if (t) {
    const palabras = t.split(' ').filter((w) => w.length > 1)
    const conTexto = candidatos.filter((p) => {
      const hay = normal(`${p.modalidad ?? ''} ${p.categoria ?? ''} ${p.producto ?? ''} ${(p.opciones ?? []).map((o) => o.valor).join(' ')}`)
      return palabras.every((w) => hay.includes(w))
    })
    // Lo que dijo Alberto no se ignora: si no casa con ningún precio, se dice, no se elige otro.
    if (conTexto.length === 0) return { tipo: 'no', motivo: `ningún precio de ${compania} casa con «${texto}»` }
    candidatos = conTexto
  }
  if (primaEur !== null && Number.isFinite(primaEur)) {
    const cerca = candidatos.filter((p) => Math.abs((p.primaEur as number) - primaEur) <= Math.max(5, primaEur * 0.03))
    if (cerca.length === 0) return { tipo: 'no', motivo: `ningún precio de ${compania} se acerca a ${primaEur}€` }
    candidatos = cerca
  }
  return candidatos.length === 1 ? { tipo: 'uno', precio: candidatos[0] } : { tipo: 'elegir', precios: candidatos }
}

/** Lo que Alberto confirma para una póliza NUEVA. Todo sale de asegura; la cuenta llega enmascarada. */
export interface ResumenEmisionNueva {
  tipo: 'nuevo'
  clienteId: string
  clienteNombre: string | null
  ramo: RamoNuevo
  /** Qué vehículo se asegura: sin ella no hay botón (el cliente puede tener dos tarificaciones). */
  matricula: string
  /** Cuándo se pidió el precio (de la tarificación guardada). */
  tarificadaEn: string | null
  tarificacionId: string
  projectId: string
  offerId: string
  compania: string
  categoria: string
  producto: string | null
  /** Modalidad de la compañía («Incendio + Robo»), si la tarificación guardada la trae. */
  modalidad?: string | null
  /** Prima que devolvió la compañía al CONFIRMAR el precio (ReRate), no la de la parrilla. */
  primaEur: number | null
  primaParrillaEur: number | null
  firmeza: string
  efecto: string | null
  caduca: string | null
  avisos: string[]
  cuenta: { enmascarada: string; descripcion: string | null }
  /** Casillas de figuras que Alberto confirma con ESTE botón (segundo paso tras un 409). */
  figurasConfirmadas: FiguraExigida[]
  cambiosFiguras: CambioFiguras[]
  /** El texto de cada casilla que se confirma, el mismo que enseña la pantalla. */
  casillasFiguras?: string[]
}

function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

export function huellaResumenNuevo(r: ResumenEmisionNueva): string {
  return createHash('sha256').update(canonico(r)).digest('hex')
}

/** Un resumen guardado en la fila, ¿es de póliza nueva? (las viejas no traen `tipo`). */
export function esResumenNuevo(v: unknown): v is ResumenEmisionNueva {
  return typeof v === 'object' && v !== null && (v as Record<string, unknown>).tipo === 'nuevo'
}

/** ¿Ha caducado ya el precio confirmado? Sin fecha no se presume caducado (asegura lo vuelve a mirar). */
export function precioCaducado(caduca: string | null, ahora: Date = new Date()): boolean {
  if (!caduca) return false
  const t = Date.parse(caduca)
  return Number.isFinite(t) && t < ahora.getTime()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const oNoConsta = (v: string | null) => (v ? esc(v) : '<i>no consta</i>')

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

function fecha(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'no consta'
}

/** El resumen encima del botón. Solo datos del puerto; nada escrito por la IA. */
export function textoResumenNuevo(r: ResumenEmisionNueva): string {
  const prima = r.primaEur !== null ? eur(r.primaEur) : 'no consta'
  const cambio = r.primaEur !== null && r.primaParrillaEur !== null && Math.abs(r.primaEur - r.primaParrillaEur) >= 0.01
    ? ` <i>(en la parrilla salía ${eur(r.primaParrillaEur)})</i>` : ''
  const figuras = r.cambiosFiguras.length
    ? [
        '',
        '👥 <b>Esta variante cambia personas o CP respecto a la primera del riesgo:</b>',
        ...r.cambiosFiguras.map((c) => `• ${esc(ETIQUETA_CAMPO_FIGURA[c.campo])}: ${oNoConsta(c.antes)} → ${oNoConsta(c.despues)}`),
        ...(r.casillasFiguras ?? []).map((c) => `☑️ ${esc(c)}`),
        'Al pulsar confirmas que es el riesgo REAL: quien conduce, quién es el dueño y dónde duerme el vehículo (arts. 10 y 89 LCS).',
      ]
    : []
  return [
    `🛡️ <b>Emisión NUEVA lista para confirmar</b> · ${r.ramo === 'moto' ? 'moto' : 'coche'}`,
    '',
    `Cliente: ${oNoConsta(r.clienteNombre)} · vehículo <b>${esc(r.matricula)}</b>`,
    `Tarificado ${fecha(r.tarificadaEn)}`,
    `<b>${esc(r.compania)}</b> · ${esc(r.categoria)}${r.modalidad ? ` · ${esc(r.modalidad)}` : ''}${r.producto ? ` · ${esc(r.producto)}` : ''}`,
    `Prima confirmada por la compañía: <b>${prima}</b>${cambio} · ${esc(r.firmeza)}`,
    `Efecto ${fecha(r.efecto)} · el precio caduca ${fecha(r.caduca)}`,
    `Cuenta de cargo: ${esc(r.cuenta.enmascarada)}${r.cuenta.descripcion ? ` (${esc(r.cuenta.descripcion)})` : ''}`,
    ...(r.avisos.length ? ['', '⚠️ Avisos de la compañía:', ...r.avisos.map((a) => `• ${esc(a)}`)] : []),
    ...figuras,
    '',
    `Proyecto ${esc(r.projectId)} · precio ${esc(r.offerId)}`,
    '📧 Al emitir, el cliente recibe un correo con su nuevo seguro (con el PDF si la compañía ya lo ha mandado; si no, le llega después) y lo ve en su portal.',
    `⚠️ Emitir es IRREVERSIBLE: crea el contrato con la compañía. El botón vale ${MINUTOS_PROPUESTA} minutos y un solo uso.`,
  ].join('\n')
}

/** Qué casillas pide asegura y no están aún confirmadas en este resumen. */
export function figurasPendientes(exigidas: FiguraExigida[], confirmadas: FiguraExigida[]): FiguraExigida[] {
  return exigidas.filter((e) => !confirmadas.includes(e))
}
