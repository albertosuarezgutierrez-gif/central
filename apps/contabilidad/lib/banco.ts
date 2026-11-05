// Banco: importación de extractos (Norma 43 / CSV con mapeo), propuesta de conciliación y confirmación. Sin BD directa (repo inyectado).
//
//   · Reimportar el mismo extracto NO duplica (huella única por empresa en BD).
//   · La conciliación solo PROPONE; nada se asienta hasta que una persona confirma. Un movimiento se concilia UNA sola vez (UNIQUE).
//   · Confirmar genera el hecho `cobro`/`pago` (medio «transferencia» → 572) con el `documento` de la partida pendiente, de modo que el
//     asiento cierra esa partida. Por regla de concepto (comisiones, seguros…) se asienta contra la cuenta elegida, sin partida.
//   · PSD2: solo la interfaz (`PuertoPsd2` de @central/core-banca); no hay nada conectado.
import { aFechaISO, antiguedadSaldos, type HechoCobro, type HechoPago } from '@central/module-contabilidad'
import {
  cabecerasCsv, huellasDeMovimientos, parseCsvBanco, parseNorma43, proponerConciliacion, reglasQueCasan,
  type Candidato, type ExtractoBanco, type MapeoCsv, type Propuesta,
} from '@central/core-banca'
import type { RepoContable, MovimientoBancoLeido, NuevoMovimientoBanco } from './repo.ts'
import { planDesdeFilas, recibirHecho } from './servicio.ts'
import { APP_INTERNA } from './compras.ts'

type Meta = { usuarioId: string | null; hoy: Date }
export const MAX_TEXTO_EXTRACTO = 3_000_000
export const MAX_MOVIMIENTOS_POR_IMPORTACION = 5000

// ── Lectura del fichero ─────────────────────────────────────────────────────────────────────────────────────────
export type EntradaLectura = { formato: 'norma43' | 'csv'; texto: string; mapeo?: MapeoCsv; cuentaRef?: string }
export type Lectura = { ok: true; extractos: ExtractoBanco[]; avisos: string[] } | { ok: false; errores: string[] }

export function leerExtracto(e: EntradaLectura): Lectura {
  if (typeof e.texto !== 'string' || !e.texto.trim()) return { ok: false, errores: ['el fichero está vacío'] }
  if (e.texto.length > MAX_TEXTO_EXTRACTO) return { ok: false, errores: ['el fichero es demasiado grande (máx. 3 MB)'] }
  if (e.formato === 'norma43') {
    const extractos = parseNorma43(e.texto).filter((x) => x.movimientos.length > 0)
    return extractos.length ? { ok: true, extractos, avisos: [] } : { ok: false, errores: ['no se encontró ningún movimiento: ¿es un fichero Norma 43 (AEB-43)?'] }
  }
  if (e.formato === 'csv') {
    if (!e.mapeo) return { ok: false, errores: ['indica qué columna es cada dato (fecha, concepto, importe)'] }
    try {
      const r = parseCsvBanco(e.texto, e.mapeo, { ccc: e.cuentaRef })
      if (!r.extracto.movimientos.length) return { ok: false, errores: ['no se pudo leer ninguna fila', ...r.errores.slice(0, 5).map((x) => `línea ${x.linea}: ${x.motivo}`)] }
      return { ok: true, extractos: [r.extracto], avisos: r.errores.slice(0, 20).map((x) => `línea ${x.linea} descartada: ${x.motivo}`) }
    } catch (err) {
      return { ok: false, errores: [err instanceof Error ? err.message : 'mapeo no válido'] }
    }
  }
  return { ok: false, errores: ['formato no admitido (norma43 o csv)'] }
}

export const cabecerasDeCsv = (texto: string) => cabecerasCsv(typeof texto === 'string' ? texto.slice(0, 20_000) : '')

// ── Importación ─────────────────────────────────────────────────────────────────────────────────────────────────
export type ResultadoImportacion = { ok: true; nuevos: number; repetidos: number; descartados: string[] } | { ok: false; errores: string[] }

const esIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

export async function importarExtractos(repo: RepoContable, extractos: readonly ExtractoBanco[], o: { origen: 'norma43' | 'csv'; cuentaRef?: string }, meta: Meta): Promise<ResultadoImportacion> {
  const total = extractos.reduce((t, x) => t + x.movimientos.length, 0)
  if (total === 0) return { ok: false, errores: ['no hay movimientos que importar'] }
  if (total > MAX_MOVIMIENTOS_POR_IMPORTACION) return { ok: false, errores: [`demasiados movimientos de golpe (${total}; máx. ${MAX_MOVIMIENTOS_POR_IMPORTACION}): divide el fichero por meses`] }
  const nuevos: NuevoMovimientoBanco[] = []
  const descartados: string[] = []
  for (const x of extractos) {
    if (x.divisa && !['EUR', '978'].includes(x.divisa)) return { ok: false, errores: [`divisa no admitida (${x.divisa}): solo euros`] }
    const cuentaRef = (x.ccc || o.cuentaRef || 'principal').trim().slice(0, 60)
    const huellas = huellasDeMovimientos(cuentaRef, x.movimientos)
    x.movimientos.forEach((m, i) => {
      if (!esIso(m.fechaOperacion) || !Number.isSafeInteger(m.importe) || m.importe === 0) { descartados.push(`movimiento ${i + 1} de ${cuentaRef}: fecha o importe no válidos`); return }
      nuevos.push({
        cuentaRef, fecha: m.fechaOperacion, fechaValor: esIso(m.fechaValor) ? m.fechaValor : m.fechaOperacion, importe: m.importe,
        concepto: m.concepto.slice(0, 500), contraparte: m.contraparte.slice(0, 200), referencia: m.referencia.slice(0, 200),
        saldo: m.saldoPosterior ?? null, origen: o.origen, huella: huellas[i],
      })
    })
  }
  if (!nuevos.length) return { ok: false, errores: ['ningún movimiento era válido', ...descartados.slice(0, 5)] }
  const r = await repo.insertarMovimientosBanco(nuevos, meta.usuarioId)
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'importar_extracto', entidad: 'movimientos_banco', detalle: { origen: o.origen, nuevos: r.nuevos, repetidos: r.repetidos } })
  return { ok: true, ...r, descartados }
}

// ── Propuestas ──────────────────────────────────────────────────────────────────────────────────────────────────
export const idCandidato = (cuenta: string, documento: string) => `${cuenta}::${documento}`

/** Partidas abiertas con documento: cobros pendientes (43x, debe − haber) y pagos pendientes (40x/41x, haber − debe). */
export async function candidatosDeConciliacion(repo: RepoContable, hoy: Date): Promise<Candidato[]> {
  const partidas = await repo.partidasPorDocumento(['43', '40', '41'], { hasta: aFechaISO(hoy) })
  const out: Candidato[] = []
  for (const [tipo, sentido] of [['clientes', 'cobro'], ['proveedores', 'pago']] as const) {
    for (const f of antiguedadSaldos(partidas, tipo, hoy)?.filas ?? []) {
      if (f.documento === null) continue
      out.push({ id: idCandidato(f.cuenta, f.documento), sentido, importe: f.importe, fecha: f.desde, documento: f.documento, cuenta: f.cuenta })
    }
  }
  return out
}

export type VistaConciliacion = {
  movimientos: MovimientoBancoLeido[]
  candidatos: Candidato[]
  propuestas: Propuesta[]
  reglas: Awaited<ReturnType<RepoContable['reglasConciliacion']>>
}

/** Pendientes + propuesta para cada uno. Solo lee: no asienta nada. */
export async function vistaDePendientes(repo: RepoContable, hoy: Date, limite = 200): Promise<VistaConciliacion> {
  const [movimientos, candidatos, reglas] = await Promise.all([repo.movimientosBanco({ filtro: 'pendientes', limite }), candidatosDeConciliacion(repo, hoy), repo.reglasConciliacion()])
  const propuestas = proponerConciliacion(movimientos.map((m) => ({ id: m.id, fecha: m.fecha, importe: m.importe, concepto: `${m.concepto} ${m.contraparte}` })), candidatos, reglas)
  return { movimientos, candidatos, propuestas, reglas }
}

// ── Confirmación ────────────────────────────────────────────────────────────────────────────────────────────────
export type Confirmacion =
  | { movimientoId: string; modo: 'partida'; documento: string; cuenta: string }
  | { movimientoId: string; modo: 'regla'; reglaId: string }
export type ResultadoConfirmacion = { ok: true; asientoId: string; metodo: 'importe_exacto' | 'regla' | 'manual' } | { ok: false; errores: string[] }

export async function confirmarConciliacion(repo: RepoContable, c: Confirmacion, meta: Meta): Promise<ResultadoConfirmacion> {
  const mov = await repo.movimientoBanco(c.movimientoId)
  if (!mov) return { ok: false, errores: ['movimiento no encontrado'] }
  if (mov.conciliacion) return { ok: false, errores: ['ese movimiento ya está conciliado'] }
  const abs = Math.abs(mov.importe)
  const base = { fecha: mov.fecha, ref: `conc:${mov.id}`, importe: abs, medio: 'transferencia' as const }
  const texto = [mov.concepto, mov.contraparte].filter(Boolean).join(' ').slice(0, 200)

  let hecho: HechoCobro | HechoPago
  let tipo: 'cobro' | 'pago' | 'regla'
  let documento: string | null = null
  let cuenta: string
  let metodo: 'importe_exacto' | 'regla' | 'manual'

  if (c.modo === 'partida') {
    const sentido = mov.importe > 0 ? 'cobro' : 'pago'
    const cand = (await candidatosDeConciliacion(repo, meta.hoy)).find((x) => x.id === idCandidato(c.cuenta, c.documento))
    if (!cand) return { ok: false, errores: ['esa partida ya no está pendiente'] }
    if (cand.sentido !== sentido) return { ok: false, errores: [sentido === 'cobro' ? 'un ingreso del banco solo puede cobrar una factura emitida' : 'un cargo del banco solo puede pagar una factura recibida'] }
    if (abs > cand.importe) return { ok: false, errores: ['el movimiento supera lo pendiente de esa partida'] }
    // ¿Es la propuesta única y exacta que el sistema haría? Entonces «importe exacto»; si la elige la persona (ambigua o parcial), «manual».
    const prop = proponerConciliacion([{ id: mov.id, fecha: mov.fecha, importe: mov.importe, concepto: texto }], await candidatosDeConciliacion(repo, meta.hoy))[0]
    metodo = prop.estado === 'propuesta' && prop.metodo === 'importe_exacto' && prop.candidatoId === cand.id ? 'importe_exacto' : 'manual'
    tipo = sentido
    documento = cand.documento ?? null
    cuenta = cand.cuenta ?? ''
    hecho = { tipo: sentido, ...base, concepto: `${sentido === 'cobro' ? 'Cobro' : 'Pago'} ${cand.documento} (banco)`.slice(0, 300), documento: cand.documento ?? undefined, cuentaTercero: cand.cuenta } as HechoCobro | HechoPago
  } else {
    const regla = (await repo.reglasConciliacion()).find((r) => r.id === c.reglaId)
    if (!regla) return { ok: false, errores: ['esa regla no existe o está desactivada'] }
    if (!reglasQueCasan({ concepto: texto, importe: mov.importe }, [regla]).length) return { ok: false, errores: ['la regla no corresponde a este movimiento'] }
    tipo = 'regla'
    metodo = 'regla'
    cuenta = regla.cuenta
    const sentido = mov.importe > 0 ? 'cobro' : 'pago'
    hecho = { tipo: sentido, ...base, concepto: `${texto} (${regla.patron})`.slice(0, 300), cuentaTercero: regla.cuenta } as HechoCobro | HechoPago
  }

  const r = await recibirHecho(repo, APP_INTERNA, hecho)
  if (r.resultado !== 'asentado' || r.duplicado) {
    return { ok: false, errores: [r.resultado === 'asentado' ? 'ese movimiento ya se había asentado' : r.resultado === 'conflicto' ? 'ya existía un asiento con esa referencia' : `no se pudo asentar: ${r.motivo}`] }
  }
  const id = await repo.insertarConciliacion({ movimientoId: mov.id, tipo, documento, cuenta, metodo, hechoId: r.hechoId, asientoId: r.asientoId, confirmadaPor: meta.usuarioId })
  if (!id) return { ok: false, errores: ['otra petición concilió ese movimiento a la vez'] }
  await repo.auditar({ actor: 'usuario', usuarioId: meta.usuarioId, accion: 'conciliar', entidad: 'conciliaciones', entidadId: id, detalle: { movimiento: mov.id, tipo, documento, cuenta, metodo } })
  return { ok: true, asientoId: r.asientoId, metodo }
}

// ── Reglas por concepto ─────────────────────────────────────────────────────────────────────────────────────────
/** Una regla asienta contra una cuenta de gasto/ingreso. Terceros (40x/41x/43x) y tesorería (57x) NO: eso es una partida, no una regla. */
export async function crearReglaConciliacion(repo: RepoContable, r: { patron: string; cuenta: string; sentido: string }, usuarioId: string | null): Promise<{ ok: true; id: string } | { ok: false; errores: string[] }> {
  const errores: string[] = []
  const patron = typeof r.patron === 'string' ? r.patron.trim() : ''
  if (patron.length < 3 || patron.length > 80) errores.push('el texto a buscar debe tener entre 3 y 80 caracteres')
  if (!['cargo', 'abono', 'ambos'].includes(r.sentido)) errores.push('sentido: cargo, abono o ambos')
  const plan = planDesdeFilas(await repo.planCuentas())
  const c = plan.cuentas[r.cuenta]
  if (!c) errores.push(`la cuenta ${r.cuenta} no existe en tu plan`)
  else if (!c.admiteApuntes) errores.push(`la cuenta ${r.cuenta} no es de nivel hoja`)
  if (/^(40|41|43|57)/.test(r.cuenta ?? '')) errores.push('las cuentas de proveedores, clientes y tesorería no valen: se concilian con la partida pendiente')
  if (errores.length) return { ok: false, errores }
  const id = await repo.insertarReglaConciliacion({ patron, cuenta: r.cuenta, sentido: r.sentido as 'cargo' | 'abono' | 'ambos' }, usuarioId)
  if (!id) return { ok: false, errores: ['ya existe una regla igual'] }
  await repo.auditar({ actor: 'usuario', usuarioId, accion: 'crear_regla_conciliacion', entidad: 'reglas_conciliacion', entidadId: id, detalle: { patron, cuenta: r.cuenta, sentido: r.sentido } })
  return { ok: true, id }
}
