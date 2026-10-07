// apps/asegura/lib/seguro-anterior-reglas.ts
//
// La parte PURA de imputar el seguro anterior a un vehículo NUEVO (03/10/2026): qué se publica,
// cuándo el bonus va supuesto y la decisión con las candidatas ya leídas. Sin BD (la lectura entra
// por parámetro), así que se testea sin Prisma. La lectura vive en `seguro-anterior-candidatas.ts`.

import {
  candidataPublica,
  elegirSeguroAnteriorParaImputar,
  historialParaImputar,
  type CandidataPublica,
  type CandidataSeguroAnterior,
  type HistorialImputado,
  type TipoVehiculoNuevo,
} from '@central/module-seguros'
import type { ClienteCartera } from './codeoscopic/desde-cartera.ts'

export type LecturaCandidatas =
  /** `conyugeNoMirado`: no se pudieron leer las relaciones, así que NO se sabe si hay pólizas del cónyuge. */
  | { ok: true; candidatas: CandidataSeguroAnterior[]; conyugeNoMirado?: boolean }
  | { ok: false; motivo: string }

/** La fecha de carné MÁS ANTIGUA de la ficha: los años que lleva conduciendo (techo del bonus). */
export function carnetMasAntiguo(cliente: Pick<ClienteCartera, 'fechaCarnet' | 'carnets'>): string | null {
  const fechas = [cliente.fechaCarnet, ...(cliente.carnets ?? []).map((c) => c.fechaExpedicion)]
    .filter((f): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
  return fechas[0] ?? null
}

/** Lo que cruza el puerto sobre el seguro anterior imputado. */
export type SeguroAnteriorPublico = {
  /** `imputado` · `ninguno` (no hay ninguna declarable) · `desactivado` (el corredor lo apagó) ·
   *  `manual` (lo ha tecleado el corredor) · `no_disponible` (no se ha podido mirar: ≠ «no tiene»). */
  estado: 'imputado' | 'ninguno' | 'desactivado' | 'manual' | 'no_disponible'
  elegida: CandidataPublica | null
  porque: string
  alternativas: CandidataPublica[]
  avisos: string[]
  elegidaPorCorredor: boolean
  /**
   * `true` = los años sin siniestros se han declarado al MÁXIMO porque no constaban: el precio está
   * CONDICIONADO a verificación (SINCO o certificado) y no se emite sin ella. `false` = dato o no se
   * declara bonus.
   */
  bonusSupuesto: boolean
  condicion: string | null
  /** `true` = no se pudo comprobar el cónyuge (≠ «no tiene»). */
  conyugeNoMirado?: boolean
}

export const CONDICION_BONUS_SUPUESTO =
  'Bonus supuesto: precio condicionado a verificación SINCO o certificado de siniestralidad antes de emitir.'

export type Imputacion =
  | { ok: true; historial: HistorialImputado | null; publico: SeguroAnteriorPublico }
  | { ok: false; status: 422 | 503; causa: string; mensaje: string }

/**
 * Decide el seguro anterior para un vehículo nuevo. `cuerpo` es el de la ruta:
 *   - `seguroAnteriorId`: la candidata que elige el corredor (override);
 *   - `sinSeguroAnterior: true`: no declarar ninguno (de calle);
 *   - `correcciones.aseguradoAntes`: si el corredor ya declara a mano (o lo apaga), manda él.
 */
export async function imputarConLectura(entrada: {
  correduriaId: string
  clienteId: string
  tipoNuevo: TipoVehiculoNuevo
  cliente: Pick<ClienteCartera, 'fechaCarnet' | 'carnets'>
  cuerpo: Record<string, unknown>
  correcciones: Record<string, unknown> | undefined
  hoy: string
  /** La lectura de las candidatas (BD en `seguro-anterior-candidatas.ts`; un doble en los tests). */
  leer: (correduriaId: string, clienteId: string) => Promise<LecturaCandidatas>
}): Promise<Imputacion> {
  const vacio = (estado: SeguroAnteriorPublico['estado'], porque: string): Imputacion => ({
    ok: true,
    historial: null,
    publico: { estado, elegida: null, porque, alternativas: [], avisos: [], elegidaPorCorredor: false, bonusSupuesto: false, condicion: null },
  })
  if (entrada.cuerpo.sinSeguroAnterior === true || entrada.correcciones?.aseguradoAntes === false) {
    return vacio('desactivado', 'el corredor ha indicado que no se declare seguro anterior: se cotiza de calle')
  }
  const elegidaId = typeof entrada.cuerpo.seguroAnteriorId === 'string' && entrada.cuerpo.seguroAnteriorId.trim() !== ''
    ? entrada.cuerpo.seguroAnteriorId.trim()
    : null
  const manual = entrada.correcciones?.aseguradoAntes === true && elegidaId === null

  const lectura = await entrada.leer(entrada.correduriaId, entrada.clienteId)
  if (!lectura.ok) {
    if (manual) return vacio('manual', 'el seguro anterior lo ha tecleado el corredor')
    return {
      ok: false,
      status: 503,
      causa: 'seguro_anterior_no_disponible',
      mensaje:
        'No se han podido leer las otras pólizas de motor del cliente para imputar su bonus, y cotizar de calle sin ' +
        'mirarlo sería pagar un precio peor por un fallo nuestro. No se ha pedido precio. Reinténtalo, o manda ' +
        '`sinSeguroAnterior: true` si de verdad no tiene.',
    }
  }
  return marcarConyuge(decidir(lectura), lectura.conyugeNoMirado === true)

  function decidir(lectura: Extract<LecturaCandidatas, { ok: true }>): Imputacion {
  const r = elegirSeguroAnteriorParaImputar(lectura.candidatas, entrada.tipoNuevo, { clienteId: entrada.clienteId, elegidaId })
  if (r.estado === 'error') return { ok: false, status: 422, causa: r.causa, mensaje: r.mensaje }

  const alternativas = r.alternativas.map(candidataPublica)
  if (manual) {
    return {
      ok: true,
      historial: null,
      publico: {
        estado: 'manual', elegida: null, porque: 'el seguro anterior lo ha tecleado el corredor: manda sobre la propuesta',
        alternativas: r.elegida ? [candidataPublica(r.elegida), ...alternativas] : alternativas,
        avisos: [], elegidaPorCorredor: true, bonusSupuesto: false, condicion: null,
      },
    }
  }
  if (!r.elegida) {
    return {
      ok: true,
      historial: null,
      publico: { estado: 'ninguno', elegida: null, porque: r.porque, alternativas, avisos: r.avisos, elegidaPorCorredor: false, bonusSupuesto: false, condicion: null },
    }
  }
  const historial = historialParaImputar(r.elegida, { fechaCarnet: carnetMasAntiguo(entrada.cliente), hoy: entrada.hoy })
  const avisos = [...r.avisos, ...(r.elegida.notas ?? [])]
  if (!historial.datos.matriculaAnterior) {
    avisos.push('No consta la matrícula de esa póliza: la compañía buscará el historial con la del vehículo nuevo y puede no encontrarlo.')
  }
  return {
    ok: true,
    historial,
    publico: {
      estado: 'imputado',
      elegida: candidataPublica(r.elegida),
      porque: r.porque,
      alternativas,
      avisos,
      elegidaPorCorredor: r.elegidaPorCorredor,
      bonusSupuesto: historial.bonusSupuesto,
      condicion: historial.bonusSupuesto ? CONDICION_BONUS_SUPUESTO : null,
    },
  }
  }
}

function marcarConyuge(i: Imputacion, noMirado: boolean): Imputacion {
  return noMirado && i.ok ? { ...i, publico: { ...i.publico, conyugeNoMirado: true } } : i
}

/**
 * Imputar para la PRECALIFICACIÓN (gratis): una excepción (lectura o regla) degrada a
 * `no_disponible` en vez de reventar la ruta con 500. Las rutas que PAGAN siguen con
 * `imputarConLectura` (cortan antes de gastar).
 */
export async function imputarParaPrecalificar(entrada: Parameters<typeof imputarConLectura>[0]): Promise<Imputacion> {
  try {
    return await imputarConLectura(entrada)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.log('[seguro-anterior] precalificar: la imputación ha lanzado —', detalle.replace(/postgres(ql)?:\/\/\S+/gi, '[url]'))
    return {
      ok: false,
      status: 503,
      causa: 'seguro_anterior_no_disponible',
      mensaje: 'No se ha podido calcular el seguro anterior del cliente (error interno). No es que no tenga: no se ha podido mirar.',
    }
  }
}

/**
 * Orígenes de unos años tecleados que cuentan como DATO (no supuesto). `'corredor'` NO está (03/10/2026,
 * criterio conservador): un número tecleado por encima de lo que acreditan los datos se verifica antes
 * de emitir. La pantalla manda `'documento'` con `origenesHistorialManual()` (module-seguros), la misma
 * regla que `historialParaImputar`.
 */
const ORIGENES_DATO = new Set(['documento', 'verificado'])

/**
 * ¿El bonus que de verdad viaja está supuesto? Se decide con los datos FINALES (tras las correcciones
 * del corredor), campo a campo: años sin siniestros (`bonusOrigen`) y años ASEGURADO
 * (`aniosAseguradoOrigen`). Fail-closed: un campo tecleado sin decir que sale del documento cuenta
 * como supuesto (la pantalla precarga el máximo cuando no consta, y eso no es un dato). Lo que no se
 * teclea manda la imputación automática (`historial`); sin ella, supuesto.
 */
export function bonusSupuestoFinal(
  datos: { aseguradoAntes?: boolean | null },
  correcciones: Record<string, unknown> | undefined,
  historial: HistorialImputado | null,
): boolean {
  if (datos.aseguradoAntes !== true) return false
  const c = correcciones ?? {}
  const tecleado = (v: unknown) => v !== undefined && v !== null && v !== ''
  const esDato = (o: unknown) => typeof o === 'string' && ORIGENES_DATO.has(o)
  const tecleaLimpios = tecleado(c.aniosSinSiniestros)
  const tecleaAsegurado = tecleado(c.aniosAsegurado)
  if (!tecleaLimpios && !tecleaAsegurado) return historial ? historial.bonusSupuesto : true
  // Lo no tecleado lo decide la imputación: ¿supuso ESE campo (o el nº de siniestros implícito)?
  const supusoHistorial = (campo: string) =>
    historial ? historial.supuestos.some((s) => s.campo === campo && s.condiciona === true) : true
  const limpios = tecleaLimpios ? !esDato(c.bonusOrigen) : supusoHistorial('aniosSinSiniestros')
  const asegurado = tecleaAsegurado ? !esDato(c.aniosAseguradoOrigen) : supusoHistorial('aniosAsegurado')
  const siniestros = !tecleado(c.siniestrosUltimos5) && historial !== null && supusoHistorial('siniestrosUltimos5')
  return limpios || asegurado || siniestros
}

/** Para la precalificación (gratis): un fallo al imputar no tumba la pantalla, se dice. */
export function seguroAnteriorNoDisponible(mensaje: string): SeguroAnteriorPublico {
  return { estado: 'no_disponible', elegida: null, porque: mensaje, alternativas: [], avisos: [], elegidaPorCorredor: false, bonusSupuesto: false, condicion: null }
}
