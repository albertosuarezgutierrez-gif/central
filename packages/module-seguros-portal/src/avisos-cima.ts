/**
 * Avisos push de lo que llega de CIMA (25/09/2026): recibo nuevo al cobro, recibo
 * devuelto y movimientos de un siniestro. Lo pidió un cliente en la demo del
 * portal («que me avise de recibos, de la póliza y del siniestro»).
 *
 * Aquí se decide QUÉ es novedad y QUÉ dice la notificación; el cron
 * (`apps/asegura-portal/app/api/cron/avisos-cima`) solo lee y envía.
 *
 * Reglas que no se negocian:
 *
 * 1. 🚨 **Semilla silenciosa por póliza Y por tipo de dato.** La primera vez que una
 *    identidad VE los recibos (o los siniestros) de una póliza, todo lo que ya hay
 *    se sella sin avisar. Es por lista y no por póliza porque la visibilidad cambia:
 *    pasar de «Solo ver» a «Acceso total» abre de golpe un historial que ya existía,
 *    y eso no es una novedad. Una lista `null` (no visible) NO siembra.
 * 2. ⏳ **Ventana de antigüedad** (`DIAS_NOVEDAD`): lo que tiene fecha propia más
 *    vieja no se avisa aunque no esté sellado. Cubre lo que la semilla no ve: CIMA
 *    rellenando a posteriori la tramitación de un siniestro de hace un año.
 * 3. 🔒 **Nada sensible en el texto.** Una notificación sale en la pantalla de
 *    bloqueo: sin importes, sin matrícula, sin nombres y **sin el tipo de siniestro**
 *    («Fallecimiento», «Invalidez», «Enfermedad» son datos de salud, art. 9 RGPD).
 *    Solo qué pasó y en qué ramo/compañía; el detalle está dentro del portal.
 * 4. 🔑 **La clave es el dato en bruto, nunca el texto traducido.** Si la clave
 *    dependiera de un diccionario, reescribir una traducción haría reaparecer como
 *    novedad cada paso viejo de cada cliente.
 * 5. **Los permisos NO se deciden aquí.** La entrada es lo que la identidad YA VE
 *    (`carteraDeIdentidad`, con autorizaciones y campos capados): si no ve los
 *    siniestros de una ficha, llegan como `null` y no hay evento.
 *
 * Coste aceptado: dos recibos de la misma póliza con las MISMAS fechas (una
 * reemisión tras devolución) comparten clave, y el segundo no se avisa.
 */
import { etiquetaEstadoSiniestro } from './siniestro-historial.ts'
import type { TramitacionSiniestro } from './siniestro-tramitacion.ts'

export const TIPOS_AVISO_CIMA = ['recibo_nuevo', 'recibo_devuelto', 'siniestro'] as const
export type TipoAvisoCima = (typeof TIPOS_AVISO_CIMA)[number]

/** Lo que se sella además de los tipos: la semilla. Los dos van al CHECK de la tabla. */
export const TIPO_SEMILLA = 'base'

export const ETIQUETA_AVISO_CIMA: Record<TipoAvisoCima, string> = {
  recibo_nuevo: 'Recibo nuevo al cobro',
  recibo_devuelto: 'Recibo devuelto',
  siniestro: 'Novedades de un siniestro',
}

/** Más viejo que esto (por su fecha propia) no es una novedad, aunque no esté sellado. */
export const DIAS_NOVEDAD = 45

export function esTipoAvisoCima(v: unknown): v is TipoAvisoCima {
  return typeof v === 'string' && (TIPOS_AVISO_CIMA as readonly string[]).includes(v)
}

/** Lo mínimo de `PolizaPortal` que hace falta. `null` = la identidad no lo ve (o no consta). */
export type PolizaParaAviso = {
  id: string
  ramo: string
  compania: string
  /** De otra persona que te autorizó: el texto no puede decir «tu póliza». */
  ajena?: boolean
  recibos: { situacion: string; fechaEmision: Date | null; fechaVencimiento: Date | null }[] | null
  siniestros:
    | { id: string; estado: string; fechaHora: Date | null; tramitacion: TramitacionSiniestro | null }[]
    | null
}

export type EventoCima = {
  clave: string
  tipo: TipoAvisoCima
  polizaId: string
  /** Qué lista lo trae: de ella depende la semilla. */
  lista: 'recibos' | 'siniestros'
  /** Fecha propia del hecho (`null` = no consta): la mira la ventana de antigüedad. */
  fecha: Date | null
  texto: string
}

const MS_DIA = 86_400_000
const dia = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)
const fechaIso = (s: string | null): Date | null => (s ? new Date(`${s}T00:00:00Z`) : null)
const masReciente = (a: Date | null, b: Date | null): Date | null => (!a ? b : !b ? a : a > b ? a : b)

export const claveBase = (polizaId: string, lista: 'recibos' | 'siniestros'): string => `base:${polizaId}:${lista}`

function donde(p: PolizaParaAviso): string {
  return p.ajena ? `la póliza de ${p.ramo} (${p.compania}) que sigues` : `tu póliza de ${p.ramo} (${p.compania})`
}

/** Todo lo que hoy es «novedad posible» en lo que la identidad ve. Sin estado: el sello decide. */
export function eventosDePolizas(polizas: readonly PolizaParaAviso[]): EventoCima[] {
  const eventos: EventoCima[] = []
  for (const p of polizas) {
    for (const r of p.recibos ?? []) {
      const emision = dia(r.fechaEmision)
      const venc = dia(r.fechaVencimiento)
      // Sin ninguna fecha no hay forma estable de reconocer el recibo en la
      // pasada siguiente: avisar sería avisar de él cada vez. Se calla.
      if (!emision && !venc) continue
      const id = `rec:${p.id}:${emision ?? '-'}:${venc ?? '-'}`
      const fecha = masReciente(r.fechaEmision, r.fechaVencimiento)
      const s = r.situacion.trim().toLowerCase()
      if (s === 'emitido' || s === 'pendiente') {
        // Mismo sello para emitido y pendiente: son el mismo recibo camino del cobro.
        eventos.push({
          clave: `${id}:cobro`,
          tipo: 'recibo_nuevo',
          polizaId: p.id,
          lista: 'recibos',
          fecha,
          texto: `Hay un recibo nuevo al cobro en ${donde(p)}.`,
        })
      } else if (s === 'devuelto') {
        eventos.push({
          clave: `${id}:devuelto`,
          tipo: 'recibo_devuelto',
          polizaId: p.id,
          lista: 'recibos',
          fecha,
          texto: `Se ha devuelto un recibo de ${donde(p)}. Entra para ver cómo resolverlo antes de quedarte sin cobertura.`,
        })
      }
    }
    for (const s of p.siniestros ?? []) {
      // 🔒 Nunca `tipoLegible`: el tipo de siniestro puede ser un dato de salud.
      const que = p.ajena ? `El siniestro de ${p.ramo}` : `Tu siniestro de ${p.ramo}`
      const base = { tipo: 'siniestro' as const, polizaId: p.id, lista: 'siniestros' as const }
      eventos.push({ ...base, clave: `sin:${s.id}`, fecha: s.fechaHora, texto: `Se ha registrado un siniestro en ${donde(p)}.` })
      // «abierto» es el estado con el que nace: el aviso de alta ya lo dice. El
      // cambio de estado no trae fecha propia: la ventana no lo filtra, la semilla sí.
      if (s.estado !== 'abierto') {
        eventos.push({
          ...base,
          clave: `sin:${s.id}:estado:${s.estado}`,
          fecha: null,
          texto: `${que}: ${etiquetaEstadoSiniestro(s.estado).toLowerCase()}.`,
        })
      }
      for (const paso of s.tramitacion?.pasos ?? []) {
        // El texto del paso ya viene traducido y SIN nombres ni importes
        // (`siniestro-tramitacion.ts`); la clave va por el código en bruto.
        eventos.push({
          ...base,
          clave: `sin:${s.id}:${paso.tipo}:${paso.codigo}:${paso.fecha ?? '-'}`.slice(0, 300),
          fecha: fechaIso(paso.fecha),
          texto: `${que} avanza: ${paso.texto}.`,
        })
      }
    }
  }
  return eventos
}

export type PlanAvisos = {
  /** Lo que se notifica. */
  enviar: EventoCima[]
  /** Claves que se sellan pase lo que pase con el envío (semilla, silenciados, viejos). */
  sellarSiempre: { clave: string; tipo: string }[]
}

/**
 * Qué se avisa y qué se sella en silencio.
 *
 * - Lista visible sin `claveBase` sellada → semilla: se sella todo, no se envía nada.
 * - Tipo silenciado por el cliente → se sella igual, para que al reactivarlo no le
 *   llegue de golpe lo que pasó mientras estaba apagado.
 * - Con fecha propia más vieja que `DIAS_NOVEDAD` → se sella sin enviar.
 * - Lo que queda y no está sellado → se envía. El cron sella estas claves SOLO si
 *   algún envío se aceptó: si fallan todos, se reintenta la pasada siguiente.
 */
export function planificarAvisos(
  polizas: readonly PolizaParaAviso[],
  selladas: ReadonlySet<string>,
  silenciados: ReadonlySet<string>,
  hoy: Date,
): PlanAvisos {
  const enviar: EventoCima[] = []
  const sellarSiempre: { clave: string; tipo: string }[] = []
  const vistas = new Set<string>()
  const limite = hoy.getTime() - DIAS_NOVEDAD * MS_DIA

  for (const p of polizas) {
    for (const lista of ['recibos', 'siniestros'] as const) {
      const clave = claveBase(p.id, lista)
      if (p[lista] !== null && !selladas.has(clave)) sellarSiempre.push({ clave, tipo: TIPO_SEMILLA })
    }
  }
  for (const e of eventosDePolizas(polizas)) {
    if (selladas.has(e.clave) || vistas.has(e.clave)) continue
    vistas.add(e.clave)
    const semilla = !selladas.has(claveBase(e.polizaId, e.lista))
    const viejo = e.fecha !== null && e.fecha.getTime() < limite
    if (semilla || viejo || silenciados.has(e.tipo)) {
      sellarSiempre.push({ clave: e.clave, tipo: e.tipo })
    } else {
      enviar.push(e)
    }
  }
  return { enviar, sellarSiempre }
}

/** Una notificación por identidad y pasada: con varias novedades, un resumen. */
export function textoPushCima(eventos: readonly EventoCima[]): { title: string; body: string } | null {
  if (eventos.length === 0) return null
  if (eventos.length === 1) return { title: ETIQUETA_AVISO_CIMA[eventos[0].tipo], body: eventos[0].texto }
  // El devuelto manda: es el único que pide hacer algo YA.
  const primero = eventos.find((e) => e.tipo === 'recibo_devuelto') ?? eventos[0]
  const resto = eventos.length - 1
  return {
    title: 'Novedades en tus seguros',
    body: `${primero.texto} Y ${resto} ${resto === 1 ? 'novedad más' : 'novedades más'}.`,
  }
}
