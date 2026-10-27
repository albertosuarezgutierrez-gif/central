// VOLCADO INICIAL SEMIAUTOMÁTICO (27/10/2026, §7 punto 4) — lógica PURA (puertos inyectados, sin prisma, sesión ni IA) de
// `POST /api/patrimonio/volcados`, `GET /api/patrimonio/volcados/[id]`, `.../confirmar` y `.../descartar`. La BD real está en
// `volcado-bd.ts`; la escritura transaccional, en `volcado-tx.ts`; la IA, en `extraer-volcado.ts`.
//
// 🚨 NADA SE ESCRIBE EN EL PATRIMONIO SIN CONFIRMAR: subir solo deja una PROPUESTA en las tablas de importación (que ninguna
// lectura de rentabilidad, calendario o avisos toca y que la BD vacía al cerrar). Confirmar exige `confirmar: true` y la
// propuesta REVISADA por el cliente; se vuelve a evaluar contra lo que hay en ese instante y se crea en UNA transacción.
// 🚨 Aislamiento: el `titular` del formulario y el `id` de la URL son PETICIONES. El titular se busca DENTRO de los accesos de
// la cookie con nivel Total (`alta_baja`); el volcado, DENTRO de los de esta identidad y de un titular autorizado. Todo lo
// demás es la MISMA 404 `no_encontrado` (nunca 403). Los uuid de inmuebles que trae la propuesta se buscan DENTRO del
// titular del volcado (`evaluarVolcado` con el contexto de ESE titular): uno ajeno es «no encontrado» y no se escribe.
// 🧮 Cupo de IA: una lectura de documento consume cupo (el mismo cupo mensual por titular que las facturas, `cupoMensualIa`).
// Se cuenta y se reserva en BD ANTES de llamar a la IA (`reservar`, atómico). El mismo fichero ya abierto no se vuelve a leer.
// 👤 Inquilinos: solo NOMBRE y tipo. Se dan de alta DESPUÉS de la transacción, por el PUENTE de siempre (el portal no puede
// escribir inquilinos: su PII va cifrada en apps/asegura). Si el puente falla, el contrato queda creado y la respuesta dice
// qué inquilinos faltan por añadir (nunca se da por añadido lo que no salió).
import {
  MAX_IMPORTACIONES_DIA,
  cupoMensualIa,
  elementosDe,
  evaluarVolcado,
  puede,
  validarPropuesta,
  type ContextoVolcado,
  type EvaluacionVolcado,
  type InquilinoVolcado,
  type NivelPatrimonio,
  type PropuestaVolcado,
  type ValorCliente,
} from '@central/module-patrimonio'

import { MAX_BYTES_FACTURA } from './facturas-api.ts'
import { leerHojaVolcado, sha256, type Hoja, type MotivoLectura } from './importacion-lectura.ts'
import { tipoRealFactura, type TipoFactura } from './tipo-fichero.ts'

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>
export type Respuesta = { status: number; body: Record<string, unknown> }

/** PDF y fotos: el tope de las facturas (10 MB). Hojas: el del importador (5 MB, lo aplica `leerHojaVolcado`). */
export const MAX_BYTES_VOLCADO = MAX_BYTES_FACTURA

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LecturaVolcado = { leido: true; propuesta: PropuestaVolcado; motivos: string[] } | { leido: false; motivos: string[] }
export type FuenteVolcado = { tipo: 'hoja'; hoja: Hoja } | { tipo: 'documento'; mime: TipoFactura; contenido: Buffer }

export type VolcadoLeido = {
  id: string
  /** Ficha del titular (clave de `accesos`). */
  clienteId: string
  estado: 'propuesta' | 'revisada' | 'confirmada' | 'descartada'
  nombre: string | null
  propuesta: PropuestaVolcado
  motivos: string[]
  resultado: Record<string, unknown> | null
}

export type EscritoVolcado = { creados: number; contratos: { ref: string; id: string; inquilino: InquilinoVolcado | null }[] }

export interface PuertosVolcado {
  accesos(): Promise<AccesosMapa>
  /** Importaciones (CSV y volcados) que esta identidad ha creado en las últimas 24 h, contadas en BD. */
  creadasHoy(): Promise<number>
  /** Volcado ABIERTO de este mismo fichero, de esta identidad y titular (no se vuelve a leer ni a gastar cupo). */
  abierto(clienteId: string, hash: string): Promise<{ id: string } | null>
  /** Lanza = no se sabe (tramo intermedio), nunca 0. */
  valorCliente(clienteId: string): Promise<ValorCliente>
  /**
   * ATÓMICO (bloqueo por titular): cuenta las lecturas con IA del mes del titular (facturas + volcados) y, si queda cupo,
   * crea el volcado VACÍO (sin elementos). `cupo` = agotado; `no_encontrado` = titular no autorizado; `abierto` = el mismo
   * fichero ya tiene un volcado abierto (carrera).
   */
  reservar(x: { clienteId: string; hash: string; nombre: string | null; cupoMes: number }): Promise<{ ok: true; id: string } | { ok: false; motivo: 'cupo' | 'no_encontrado' | 'abierto' }>
  leer(f: FuenteVolcado): Promise<LecturaVolcado>
  /** Guarda la propuesta (tránsito) en el volcado ABIERTO de esta identidad. Ningún dato del patrimonio se toca. */
  guardarPropuesta(id: string, propuesta: PropuestaVolcado, motivos: string[]): Promise<boolean>
  /** SOLO un volcado de ESTA identidad cuyo titular está en `accesos()`; si no, `null`. */
  ver(id: string): Promise<VolcadoLeido | null>
  /** Lo que el titular ya tiene (sus inmuebles y las claves de lo existente), leído DENTRO de ese titular. */
  contexto(clienteId: string): Promise<ContextoVolcado>
  /**
   * UNA transacción: cierre condicionado a que siguiera abierto → `evaluar` contra lo que hay EN ESE MOMENTO → crea solo las
   * «nueva» con el titular del VOLCADO (nunca de la petición). `cerrado` = otra petición se adelantó: no se crea nada.
   */
  confirmar(id: string, propuesta: PropuestaVolcado, evaluar: (ctx: ContextoVolcado) => EvaluacionVolcado): Promise<({ ok: true; evaluacion: EvaluacionVolcado } & EscritoVolcado) | { ok: false; motivo: 'cerrado' }>
  descartar(id: string): Promise<boolean>
  /** Alta del inquilino (solo nombre y tipo) en un contrato ya creado, por el puente. */
  altaInquilino(contratoId: string, q: InquilinoVolcado): Promise<'ok' | 'sin_puente' | 'sin_clave' | 'error'>
}

const MOTIVO_LECTURA: Record<MotivoLectura, { status: number; error: string }> = {
  vacio: { status: 400, error: 'fichero_vacio' },
  demasiado_grande: { status: 413, error: 'fichero_demasiado_grande' },
  formato: { status: 400, error: 'formato_no_admitido' },
  ilegible: { status: 400, error: 'fichero_ilegible' },
  sin_filas: { status: 400, error: 'sin_filas' },
  demasiadas_filas: { status: 400, error: 'demasiadas_filas' },
  demasiadas_columnas: { status: 400, error: 'demasiadas_columnas' },
  sin_cabeceras: { status: 400, error: 'sin_cabeceras' },
}

// ─── Subir ────────────────────────────────────────────────────────────────────────────────────────────────

export type EntradaVolcado = { titular: unknown; nombre: string | null; bytes: Uint8Array | null }

/** El fichero → de dónde se lee. PDF/foto por sus BYTES; si no, hoja (CSV/.xlsx con el lector propio). */
export function fuenteDe(bytes: Uint8Array): { ok: true; fuente: FuenteVolcado; hash: string } | { ok: false; respuesta: Respuesta } {
  if (bytes.length === 0) return { ok: false, respuesta: { status: 400, body: { error: 'fichero_vacio' } } }
  if (bytes.length > MAX_BYTES_VOLCADO) return { ok: false, respuesta: { status: 413, body: { error: 'fichero_demasiado_grande' } } }
  const mime = tipoRealFactura(bytes)
  if (mime !== null) return { ok: true, fuente: { tipo: 'documento', mime, contenido: Buffer.from(bytes) }, hash: sha256(bytes) }
  const l = leerHojaVolcado(bytes)
  if (!l.ok) {
    const m = MOTIVO_LECTURA[l.motivo]
    return { ok: false, respuesta: { status: m.status, body: { error: m.error } } }
  }
  return { ok: true, fuente: { tipo: 'hoja', hoja: l.hoja }, hash: l.hash }
}

export async function responderSubirVolcado(p: PuertosVolcado, x: EntradaVolcado): Promise<Respuesta> {
  const accesos = await p.accesos()
  if (typeof x.titular !== 'string' || !accesos.has(x.titular)) return NO_ENCONTRADO
  if (!puede(accesos.get(x.titular), 'alta_baja')) return NO_ENCONTRADO
  const clienteId = x.titular
  if (x.bytes === null) return { status: 400, body: { error: 'falta_fichero' } }
  // Los bytes antes que nada: un fichero basura no gasta tope ni cupo.
  const f = fuenteDe(x.bytes)
  if (!f.ok) return f.respuesta
  const ya = await p.abierto(clienteId, f.hash)
  if (ya) return { status: 200, body: { id: ya.id, nueva: false } }
  if ((await p.creadasHoy()) >= MAX_IMPORTACIONES_DIA) return { status: 429, body: { error: 'limite_diario' } }
  const valor = await p.valorCliente(clienteId).catch((): ValorCliente => ({ comisionAnualCent: null, polizasEnVigor: null }))
  const nombre = x.nombre ? x.nombre.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || null : null
  const reserva = await p.reservar({ clienteId, hash: f.hash, nombre, cupoMes: cupoMensualIa(valor).max })
  if (!reserva.ok) {
    if (reserva.motivo === 'cupo') return { status: 429, body: { error: 'cupo_ia_agotado' } }
    if (reserva.motivo === 'abierto') {
      const otra = await p.abierto(clienteId, f.hash)
      return otra ? { status: 200, body: { id: otra.id, nueva: false } } : NO_ENCONTRADO
    }
    return NO_ENCONTRADO
  }
  let lectura: LecturaVolcado
  try {
    lectura = await p.leer(f.fuente)
  } catch {
    lectura = { leido: false, motivos: ['La lectura automática ha fallado. Inténtalo más tarde.'] }
  }
  const descartadas = f.fuente.tipo === 'hoja' ? f.fuente.hoja.descartadas : 0
  if (!lectura.leido || elementosDe(lectura.propuesta) === 0) {
    // La lectura se intentó (gastó cupo) pero no hay nada que revisar: se cierra para no dejar un volcado vacío abierto.
    await p.descartar(reserva.id)
    return { status: 422, body: { error: 'sin_propuesta', motivos: lectura.motivos } }
  }
  if (!(await p.guardarPropuesta(reserva.id, lectura.propuesta, lectura.motivos))) return NO_ENCONTRADO
  return { status: 201, body: { id: reserva.id, nueva: true, descartadas } }
}

// ─── Ver / confirmar / descartar ──────────────────────────────────────────────────────────────────────────

async function dentro(p: PuertosVolcado, id: unknown): Promise<VolcadoLeido | null> {
  if (typeof id !== 'string' || !UUID.test(id)) return null
  const accesos = await p.accesos()
  if (accesos.size === 0) return null
  const v = await p.ver(id)
  // Doble llave: el titular sigue autorizado Y con nivel Total (un acceso retirado cierra la puerta).
  if (!v || !accesos.has(v.clienteId) || !puede(accesos.get(v.clienteId), 'alta_baja')) return null
  return v
}

const abierto = (v: VolcadoLeido) => v.estado === 'propuesta' || v.estado === 'revisada'

export async function responderVerVolcado(p: PuertosVolcado, id: unknown): Promise<Respuesta> {
  const v = await dentro(p, id)
  if (!v) return NO_ENCONTRADO
  const base = { id: v.id, estado: v.estado, nombre: v.nombre, titular: v.clienteId, resultado: v.resultado }
  if (!abierto(v)) return { status: 200, body: { ...base, propuesta: null, evaluacion: null, motivos: [], existentes: [] } }
  const ctx = await p.contexto(v.clienteId)
  return {
    status: 200,
    body: {
      ...base,
      propuesta: v.propuesta,
      motivos: v.motivos,
      evaluacion: evaluarVolcado(v.propuesta, ctx),
      // Para que la pantalla ofrezca colgar unidades o contratos de lo que YA tiene (solo lo de ESTE titular).
      existentes: ctx.inmuebles.map((i) => ({ id: i.id, alias: i.alias, uso: i.uso, edificio: i.inmueblePadreId })),
    },
  }
}

/** Re-evalúa una propuesta revisada SIN escribir (la pantalla la llama al corregir). */
export async function responderEvaluarVolcado(p: PuertosVolcado, id: unknown, cuerpo: unknown): Promise<Respuesta> {
  const v = await dentro(p, id)
  if (!v) return NO_ENCONTRADO
  if (!abierto(v)) return { status: 409, body: { error: 'cerrado' } }
  const val = validarPropuesta((cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>)
  if (!val.ok) return { status: 400, body: { error: 'datos_invalidos', campo: val.campo } }
  return { status: 200, body: { evaluacion: evaluarVolcado(val.propuesta, await p.contexto(v.clienteId)) } }
}

export async function responderConfirmarVolcado(p: PuertosVolcado, id: unknown, cuerpo: unknown): Promise<Respuesta> {
  const v = await dentro(p, id)
  if (!v) return NO_ENCONTRADO
  if (!abierto(v)) return { status: 409, body: { error: 'cerrado', resultado: v.resultado } }
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  // Confirmación EXPLÍCITA: sin `confirmar: true` no se escribe nada (un POST cualquiera no basta).
  if (b.confirmar !== true) return { status: 400, body: { error: 'falta_confirmacion' } }
  const val = validarPropuesta(b.propuesta)
  if (!val.ok) return { status: 400, body: { error: 'datos_invalidos', campo: val.campo } }
  const r = await p.confirmar(v.id, val.propuesta, (ctx) => evaluarVolcado(val.propuesta, ctx))
  if (!r.ok) return { status: 409, body: { error: 'cerrado' } }

  // Inquilinos: después de la transacción y por el puente. Lo que no sale se dice, nunca se da por hecho.
  const pendientes: { contrato: string; motivo: string }[] = []
  let inquilinos = 0
  for (const c of r.contratos) {
    if (c.inquilino === null) continue
    let e: Awaited<ReturnType<PuertosVolcado['altaInquilino']>>
    try {
      e = await p.altaInquilino(c.id, c.inquilino)
    } catch {
      e = 'error'
    }
    if (e === 'ok') inquilinos++
    else pendientes.push({ contrato: c.id, motivo: e })
  }
  return {
    status: 200,
    body: { resultado: { creados: r.creados, ...r.evaluacion.resumen }, inquilinos: { creados: inquilinos, pendientes } },
  }
}

export async function responderDescartarVolcado(p: PuertosVolcado, id: unknown): Promise<Respuesta> {
  const v = await dentro(p, id)
  if (!v) return NO_ENCONTRADO
  if (!abierto(v)) return { status: 409, body: { error: 'cerrado' } }
  return (await p.descartar(v.id)) ? { status: 200, body: { ok: true } } : { status: 409, body: { error: 'cerrado' } }
}
