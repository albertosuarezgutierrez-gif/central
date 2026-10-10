// Cepos del descubrimiento automático de emisiones (03/10/2026). Escribe pólizas de clientes reales:
// cada brazo fija una forma de fallar en CERRADO. Vendor simulado con `globalThis.fetch` (token +
// lista + detalle) y BD en memoria: ni una llamada real a Codeoscopic.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { olvidarToken, peticion } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'
import {
  BACKOFF_BASE_MS,
  descubrirEmisiones,
  idsDelWebhook,
  listarPresentadas,
  nuevoPresupuesto,
  planificar,
  posicionEnAnillo,
  procesarProyecto,
  rotarNuevos,
  sincronizarTrasWebhook,
  type DepsPasada,
  type EstadoLocal,
  type ItemRevision,
  type ResultadoSync,
} from './descubrir-emisiones.ts'

const CFG: ConfigCodeoscopic = {
  baseUrl: 'https://vendor.test/api',
  tokenUrl: 'https://vendor.test/oauth/token',
  clientId: 'cid',
  clientSecret: 'secreto',
  clientApp: 'app',
  userEmail: 'operador@test',
  quotePath: '/insurances',
  timeoutCotizacionMs: 1_000,
  timeoutGenericoMs: 1_000,
  margenRefrescoTokenS: 30,
  topes: { diario: 0, mensual: 0 },
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
  olvidarToken()
})

type Respuesta = { status: number; body?: unknown }
/** Vendor falso. `rutas(path)` devuelve la respuesta para cada GET (path con query). */
function vendor(rutas: (path: string) => Respuesta) {
  const llamadas: string[] = []
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    if (u === CFG.tokenUrl) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), { status: 200 })
    assert.equal(init?.method, 'GET', 'el descubrimiento SOLO puede hacer GET al vendor')
    const path = u.slice(CFG.baseUrl.length)
    llamadas.push(path)
    const r = rutas(path)
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status })
  }) as typeof fetch
  return llamadas
}
const leerVendor = (path: string) => peticion(CFG, { metodo: 'GET', path, timeoutMs: 1_000 })
const sinEspera = async () => {}

// ─── Proyectos de Avant2 ──────────────────────────────────────────────────────
const quote = { id: 'Q1', premium: 212.5, product: { vendor: { name: 'Allianz' }, modality: { name: 'TERCEROS' } } }
function proyecto(o: { linea?: string; doc?: string | null; status?: string; poliza?: string | null; creada?: string } = {}) {
  return {
    id: 1,
    effectiveDate: '2026-10-01',
    insuranceLine: { id: o.linea ?? 'Car' },
    holder: o.doc === null ? {} : { identificationDocument: { id: o.doc ?? '12345678Z' } },
    policyApplications: [{
      id: 'PA1',
      creationDateTime: o.creada ?? '2026-09-20T10:00:00Z',
      status: { id: o.status ?? 'Approved' },
      ...(o.poliza === null ? {} : { policyNumber: o.poliza ?? 'POL-1' }),
      quote,
    }],
  }
}

// ─── BD en memoria ────────────────────────────────────────────────────────────
type Fila = { estado: string; clienteId: string | null; revisadoAt: Date | null }
type Revision = ItemRevision & { abierta: boolean; veces: number; ultimaVezAt: Date; porPersona: boolean }

function bd(fichasPorHash: Record<string, string[]>) {
  const proyectos = new Map<string, Fila>()
  const revisiones = new Map<string, Revision>()
  const polizas: { projectId: string; clienteId: string }[] = []
  const syncs: { projectId: string; clienteId: string }[] = []
  let reloj = new Date('2026-10-03T08:00:00Z')

  const deps = (extra: Partial<DepsPasada> = {}): DepsPasada => ({
    leer: leerVendor,
    leerProyecto: async () => { throw new Error('la pasada usa su propio lector con reintento') },
    filaLocal: async (id) => {
      const f = proyectos.get(id)
      return f ? { estado: f.estado, clienteId: f.clienteId } : null
    },
    clientesPorHash: async (h) => fichasPorHash[h] ?? [],
    hashDni: (doc) => `h:${doc}`,
    // Imita a `sincronizarEmisionExterna`: crea la fila y acuña si hay nº; nunca acuña dos veces.
    sincronizar: async ({ projectId, clienteId, crudo }): Promise<ResultadoSync> => {
      syncs.push({ projectId, clienteId })
      const antes = proyectos.get(projectId)?.estado ?? null
      if (antes === 'emitida') return { ok: true, tipo: 'escrito', estado: 'ya_emitida', antes, despues: 'emitida' }
      const pa = (crudo as { policyApplications: { status: { id: string }; policyNumber?: string }[] }).policyApplications[0]
      const acunar = pa.status.id === 'Approved' && !!pa.policyNumber
      if (acunar) polizas.push({ projectId, clienteId })
      const despues = acunar ? 'emitida' : 'riesgo_condicionado'
      proyectos.set(projectId, { estado: despues, clienteId, revisadoAt: null })
      return { ok: true, tipo: 'escrito', estado: 'ok', antes, despues }
    },
    encolar: async (item) => {
      const r = revisiones.get(item.projectId)
      if (r && r.abierta) {
        revisiones.set(item.projectId, { ...r, ...item, veces: r.veces + 1, ultimaVezAt: reloj })
        return { nueva: false }
      }
      revisiones.set(item.projectId, { ...item, abierta: true, veces: 1, ultimaVezAt: reloj, porPersona: false })
      return { nueva: true }
    },
    resolverRevision: async (id) => {
      const r = revisiones.get(id)
      if (r) r.abierta = false
    },
    descartadoPorPersona: async (id) => {
      const r = revisiones.get(id)
      return !!r && !r.abierta && r.porPersona
    },
    locales: async (ids) => {
      const m = new Map<string, EstadoLocal>()
      for (const id of ids) {
        const p = proyectos.get(id)
        const r = revisiones.get(id)
        if (!p && !r) continue
        m.set(id, {
          proyecto: p ? { estado: p.estado, clienteId: p.clienteId, revisadoAt: p.revisadoAt } : null,
          revision: r ? { abierta: r.abierta, ultimaVezAt: r.ultimaVezAt, resueltaPorPersona: r.porPersona } : null,
        })
      }
      return m
    },
    candidatosIntranet: async () => [],
    marcarRevisado: async (id) => {
      const p = proyectos.get(id)
      if (p) p.revisadoAt = reloj
    },
    esperar: sinEspera,
    ahora: () => reloj,
    ...extra,
  })
  return {
    proyectos, revisiones, polizas, syncs, deps,
    avanzar: (horas: number) => { reloj = new Date(reloj.getTime() + horas * 3_600_000) },
  }
}

/** Vendor con una lista (una página) y el detalle de cada id. */
function vendorCon(detalle: Record<string, unknown>) {
  return vendor((path) => {
    if (path.startsWith('/insurances?')) return { status: 200, body: Object.keys(detalle).map((id) => ({ id: Number(id) })) }
    const id = path.slice('/insurances/'.length)
    return id in detalle ? { status: 200, body: detalle[id] } : { status: 404, body: {} }
  })
}

// ─── Paginación ───────────────────────────────────────────────────────────────

test('paginación: recorre páginas llenas hasta una corta, con pageNumber 1..n y la ventana', async () => {
  const ids = Array.from({ length: 250 }, (_, i) => 40_000_000 + i)
  const llamadas = vendor((path) => {
    const q = new URLSearchParams(path.split('?')[1])
    const p = Number(q.get('pageNumber'))
    return { status: 200, body: ids.slice((p - 1) * 100, p * 100).map((id) => ({ id })) }
  })
  const r = await listarPresentadas(leerVendor, { desde: '2026-09-19', hasta: '2026-10-03' }, nuevoPresupuesto(), sinEspera)
  assert.equal(r.ids.length, 250)
  assert.equal(r.paginas, 3)
  assert.equal(r.truncado, false)
  assert.deepEqual(llamadas.map((l) => new URLSearchParams(l.split('?')[1]).get('pageNumber')), ['1', '2', '3'])
  const q = new URLSearchParams(llamadas[0].split('?')[1])
  assert.equal(q.get('policyApplicationSubmitted'), 'true')
  assert.equal(q.get('fromDate'), '2026-09-19')
  assert.equal(q.get('toDate'), '2026-10-03')
  assert.equal(q.get('pageSize'), '100')
})

test('paginación: con el tope de páginas lleno se marca truncado (no «ya lo he visto todo»)', async () => {
  vendor(() => ({ status: 200, body: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) }))
  const r = await listarPresentadas(leerVendor, { desde: 'a', hasta: 'b' }, nuevoPresupuesto(), sinEspera, { maxPaginas: 2 })
  assert.equal(r.truncado, true)
})

test('una lista con forma desconocida es un ERROR, nunca «no hay emisiones»', async () => {
  vendor(() => ({ status: 200, body: { total: 3 } }))
  await assert.rejects(listarPresentadas(leerVendor, { desde: 'a', hasta: 'b' }, nuevoPresupuesto(), sinEspera), /forma desconocida/)
})

// ─── 429 / 5xx / 401 ──────────────────────────────────────────────────────────

test('429 y 5xx: backoff (1 s, 2 s) y reintento; cada intento gasta del tope', async () => {
  let n = 0
  vendor(() => (++n < 3 ? { status: n === 1 ? 429 : 503 } : { status: 200, body: [] }))
  const esperas: number[] = []
  const presupuesto = nuevoPresupuesto()
  const r = await listarPresentadas(leerVendor, { desde: 'a', hasta: 'b' }, presupuesto, async (ms) => { esperas.push(ms) })
  assert.deepEqual(r.ids, [])
  assert.deepEqual(esperas, [BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2])
  assert.equal(presupuesto.usadas, 3)
})

test('5xx persistente: se rinde tras 3 intentos y la pasada queda en error_vendor', async () => {
  vendor(() => ({ status: 500 }))
  const b = bd({})
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.estado, 'error_vendor')
  assert.equal(r.llamadas, 3)
})

test('401 del vendor: la pasada se corta en «credenciales_rechazadas» y NO escribe nada', async () => {
  vendor(() => ({ status: 401 }))
  const b = bd({ 'h:12345678Z': ['c1'] })
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.estado, 'credenciales_rechazadas')
  assert.equal(b.syncs.length, 0)
  assert.equal(b.revisiones.size, 0)
})

test('401 a mitad de pasada (en un detalle): corta y cuenta lo que quedó sin mirar', async () => {
  vendor((path) => (path.startsWith('/insurances?') ? { status: 200, body: [{ id: 1 }, { id: 2 }] } : { status: 401 }))
  const b = bd({})
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.estado, 'credenciales_rechazadas')
  assert.equal(r.pendientesPorTope, 2)
  assert.equal(r.revisados, 0)
})

// ─── Match por documento ──────────────────────────────────────────────────────

test('match ÚNICO por hash del documento: sincroniza con esa ficha y acuña', async () => {
  vendorCon({ '41000001': proyecto() })
  const b = bd({ 'h:12345678Z': ['c1'] })
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.estado, 'ok')
  assert.deepEqual(b.syncs, [{ projectId: '41000001', clienteId: 'c1' }])
  assert.equal(r.acunadas, 1)
  assert.equal(b.polizas.length, 1)
  assert.equal(b.revisiones.size, 0)
})

test('0 fichas con ese documento: NO escribe, va a revisión como sin_cliente (coincidencias 0)', async () => {
  vendorCon({ '41000002': proyecto() })
  const b = bd({})
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(b.syncs.length, 0)
  assert.equal(b.revisiones.get('41000002')?.motivo, 'sin_cliente')
  assert.equal(b.revisiones.get('41000002')?.coincidencias, 0)
  assert.equal(r.revisionNuevas, 1)
})

test('VARIAS fichas con ese documento: NO elige ninguna, va a revisión', async () => {
  vendorCon({ '41000003': proyecto() })
  const b = bd({ 'h:12345678Z': ['c1', 'c2'] })
  await descubrirEmisiones({}, b.deps())
  assert.equal(b.syncs.length, 0)
  assert.equal(b.revisiones.get('41000003')?.motivo, 'varios_clientes')
  assert.equal(b.revisiones.get('41000003')?.coincidencias, 2)
})

test('sin documento del tomador: revisión sin_documento, nunca un match por nombre', async () => {
  vendorCon({ '41000004': proyecto({ doc: null }) })
  const b = bd({ 'h:12345678Z': ['c1'] })
  await descubrirEmisiones({}, b.deps())
  assert.equal(b.syncs.length, 0)
  assert.equal(b.revisiones.get('41000004')?.motivo, 'sin_documento')
})

test('documento sin hash (falta la clave): es un ERROR de la pasada, no «no es cliente»', async () => {
  vendorCon({ '41000005': proyecto() })
  const b = bd({})
  const r = await descubrirEmisiones({}, b.deps({ hashDni: () => null }))
  assert.equal(r.errores.length, 1)
  assert.equal(b.revisiones.size, 0)
})

test('ramo que no se acuña (uno que RAMO_DE_LINEA no conoce) emitido con nº: «ramo_sin_acunar», sin sincronizar', async () => {
  vendorCon({ '41000006': proyecto({ linea: 'Pets' }) })
  const b = bd({ 'h:12345678Z': ['c1'] })
  await descubrirEmisiones({}, b.deps())
  assert.equal(b.syncs.length, 0)
  const rev = b.revisiones.get('41000006')
  assert.equal(rev?.motivo, 'ramo_sin_acunar')
  assert.equal(rev?.clienteId, 'c1')
  assert.equal(rev?.numeroPoliza, 'POL-1')
})

test('vida, salud, decesos y hogar emitidos fuera SÍ se sincronizan (se acuñan), ya no van a «ramo_sin_acunar»', async () => {
  for (const [i, linea] of ['TermLife', 'Health', 'Burial', 'Home'].entries()) {
    const id = `4100010${i}`
    vendorCon({ [id]: proyecto({ linea }) })
    const b = bd({ 'h:12345678Z': ['c1'] })
    await descubrirEmisiones({}, b.deps())
    assert.equal(b.syncs.length, 1, linea)
    assert.equal(b.syncs[0].projectId, id, linea)
    assert.equal(b.revisiones.get(id)?.motivo, undefined, linea)
  }
})

test('estado de la solicitud desconocido: a revisión y contado como desconocido nuevo', async () => {
  vendorCon({ '41000007': proyecto({ status: 'Zzz' }) })
  const b = bd({ 'h:12345678Z': ['c1'] })
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(b.syncs.length, 0)
  assert.equal(r.desconocidosNuevos, 1)
})

test('solicitud recién creada en un proyecto de la intranet: se deja a /emitir (en vuelo)', async () => {
  vendorCon({ '41000008': proyecto({ creada: '2026-10-03T07:55:00Z' }) })
  const b = bd({ 'h:12345678Z': ['c1'] })
  b.proyectos.set('41000008', { estado: 'preemision', clienteId: 'c1', revisadoAt: null })
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.enVuelo, 1)
  assert.equal(b.syncs.length, 0)
})

// ─── Idempotencia ─────────────────────────────────────────────────────────────

test('idempotencia: dos pasadas no acuñan dos veces ni duplican la revisión', async () => {
  vendorCon({ '41000010': proyecto(), '41000011': proyecto({ doc: '99999999R' }) })
  const b = bd({ 'h:12345678Z': ['c1'] })
  const r1 = await descubrirEmisiones({}, b.deps())
  assert.equal(r1.acunadas, 1)
  assert.equal(r1.revisionNuevas, 1)

  b.avanzar(7) // pasada la espera entre revisiones: la fila en revisión se vuelve a mirar
  const r2 = await descubrirEmisiones({}, b.deps())
  assert.equal(b.polizas.length, 1, 'la segunda pasada no puede acuñar otra póliza')
  assert.equal(r2.acunadas, 0)
  assert.equal(r2.saltados.yaEmitida, 1)
  assert.equal(r2.revisionNuevas, 0)
  assert.equal(b.revisiones.size, 1)
  assert.equal(b.revisiones.get('41000011')?.veces, 2)
})

test('cuando el cliente aparece, la revisión se cierra sola en la siguiente pasada', async () => {
  vendorCon({ '41000012': proyecto() })
  const fichas: Record<string, string[]> = {}
  const b = bd(fichas)
  await descubrirEmisiones({}, b.deps())
  assert.equal(b.revisiones.get('41000012')?.abierta, true)
  fichas['h:12345678Z'] = ['c9']
  b.avanzar(7)
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.acunadas, 1)
  assert.equal(b.revisiones.get('41000012')?.abierta, false)
})

test('una revisión cerrada por una PERSONA no se reabre', async () => {
  vendorCon({ '41000013': proyecto() })
  const b = bd({})
  b.revisiones.set('41000013', {
    projectId: '41000013', motivo: 'sin_cliente', coincidencias: 0, ramoVendor: 'Car', estadoEmision: 'aprobada', estadoVendor: null,
    compania: null, numeroPoliza: null, clienteId: null, detalle: null, abierta: false, veces: 1, ultimaVezAt: new Date(0), porPersona: true,
  })
  const r = await descubrirEmisiones({}, b.deps())
  assert.equal(r.saltados.descartadaPorPersona, 1)
  assert.equal(b.revisiones.get('41000013')?.abierta, false)
})

test('tope de llamadas: lo que no se miró se cuenta como pendiente, no como revisado', async () => {
  vendorCon({ '1': proyecto(), '2': proyecto(), '3': proyecto() })
  const b = bd({ 'h:12345678Z': ['c1'] })
  const r = await descubrirEmisiones({ topeLlamadas: 2 }, b.deps())
  assert.equal(r.llamadas, 2)
  assert.equal(r.revisados, 1)
  assert.equal(r.pendientesPorTope, 2)
})

// ─── Planificación ────────────────────────────────────────────────────────────

test('inanición: 60 no accionables delante de 1 accionable — en pasadas acotadas se acuña igual', async () => {
  // 60 hogares sin nº (desenlace «ramo_no_vigilado», no dejan fila) y, al FINAL de la lista, un auto
  // acuñable. Con orden fijo los 39 primeros se comían el tope en cada pasada y el auto no se miraba nunca.
  const detalle: Record<string, unknown> = {}
  for (let i = 0; i < 60; i++) detalle[String(50_000_000 + i)] = proyecto({ linea: 'Home', poliza: null })
  detalle['50000060'] = proyecto()
  vendorCon(detalle)
  const b = bd({ 'h:12345678Z': ['c1'] })
  let pasadas = 0
  for (; pasadas < 12 && b.polizas.length === 0; pasadas++) {
    const r = await descubrirEmisiones({}, b.deps())
    assert.ok(r.pendientesPorTope > 0, 'con 61 en la ventana no caben todos: se cuenta, no se calla')
    b.avanzar(0.5) // el cron pasa cada 30 min
  }
  assert.deepEqual(b.polizas, [{ projectId: '50000060', clienteId: 'c1' }], `no se acuñó en ${pasadas} pasadas`)
  assert.equal(b.revisiones.size, 0, 'los hogares sin nº no van a la cola')
})

test('rotación: en una vuelta (12 pasadas) todos los nuevos van alguna vez en cabeza', () => {
  const ids = Array.from({ length: 200 }, (_, i) => String(60_000_000 + i))
  const vistos = new Set<string>()
  const t0 = new Date('2026-10-03T05:10:00Z').getTime()
  for (let k = 0; k < 12; k++) for (const id of rotarNuevos(ids, new Date(t0 + k * 1_800_000)).slice(0, 39)) vistos.add(id)
  assert.equal(vistos.size, ids.length)
  // Posición estable: no depende de qué otros ids haya.
  assert.equal(posicionEnAnillo('50000060'), posicionEnAnillo('50000060'))
  assert.deepEqual(rotarNuevos(['b', 'a'], new Date(t0)).sort(), ['a', 'b'])
})

test('planificar: los nuevos no dejan sin tope a los proyectos vivos de la intranet (por turnos)', () => {
  const ahora = new Date('2026-10-03T08:00:00Z')
  const locales = new Map<string, EstadoLocal>([['9', { proyecto: { estado: 'preemision', clienteId: 'c', revisadoAt: null }, revision: null }]])
  const nuevos = Array.from({ length: 50 }, (_, i) => String(70_000_000 + i))
  const p = planificar([...nuevos, '9'], locales, ahora)
  assert.ok(p.aProcesar.findIndex((x) => x.projectId === '9') < 2, 'el vivo entra en el primer turno')
})


test('planificar: salta lo acuñado (estado emitida, no poliza_id) y pone primero lo nuevo', () => {
  const ahora = new Date('2026-10-03T08:00:00Z')
  const locales = new Map<string, EstadoLocal>([
    ['1', { proyecto: { estado: 'emitida', clienteId: 'c', revisadoAt: null }, revision: null }],
    ['2', { proyecto: { estado: 'preemision', clienteId: 'c', revisadoAt: null }, revision: null }],
    ['3', { proyecto: { estado: 'rechazada', clienteId: 'c', revisadoAt: new Date('2026-10-03T07:00:00Z') }, revision: null }],
  ])
  const p = planificar(['1', '2', '3', '4'], locales, ahora)
  assert.deepEqual(p.aProcesar.map((x) => x.projectId), ['4', '2'])
  assert.deepEqual(p.saltados, { yaEmitida: 1, descartadaPorPersona: 0, reciente: 1 })
})

// ─── Webhook ──────────────────────────────────────────────────────────────────

test('webhook: si la sync falla NO lanza (el receptor sigue contestando 200) y lo cuenta', async () => {
  const lineas: string[] = []
  const r = await sincronizarTrasWebhook(['41000001', null, 'x', '41000001', '41000002'], async (id) => {
    if (id === '41000001') throw new Error('BD caída')
    return { tipo: 'ya_emitida' }
  }, (l) => lineas.push(l))
  assert.deepEqual(r, { intentados: 2, fallidos: 1 })
  assert.ok(lineas.some((l) => /41000001 falló/.test(l)))
})

test('webhook: ids válidos, únicos y con tope', () => {
  assert.deepEqual(idsDelWebhook(['1', '1', null, 'abc', '2', '3', '4', '5', '6']), ['1', '2', '3', '4', '5'])
})

test('webhook: la ruta programa la sync con after() DESPUÉS de guardar y la respuesta no depende de ella', () => {
  const src = readFileSync(new URL('../../app/api/webhooks/codeoscopic/route.ts', import.meta.url), 'utf8')
  const guardado = src.indexOf('for (const f of filas)')
  const sync = src.indexOf('after(() => sincronizarDesdeWebhook(ids))')
  const respuesta = src.lastIndexOf('return NextResponse.json({ estado: nuevas > 0')
  assert.ok(guardado > 0 && sync > guardado, 'la sync tiene que programarse tras guardar el crudo')
  assert.ok(respuesta > sync, 'la respuesta va después y no espera a la sync')
  assert.doesNotMatch(src, /await\s+sincronizarDesdeWebhook/, 'esperar a la sync haría depender el 200 de ella')
})

test('procesarProyecto: un 422 de sincronizar va a revisión como «bloqueada», no se pierde', async () => {
  const b = bd({ 'h:12345678Z': ['c1'] })
  const deps = { ...b.deps(), leerProyecto: async () => proyecto(), sincronizar: async (): Promise<ResultadoSync> => ({ ok: false, status: 422, origen: 'entrada', mensaje: 'no se registra: x' }) }
  const d = await procesarProyecto('41000020', deps, { presentadaSegunLista: true })
  assert.deepEqual(d, { tipo: 'revision', motivo: 'bloqueada', nueva: true })
})

test('planificar: una revisión cerrada por una persona se salta antes de pedir nada al vendor', () => {
  const locales = new Map<string, EstadoLocal>([['7', { proyecto: null, revision: { abierta: false, ultimaVezAt: null, resueltaPorPersona: true } }]])
  const p = planificar(['7'], locales, new Date('2026-10-03T08:00:00Z'))
  assert.deepEqual(p.aProcesar, [])
  assert.equal(p.saltados.descartadaPorPersona, 1)
})

test('procesarProyecto (camino del webhook): una revisión cerrada por una persona no se reabre ni se lee', async () => {
  const b = bd({})
  let leido = false
  const deps = { ...b.deps(), leerProyecto: async () => { leido = true; return proyecto() }, descartadoPorPersona: async () => true }
  const d = await procesarProyecto('41000030', deps, { presentadaSegunLista: false })
  assert.deepEqual(d, { tipo: 'descartada' })
  assert.equal(leido, false)
  assert.equal(b.revisiones.size, 0)
})
