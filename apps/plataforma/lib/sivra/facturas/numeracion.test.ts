import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { evaluarSerie, formatearNumero, planEmision, fechaMadrid, type SerieConfig } from './numeracion.ts'

const SERIE: SerieConfig = { id: 's1', prefijo: 'HS', anio: 2026, siguienteNumero: 1, tipoIva: 10, mencionIva: null, activa: true }

test('fail-closed: sin serie, sin número inicial o sin IVA NO se emite y el motivo dice «falta configurar IVA/serie»', () => {
  const casos: Array<[SerieConfig | null, string[]]> = [
    [null, ['serie']],
    [{ ...SERIE, activa: false }, ['serie']],
    [{ ...SERIE, anio: 2025 }, ['serie']],
    [{ ...SERIE, siguienteNumero: null }, ['numero']],
    [{ ...SERIE, tipoIva: null }, ['iva']],
    [{ ...SERIE, siguienteNumero: null, tipoIva: null }, ['numero', 'iva']],
    [{ ...SERIE, tipoIva: 0, mencionIva: null }, ['mencion']],
    [{ ...SERIE, tipoIva: 25 }, ['iva']],
  ]
  for (const [s, faltan] of casos) {
    const e = evaluarSerie(s, 2026)
    assert.equal(e.ok, false, JSON.stringify(s))
    if (!e.ok) { assert.deepEqual(e.faltan, faltan); assert.match(e.motivo, /falta configurar IVA\/serie/) }
    const p = planEmision({ estado: 'borrador', numeroCompleto: null, total: 100 }, e)
    assert.equal(p.accion, 'bloqueada')
  }
  assert.equal(evaluarSerie(SERIE, 2026).ok, true)
  assert.equal(evaluarSerie({ ...SERIE, tipoIva: 0, mencionIva: 'Operación exenta de IVA (art. 20.Uno.23º LIVA)' }, 2026).ok, true)
})

test('formato del número', () => {
  assert.equal(formatearNumero('HS', 2026, 1), 'HS-2026-0001')
  assert.equal(formatearNumero('HS', 2026, 12345), 'HS-2026-12345')
})

test('plan: asigna el siguiente, sube el contador y desglosa', () => {
  const p = planEmision({ estado: 'borrador', numeroCompleto: null, total: 110 }, evaluarSerie({ ...SERIE, siguienteNumero: 37 }, 2026))
  assert.equal(p.accion, 'emitir')
  if (p.accion === 'emitir') {
    assert.equal(p.numero, 37); assert.equal(p.siguiente, 38); assert.equal(p.numeroCompleto, 'HS-2026-0037')
    assert.deepEqual(p.importes, { total: 110, base: 100, cuota: 10, tipoIva: 10 })
  }
})

test('idempotencia: una factura que no es borrador NUNCA se vuelve a numerar (aunque la serie esté lista)', () => {
  for (const estado of ['emitida', 'enviada', 'rectificada']) {
    const p = planEmision({ estado, numeroCompleto: 'HS-2026-0004', total: 100 }, evaluarSerie(SERIE, 2026))
    assert.deepEqual(p, { accion: 'ya_emitida', numeroCompleto: 'HS-2026-0004', estado })
  }
})

// Simulación de la transacción de `emitir.ts` con un cerrojo (FOR UPDATE) sobre factura y serie: pulsaciones
// concurrentes de N facturas, cada una pulsada 1-3 veces. Resultado: números 1..N sin huecos ni duplicados.
test('numeración bajo concurrencia: sin huecos, sin duplicados, doble pulsación idempotente', async () => {
  let cola: Promise<void> = Promise.resolve()
  const conCerrojo = <T>(fn: () => Promise<T>): Promise<T> => { const r = cola.then(fn); cola = r.then(() => {}, () => {}); return r }
  const serie = { ...SERIE, siguienteNumero: 1 }
  const facturas = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, estado: 'borrador', numero: null as number | null, numeroCompleto: null as string | null, total: 10 + i }))
  const emitir = (id: string) => conCerrojo(async () => {
    const f = facturas.find((x) => x.id === id)!
    await new Promise((r) => setTimeout(r, Math.random() * 2))
    const p = planEmision(f, evaluarSerie(serie, 2026))
    if (p.accion !== 'emitir') return p.accion
    f.estado = 'emitida'; f.numero = p.numero; f.numeroCompleto = p.numeroCompleto
    assert.equal(serie.siguienteNumero, p.numero) // UPDATE … WHERE siguiente_numero = numero
    serie.siguienteNumero = p.siguiente
    return 'emitida'
  })
  const pulsaciones = facturas.flatMap((f, i) => Array.from({ length: 1 + (i % 3) }, () => f.id)).sort(() => Math.random() - 0.5)
  const res = await Promise.all(pulsaciones.map(emitir))
  assert.equal(res.filter((r) => r === 'emitida').length, facturas.length)
  assert.equal(res.filter((r) => r === 'ya_emitida').length, pulsaciones.length - facturas.length)
  const nums = facturas.map((f) => f.numero!).sort((a, b) => a - b)
  assert.deepEqual(nums, Array.from({ length: facturas.length }, (_, i) => i + 1))
  assert.equal(serie.siguienteNumero, facturas.length + 1)
})

// Cepos sobre el FUENTE: lo que tsc no ve (SQL crudo) y que sostiene la garantía real en la BD.
const EMITIR = readFileSync(new URL('./emitir.ts', import.meta.url), 'utf8')
const SQL = readFileSync(new URL('../../../prisma/sql/2026-10-27_sivra_facturas_huesped.sql', import.meta.url), 'utf8')

test('emitir.ts: bloquea factura y serie (FOR UPDATE), numera antes de subir el contador y lo sube condicionado', () => {
  assert.match(EMITIR, /FROM sivra_facturas_huesped WHERE id = \$\{facturaId\}::uuid FOR UPDATE/)
  assert.match(EMITIR, /FROM sivra_factura_series WHERE cuenta_id = [\s\S]*? AND activa FOR UPDATE/)
  const iFactura = EMITIR.indexOf("SET estado = 'emitida'")
  const iSerie = EMITIR.indexOf('UPDATE sivra_factura_series SET siguiente_numero')
  assert.ok(iFactura > 0 && iSerie > iFactura, 'la factura se numera ANTES de subir el contador (el trigger compara con siguiente_numero)')
  assert.match(EMITIR, /WHERE id = \$\{plan\.serieId\}::uuid AND siguiente_numero = \$\{plan\.numero\}/)
  assert.match(EMITIR, /WHERE id = \$\{facturaId\}::uuid AND estado = 'borrador'/)
  assert.match(EMITIR, /prisma\.\$transaction\(/)
})

test('SQL: único (serie, número), trigger de correlatividad e inmutabilidad, borrador sin número', () => {
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS sivra_facturas_huesped_numero ON public\.sivra_facturas_huesped \(serie_id, numero\)/)
  assert.match(SQL, /NEW\.numero <> maximo \+ 1/)
  assert.match(SQL, /NEW\.numero <> s\.siguiente_numero/)
  assert.match(SQL, /CREATE TRIGGER sivra_factura_inmutable BEFORE UPDATE OR DELETE/)
  assert.match(SQL, /estado <> 'borrador' OR \(numero IS NULL AND numero_completo IS NULL\)/)
  assert.match(SQL, /base \+ cuota = total/)
  assert.match(SQL, /REVOKE ALL ON public\.sivra_factura_series, public\.sivra_factura_solicitudes, public\.sivra_facturas_huesped FROM anon, authenticated/)
})

test('fecha de expedición en hora de Madrid (no UTC)', () => {
  assert.deepEqual(fechaMadrid(new Date('2026-12-31T23:30:00Z')), { anio: 2027, iso: '2027-01-01' })
  assert.deepEqual(fechaMadrid(new Date('2026-06-30T21:59:00Z')), { anio: 2026, iso: '2026-06-30' })
})
