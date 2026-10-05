// Cepo de «Solicitar baja desde el portal». La decisión (`anulacion-solicitud.ts`, `anulacion-operador.ts`) se ejecuta con
// una BD simulada; lo que vive en SQL crudo de `anulacion-portal.ts` (la compuerta de la firma) se vigila leyendo el FUENTE,
// donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solicitarAnulacionConDeps, type DepsSolicitud, type FichaSolicitud } from './anulacion-solicitud.ts'
import { bloqueoAccion, esViolacionRetencionPortal, MOTIVO_RETENIDA, liberarConDeps } from './anulacion-operador.ts'

const CORR = '11111111-1111-4111-8111-111111111111'
const IDENT = '22222222-2222-4222-8222-222222222222'
const FICHA = '33333333-3333-4333-8333-333333333333'
const POLIZA = '44444444-4444-4444-8444-444444444444'
const HOY = '2026-10-05'

type Llamada = { sql: string; valores: unknown[] }

function poliza(extra: Record<string, unknown> = {}) {
  return { id: POLIZA, compania: 'MAPFRE', numeroPoliza: '123456', vencimiento: '2027-01-10', estado: 'en_vigor', importRef: null, eiacXmlHash: 'h', sustituidaAt: null, ...extra }
}

function montar(o: { polizas?: unknown[]; abiertas?: unknown[]; insertar?: () => unknown; ficha?: FichaSolicitud } = {}) {
  const llamadas: Llamada[] = []
  const anotados: unknown[] = []
  const deps: DepsSolicitud = {
    hoy: () => HOY,
    ficha: async () => o.ficha ?? { estado: 'ok', clienteId: FICHA },
    anotar: (c) => anotados.push(c),
    db: {
      $queryRaw: async (t, ...v) => {
        const sql = t.join('?')
        llamadas.push({ sql, valores: v })
        if (sql.includes('from polizas p')) return o.polizas ?? [poliza()]
        if (sql.includes('from anulacion') && sql.includes('limit 1')) return o.abiertas ?? []
        if (sql.includes('insert into anulacion')) return o.insertar ? o.insertar() : [{ id: 'nueva', creadaAt: new Date('2026-10-05T10:00:00Z') }]
        throw new Error(`consulta inesperada: ${sql}`)
      },
      $executeRaw: async (t, ...v) => { llamadas.push({ sql: t.join('?'), valores: v }); return 1 },
    },
  }
  const insertos = () => llamadas.filter((l) => l.sql.includes('insert into anulacion'))
  return { deps, llamadas, anotados, insertos }
}

const cuerpo = { polizaId: POLIZA, motivo: 'otro', motivoTexto: 'Me cambio de ciudad' }

test('🪤 la póliza se busca por id + correduría + LA FICHA del vínculo: una ajena es 403 y no escribe nada', async () => {
  const m = montar({ polizas: [] })
  const r = await solicitarAnulacionConDeps(m.deps, CORR, IDENT, cuerpo)
  assert.equal(r.estado, 'no_es_tuya')
  const q = m.llamadas.find((l) => l.sql.includes('from polizas p'))!
  assert.match(q.sql, /p\.cliente_id = \?::uuid/)
  assert.deepEqual(q.valores, [POLIZA, CORR, FICHA], 'el cliente sale del vínculo, no de la petición')
  assert.equal(m.insertos().length, 0)
})

test('inexistente = ajena (mismo 403: no se hace de oráculo); un id mal formado, igual', async () => {
  assert.equal((await solicitarAnulacionConDeps(montar({ polizas: [] }).deps, CORR, IDENT, { ...cuerpo, polizaId: '55555555-5555-4555-8555-555555555555' })).estado, 'no_es_tuya')
  const m = montar()
  assert.equal((await solicitarAnulacionConDeps(m.deps, CORR, IDENT, { ...cuerpo, polizaId: 'no-es-uuid' })).estado, 'no_es_tuya')
  assert.equal(m.llamadas.length, 0)
})

test('sin ficha (o varias) no hay a quién pertenezca: se devuelve tal cual y no se consulta nada', async () => {
  const m = montar({ ficha: { estado: 'varias_fichas' } })
  assert.equal((await solicitarAnulacionConDeps(m.deps, CORR, IDENT, cuerpo)).estado, 'varias_fichas')
  assert.equal(m.llamadas.length, 0)
})

test('una póliza que no está en vigor (cancelada, volcado histórico, sustituida) → 422 no_vigente', async () => {
  for (const extra of [{ estado: 'cancelada' }, { importRef: 'intranet:1', eiacXmlHash: null }, { sustituidaAt: new Date() }]) {
    const m = montar({ polizas: [poliza(extra)] })
    assert.equal((await solicitarAnulacionConDeps(m.deps, CORR, IDENT, cuerpo)).estado, 'no_vigente', JSON.stringify(extra))
    assert.equal(m.insertos().length, 0)
  }
})

test('baja ya abierta: el pre-chequeo la corta (409) y el 23505 del índice parcial también', async () => {
  const pre = montar({ abiertas: [{ id: 'x' }] })
  assert.equal((await solicitarAnulacionConDeps(pre.deps, CORR, IDENT, cuerpo)).estado, 'ya_abierta')
  assert.equal(pre.insertos().length, 0)
  for (const e of [
    new Error('duplicate key value violates unique constraint "uq_anulacion_abierta_por_poliza"'),
    Object.assign(new Error('Raw query failed'), { code: '23505', constraint: 'uq_anulacion_abierta_por_poliza' }),
    Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '23505', message: 'ERROR: duplicate key value violates unique constraint "uq_anulacion_abierta_por_poliza"' } }),
    Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['uq_anulacion_abierta_por_poliza'] } }),
  ]) {
    const carrera = montar({ insertar: () => { throw e } })
    assert.equal((await solicitarAnulacionConDeps(carrera.deps, CORR, IDENT, cuerpo)).estado, 'ya_abierta')
  }
  // Un 23505 de OTRO índice no es «ya abierta»: se relanza.
  for (const e of [
    Object.assign(new Error('Raw query failed'), { code: '23505' }),
    Object.assign(new Error('duplicate key value violates unique constraint "otro_indice"'), { code: '23505', constraint: 'otro_indice' }),
    Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '23505', message: 'constraint "otro_indice"' } }),
    Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['otro_indice'] } }),
  ]) {
    await assert.rejects(solicitarAnulacionConDeps(montar({ insertar: () => { throw e } }).deps, CORR, IDENT, cuerpo), e as Error)
  }
  await assert.rejects(solicitarAnulacionConDeps(montar({ insertar: () => { throw new Error('conexión caída') } }).deps, CORR, IDENT, cuerpo), /conexión caída/)
})

test('las reglas de la solicitud mandan: precio sin ver la oferta → ofrecer_presupuesto; otro sin texto → invalida', async () => {
  const p = montar()
  assert.equal((await solicitarAnulacionConDeps(p.deps, CORR, IDENT, { polizaId: POLIZA, motivo: 'precio' })).estado, 'ofrecer_presupuesto')
  assert.equal((await solicitarAnulacionConDeps(p.deps, CORR, IDENT, { polizaId: POLIZA, motivo: 'otro' })).estado, 'invalida')
  assert.equal(p.insertos().length, 0)
})

test('🪤 nace del PORTAL y RETENIDA: origen portal, pedida por el cliente, sin liberar; se libera sola a las 48 h', async () => {
  const m = montar()
  const r = await solicitarAnulacionConDeps(m.deps, CORR, IDENT, cuerpo)
  assert.ok(r.estado === 'creada')
  assert.equal(r.liberada, false)
  assert.equal(r.liberaSolaAt, '2026-10-07T10:00:00.000Z')
  assert.deepEqual(r.poliza, { id: POLIZA, compania: 'MAPFRE', numeroPoliza: '123456' })
  const ins = m.insertos()[0]!
  assert.match(ins.sql, /'cliente'/)
  assert.match(ins.sql, /creada_por, origen/)
  assert.match(ins.sql, /'portal', 'portal'/)
  assert.deepEqual(ins.valores.slice(-2), [false, false], 'liberada_at/liberada_por solo con efecto inminente')
  assert.equal(m.anotados.length, 1)
  assert.ok(m.llamadas.some((l) => l.sql.includes('historial_interno')))
})

test('efecto inminente (venta ya hecha) nace liberada por plazo', async () => {
  const m = montar()
  const r = await solicitarAnulacionConDeps(m.deps, CORR, IDENT, { polizaId: POLIZA, motivo: 'venta', fechaVenta: '2026-10-03' })
  assert.ok(r.estado === 'creada' && r.liberada && r.liberaSolaAt === null)
  assert.match(m.insertos()[0]!.sql, /then 'plazo' end/)
  assert.equal(m.insertos()[0]!.valores.includes(true), true)
})

// ─── La compuerta de la firma (SQL crudo de anulacion-portal.ts) ───────────────────────────────────────────────

const src = readFileSync(new URL('./anulacion-portal.ts', import.meta.url), 'utf8')
const tramo = (desde: string, hasta?: string) => src.slice(src.indexOf(desde), hasta ? src.indexOf(hasta) : undefined)

test('🪤 LIBERADA_SQL: portal retenida = ni liberada ni pasadas 48 h; las del corredor, siempre', () => {
  const l = src.match(/export const LIBERADA_SQL = `([^`]+)`/)![1]!
  assert.match(l, /a\.origen <> 'portal'/)
  assert.match(l, /a\.liberada_at is not null/)
  assert.match(l, /now\(\) >= a\.created_at \+ interval '\$\{HORAS_RETENCION_PORTAL\} hours'/)
})

test('🪤 la compuerta está en TODA consulta que lleva a una firma: lectura, código, gasto del intento y firma', () => {
  assert.match(tramo('async function pendientesDe', 'async function enRevisionDe'), /\$\{LIBERADA\}/, 'sin ella una retenida sale en la lista y se firma')
  assert.match(tramo('export async function pedirCodigoFirma', 'export type ResultadoFirma'), /a\.estado = 'solicitada' and \$\{LIBERADA\}\s+and \(firma_otp_expira is null/, 'el código no se manda a una retenida')
  const firmar = tramo('export async function firmarAnulacion')
  assert.match(firmar, /a\.estado = 'solicitada' and \$\{LIBERADA\}\s+and firma_otp_hash is not null/, 'el intento no se gasta en una retenida')
  assert.match(firmar, /update anulacion a set estado = 'firmada'[\s\S]*?a\.estado = 'solicitada' and \$\{LIBERADA\}`/, 'la firma final no pasa si está retenida')
  assert.equal((src.match(/\$\{LIBERADA\}/g) ?? []).length >= 6, true)
})

test('una baja del portal sin liberar no está en anulacionesParaFirmar, y pedirCodigoFirma dice no_encontrada', () => {
  // Las tres funciones leen por `pendientesDe`; una retenida no sale de ahí y, sin fila, el código y la firma contestan no_encontrada.
  assert.match(tramo('export async function anulacionesParaFirmar', 'export type ResultadoCodigo'), /pendientesDe\(correduriaId, f\.clienteId\)/)
  assert.match(tramo('export async function pedirCodigoFirma', 'export type ResultadoFirma'), /const \[p\] = await pendientesDe\([^)]*anulacionId\)\s+if \(!p\) return \{ estado: 'no_encontrada' \}/)
  assert.match(tramo('export async function firmarAnulacion'), /const \[p\] = await pendientesDe\([^)]*anulacionId\)\s+if \(!p\) return \{ estado: 'no_encontrada' \}/)
})

test('la retenida se enseña aparte (enRevision) con su hora, y es la negación exacta de la compuerta', () => {
  const r = tramo('async function enRevisionDe', 'export type LecturaParaFirmar')
  assert.match(r, /a\.estado = 'solicitada' and not \$\{LIBERADA\}/)
  assert.match(r, /a\.cliente_id = \$\{clienteId\}::uuid/)
  assert.match(tramo('export async function anulacionesParaFirmar', 'export type ResultadoCodigo'), /enRevision,/)
})

// ─── El corredor ──────────────────────────────────────────────────────────────────────────────────────────────

function dbLiberar(fila: { estado: string; origen: string; liberada: boolean }) {
  const e = { ...fila }
  return {
    $queryRaw: async (t: TemplateStringsArray) => {
      const sql = t.join('?')
      if (sql.includes('update anulacion set liberada_at')) {
        if (e.estado === 'solicitada' && e.origen === 'portal' && !e.liberada) { e.liberada = true; return [{ id: 'a', clienteId: FICHA, polizaId: POLIZA }] }
        return []
      }
      return [e]
    },
  }
}

test('🪤 liberar: la primera vez sí; la segunda, 409 (no_permitida); una del corredor o ya firmada, también', async () => {
  const hist: string[] = []
  const deps = (db: ReturnType<typeof dbLiberar>) => ({ db, anotar: () => {}, historial: async (_c: string, _p: string, t: string) => { hist.push(t) } })
  const ID = '66666666-6666-4666-8666-666666666666'
  const db = dbLiberar({ estado: 'solicitada', origen: 'portal', liberada: false })
  assert.deepEqual(await liberarConDeps(deps(db), CORR, ID, 'alberto'), { estado: 'hecho', nuevo: 'solicitada' })
  const otra = await liberarConDeps(deps(db), CORR, ID, 'alberto')
  assert.ok(otra.estado === 'no_permitida' && /Ya estaba liberada/.test(otra.motivo))
  assert.equal(hist.length, 1)
  const corredor = await liberarConDeps(deps(dbLiberar({ estado: 'solicitada', origen: 'corredor', liberada: false })), CORR, ID, 'a')
  assert.ok(corredor.estado === 'no_permitida' && /desde el portal/.test(corredor.motivo))
  assert.equal((await liberarConDeps(deps(dbLiberar({ estado: 'firmada', origen: 'portal', liberada: true })), CORR, ID, 'a')).estado, 'no_permitida')
  assert.equal((await liberarConDeps(deps(dbLiberar({ estado: 'solicitada', origen: 'portal', liberada: false })), CORR, 'no-uuid', 'a')).estado, 'no_encontrada')
})

test('🪤 liberar: el UPDATE solo casa con solicitada + portal + sin liberar (la BD simulada no ve el SQL: se lee el fuente)', () => {
  const f = readFileSync(new URL('./anulacion-operador.ts', import.meta.url), 'utf8')
  assert.match(f, /update anulacion set liberada_at = now\(\), liberada_por = \$\{quien\}[\s\S]*?and estado = 'solicitada' and origen = 'portal' and liberada_at is null\s+returning/)
})

test('🪤 marcar_firmada de una baja del portal sin liberar → bloqueada; liberada o pasadas 48 h, sí; desistir exige nota', () => {
  const createdAt = new Date('2026-10-05T10:00:00Z')
  const base = { origen: 'portal' as const, liberadaAt: null, createdAt }
  const antes = new Date('2026-10-06T10:00:00Z')
  assert.equal(bloqueoAccion(base, 'marcar_firmada', 'carta', antes)?.estado, 'no_permitida')
  assert.equal(bloqueoAccion({ ...base, liberadaAt: antes }, 'marcar_firmada', 'carta', antes), null)
  assert.equal(bloqueoAccion(base, 'marcar_firmada', 'carta', new Date('2026-10-07T10:00:00Z')), null)
  assert.equal(bloqueoAccion({ ...base, origen: 'corredor' }, 'marcar_firmada', 'carta', antes), null, 'las del corredor no cambian')
  assert.equal(bloqueoAccion(base, 'desistir', null, antes)?.estado, 'invalida')
  assert.equal(bloqueoAccion(base, 'desistir', '  ', antes)?.estado, 'invalida')
  assert.equal(bloqueoAccion(base, 'desistir', 'hablado, se queda', antes), null)
  assert.equal(bloqueoAccion({ ...base, origen: 'corredor' }, 'desistir', null, antes), null)
})

test('el puerto: «liberar» va fuera de ACCIONES_ANULACION, antes de validar la acción, y marcar_firmada pasa por el bloqueo', () => {
  const ruta = readFileSync(new URL('../app/api/operador/anulaciones/route.ts', import.meta.url), 'utf8')
  assert.ok(ruta.indexOf("cuerpo?.accion === 'liberar'") > 0 && ruta.indexOf("cuerpo?.accion === 'liberar'") < ruta.indexOf('ACCIONES_ANULACION.find'))
  assert.match(ruta, /STATUS_ACCION: Record<string, number> = \{[^}]*no_permitida: 409/)
  const a = readFileSync(new URL('./anulaciones.ts', import.meta.url), 'utf8')
  const accion = a.slice(a.indexOf('export async function accionAnulacion'))
  const i = accion.indexOf('const bloqueo = bloqueoAccion(a, accion, texto')
  assert.ok(i > 0 && i < accion.indexOf('update anulacion set estado'))
  assert.match(accion.slice(i, i + 200), /if \(bloqueo\) return bloqueo/)
})

test('la ruta del puente solicitar: protegida con el secreto del puente, auditada, y los códigos del diseño', () => {
  const r = readFileSync(new URL('../app/api/portal/anulacion/solicitar/route.ts', import.meta.url), 'utf8')
  assert.match(r, /export const POST = auditado\(/)
  assert.ok(r.indexOf('puentePortalAutorizado(req)') > 0 && r.indexOf('puentePortalAutorizado(req)') < r.indexOf('req.json()'))
  assert.match(r, /creada: 201, no_es_tuya: 403, ya_abierta: 409/)
  assert.match(r, /no_vigente: 422/)
  assert.doesNotMatch(r.replace(/\/\*[\s\S]*?\*\//g, ''), /clienteId/, 'nunca acepta clienteId')
})

test('el CHECK anulacion_portal_retenida (23514) se reconoce y habla como bloqueoAccion; otros errores no', () => {
  const ahora = new Date('2026-10-05T10:00:00Z')
  assert.equal(bloqueoAccion({ origen: 'portal', liberadaAt: null, createdAt: ahora }, 'marcar_firmada', 'carta', ahora)?.motivo, MOTIVO_RETENIDA)
  assert.equal(esViolacionRetencionPortal(Object.assign(new Error('new row for relation "anulacion" violates check constraint "anulacion_portal_retenida"'), { code: '23514' })), true)
  assert.equal(esViolacionRetencionPortal(Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '23514', message: 'violates check constraint "anulacion_portal_retenida"' } })), true)
  assert.equal(esViolacionRetencionPortal(Object.assign(new Error('violates check constraint "otro_check"'), { code: '23514' })), false)
  assert.equal(esViolacionRetencionPortal(new Error('conexión caída')), false)
  assert.equal(esViolacionRetencionPortal(null), false)
})
