/**
 * Avisos de la fase B (13/10/2026): tres avisos nuevos que salen por el MISMO cron, sello e
 * interruptor que los de CIMA (`avisos-cima.ts`, `portal_aviso_cima`, `portal_aviso_silenciado`).
 * Aquí se decide QUÉ es aviso y QUÉ dice; el cron (`app/api/cron/avisos-cima`) solo lee y envía.
 *
 *  1. `vencimiento_aportada` — una póliza que APORTÓ el cliente (no la gestiona la correduría) vence
 *     pronto: «¿Quieres que te preparemos una comparativa?» (la pregunta, solo con el consentimiento
 *     `comercial` vigente: es una oferta). Ventana FIJA (no la antelación de
 *     «Configuración»): entre 45 y 30 días antes del vencimiento. El tope de 30 no es estético: pasada
 *     esa fecha el tomador ya no puede oponerse a la prórroga (art. 22 LCS, `DIAS_PREAVISO_TOMADOR`) y
 *     ofrecerle una comparativa sería ofrecerle algo que ya no puede usar sin coste.
 *  2. `subida_prima` — el precio de una póliza (de la cartera o aportada) sube más del umbral elegido.
 *     Se compara contra la ÚLTIMA observación guardada (`portal_prima_observada`), nunca entre dos
 *     unidades distintas: la `unidad` lleva qué importe es (bruta anual de CIMA / prima anual declarada)
 *     y con qué fraccionamiento. Si la unidad cambia se re-siembra en silencio (pasar de anual a
 *     mensual mete el recargo de fraccionamiento: no es una subida). `null` = no se sabe → no se avisa
 *     y NO se pisa lo guardado.
 *  3. `vencimiento_autorizado` — el vencimiento de una póliza de quien te dio acceso de GESTIÓN o TOTAL
 *     sobre ESA póliza (`capacidadesDeAlcances(...).abrirParte` + la lista `partes` por póliza). Con
 *     «Consulta» (`ver`, `ver_economico`, `documentos`) NO: ese nivel mira, no actúa; avisarle sería
 *     servirle activamente el dato de otro para que decida algo que su nivel no le deja hacer. La vía
 *     `dueno` (su empresa) tampoco: no es una autorización y el encargo es solo de autorizaciones.
 *
 * 🔒 Lo que sale en la PANTALLA DE BLOQUEO (decisión de Alberto, 13/10/2026): los avisos 2 y 3 NO llevan
 * importes, porcentaje, ramo, compañía ni el nombre del titular — un móvil bloqueado lo lee cualquiera que
 * esté al lado, y en el 3 el dato es de OTRA persona. Texto FIJO (`TEXTO_SUBIDA_PRIMA`,
 * `TEXTO_VENCIMIENTO_AUTORIZADO`); el detalle se ve solo dentro de la app, en la ficha a la que lleva el
 * aviso. Nada de matrícula, número de póliza, DNI ni dirección en ninguno.
 */
import type { EventoCima } from './avisos-cima.ts'
import { capacidadesDeAlcances } from './capacidades.ts'
import type { TipoOtorgante } from './autorizacion.ts'
import {
  DIAS_PREAVISO_TOMADOR,
  entraEnVentana,
  fechaAccionable,
  obligacionDerivable,
  reparoDeclarada,
  type VigenciaObligacion,
} from './obligacion.ts'
import { etiquetaRamo } from './poliza-leida.ts'

const MS_DIA = 86_400_000
const diaUtc = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const iso = (d: Date): string => d.toISOString().slice(0, 10)
/** `dd/mm/aaaa` del día UTC (las fechas de póliza son `@db.Date`). */
export function fechaCorta(d: Date): string {
  const [a, m, dd] = iso(d).split('-')
  return `${dd}/${m}/${a}`
}

/** «Hogar» → «hogar»; un acrónimo («RC») se deja tal cual. */
function enMinuscula(t: string): string {
  return t.length > 1 && t[1] === t[1].toUpperCase() && t[1] !== t[1].toLowerCase() ? t : t.charAt(0).toLowerCase() + t.slice(1)
}

// ─── 1. Vencimiento de una póliza APORTADA ───────────────────────────────────

/** Días antes del vencimiento en que se ofrece la comparativa (el primer día de la ventana). */
export const DIAS_CAPTACION_APORTADA = 45

export type DeclaradaParaAviso = {
  id: string
  ramo: string | null
  compania: string | null
  fechaVencimiento: Date | null
  confirmadaPorUsuario: boolean
}

export const PREGUNTA_COMPARATIVA = '¿Quieres que te preparemos una comparativa?'

/**
 * 🚨 La pregunta de la comparativa es una OFERTA del servicio de la correduría (comunicación comercial
 * por medio electrónico, art. 21 LSSI): solo va con el consentimiento `comercial` VIGENTE, que es
 * exactamente «revisad mis seguros guardados y contactadme cuando se acerque un vencimiento».
 * Sin él, el aviso se queda en el hecho (el vencimiento), que sí cubre el consentimiento de `avisos`.
 */
export function textoVencimientoAportada(
  p: { ramo: string | null; compania: string | null; fechaVencimiento: Date },
  ofrecerComparativa: boolean,
): string {
  const ramo = etiquetaRamo(p.ramo)
  const deQue = ramo ? ` de ${enMinuscula(ramo)}` : ''
  const conQuien = p.compania?.trim() ? ` con ${p.compania.trim()}` : ''
  const hecho = `Tu seguro${deQue}${conQuien} vence el ${fechaCorta(p.fechaVencimiento)}.`
  return ofrecerComparativa ? `${hecho} ${PREGUNTA_COMPARATIVA}` : hecho
}

/**
 * Las aportadas PROPIAS (no eliminadas: lo filtra quien lee) cuyo vencimiento cae dentro de la ventana.
 * · Mismo cepo que el calendario (`reparoDeclarada`): sin fecha o sin confirmar por la persona no se
 *   avisa — la fecha la adivinó un extractor y avisar sobre ella es peor que callar.
 * · `pedidas`: ids con la captación ya pedida («Que la gestione Grupo ASegura»): ya nos lo ha dicho.
 * · La clave lleva la FECHA: la renovación del año que viene vuelve a avisar; una fecha corregida, también.
 * · `ofrecerComparativa`: `consentimientoVigente(..., 'comercial', VERSION_TEXTO_COMERCIAL) === true`
 *   (`null` = no consta → NO se ofrece; ver `textoVencimientoAportada`).
 */
export function eventosVencimientoAportada(
  declaradas: readonly DeclaradaParaAviso[],
  hoy: Date,
  pedidas: ReadonlySet<string> = new Set(),
  ofrecerComparativa = false,
): EventoCima[] {
  const out: EventoCima[] = []
  for (const p of declaradas) {
    if (reparoDeclarada(p) !== null || p.fechaVencimiento === null) continue
    if (pedidas.has(p.id)) continue
    const faltan = Math.round((diaUtc(p.fechaVencimiento) - diaUtc(hoy)) / MS_DIA)
    if (faltan > DIAS_CAPTACION_APORTADA || faltan < DIAS_PREAVISO_TOMADOR) continue
    out.push({
      clave: `apo-venc:${p.id}:${iso(p.fechaVencimiento)}`,
      tipo: 'vencimiento_aportada',
      polizaId: p.id,
      lista: 'polizas',
      fecha: null,
      texto: textoVencimientoAportada({ ramo: p.ramo, compania: p.compania, fechaVencimiento: p.fechaVencimiento }, ofrecerComparativa),
      url: `/boveda/anadida/${p.id}`,
    })
  }
  return out
}

// ─── 2. Subida de prima ──────────────────────────────────────────────────────

export const UMBRALES_SUBIDA_PRIMA = [5, 10, 15, 20] as const
export type UmbralSubidaPrima = (typeof UMBRALES_SUBIDA_PRIMA)[number]
export const UMBRAL_SUBIDA_POR_DEFECTO: UmbralSubidaPrima = 10

export function esUmbralSubidaPrima(v: unknown): v is UmbralSubidaPrima {
  return typeof v === 'number' && (UMBRALES_SUBIDA_PRIMA as readonly number[]).includes(v)
}

export type OrigenPrima = 'cartera' | 'aportada'

/** Un importe con QUÉ es: dos importes solo se comparan si su `unidad` es idéntica. */
export type PrimaObservable = { importe: number; unidad: string }

/**
 * La prima de una póliza de la CARTERA que se puede comparar, o `null`.
 * Solo la BRUTA anual (lo que paga el cliente): mezclarla con la neta es el error de la foto v1 de
 * `poliza-cambios.ts`. `dudosa` (CIMA mandó el importe del PERIODO) → `null` aunque haya número.
 */
export function primaCarteraObservable(
  prima: { bruta: number | null; fraccionamiento: string | null; dudosa?: boolean } | null,
): PrimaObservable | null {
  if (prima === null || prima.dudosa === true) return null
  const b = prima.bruta
  if (b === null || !Number.isFinite(b) || b <= 0) return null
  return { importe: b, unidad: `cartera-bruta-anual|${prima.fraccionamiento?.trim().toLowerCase() || '-'}` }
}

/** La prima ANUAL declarada de una aportada, con su periodicidad (`null` = no se sabe → otra unidad). */
export function primaAportadaObservable(p: { primaAnual: number | null; periodicidadPago: string | null }): PrimaObservable | null {
  const a = p.primaAnual
  if (a === null || !Number.isFinite(a) || a <= 0) return null
  return { importe: a, unidad: `declarada-anual|${p.periodicidadPago?.trim().toLowerCase() || '-'}` }
}

export type Subida = { desde: number; hasta: number; porcentaje: number; en: Date }
export type ObservacionPrima = { importe: number; unidad: string; subida: Subida | null }

const centimos = (n: number): number => Math.round(n * 100)

/**
 * Qué se guarda tras mirar la prima de hoy. `null` = no se escribe nada.
 *  · Hoy no se sabe (`actual === null`) → nada: `null` no es 0 ni «ha bajado», y pisar lo guardado
 *    haría que al volver el dato se comparase contra nada.
 *  · Primera vez → semilla (sin subida): la prima que ya tenía no es una novedad.
 *  · Otra unidad → re-semilla (sin subida): nunca se comparan importes de unidades distintas.
 *  · Mismo importe → nada (la subida pendiente, si la hay, sigue).
 *  · Sube MÁS del umbral (estricto) → se guarda la subida con desde/hasta/%.
 *  · Cualquier otro cambio → nuevo importe y la subida pendiente se BORRA: si el precio volvió a
 *    bajar, avisar «sube» sería falso.
 */
export function observarPrima(
  anterior: ObservacionPrima | null,
  actual: PrimaObservable | null,
  umbral: number,
  ahora: Date,
): ObservacionPrima | null {
  if (actual === null) return null
  if (anterior === null || anterior.unidad !== actual.unidad || centimos(anterior.importe) <= 0) {
    return { importe: actual.importe, unidad: actual.unidad, subida: null }
  }
  const a = centimos(anterior.importe)
  const n = centimos(actual.importe)
  if (a === n) return null
  const porcentaje = ((n - a) / a) * 100
  const subida = porcentaje > umbral ? { desde: a / 100, hasta: n / 100, porcentaje: Math.round(porcentaje * 100) / 100, en: ahora } : null
  return { importe: actual.importe, unidad: actual.unidad, subida }
}

/** 🔒 Pantalla de bloqueo: sin importes, %, ramo ni compañía. El detalle, dentro de la app. */
export const TEXTO_SUBIDA_PRIMA = 'Una de tus pólizas sube de precio. Ábrela para ver el detalle.'

export function textoSubidaPrima(): string {
  return TEXTO_SUBIDA_PRIMA
}

export type ObservacionGuardada = { origen: OrigenPrima; refId: string; ramo: string | null; subida: Subida | null }

/**
 * Un evento por observación con subida PENDIENTE. Se deriva de lo guardado (no del momento de
 * detectarla): si el push de hoy falla, mañana se vuelve a intentar. `fecha` = cuándo se detectó, para
 * que la ventana de `planificarAvisos` no mande una subida de hace meses.
 */
export function eventosSubidaPrima(obs: readonly ObservacionGuardada[]): EventoCima[] {
  return obs.flatMap((o) => {
    if (o.subida === null) return []
    const s = o.subida
    return [{
      clave: `prima:${o.origen}:${o.refId}:${s.desde.toFixed(2)}:${s.hasta.toFixed(2)}`,
      tipo: 'subida_prima' as const,
      polizaId: o.refId,
      lista: 'polizas' as const,
      fecha: s.en,
      texto: textoSubidaPrima(),
      url: o.origen === 'cartera' ? `/boveda/poliza/${o.refId}` : `/boveda/anadida/${o.refId}`,
    }]
  })
}

// ─── 3. Vencimiento de las pólizas de quien te dio acceso ────────────────────

export type TitularAutorizadoParaAviso = {
  nombre: string
  tipoPersona: TipoOtorgante
  /** `undefined` = no es una autorización (propias): no avisa por aquí. */
  autorizacion?: { alcances: readonly unknown[]; partes: readonly string[]; via?: 'dueno' }
  polizas: readonly {
    id: string
    ramo: string
    compania: string
    fechaVencimiento: Date | null
    vigencia: VigenciaObligacion
    procedencia: { importRef: string | null; eiacXmlHash: string | null }
    figuraTitular?: unknown
  }[]
}

/** Del titular, lo mínimo que lo identifica para quien ya lo conoce: nombre de pila si es persona. */
export function nombreTitularParaAviso(nombre: string, tipo: TipoOtorgante): string | null {
  const n = nombre.trim().replace(/\s+/g, ' ')
  if (!n) return null
  return tipo === 'juridica' ? n : n.split(' ')[0]
}

/** 🔒 Pantalla de bloqueo: sin nombre del titular, ramo, compañía ni fecha. El detalle, dentro de la app. */
export const TEXTO_VENCIMIENTO_AUTORIZADO = 'Vence una póliza de una persona que te dio acceso.'

export function textoVencimientoAutorizado(): string {
  return TEXTO_VENCIMIENTO_AUTORIZADO
}

/**
 * Los vencimientos de las pólizas AJENAS que esta identidad puede GESTIONAR, con SU antelación
 * (`diasAntelacion` de sus preferencias) y la misma regla que el calendario del titular: cartera viva y
 * vigente (`obligacionDerivable`), fecha accionable = vencimiento − 30 días, ventana `entraEnVentana`.
 * La entrada es lo que la identidad YA VE (`carteraDeIdentidad`: solo autorizaciones ACEPTADAS, no
 * revocadas ni caducadas); aquí se exige además, póliza a póliza, el nivel que actúa.
 */
export function eventosVencimientoAutorizado(
  titulares: readonly TitularAutorizadoParaAviso[],
  hoy: Date,
  diasAntelacion: number,
): EventoCima[] {
  const out: EventoCima[] = []
  for (const t of titulares) {
    const a = t.autorizacion
    if (!a || a.via === 'dueno') continue
    if (!capacidadesDeAlcances(a.alcances, t.tipoPersona).abrirParte) continue
    for (const p of t.polizas) {
      // Una póliza de OTRO tomador en la que la ficha solo figura: el acceso no es a ella.
      if (p.figuraTitular !== undefined) continue
      // Por póliza: un «Total» sobre el coche no abre el vencimiento del hogar si este es solo Consulta.
      if (!a.partes.includes(p.id)) continue
      if (!obligacionDerivable({ ...p.procedencia, fechaVencimiento: p.fechaVencimiento, vigencia: p.vigencia })) continue
      const venc = p.fechaVencimiento
      if (venc === null) continue
      if (!entraEnVentana({ fechaAccionable: fechaAccionable(venc), hoy, dias: diasAntelacion })) continue
      out.push({
        clave: `aut-venc:${p.id}:${iso(venc)}`,
        tipo: 'vencimiento_autorizado',
        polizaId: p.id,
        lista: 'polizas',
        fecha: null,
        texto: textoVencimientoAutorizado(),
        url: `/boveda/poliza/${p.id}`,
      })
    }
  }
  return out
}
