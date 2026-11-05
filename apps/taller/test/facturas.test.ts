/* eslint-disable @typescript-eslint/no-explicit-any */
// Facturación VeriFactu del taller sobre la BD falsa (RLS emulado, candados de transacción, rollback).
// Cepos vistos FALLAR (04/11/2026), uno por aserción, y restaurados:
// (1) quitar `await candado(tx, o.tallerId)` de emitirFactura → rojo «dos emisiones concurrentes: sin duplicados ni huecos».
// (2) en escribirAlta, `anterior: eslabon` → `anterior: null` → rojo «la segunda encadena con la primera».
// (3) en anularFactura, `anterior: eslabon` → `anterior: null` → rojo «anulación encadenada».
// (4) en construirFacturaDesdeOt usar `lineas` sin filtrar → rojo «ampliación no aceptada fuera» (lo ve también module-taller).
// (5) en emitirFactura quitar la pre-validación de cobros → rojo «efectivo > 1.000 € bloquea y no deja factura».
// (6) añadir `totalCent` al `data` de un `tx.factura.update` → rojo «solo se actualizan columnas de estado».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asientoDesdeHecho } from '@central/module-contabilidad'
import { construirRegistroAnulacion, transporteDesactivado } from '@central/core-fiscal'
import { LIMITE_EFECTIVO_CENT, LIMITE_SIMPLIFICADA_CENT } from '@central/module-taller'
import { crearBdFake } from './_fake-prisma.ts'
import { crearConTaller } from '../lib/rls.ts'
import {
  aplicarRespuestaEnvio, anularFactura, emitirFactura, estadoEnvioDe, registrarCobros, rectificarFactura,
} from '../lib/facturas.ts'
import { CONFIG_SIF, type ConfigSif } from '../lib/sistema-informatico.ts'
import { hechoCobro, hechoVenta } from '../lib/factura-hechos.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const T2 = '00000000-0000-4000-8000-000000000002'
const AHORA = new Date('2026-11-04T10:00:00Z')
const PB = 1900 // IVA arbitrario (no el general)
const SIF: ConfigSif = { ...CONFIG_SIF, productorNombreRazon: 'Productor de prueba', productorNif: '00000000T', nombreSistema: 'Sistema prueba', idSistema: 'ZZ', version: '0.1' }
const deps = { sif: SIF }

function montar() {
  const bd = crearBdFake()
  for (const [id, nif] of [[T, '12345678Z'], [T2, '11111111H']] as const) {
    bd.sembrar('taller', { id, razonSocial: `Taller ${nif}`, nombreComercial: 'Taller', nif, via: 'Calle Cañada Real', numero: '14', cp: '41900', municipio: 'Camas', provincia: 'Sevilla' })
    bd.sembrar('serieFactura', { tallerId: id, codigo: 'F', prefijo: 'F', descripcion: 'Facturas', rectificativa: false, porDefecto: true, ultimoNumero: 0 })
    bd.sembrar('serieFactura', { tallerId: id, codigo: 'R', prefijo: 'R', descripcion: 'Rectificativas', rectificativa: true, porDefecto: false, ultimoNumero: 0 })
    bd.sembrar('medioCobro', { tallerId: id, codigo: 'efectivo', nombre: 'Efectivo', esEfectivo: true })
    bd.sembrar('medioCobro', { tallerId: id, codigo: 'tarjeta', nombre: 'Tarjeta', esEfectivo: false })
  }
  return { bd, conTaller: crearConTaller(bd.cliente) }
}

let nOt = 0
/** OT terminada con recepción firmada y líneas (base en céntimos; `sinAceptar` = ampliación pendiente). */
function ot(m: ReturnType<typeof montar>, o: { taller?: string; bases?: number[]; sinAceptar?: number[]; nif?: string | null; firmada?: boolean; estado?: string } = {}) {
  const tallerId = o.taller ?? T
  const cli = m.bd.sembrar('cliente', {
    tallerId, nombre: 'Taxis Ana S.L.', nif: o.nif === undefined ? '87654321X' : o.nif, via: 'Calle Mayor', numero: '1', cp: '41900', municipio: 'Camas', provincia: 'Sevilla',
  })
  const veh = m.bd.sembrar('vehiculo', { tallerId, matricula: `${1000 + nOt} BCD` })
  const rec = m.bd.sembrar('recepcion', { tallerId, vehiculoId: veh.id, clienteId: cli.id, firmadoEn: o.firmada === false ? null : AHORA })
  const orden = m.bd.sembrar('ordenTrabajo', { tallerId, numero: ++nOt, recepcionId: rec.id, vehiculoId: veh.id, estado: o.estado ?? 'terminado' })
  const linea = (base: number, aceptada: boolean, origen: string) => m.bd.sembrar('otLinea', {
    tallerId, otId: orden.id, tipo: 'mano_obra', descripcion: `Trabajo ${base}`, cantidad: 60, unidad: 'min', baseCent: base, ivaCodigo: 'g',
    ivaPuntosBasicos: PB, cuotaIvaCent: 0, totalCent: base, origen, aceptadaEn: aceptada ? AHORA : null,
  })
  for (const b of o.bases ?? [10_000]) linea(b, true, 'paquete')
  for (const b of o.sinAceptar ?? []) linea(b, false, 'ampliacion')
  return orden
}

const emitir = (m: ReturnType<typeof montar>, otId: string, extra: Record<string, unknown> = {}, tallerId = T) =>
  m.conTaller(tallerId, (tx: any) => emitirFactura(tx, { tallerId, otId, usuarioId: null, ahora: AHORA, ...extra }, deps))

test('emite F1: número de la serie, primer registro SIN anterior, QR, XML y OT → facturado', async () => {
  const m = montar()
  const o = ot(m, { bases: [10_000, 5_000] })
  const r = await emitir(m, o.id)
  assert.equal(r.ok, true, JSON.stringify(r))
  const [f] = m.bd.filas('factura')
  assert.equal(f.numSerie, 'F2026-000001')
  assert.equal(f.tipo, 'F1')
  assert.equal(f.clienteNif, '87654321X')
  assert.equal(f.baseCent, 15_000)
  assert.equal(f.cuotaIvaCent, 2_850)
  assert.equal(f.totalCent, 17_850)
  assert.equal(f.huellaAnterior, null)
  assert.match(f.huella, /^[0-9A-F]{64}$/)
  assert.match(f.xml, /<sum1:PrimerRegistro>S<\/sum1:PrimerRegistro>/)
  assert.match(f.xml, /<sum1:TipoFactura>F1<\/sum1:TipoFactura>/)
  assert.match(f.xml, /<sum1:NIF>00000000T<\/sum1:NIF>/, 'el NIF del PRODUCTOR va en SistemaInformatico')
  assert.match(f.qrUrl, /nif=12345678Z&numserie=F2026-000001&fecha=04-11-2026&importe=178\.50/)
  assert.equal(f.estadoEnvio, 'no_enviado')
  const [reg] = m.bd.filas('registroVerifactu')
  assert.deepEqual([reg.tipo, reg.secuencia, reg.huellaAnterior, reg.huella], ['alta', 1, null, f.huella])
  assert.equal(m.bd.filas('facturaLinea').length, 2)
  assert.equal(m.bd.filas('ordenTrabajo').find((x) => x.id === o.id).estado, 'facturado')
  assert.equal(m.bd.filas('contadorFactura')[0].ultimoNumero, 1)
})

test('el candado de la factura se toma DENTRO de la misma transacción que escribe (no antes ni aparte)', async () => {
  const m = montar()
  const o = ot(m)
  const antes = m.bd.transacciones
  await emitir(m, o.id)
  assert.equal(m.bd.transacciones - antes, 1, 'una sola transacción para candado + escrituras')
  const raw = m.bd.llamadasRaw
  const i = raw.findIndex((s) => s.includes('pg_advisory_xact_lock') && s.includes(`factura:${T}`))
  assert.ok(i > 0, 'toma pg_advisory_xact_lock(factura:<taller>)')
  assert.match(raw[i - 1], /set_config\('taller\.taller_id'/, 'justo tras fijar el taller: antes de cualquier lectura')
})

test('la segunda encadena con la primera (número 2, secuencia 2, huella anterior = la primera)', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  await emitir(m, ot(m).id)
  const [a, b] = m.bd.filas('factura').sort((x, y) => x.numero - y.numero)
  assert.equal(b.numSerie, 'F2026-000002')
  assert.equal(b.huellaAnterior, a.huella)
  assert.deepEqual(m.bd.filas('registroVerifactu').map((r) => r.secuencia).sort(), [1, 2])
  assert.match(b.xml, new RegExp(`<sum1:Huella>${a.huella}</sum1:Huella></sum1:RegistroAnterior>`))
})

test('dos emisiones concurrentes: sin duplicados ni huecos y cadena coherente', async () => {
  const m = montar()
  const ots = [ot(m), ot(m), ot(m)]
  const rs = await Promise.all(ots.map((o) => emitir(m, o.id)))
  assert.ok(rs.every((r) => r.ok), JSON.stringify(rs))
  const fs = m.bd.filas('factura')
  assert.deepEqual(fs.map((f) => f.numero).sort(), [1, 2, 3])
  const regs = m.bd.filas('registroVerifactu').sort((x, y) => x.secuencia - y.secuencia)
  assert.deepEqual(regs.map((r) => r.secuencia), [1, 2, 3])
  assert.equal(regs[0].huellaAnterior, null)
  assert.equal(regs[1].huellaAnterior, regs[0].huella)
  assert.equal(regs[2].huellaAnterior, regs[1].huella)
})

test('una emisión que falla a mitad NO consume número (rollback): la siguiente es la 1', async () => {
  const m = montar()
  const o = ot(m)
  await assert.rejects(m.conTaller(T, (tx: any) => {
    const roto = new Proxy(tx, { get: (t, p) => (p === 'registroVerifactu' ? { ...t.registroVerifactu, findFirst: t.registroVerifactu.findFirst, create: async () => { throw new Error('caída simulada') } } : t[p]) })
    return emitirFactura(roto, { tallerId: T, otId: o.id, usuarioId: null, ahora: AHORA }, deps)
  }))
  assert.equal(m.bd.filas('factura').length, 0)
  assert.equal(m.bd.filas('contadorFactura').length, 0)
  const r = await emitir(m, o.id)
  assert.equal(r.ok && r.numSerie, 'F2026-000001')
})

test('una OT no se factura dos veces; ni sin recepción firmada; ni abierta', async () => {
  const m = montar()
  const o = ot(m)
  assert.equal((await emitir(m, o.id)).ok, true)
  const dos = await emitir(m, o.id)
  assert.equal(dos.ok, false)
  assert.equal(m.bd.filas('factura').length, 1)
  assert.equal((await emitir(m, ot(m, { firmada: false }).id)).ok, false)
  assert.equal((await emitir(m, ot(m, { estado: 'en_curso' }).id)).ok, false)
})

test('ampliación no aceptada fuera de la factura (ni líneas ni total)', async () => {
  const m = montar()
  const o = ot(m, { bases: [10_000], sinAceptar: [50_000] })
  await emitir(m, o.id)
  const [f] = m.bd.filas('factura')
  assert.equal(f.baseCent, 10_000)
  assert.deepEqual(m.bd.filas('facturaLinea').map((l) => l.baseCent), [10_000])
})

test('F2 > 400 € sin NIF rechazada (y no consume número); ≤ 400 € sale simplificada sin destinatario', async () => {
  const m = montar()
  const base = Math.floor((LIMITE_SIMPLIFICADA_CENT * 10_000) / (10_000 + PB)) + 10 // total > límite
  const r = await emitir(m, ot(m, { nif: null, bases: [base] }).id)
  assert.equal(r.ok, false)
  assert.match((r as any).motivo, /pide NIF/)
  assert.equal(m.bd.filas('contadorFactura').length, 0)
  const ok = await emitir(m, ot(m, { nif: null, bases: [10_000] }).id)
  assert.equal(ok.ok, true)
  const [f] = m.bd.filas('factura')
  assert.deepEqual([f.tipo, f.clienteNif, f.numero], ['F2', null, 1])
  assert.doesNotMatch(f.xml, /Destinatarios/)
})

test('cobro dividido que suma el total → pendiente 0 y dos cobros', async () => {
  const m = montar()
  const r = await emitir(m, ot(m, { bases: [100_000] }).id, { cobros: [{ medioCodigo: 'tarjeta', importeCent: 69_000 }, { medioCodigo: 'efectivo', importeCent: 50_000 }] })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.ok && r.pendienteCent, 0)
  const cobros = m.bd.filas('cobro')
  assert.equal(cobros.reduce((s, c) => s + c.importeCent, 0), 119_000)
  assert.deepEqual(cobros.map((c) => c.esEfectivo).sort(), [false, true])
})

test('efectivo > 1.000 € bloquea y no deja factura', async () => {
  const m = montar()
  const r = await emitir(m, ot(m, { bases: [200_000] }).id, { cobros: [{ medioCodigo: 'efectivo', importeCent: LIMITE_EFECTIVO_CENT + 1 }] })
  assert.equal(r.ok, false)
  assert.equal(m.bd.filas('factura').length, 0)
  assert.equal(m.bd.filas('cobro').length, 0)
})

test('cobro posterior: parcial y luego el resto; pasarse del total se rechaza', async () => {
  const m = montar()
  const r = await emitir(m, ot(m, { bases: [10_000] }).id)
  assert.ok(r.ok)
  const cobrar = (importeCent: number) => m.conTaller(T, (tx: any) => registrarCobros(tx, { tallerId: T, facturaId: (r as any).facturaId, usuarioId: null, ahora: AHORA, cobros: [{ medioCodigo: 'tarjeta', importeCent }] }))
  assert.equal(((await cobrar(5_000)) as any).pendienteCent, 6_900)
  assert.equal((await cobrar(6_901)).ok, false)
  assert.equal(((await cobrar(6_900)) as any).pendienteCent, 0)
})

test('anulación encadenada: registro de anulación tras el alta, huella recalculable y factura anulada', async () => {
  const m = montar()
  const o = ot(m)
  const r = await emitir(m, o.id)
  assert.ok(r.ok)
  const an = await m.conTaller(T, (tx: any) => anularFactura(tx, { tallerId: T, facturaId: (r as any).facturaId, motivo: 'Error en la matrícula', ahora: AHORA }, deps))
  assert.equal(an.ok, true, JSON.stringify(an))
  const regs = m.bd.filas('registroVerifactu').sort((x, y) => x.secuencia - y.secuencia)
  assert.deepEqual(regs.map((x) => [x.tipo, x.secuencia]), [['alta', 1], ['anulacion', 2]])
  assert.equal(regs[1].huellaAnterior, regs[0].huella)
  const recalculada = construirRegistroAnulacion({
    facturaAnulada: { idEmisor: '12345678Z', numSerie: 'F2026-000001', fechaExpedicion: '2026-11-04' },
    anterior: { idEmisor: '12345678Z', numSerie: 'F2026-000001', fechaExpedicion: '2026-11-04', huella: regs[0].huella },
    fechaHoraHusoGenRegistro: regs[1].fechaHoraHuso,
  })
  assert.equal(regs[1].huella, recalculada.huella)
  assert.match(regs[1].xml, /<sum1:RegistroAnulacion>/)
  const [f] = m.bd.filas('factura')
  assert.deepEqual([f.estado, f.motivoAnulacion], ['anulada', 'Error en la matrícula'])
  // La OT queda facturable otra vez: nueva factura con el SIGUIENTE número (el anulado no se reutiliza) y la cadena sigue.
  const otra = await emitir(m, o.id)
  assert.equal(otra.ok && otra.numSerie, 'F2026-000002')
  assert.equal(m.bd.filas('registroVerifactu').find((x) => x.secuencia === 3).huellaAnterior, regs[1].huella)
  // Una anulada no se anula dos veces.
  assert.equal((await m.conTaller(T, (tx: any) => anularFactura(tx, { tallerId: T, facturaId: (r as any).facturaId, motivo: 'otra vez', ahora: AHORA }, deps))).ok, false)
})

test('con cobros no se anula: se rectifica', async () => {
  const m = montar()
  const r = await emitir(m, ot(m).id, { cobros: [{ medioCodigo: 'tarjeta', importeCent: 1_000 }] })
  const an = await m.conTaller(T, (tx: any) => anularFactura(tx, { tallerId: T, facturaId: (r as any).facturaId, motivo: 'Error grave', ahora: AHORA }, deps))
  assert.equal(an.ok, false)
})

test('rectificativa por abono total: serie R, R1 por diferencias, importes negativos y referencia a la original', async () => {
  const m = montar()
  const r = await emitir(m, ot(m).id)
  const rect = await m.conTaller(T, (tx: any) => rectificarFactura(tx, { tallerId: T, facturaId: (r as any).facturaId, usuarioId: null, ahora: AHORA, motivo: 'Trabajo no realizado', modo: 'abono_total' }, deps))
  assert.equal(rect.ok, true, JSON.stringify(rect))
  const f = m.bd.filas('factura').find((x) => x.tipo === 'R1')
  assert.equal(f.numSerie, 'R2026-000001')
  assert.equal(f.totalCent, -11_900)
  assert.equal(f.tipoRectificativa, 'I')
  assert.equal(f.rectificadaId, (r as any).facturaId)
  assert.match(f.xml, /<sum1:TipoRectificativa>I<\/sum1:TipoRectificativa>/)
  assert.match(f.xml, /<sum1:IDFacturaRectificada>.*F2026-000001/)
  assert.equal(f.huellaAnterior, m.bd.filas('factura').find((x) => x.tipo === 'F1').huella)
})

test('aislamiento por taller: el otro taller no ve la factura ni factura la OT ajena, y su cadena empieza en 1', async () => {
  const m = montar()
  const o = ot(m)
  await emitir(m, o.id)
  const ajena = await emitir(m, o.id, {}, T2)
  assert.equal(ajena.ok, false)
  assert.equal(await m.conTaller(T2, (tx: any) => tx.factura.findMany({})).then((x) => (x as any[]).length), 0)
  const r2 = await emitir(m, ot(m, { taller: T2 }).id, {}, T2)
  assert.equal(r2.ok, true)
  const reg2 = m.bd.filas('registroVerifactu').find((x) => x.tallerId === T2)
  assert.deepEqual([reg2.secuencia, reg2.huellaAnterior], [1, null], 'cadena propia del otro obligado')
  assert.equal(m.bd.filas('factura').find((x) => x.tallerId === T2).numSerie, 'F2026-000001')
})

test('sin sistema informático configurado la emisión FALLA con un error claro (y la configuración del repo no inventa el NIF)', async () => {
  const m = montar()
  const r = await m.conTaller(T, (tx: any) => emitirFactura(tx, { tallerId: T, otId: ot(m).id, usuarioId: null, ahora: AHORA }))
  assert.equal(r.ok, false)
  assert.match((r as any).motivo, /falta configurar el sistema informático/)
  assert.equal(CONFIG_SIF.productorNif, null, 'el NIF del productor no se inventa: lo decide Alberto')
  assert.equal(m.bd.filas('factura').length, 0)
})

test('sin NIF del taller no se factura', async () => {
  const m = montar()
  const o = ot(m)
  const r = await m.conTaller(T, async (tx: any) => {
    await tx.taller.update({ where: { id: T }, data: { nif: null } })
    return emitirFactura(tx, { tallerId: T, otId: o.id, usuarioId: null, ahora: AHORA }, deps)
  })
  assert.equal(r.ok, false)
  assert.match((r as any).motivo, /NIF del taller/)
})

test('envío: transporte desactivado = no_enviado (nada cambia); incierto ≠ rechazado', async () => {
  const m = montar()
  await emitir(m, ot(m).id)
  const [reg] = m.bd.filas('registroVerifactu')
  const respuesta = await transporteDesactivado().enviar({ xml: reg.xml, nifObligado: '12345678Z', entorno: 'pruebas' })
  const e = await m.conTaller(T, (tx: any) => aplicarRespuestaEnvio(tx, { tallerId: T, registroId: reg.id, respuesta }))
  assert.equal(e, 'no_enviado')
  assert.equal(m.bd.filas('factura')[0].estadoEnvio, 'no_enviado')
  assert.equal(estadoEnvioDe({ estado: 'incierto', motivo: 'timeout' }), 'incierto')
  assert.equal(estadoEnvioDe({ estado: 'rechazado', respuestaXml: '', errores: [] }), 'rechazado')
  await m.conTaller(T, (tx: any) => aplicarRespuestaEnvio(tx, { tallerId: T, registroId: reg.id, respuesta: { estado: 'aceptado', csv: 'X', respuestaXml: '' } }))
  assert.equal(m.bd.filas('factura')[0].estadoEnvio, 'enviado')
})

test('hechos contables: la venta y el cobro dan asientos cuadrados; un abono negativo aún no es representable', async () => {
  const m = montar()
  await emitir(m, ot(m, { bases: [10_000, 3_333] }).id)
  const [f] = m.bd.filas('factura')
  const v = hechoVenta({ numSerie: f.numSerie, fechaExpedicion: '2026-11-04', tipo: f.tipo, desglose: f.desgloseIva, clienteNombre: f.clienteNombre })
  assert.ok(v.ok)
  const asiento = asientoDesdeHecho(v.hecho)
  const debe = asiento.apuntes.reduce((s, a) => s + a.debe, 0)
  assert.equal(debe, f.totalCent, 'el asiento de la venta suma el total de la factura')
  const c = hechoCobro({ id: 'c1', fecha: '2026-11-04', importeCent: f.totalCent, medioCodigo: 'tarjeta', numSerie: f.numSerie })
  assert.ok(c.ok)
  assert.equal(asientoDesdeHecho(c.hecho).apuntes.reduce((s, a) => s + a.haber, 0), f.totalCent)
  assert.equal(hechoVenta({ numSerie: 'R', fechaExpedicion: '2026-11-04', tipo: 'R1', desglose: [{ ivaPuntosBasicos: PB, baseCent: -1, cuotaCent: 0 }], clienteNombre: null }).ok, false)
})

test('código: una factura solo se actualiza en columnas de estado (espejo del GRANT por columna de 0009)', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'lib', 'facturas.ts'), 'utf8')
  const updates = [...src.matchAll(/tx\.factura\.update\(\{[^}]*\}, data: \{([^}]*)\}/g)].map((x) => x[1])
  assert.ok(updates.length >= 2, `hay qué vigilar (${updates.length})`)
  const permitidas = new Set(['estado', 'anuladaEn', 'motivoAnulacion', 'estadoEnvio'])
  for (const u of updates) {
    for (const k of [...u.matchAll(/(\w+):/g)].map((x) => x[1])) assert.ok(permitidas.has(k), `factura.update toca «${k}»`)
  }
  assert.doesNotMatch(src, /factura(Linea)?\.(delete|deleteMany|upsert)|registroVerifactu\.(delete|deleteMany)|cobro\.(update|delete)/)
})
