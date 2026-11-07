// Puerto `POST /api/hechos`: autenticación por vertical (Bearer propio, requireSecret, fail-closed), forma del hecho,
// autorización por empresa y códigos HTTP de la idempotencia. Con el manejador real y el repositorio en memoria.
// Cepo visto fallar el 05/11/2026: quitar `!autorizado(req, app)` en lib/puerto-hechos.ts → rojo en los 401; restaurado → verde.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { crearManejadorHechos } from '../lib/puerto-hechos.ts'
import { recibirHecho } from '../lib/servicio.ts'
import { parsearEntradaHecho } from '../lib/hecho-entrada.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const SECRETO = 'secreto-taller-de-prueba'
const OTRO = 'secreto-ialimp-de-prueba'
const venta = { tipo: 'venta', fecha: '2026-03-10', ref: 'F-1', desglose: [{ base: 10000, tipoIva: 21 }] }

let al: ReturnType<typeof crearAlmacen>
let POST: (r: Request) => Promise<Response>
beforeEach(() => {
  process.env.CONTABILIDAD_HECHOS_SECRET_TALLER = SECRETO
  process.env.CONTABILIDAD_HECHOS_SECRET_IALIMP = OTRO
  al = crearAlmacen()
  al.empresaLista(A).origenes.add('taller')
  al.empresaLista(B)
  POST = crearManejadorHechos({ conRepo: (id, fn) => fn(al.repo(id)), recibir: recibirHecho })
})
afterEach(() => { delete process.env.CONTABILIDAD_HECHOS_SECRET_TALLER; delete process.env.CONTABILIDAD_HECHOS_SECRET_IALIMP })

const peticion = (cuerpo: unknown, cab: Record<string, string>) =>
  new Request('https://c.test/api/hechos', { method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) })
const ok = (cuerpo: unknown = { empresaId: A, hecho: venta }) => peticion(cuerpo, { 'x-origen-app': 'taller', authorization: `Bearer ${SECRETO}` })

test('401 sin Bearer, con Bearer malo, con el secreto de OTRA vertical, sin cabecera de origen o con origen desconocido', async () => {
  const casos: Record<string, string>[] = [
    { 'x-origen-app': 'taller' },
    { 'x-origen-app': 'taller', authorization: 'Bearer nope' },
    { 'x-origen-app': 'taller', authorization: `Bearer ${OTRO}` },
    { 'x-origen-app': 'taller', authorization: SECRETO },
    { authorization: `Bearer ${SECRETO}` },
    { 'x-origen-app': 'inventada', authorization: `Bearer ${SECRETO}` },
  ]
  for (const cab of casos) {
    const r = await POST(peticion({ empresaId: A, hecho: venta }, cab))
    assert.equal(r.status, 401, JSON.stringify(cab))
  }
  assert.equal(al.datos(A).hechos.length, 0)
})

test('401 si la variable del secreto NO está configurada (fail-closed, ni siquiera con «Bearer » vacío)', async () => {
  delete process.env.CONTABILIDAD_HECHOS_SECRET_TALLER
  assert.equal((await POST(ok())).status, 401)
  assert.equal((await POST(peticion({ empresaId: A, hecho: venta }, { 'x-origen-app': 'taller', authorization: 'Bearer ' }))).status, 401)
})

test('201 asentado → 200 duplicado (mismo hecho) → 409 (misma clave, otro contenido)', async () => {
  const r1 = await POST(ok())
  assert.equal(r1.status, 201)
  const r2 = await POST(ok())
  assert.equal(r2.status, 200)
  assert.equal((await r2.json()).duplicado, true)
  const r3 = await POST(ok({ empresaId: A, hecho: { ...venta, desglose: [{ base: 1, tipoIva: 21 }] } }))
  assert.equal(r3.status, 409)
  assert.equal(al.datos(A).asientos.length, 1)
})

test('403 si la empresa no autoriza a esa vertical, y lo MISMO si la empresa no existe (sin oráculo)', async () => {
  const r1 = await POST(ok({ empresaId: B, hecho: venta }))
  const r2 = await POST(ok({ empresaId: '00000000-0000-4000-8000-0000000000ee', hecho: venta }))
  assert.equal(r1.status, 403)
  assert.equal(r2.status, 403)
  assert.deepEqual(await r1.json(), await r2.json())
  assert.equal(al.datos(B).hechos.length, 0)
})

test('400: el puerto NO admite cuentas contables de la vertical (ni en el hecho ni en una línea)', async () => {
  for (const hecho of [
    { ...venta, cuentaTercero: '430000001' },
    { ...venta, desglose: [{ base: 100, tipoIva: 21, cuentaContrapartida: '700' }] },
    { tipo: 'cobro', fecha: '2026-03-10', ref: 'C-1', importe: 100, cuentaTesoreria: '570' },
  ]) {
    const r = await POST(ok({ empresaId: A, hecho }))
    assert.equal(r.status, 400)
    assert.match(JSON.stringify(await r.json()), /no admite cuentas/)
  }
})

test('400: importes no enteros, fecha imposible, campos desconocidos o empresa no uuid', () => {
  const malos = [
    { empresaId: A, hecho: { ...venta, desglose: [{ base: 100.5, tipoIva: 21 }] } },
    { empresaId: A, hecho: { ...venta, fecha: '2026-02-30' } },
    { empresaId: A, hecho: { ...venta, extra: 1 } },
    { empresaId: 'A', hecho: venta },
    { empresaId: A, hecho: { tipo: 'cobro', fecha: '2026-03-10', ref: 'C', importe: 0 } },
    { empresaId: A, hecho: venta, sobra: true },
  ]
  for (const m of malos) assert.equal(parsearEntradaHecho(m).ok, false, JSON.stringify(m))
  assert.equal(parsearEntradaHecho({ empresaId: A, hecho: venta }).ok, true)
})

test('202 pendiente_de_regla (sin ejercicio) y 422 rechazado (nómina que no cuadra)', async () => {
  const r1 = await POST(ok({ empresaId: A, hecho: { ...venta, fecha: '2027-01-02', ref: 'F-27' } }))
  assert.equal(r1.status, 202)
  al.datos(A).origenes.add('rrhh')
  process.env.CONTABILIDAD_HECHOS_SECRET_RRHH = 'secreto-rrhh'
  const r2 = await POST(peticion(
    { empresaId: A, hecho: { tipo: 'nomina', fecha: '2026-03-31', ref: 'N', bruto: 100, ssEmpresa: 0, irpf: 0, ssTrabajador: 0, liquido: 1 } },
    { 'x-origen-app': 'rrhh', authorization: 'Bearer secreto-rrhh' },
  ))
  delete process.env.CONTABILIDAD_HECHOS_SECRET_RRHH
  assert.equal(r2.status, 422)
})

test('nómina con perceptor (NIF, nombre, provincia) y clave A: el puerto la acepta y los conserva en el hecho; sin ellos también', () => {
  const nomina = { tipo: 'nomina', fecha: '2026-01-31', ref: 'nomina:1', bruto: 100000, ssEmpresa: 30000, irpf: 0, ssTrabajador: 6350, liquido: 93650 }
  const sin = parsearEntradaHecho({ empresaId: A, hecho: nomina })
  assert.ok(sin.ok)
  assert.equal('perceptor' in sin.valor.hecho, false)
  const con = parsearEntradaHecho({ empresaId: A, hecho: { ...nomina, perceptor: { nif: '12345678-z', nombre: ' Ana ', provincia: '41' }, clave: 'A' } })
  assert.ok(con.ok, JSON.stringify(con))
  assert.deepEqual((con.valor.hecho as unknown as Record<string, unknown>).perceptor, { nif: '12345678Z', nombre: 'Ana', provincia: '41' })
  assert.equal((con.valor.hecho as unknown as Record<string, unknown>).clave, 'A')
  const soloNombre = parsearEntradaHecho({ empresaId: A, hecho: { ...nomina, perceptor: { nombre: 'Sin DNI' } } })
  assert.ok(soloNombre.ok, 'sin NIF se admite: el 190 lo lista como incompleto')
  const malos = [
    { ...nomina, perceptor: 'Ana' },
    { ...nomina, perceptor: { nif: '1', nombre: 'Ana' } },
    { ...nomina, perceptor: { nif: '12345678Z' } },
    { ...nomina, perceptor: { nif: '12345678Z', nombre: 'Ana', provincia: 'Sevilla' } },
    { ...nomina, perceptor: { nif: '12345678Z', nombre: 'Ana', iban: 'ES00' } },
    { ...nomina, clave: 'Z' },
    { tipo: 'venta', fecha: '2026-03-10', ref: 'F-9', desglose: [{ base: 1, tipoIva: 21 }], perceptor: { nif: '12345678Z', nombre: 'Ana' } },
  ]
  for (const h of malos) assert.equal(parsearEntradaHecho({ empresaId: A, hecho: h }).ok, false, JSON.stringify(h))
})
