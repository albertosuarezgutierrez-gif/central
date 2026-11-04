import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENDPOINTS_CATALOGO_GRATIS,
  agruparPorCompania,
  esEndpointGratis,
  esPatronDePago,
  filasDeInstantanea,
  llamadasDeProductos,
  resumenInstantanea,
  vendorDeProducto,
  type ResultadoLlamada,
} from './catalogo-companias.ts'
import { recorrerCatalogo, EndpointNoPermitido } from './catalogo-instantanea.ts'

const APP = join(import.meta.dirname, '../..')
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')

// ─── Lista cerrada: solo GET gratis ───────────────────────────────────────────

test('🚫 la lista de endpoints es CERRADA, solo GET, y nada de ella factura (POST /insurances, /vehicles, recommend-limits…)', () => {
  for (const e of ENDPOINTS_CATALOGO_GRATIS) {
    assert.equal(e.metodo, 'GET', `${e.plantilla}: solo GET`)
    assert.ok(!esPatronDePago(e.metodo, e.plantilla), `${e.plantilla} casa un patrón de PAGO`)
    assert.ok(!/^\/insurances\b/i.test(e.plantilla), `${e.plantilla}: /insurances factura`)
    assert.ok(!/^\/vehicles\b/i.test(e.plantilla), `${e.plantilla}: /vehicles exige créditos`)
    assert.ok(!/recommend-limits|product-form|quoteId|registrationPlate/i.test(e.plantilla), `${e.plantilla}: de pago`)
  }
  assert.deepEqual(
    ENDPOINTS_CATALOGO_GRATIS.map((e) => `${e.metodo} ${e.plantilla}`).sort(),
    [
      'GET /car/insurance-companies',
      'GET /insurance-companies',
      'GET /insurance-lines',
      'GET /insurance-lines/{ramo}/products',
      'GET /insurance-vendors',
      'GET /motorcycle/insurance-companies',
      'GET /payment-frequencies',
      'GET /payment-methods',
    ],
    'un endpoint nuevo en la lista exige revisar su coste en la spec y actualizar este test',
  )
  assert.ok(Object.isFrozen(ENDPOINTS_CATALOGO_GRATIS))
})

test('esEndpointGratis: lo de la lista pasa; lo de pago, otro método o un ramo con texto raro NO', () => {
  assert.ok(esEndpointGratis('GET', '/insurance-lines'))
  assert.ok(esEndpointGratis('GET', '/insurance-lines/Car/products'))
  assert.ok(esEndpointGratis('GET', '/insurance-vendors'))
  for (const [m, p] of [
    ['POST', '/insurances'],
    ['GET', '/insurances'],
    ['POST', '/insurances/abc/offers'],
    ['GET', '/vehicles?registrationPlate=1234ABC'],
    ['POST', '/home/recommend-limits'],
    ['POST', '/product-form-requests'],
    ['GET', '/payment-methods?quoteId=9'],
    ['POST', '/insurance-lines'],
    ['GET', '/insurance-lines/../insurances/products'],
    ['GET', '/insurance-lines/Car/products?x=1'],
    ['GET', '/insurance-lines//products'],
  ] as const) {
    assert.equal(esEndpointGratis(m, p), false, `${m} ${p} no puede pasar`)
  }
})

test('tope: las llamadas de productos no pasan de 60 en total y se marca truncado', () => {
  const ramos = Array.from({ length: 70 }, (_, i) => `R${i}`)
  const r = llamadasDeProductos(ramos, 7)
  assert.equal(r.llamadas.length, 53)
  assert.equal(r.truncado, true)
  assert.equal(llamadasDeProductos(['Car', 'bad/x'], 7).llamadas.length, 1, 'un id de ramo raro no compone URL')
})

// ─── Recorrido con red falsa ──────────────────────────────────────────────────

const RESPUESTAS: Record<string, unknown> = {
  '/insurance-lines': [
    { id: 'Car', path: 'car', name: 'Autos', active: true, supports: { rating: true, policyApplication: true, policyApplicationsReport: true } },
    { id: 'Home', path: 'home', name: 'Hogar', active: true, supports: { rating: true, policyApplication: false, policyApplicationsReport: false } },
  ],
  '/insurance-vendors': [
    { id: 1, name: 'Allianz', description: 'Allianz Seguros' },
    { id: 2, name: 'Allianz Direct', description: 'Allianz Direct' },
    { id: 3, name: 'Mapfre', description: 'Mapfre España' },
  ],
  '/insurance-companies': [{ code: 'C0072', name: 'Allianz' }],
  '/car/insurance-companies': [{ code: 'C0058', name: 'Mapfre' }],
  '/motorcycle/insurance-companies': [{ code: 'C0058', name: 'Mapfre' }],
  '/payment-frequencies': [{ id: 'Annual', name: 'Anual', description: 'Anual', installments: 1 }],
  '/payment-methods': [{ id: 'DirectDebit', name: 'Domiciliación', description: '', default: true }],
  '/insurance-lines/Car/products': [
    { id: 10, name: 'Allianz Auto', imageUrl: 'https://x/logo.svg', configs: [{ id: 100, name: 'Estándar', favorite: true }], supports: { policyApplication: true } },
    { id: 11, name: 'Allianz Direct Coche', configs: [{ id: 110, name: 'Online', favorite: false, brokerFee: { defaultFee: { type: 'Fixed', value: 0 } } }] },
    { id: 12, name: 'Producto Misterioso', configs: [] },
  ],
}

test('recorrido: solo llama a paths de la lista, con pausa entre llamadas, y mapea a filas', async () => {
  const llamados: string[] = []
  const pausas: number[] = []
  const r = await recorrerCatalogo(
    async (p) => {
      llamados.push(p)
      if (p === '/insurance-lines/Home/products') throw Object.assign(new Error('respuesta 500'), { status: 500 })
      return RESPUESTAS[p]
    },
    { dormir: async (ms) => void pausas.push(ms) },
  )
  assert.ok(llamados.every((p) => esEndpointGratis('GET', p)))
  assert.equal(llamados.length, 9)
  assert.equal(pausas.length, 8, 'pausa entre cada par de llamadas')
  const prods = r.filas.filter((f) => f.tipo === 'producto')
  assert.equal(prods.length, 3)
  const az = prods.find((f) => f.producto_id === '10')!
  assert.equal(az.vendor_id, '1')
  assert.equal(az.broker_fee, null, 'sin brokerFee en la respuesta → NULL (no se sabe), nunca []')
  assert.equal(az.extra.emisionOnline, true)
  const azd = prods.find((f) => f.producto_id === '11')!
  assert.equal(azd.vendor_id, '2', '«Allianz Direct» gana a «Allianz» porque lo contiene')
  assert.deepEqual(azd.broker_fee, [{ configId: '110', defaultFee: { type: 'Fixed', value: 0 }, minFee: null, maxFee: null }])
  assert.equal(prods.find((f) => f.producto_id === '12')!.vendor_id, null, 'sin emparejar → NULL, no el primero')
  const errHome = r.filas.find((f) => f.tipo === 'llamada' && f.ramo === 'Home')!
  assert.equal(errHome.extra.estado, 'error')
  assert.equal(errHome.extra.http, 500)

  const res = resumenInstantanea(r.filas)
  assert.deepEqual(res.porRamo, { Car: { productos: 3, companias: 2, sinCompania: 1 } })
  assert.equal(res.errores, 1)
  assert.equal(res.vendors, 3)
  assert.equal(JSON.stringify(res).includes('Allianz'), false, 'el resumen no lleva nombres, solo cifras por ramo')

  const g = agruparPorCompania(r.filas)
  assert.equal(g.companias.length, 3)
  assert.deepEqual(g.companias.find((c) => c.vendorId === '1')!.ramos, ['Car'])
  assert.equal(g.companias.find((c) => c.vendorId === '3')!.productos.length, 0, 'vendor sin productos sigue saliendo')
  assert.equal(g.productosSinCompania.length, 1)
  assert.equal(g.companiasDgs.length, 3)
})

test('recorrido: un id de ramo raro del vendor NO compone URL (no se llama)', async () => {
  const llamados: string[] = []
  await recorrerCatalogo(
    async (p) => {
      llamados.push(p)
      return p === '/insurance-lines' ? [{ id: '../insurances' }, { id: 'Car' }] : []
    },
    { pausaMs: 0 },
  )
  assert.ok(!llamados.some((p) => p.includes('insurances')))
  assert.ok(llamados.includes('/insurance-lines/Car/products'))
  assert.ok(new EndpointNoPermitido('/x') instanceof Error)
})

test('una llamada fallida NO es una lista vacía: queda su fila llamada con estado error', () => {
  const res: ResultadoLlamada[] = [{ llamada: { clave: 'vendors', path: '/insurance-vendors', ramo: null }, estado: 'error', mensaje: 'timeout', http: null }]
  const f = filasDeInstantanea(res, false)
  assert.equal(f.length, 1)
  assert.equal(f[0].extra.estado, 'error')
})

test('vendorDeProducto: un campo anidado manda; dos vendors sin relación → NULL', () => {
  const vs = [{ id: '1', nombre: 'Axa' }, { id: '2', nombre: 'Mapfre' }]
  assert.deepEqual(vendorDeProducto({ name: 'x', vendor: { id: 2 } }, vs), { vendor: { id: '2', nombre: 'Mapfre' }, por: 'campo' })
  assert.equal(vendorDeProducto({ name: 'Axa Mapfre combo' }, vs).vendor, null)
  assert.equal(vendorDeProducto({ name: 'Maxa hogar' }, vs).vendor, null, 'por palabra, no por subcadena')
})

// ─── Cableado (rutas, SQL, workflow) leído del fuente ─────────────────────────

test('ruta instantánea: operador, fail-closed sin tabla ANTES de llamar, ignora el interruptor (gratis), sin libro de consumo', () => {
  const src = leer('app/api/operador/codeoscopic/catalogo/instantanea/route.ts')
  assert.match(src, /operadorAutorizado\(req\)/)
  assert.ok(src.indexOf('sin_migracion') < src.indexOf('recorrerCatalogo('), 'la tabla se mira antes de llamar al vendor')
  assert.match(src, /ignorarInterruptor: true/)
  assert.match(src, /metodo: 'GET'/)
  assert.ok(!/metodo: 'POST'|reservar|cotizar|consumo/i.test(src.replace(/\/\*\*[\s\S]*?\*\//, '')), 'nada de POST ni libro de consumo')
})

test('recorrido: la barrera esEndpointGratis va ANTES de llamar al vendor (y aborta, no salta)', () => {
  const src = leer('lib/codeoscopic/catalogo-instantanea.ts')
  const g = src.indexOf("if (!esEndpointGratis('GET', ll.path)) throw new EndpointNoPermitido(ll.path)")
  assert.ok(g > 0, 'falta la barrera')
  assert.ok(g < src.indexOf('await llamar(ll.path)'))
})

test('SQL 2026-11-04f: transaccional, RLS sin policies, app SELECT/INSERT, correduria_id, rollback documentado', () => {
  const sql = leer('prisma/sql/2026-11-04f_codeoscopic_catalogo.sql')
  assert.match(sql, /^BEGIN;$/m)
  assert.match(sql, /^COMMIT;$/m)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.codeoscopic_catalogo \(/)
  assert.match(sql, /correduria_id\s+uuid NOT NULL REFERENCES seguros\.corredurias\(id\)/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.ok(!/CREATE POLICY/i.test(sql))
  assert.match(sql, /GRANT SELECT, INSERT ON seguros\.codeoscopic_catalogo TO prisma_seguros;/)
  assert.ok(!/GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*codeoscopic_catalogo/i.test(sql))
  assert.match(sql, /REVOKE ALL ON seguros\.codeoscopic_catalogo FROM PUBLIC, anon, authenticated, crm_seguros;/)
  assert.match(sql, /NO APLICADA/)
  assert.match(sql, /-- ─── ROLLBACK[\s\S]*DROP TABLE IF EXISTS seguros\.codeoscopic_catalogo;/)
})

test('workflow: accion=catalogo_avant2 llama a /codeoscopic/catalogo/instantanea sin cuerpo y solo imprime el resumen', () => {
  const wf = leer('../../.github/workflows/tarificador-relanzar.yml')
  assert.match(wf, /options: \[[^\]]*\bcatalogo_avant2\b[^\]]*\]/)
  assert.match(wf, /prefijo="codeoscopic\/catalogo"\n\s+ruta="instantanea"\n\s+cuerpo='\{\}'/)
  assert.match(wf, /url="\$\{ASEGURA_URL%\/\}\/api\/operador\/\$\{prefijo\}\/\$\{ruta\}"/)
  assert.match(wf, /IN\([^)]*"resumen"[^)]*\)/, 'el resumen tiene que pasar el filtro de salida')
  assert.match(wf, /--config -/)
})
