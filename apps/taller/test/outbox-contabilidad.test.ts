/* eslint-disable @typescript-eslint/no-explicit-any */
// Outbox hacia contabilidad: el hecho nace en la MISMA transacción que la factura/cobro; el envío (cron) clasifica la respuesta del puerto.
// Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en escribirAlta quitar la llamada `encolarFactura` → rojo «factura emitida: un hecho de venta en la misma transacción».
// (2) en escribirCobros quitar `encolarCobro` → rojo «cobros: un hecho de cobro por cada cobro».
// (3) en hechos-outbox `insertar` quitar el `findFirst` previo → rojo «encolar dos veces lo mismo no duplica».
// (4) en clasificarRespuesta mover 409 a `error` (quitar el 409 de «rechazado») → rojo «clasificación».
// (5) en enviarHechos quitar `if (!d.config) return r` → rojo «sin configuración: no envía» (hace fetch).
// (6) en enviarHechos quitar `if (!lectura.empresaId) {…continue}` → rojo «taller sin empresa vinculada».
// (7) en manejarCronHechos cambiar `!secretoCoincide(...)` por `false` → rojo «cron: 401 sin Bearer».
// (8) en margenOt devolver `ok` con coste 0 cuando no hay costes → rojo «margen: sin costes = sin datos».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crearBdFake } from './_fake-prisma.ts'
import { crearConTaller } from '../lib/rls.ts'
import { anularFactura, emitirFactura, rectificarFactura, registrarCobros } from '../lib/facturas.ts'
import { CONFIG_SIF, type ConfigSif } from '../lib/sistema-informatico.ts'
import { encolarFactura } from '../lib/hechos-outbox.ts'
import {
  clasificarRespuesta, enviarHechos, esperaTrasIntento, leerConfigContabilidad, type DepsEnvio,
} from '../lib/enviar-hechos.ts'
import { manejarCronHechos } from '../lib/cron-hechos.ts'
import { cobrosPorMedio, facturacionMensual, horasPorMecanico, margenOt, estadoEnvio } from '../lib/panel-dueno.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const T2 = '00000000-0000-4000-8000-000000000002'
const EMPRESA = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-11-04T10:00:00Z')
const SIF: ConfigSif = { ...CONFIG_SIF, productorNombreRazon: 'Productor de prueba', productorNif: '00000000T', nombreSistema: 'Sistema prueba', idSistema: 'ZZ', version: '0.1' }
const deps = { sif: SIF }

function montar(vincular = true) {
  const bd = crearBdFake()
  for (const [id, nif] of [[T, '12345678Z'], [T2, '11111111H']] as const) {
    bd.sembrar('taller', { id, razonSocial: `Taller ${nif}`, nombreComercial: 'Taller', nif, via: 'Calle Cañada Real', numero: '14', cp: '41900', municipio: 'Camas', provincia: 'Sevilla', contabilidadEmpresaId: vincular && id === T ? EMPRESA : null })
    bd.sembrar('serieFactura', { tallerId: id, codigo: 'F', prefijo: 'F', descripcion: 'Facturas', rectificativa: false, porDefecto: true, ultimoNumero: 0 })
    bd.sembrar('serieFactura', { tallerId: id, codigo: 'R', prefijo: 'R', descripcion: 'Rectificativas', rectificativa: true, porDefecto: false, ultimoNumero: 0 })
    bd.sembrar('medioCobro', { tallerId: id, codigo: 'tarjeta', nombre: 'Tarjeta', esEfectivo: false })
  }
  return { bd, conTaller: crearConTaller(bd.cliente) }
}
let nOt = 0
function ot(m: ReturnType<typeof montar>, o: { firmada?: boolean; base?: number } = {}) {
  const tallerId = T
  const cli = m.bd.sembrar('cliente', { tallerId, nombre: 'Taxis Ana S.L.', nif: '87654321X', via: 'Calle Mayor', numero: '1', cp: '41900', municipio: 'Camas', provincia: 'Sevilla' })
  const veh = m.bd.sembrar('vehiculo', { tallerId, matricula: `${2000 + nOt} BCD` })
  const rec = m.bd.sembrar('recepcion', { tallerId, vehiculoId: veh.id, clienteId: cli.id, firmadoEn: o.firmada === false ? null : AHORA })
  const orden = m.bd.sembrar('ordenTrabajo', { tallerId, numero: ++nOt, recepcionId: rec.id, vehiculoId: veh.id, estado: 'terminado' })
  m.bd.sembrar('otLinea', { tallerId, otId: orden.id, tipo: 'mano_obra', descripcion: 'Trabajo', cantidad: 60, unidad: 'min', baseCent: o.base ?? 10_000, ivaCodigo: 'g', ivaPuntosBasicos: 2100, cuotaIvaCent: 0, totalCent: o.base ?? 10_000, origen: 'paquete', aceptadaEn: AHORA })
  return orden
}
const emitir = (m: ReturnType<typeof montar>, otId: string, extra: Record<string, unknown> = {}) =>
  m.conTaller(T, (tx: any) => emitirFactura(tx, { tallerId: T, otId, usuarioId: null, ahora: AHORA, ...extra }, deps))
const hechos = (m: ReturnType<typeof montar>) => m.bd.filas('hechoPendiente')

// ─── Outbox: misma transacción ───────────────────────────────────────────────
test('factura emitida: un hecho de venta en la misma transacción (sin cuentas, ref = número)', async () => {
  const m = montar()
  const r: any = await emitir(m, ot(m).id)
  assert.equal(r.ok, true, JSON.stringify(r))
  const hs = hechos(m)
  assert.equal(hs.length, 1)
  assert.deepEqual([hs[0].tipo, hs[0].estado, hs[0].intentos, hs[0].ref, hs[0].facturaId], ['venta', 'pendiente', 0, r.numSerie, r.facturaId])
  assert.deepEqual(hs[0].hecho.desglose, [{ base: 10_000, tipoIva: 21, cuota: 2_100 }])
  assert.equal(hs[0].hecho.tipo, 'venta')
  for (const k of ['cuentaTercero', 'cuentaTesoreria', 'cuentaContrapartida']) assert.equal(k in hs[0].hecho, false)
})

test('cobros: un hecho de cobro por cada cobro, con el id del cobro como ref', async () => {
  const m = montar()
  const r: any = await emitir(m, ot(m).id, { cobros: [{ medioCodigo: 'tarjeta', importeCent: 5_000 }, { medioCodigo: 'tarjeta', importeCent: 7_100 }] })
  assert.equal(r.ok, true, JSON.stringify(r))
  const cobros = m.bd.filas('cobro')
  const hs = hechos(m).filter((h) => h.tipo === 'cobro')
  assert.equal(hs.length, 2)
  assert.deepEqual(hs.map((h) => h.ref).sort(), cobros.map((c) => c.id).sort())
  assert.deepEqual(hs.map((h) => h.hecho.importe).sort(), [5_000, 7_100])
  assert.ok(hs.every((h) => h.hecho.medio === 'tarjeta'), 'el hecho de cobro lleva el código del medio')
  // Un cobro posterior (parcial) también genera el suyo.
  const f = m.bd.filas('factura')[0]
  assert.equal(((await m.conTaller(T, (tx: any) => registrarCobros(tx, { tallerId: T, facturaId: f.id, usuarioId: null, ahora: AHORA, cobros: [{ medioCodigo: 'tarjeta', importeCent: 1 }] }))) as any).ok, false) // ya está cobrada entera
  assert.equal(hechos(m).filter((h) => h.tipo === 'cobro').length, 2)
})

test('si la transacción falla NO queda hecho (ni factura); una validación fallida tampoco escribe', async () => {
  const m = montar()
  const o = ot(m)
  await assert.rejects(m.conTaller(T, async (tx: any) => {
    const r = await emitirFactura(tx, { tallerId: T, otId: o.id, usuarioId: null, ahora: AHORA }, deps)
    assert.equal(r.ok, true)
    throw new Error('falla algo después de emitir')
  }), /falla algo/)
  assert.equal(m.bd.filas('factura').length, 0)
  assert.equal(hechos(m).length, 0, 'el rollback deshace el hecho con la factura')
  const sinFirma = ot(m, { firmada: false })
  assert.equal(((await emitir(m, sinFirma.id)) as any).ok, false)
  assert.equal(hechos(m).length, 0)
})

test('encolar dos veces lo mismo no duplica (idempotente por taller, tipo y ref)', async () => {
  const m = montar()
  const factura = { numSerie: 'F2026-000009', fechaExpedicion: '2026-11-04', tipo: 'F1', clienteNombre: 'X', desglose: [{ ivaPuntosBasicos: 2100, baseCent: 100, cuotaCent: 21 }] }
  for (let i = 0; i < 2; i++) await m.conTaller(T, (tx: any) => encolarFactura(tx, { tallerId: T, facturaId: '00000000-0000-4000-8000-0000000000aa', factura }))
  assert.equal(hechos(m).length, 1)
})

test('abono, rectificativa por sustitución y anulación: quedan «no_soportado» con motivo, no se inventan', async () => {
  const m = montar()
  const r: any = await emitir(m, ot(m).id)
  const abono: any = await m.conTaller(T, (tx: any) => rectificarFactura(tx, { tallerId: T, facturaId: r.facturaId, usuarioId: null, ahora: AHORA, motivo: 'devolución total', modo: 'abono_total' }, deps))
  assert.equal(abono.ok, true, JSON.stringify(abono))
  const ns = hechos(m).filter((h) => h.estado === 'no_soportado')
  assert.equal(ns.length, 1)
  assert.equal(ns[0].tipo, 'no_soportado')
  assert.match(ns[0].hecho.motivo, /abonos/)
  // Anulación de otra factura.
  const r2: any = await emitir(m, ot(m).id)
  assert.equal(((await m.conTaller(T, (tx: any) => anularFactura(tx, { tallerId: T, facturaId: r2.facturaId, motivo: 'error de datos', ahora: AHORA }, deps))) as any).ok, true)
  assert.equal(hechos(m).filter((h) => h.estado === 'no_soportado' && h.ref.startsWith('anulacion:')).length, 1)
  // Y el envío ignora los no soportados.
  const { d, llamadas } = depsEnvio(m, [{ status: 201 }, { status: 201 }])
  await enviarHechos(d)
  assert.equal(llamadas.length, 2, 'solo las dos ventas; ni el abono ni la anulación')
  assert.equal(hechos(m).filter((h) => h.estado === 'no_soportado').length, 2)
})

// ─── Clasificación ───────────────────────────────────────────────────────────
test('clasificación de la respuesta del puerto', () => {
  const caso = (s: number | null) => clasificarRespuesta(s).estado
  for (const s of [200, 201, 202]) assert.equal(caso(s), 'enviado', String(s))
  for (const s of [400, 403, 409, 422]) assert.equal(caso(s), 'rechazado', String(s))
  for (const s of [401, 408, 429, 500, 502, 503, 504, 302]) assert.equal(caso(s), 'error', String(s))
  assert.equal(caso(null), 'error')
  assert.match(clasificarRespuesta(409).detalle ?? '', /contenido distinto/)
  assert.match(clasificarRespuesta(403).detalle ?? '', /no está autorizado/)
  assert.equal(clasificarRespuesta(200).detalle, null)
})

test('espera exponencial con tope', () => {
  assert.deepEqual([1, 2, 3].map(esperaTrasIntento), [5 * 60_000, 10 * 60_000, 20 * 60_000])
  assert.equal(esperaTrasIntento(40), 12 * 60 * 60_000)
})

// ─── Envío ───────────────────────────────────────────────────────────────────
type Resp = { status: number } | 'red'
function depsEnvio(m: ReturnType<typeof montar>, respuestas: Resp[], extra: Partial<DepsEnvio> = {}) {
  const llamadas: { url: string; init: any }[] = []
  let i = 0
  const d: DepsEnvio = {
    config: { url: 'https://contabilidad.example.test', secreto: 'secreto-de-prueba-0123456789' },
    talleres: async () => [T, T2],
    conTaller: m.conTaller as any,
    fetch: async (url, init) => {
      llamadas.push({ url, init })
      const r = respuestas[Math.min(i++, respuestas.length - 1)]
      if (r === 'red') throw new TypeError('fetch failed')
      return { status: r.status, text: async () => '{}' }
    },
    ahora: () => AHORA,
    ...extra,
  }
  return { d, llamadas }
}

test('sin configuración (URL o secreto) NO envía y todo queda pendiente', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  const { d, llamadas } = depsEnvio(m, [{ status: 201 }], { config: null })
  const r = await enviarHechos(d)
  assert.equal(llamadas.length, 0)
  assert.equal(r.configurado, false)
  assert.deepEqual([hechos(m)[0].estado, hechos(m)[0].intentos, hechos(m)[0].ultimoError ?? null], ['pendiente', 0, null])
  // leerConfigContabilidad: falta URL, falta secreto, URL no https.
  const sec = () => 's'.repeat(24)
  assert.equal(leerConfigContabilidad({}, sec), null)
  assert.equal(leerConfigContabilidad({ CONTABILIDAD_URL: 'https://c.example.test' }, () => { throw new Error('falta') }), null)
  assert.equal(leerConfigContabilidad({ CONTABILIDAD_URL: 'http://c.example.test' }, sec), null)
  assert.deepEqual(leerConfigContabilidad({ CONTABILIDAD_URL: 'https://c.example.test/ruta' }, sec), { url: 'https://c.example.test', secreto: sec() })
})

test('taller sin empresa de contabilidad vinculada: no envía y deja pendiente (no es error)', async () => {
  const m = montar(false)
  await emitir(m, ot(m).id)
  const { d, llamadas } = depsEnvio(m, [{ status: 201 }])
  const r = await enviarHechos(d)
  assert.equal(llamadas.length, 0)
  assert.equal(r.sinEmpresa, 2)
  assert.equal(r.talleresConError, 0)
  assert.equal(hechos(m)[0].estado, 'pendiente')
})

test('envío correcto: contrato del puerto (Bearer, X-Origen-App, empresaId + hecho) y estado enviado', async () => {
  const m = montar()
  await emitir(m, ot(m).id, { cobros: [{ medioCodigo: 'tarjeta', importeCent: 12_100 }] })
  const { d, llamadas } = depsEnvio(m, [{ status: 201 }])
  const r = await enviarHechos(d)
  assert.equal(r.enviados, 2)
  assert.equal(llamadas[0].url, 'https://contabilidad.example.test/api/hechos')
  assert.equal(llamadas[0].init.headers.authorization, 'Bearer secreto-de-prueba-0123456789')
  assert.equal(llamadas[0].init.headers['x-origen-app'], 'taller')
  assert.equal(llamadas[0].init.redirect, 'manual')
  const cuerpo = JSON.parse(llamadas[0].init.body)
  assert.deepEqual(Object.keys(cuerpo).sort(), ['empresaId', 'hecho'])
  assert.equal(cuerpo.empresaId, EMPRESA)
  assert.deepEqual(llamadas.map((l) => JSON.parse(l.init.body).hecho.tipo), ['venta', 'cobro'], 'la venta viaja antes que su cobro')
  assert.ok(hechos(m).every((h) => h.estado === 'enviado' && h.intentos === 1 && h.enviadoEn))
})

test('409/403 → rechazado y NO se reintenta; visible en el estado', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  const a = depsEnvio(m, [{ status: 409 }])
  assert.equal((await enviarHechos(a.d)).rechazados, 1)
  assert.equal(hechos(m)[0].estado, 'rechazado')
  assert.match(hechos(m)[0].ultimoError, /409/)
  const b = depsEnvio(m, [{ status: 201 }])
  await enviarHechos(b.d)
  assert.equal(b.llamadas.length, 0, 'un rechazado no se vuelve a enviar')
  assert.equal(estadoEnvio(hechos(m) as any).rechazados, 1)
})

test('5xx y red → error con reintento exponencial; reintento idempotente (200 duplicado) → enviado, sin duplicar filas', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  let ahora = AHORA
  const mk = (rs: Resp[]) => depsEnvio(m, rs, { ahora: () => ahora })
  const r1 = mk(['red'])
  assert.equal((await enviarHechos(r1.d)).errores, 1)
  assert.deepEqual([hechos(m)[0].estado, hechos(m)[0].intentos], ['error', 1])
  assert.equal(new Date(hechos(m)[0].proximoIntento).getTime(), AHORA.getTime() + 5 * 60_000)
  // Aún no toca: no llama.
  const r2 = mk([{ status: 503 }])
  await enviarHechos(r2.d)
  assert.equal(r2.llamadas.length, 0)
  // Toca: 503 → segundo error, espera 10 min.
  ahora = new Date(AHORA.getTime() + 6 * 60_000)
  const r3 = mk([{ status: 503 }])
  await enviarHechos(r3.d)
  assert.equal(r3.llamadas.length, 1)
  assert.deepEqual([hechos(m)[0].estado, hechos(m)[0].intentos], ['error', 2])
  assert.equal(new Date(hechos(m)[0].proximoIntento).getTime(), ahora.getTime() + 10 * 60_000)
  // Más tarde el puerto responde 200 (ya lo tenía: duplicado idempotente) → enviado.
  ahora = new Date(ahora.getTime() + 11 * 60_000)
  const r4 = mk([{ status: 200 }])
  await enviarHechos(r4.d)
  assert.deepEqual([hechos(m)[0].estado, hechos(m)[0].intentos, hechos(m).length], ['enviado', 3, 1])
  assert.equal(JSON.parse(r4.llamadas[0].init.body).hecho.ref, hechos(m)[0].ref, 'mismo ref en cada reintento')
})

test('si la venta no sale, su cobro espera (no viaja antes que la venta)', async () => {
  const m = montar()
  await emitir(m, ot(m).id, { cobros: [{ medioCodigo: 'tarjeta', importeCent: 12_100 }] })
  const { d, llamadas } = depsEnvio(m, [{ status: 503 }])
  const r = await enviarHechos(d)
  assert.equal(llamadas.length, 1)
  assert.equal(r.errores, 1)
  const cobro = hechos(m).find((h) => h.tipo === 'cobro')
  assert.deepEqual([cobro.estado, cobro.intentos], ['pendiente', 0])
})

// ─── Cron ────────────────────────────────────────────────────────────────────
const SECRETO = ['cron', 'secreto', 'prueba', '0123456789'].join('-')
const peticion = (auth?: string) => ({ headers: new Headers(auth === undefined ? {} : { authorization: auth }) })

test('cron: 401 sin Bearer, con Bearer incorrecto o sin secreto configurado; con el correcto responde contadores', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  const mk = (secreto: string | null) => ({ ...depsEnvio(m, [{ status: 201 }]).d, secreto })
  for (const [auth, sec] of [[undefined, SECRETO], ['Bearer otro', SECRETO], ['Basic ' + SECRETO, SECRETO], ['Bearer ' + SECRETO, null], ['Bearer ', null]] as const) {
    const r = await manejarCronHechos(peticion(auth), mk(sec))
    assert.equal(r.status, 401, String(auth))
  }
  assert.equal(hechos(m)[0].estado, 'pendiente', 'ningún 401 envía nada')
  const ok = await manejarCronHechos(peticion('Bearer ' + SECRETO), mk(SECRETO))
  assert.equal(ok.status, 200)
  const cuerpo = await ok.json()
  assert.equal(cuerpo.enviados, 1)
  assert.equal(JSON.stringify(cuerpo).includes(EMPRESA), false, 'solo contadores')
})

test('el cron está declarado en vercel.json sin tocar el ignoreCommand', () => {
  const v = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'vercel.json'), 'utf8'))
  assert.ok(v.crons.some((c: any) => c.path === '/api/cron/enviar-hechos'))
  assert.match(v.ignoreCommand, /vercel-ignore-build\.mjs apps\/taller --sin-previews/)
})

// ─── Panel: lógica pura ──────────────────────────────────────────────────────
test('margen: sin costes = «sin datos» (NUNCA margen = ventas); recambio sin coste = incompleto; con todos = margen real', () => {
  const sinCostes = margenOt(10_000, [{ tipo: 'mano_obra', costeCent: null }, { tipo: 'pieza', costeCent: null }])
  assert.equal(sinCostes.estado, 'sin_datos')
  assert.equal(sinCostes.margenCent, null)
  assert.equal(margenOt(10_000, [{ tipo: 'mano_obra', costeCent: null }]).estado, 'sin_datos', 'solo mano de obra: tampoco hay dato de coste')
  assert.equal(margenOt(10_000, []).margenCent, null)
  const inc: any = margenOt(10_000, [{ tipo: 'pieza', costeCent: 3_000 }, { tipo: 'pieza', costeCent: null }])
  assert.deepEqual([inc.estado, inc.faltan, inc.margenCent], ['incompleto', 1, null])
  const ok: any = margenOt(10_000, [{ tipo: 'pieza', costeCent: 3_000 }, { tipo: 'granel', costeCent: BigInt(500) }, { tipo: 'mano_obra', costeCent: null }])
  assert.deepEqual([ok.estado, ok.costeCent, ok.margenCent], ['ok', 3_500, 6_500])
  assert.equal(margenOt(10_000, [{ tipo: 'pieza', costeCent: 0 }]).estado, 'ok', 'coste 0 declarado es un dato; NULL no')
})

test('facturación: mes vs anterior; anuladas fuera, rectificativas restan; sin base → variación null', () => {
  const f = (fecha: string, base: number, estado = 'emitida') => ({ fechaExpedicion: fecha, estado, baseCent: base, totalCent: Math.round(base * 1.21) })
  const r = facturacionMensual([
    f('2026-11-02', 20_000), f('2026-11-03', -5_000), f('2026-11-01', 99_000, 'anulada'),
    f('2026-10-15', 10_000), f('2026-10-30', 10_000), f('2026-09-30', 77_777),
  ], AHORA)
  assert.deepEqual([r.actual.base, r.actual.facturas, r.anterior.base, r.variacionPct], [15_000, 2, 20_000, -25])
  assert.equal(facturacionMensual([f('2026-11-02', 1_000)], AHORA).variacionPct, null)
})

test('horas: baremo repartido por minutos; OT sin baremo no cuenta; parte abierto aparte', () => {
  const t = (h: number, min = 0) => new Date(Date.UTC(2026, 10, 3, h, min))
  const r = horasPorMecanico(
    [
      { mecanicoId: 'a', otId: 'o1', inicio: t(8), fin: t(10) }, // 120
      { mecanicoId: 'b', otId: 'o1', inicio: t(8), fin: t(9) }, // 60
      { mecanicoId: 'a', otId: 'o2', inicio: t(11), fin: t(12) }, // 60 en OT sin baremo
      { mecanicoId: 'b', otId: 'o3', inicio: t(13), fin: null },
    ],
    [{ otId: 'o1', baremoMinutos: 90 }, { otId: 'o2', baremoMinutos: null }],
  )
  const a = r.find((x) => x.mecanicoId === 'a')!
  const b = r.find((x) => x.mecanicoId === 'b')!
  assert.deepEqual([a.realesMin, a.conBaremoMin, a.baremoMin, a.rendimientoPct], [180, 120, 60, 50])
  assert.deepEqual([b.realesMin, b.baremoMin, b.partesAbiertos], [60, 30, 1])
  const sin = horasPorMecanico([{ mecanicoId: 'c', otId: 'o9', inicio: t(8), fin: t(9) }], [])
  assert.deepEqual([sin[0].baremoMin, sin[0].rendimientoPct], [null, null])
})

// ─── Esquema SQL 0010 (fuente) ───────────────────────────────────────────────
test('0010: RLS por taller, solo-añadir, vínculo solo del operador y estados espejo del código', () => {
  const sql = readFileSync(join(import.meta.dirname, '..', 'prisma', 'sql', '0010_outbox_contabilidad.sql'), 'utf8').replace(/^\s*--.*$/gm, '')
  assert.match(sql, /^BEGIN;$/m)
  assert.match(sql, /FORCE ROW LEVEL SECURITY/)
  assert.match(sql, /USING \(taller_id = taller\.taller_actual\(\)\) WITH CHECK \(taller_id = taller\.taller_actual\(\)\)/)
  assert.match(sql, /GRANT SELECT, INSERT ON taller\.hechos_pendientes TO prisma_taller;/)
  assert.doesNotMatch(sql, /GRANT[^;]*\bDELETE\b/)
  assert.match(sql, /GRANT UPDATE \(estado, intentos, ultimo_error, proximo_intento, enviado_en, actualizado_en\) ON taller\.hechos_pendientes/)
  assert.match(sql, /REVOKE UPDATE \(contabilidad_empresa_id\) ON taller\.talleres FROM prisma_taller;/)
  assert.match(sql, /fijar_contabilidad_empresa[\s\S]*SECURITY DEFINER/)
  assert.match(sql, /REVOKE ALL ON FUNCTION taller\.fijar_contabilidad_empresa\(uuid, uuid\) FROM PUBLIC;/)
  assert.match(sql, /UNIQUE \(taller_id, tipo, ref\)/)
  assert.match(sql, /coste_cent bigint;/)
  assert.equal([...sql.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/g)].length, 0)
  const estados = sql.match(/estado\s+text NOT NULL DEFAULT 'pendiente' CHECK \(estado IN \(([^)]*)\)\)/)
  assert.ok(estados)
  assert.deepEqual([...estados[1].matchAll(/'(\w+)'/g)].map((x) => x[1]), ['pendiente', 'enviado', 'rechazado', 'error', 'no_soportado'])
  const prisma = readFileSync(join(import.meta.dirname, '..', 'prisma', 'schema.prisma'), 'utf8')
  assert.match(prisma, /model HechoPendiente[\s\S]*@@map\("hechos_pendientes"\)/)
  assert.match(prisma, /contabilidadEmpresaId\s+String\?\s+@map\("contabilidad_empresa_id"\)/)
  assert.match(prisma, /costeCent\s+BigInt\?\s+@map\("coste_cent"\)/)
})

test('cobros del mes por medio (bizum / transferencia / efectivo), otros meses fuera', () => {
  const c = (medioCodigo: string, importeCent: number, d: string) => ({ medioCodigo, importeCent, cobradoEn: new Date(d) })
  const r = cobrosPorMedio([c('bizum', 1_000, '2026-11-02T10:00:00Z'), c('bizum', 500, '2026-11-03T10:00:00Z'), c('efectivo', 300, '2026-11-03T10:00:00Z'), c('transferencia', 9_000, '2026-10-30T10:00:00Z')], '2026-11')
  assert.deepEqual(r, [{ medio: 'bizum', importeCent: 1_500, cobros: 2 }, { medio: 'efectivo', importeCent: 300, cobros: 1 }])
})
