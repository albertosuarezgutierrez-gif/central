// Cepos de la lectura del tarificador RPA para plataforma (06/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentoDePdf, errorPublico, indicePdfValido, proyectarTrabajo, proyectarUltimoRiesgo, riesgoPublico } from './tarificador-lectura-reglas.ts'

const APP = join(import.meta.dirname, '..')
const RUTA = 'app/api/operador/tarificador/trabajo/[id]/route.ts'
const RUTA_PDF = 'app/api/operador/tarificador/trabajo/[id]/pdf/[indice]/route.ts'
const leer = (r: string) => readFileSync(join(APP, r), 'utf8')

const respuesta = {
  canal: 'rpa',
  ofertas: [{
    compania: 'allianz', producto: 'Comunidades 2020', primaAnualEur: 1234.5, primaNetaEur: 1100,
    desglose: { anual: { primaNetaEur: 1000, impuestosEur: 234.5, primaTotalEur: 1234.5 }, sucesivos: {} },
    pdf: { indice: 0, nombre: 'oferta.pdf' }, documentoId: 'doc-1', avisos: ['x'], coberturas: [{}], referenciaPortal: 'P1',
  }],
}
const fila = { estado: 'ok', created_at: new Date('2026-10-06T10:00:00Z'), updated_at: '2026-10-06T10:02:00Z', error: null }

test('proyecta estado, fechas, prima total, desglose y pdfs; nada más', () => {
  const t = proyectarTrabajo(fila, respuesta)
  assert.equal(t.estado, 'ok')
  assert.equal(t.creadoEn, '2026-10-06T10:00:00.000Z')
  assert.deepEqual(t.ofertas, [{ compania: 'allianz', producto: 'Comunidades 2020', primaTotalAnual: 1234.5, primaNeta: 1000, impuestos: 234.5, primaTotalSucesivos: null, primaNetaSucesivos: null, impuestosSucesivos: null, pdfIndice: 0, fechaTerminoPortal: null }])
  assert.deepEqual(t.pdfs, [{ indice: 0, nombre: 'oferta.pdf' }])
  const s = JSON.stringify(t)
  for (const prohibido of ['documentoId', 'doc-1', 'referenciaPortal', 'coberturas', 'avisos']) assert.ok(!s.includes(prohibido), prohibido)
})

test('propaga la columna de sucesivos (prima anual de renovación) sin confundirla con el primer recibo', () => {
  const r = { ofertas: [{ compania: 'allianz', producto: 'C', primaAnualEur: 342.77, desglose: {
    anual: { primaNetaEur: 295.88, impuestosEur: 46.89, primaTotalEur: 342.77 },
    sucesivos: { primaNetaEur: 300, impuestosEur: 47.55, primaTotalEur: 347.55 } } }] }
  const [o] = proyectarTrabajo(fila, r).ofertas
  assert.equal(o.primaTotalAnual, 342.77)
  assert.deepEqual([o.primaTotalSucesivos, o.primaNetaSucesivos, o.impuestosSucesivos], [347.55, 300, 47.55])
})

test('propaga la fecha de término real del portal solo si es ISO (si no, null: no se supone)', () => {
  const base = respuesta.ofertas[0]
  const ok = proyectarTrabajo(fila, { ofertas: [{ ...base, fechaTerminoPortal: '2027-10-01' }] }).ofertas[0]
  assert.equal(ok.fechaTerminoPortal, '2027-10-01')
  const mal = proyectarTrabajo(fila, { ofertas: [{ ...base, fechaTerminoPortal: '01102027' }] }).ofertas[0]
  assert.equal(mal.fechaTerminoPortal, null)
})

test('un trabajo que no está ok no enseña ofertas; el error sale sin url ni ids de evidencia', () => {
  const t = proyectarTrabajo({ ...fila, estado: 'error', error: { tipo: 'requiere_humano', mensaje: 'captcha', url: 'https://portal/x', html_documento_id: 'h1' } }, respuesta)
  assert.deepEqual(t.ofertas, [])
  assert.deepEqual(t.error, { tipo: 'requiere_humano', mensaje: 'captcha' })
  assert.ok(!JSON.stringify(t).includes('portal') && !JSON.stringify(t).includes('h1'))
  assert.equal(errorPublico(null), null)
})

test('oferta sin prima numérica se descarta (no se inventa 0)', () => {
  const t = proyectarTrabajo(fila, { ofertas: [{ compania: 'a', producto: 'p', primaAnualEur: null }] })
  assert.deepEqual(t.ofertas, [])
})

test('documentoDePdf e indicePdfValido', () => {
  assert.equal(documentoDePdf(respuesta, 0), 'doc-1')
  assert.equal(documentoDePdf(respuesta, 1), null)
  assert.equal(documentoDePdf(null, 0), null)
  assert.equal(indicePdfValido('0'), 0)
  assert.equal(indicePdfValido('12'), 12)
  for (const x of ['', '-1', '01', '1.5', 'a', '100']) assert.equal(indicePdfValido(x), null, x)
})

test('las rutas: Bearer (401) antes de nada, uuid (400), 404, por correduría, sin depender del interruptor', () => {
  for (const r of [RUTA, RUTA_PDF]) {
    const src = leer(r)
    assert.ok(src.indexOf('operadorAutorizado(req)') < src.indexOf('await ctx.params'), `${r}: auth primero`)
    assert.match(src, /status: 401/)
    assert.match(src, /UUID\.test\(id\)/)
    assert.match(src, /status: 400/)
    assert.match(src, /status: 404/)
    assert.match(src, /correduriaUnica\(\)/)
    assert.ok(!src.includes('rpaActivo'), `${r}: la lectura no se bloquea con TARIFICADOR_RPA_ACTIVO`)
  }
  assert.match(leer(RUTA_PDF), /application\/pdf/)
  assert.match(leer(RUTA_PDF), /attachment/)
})

test('la lectura filtra por correduria_id y no toca html/captura', () => {
  const src = readFileSync(join(APP, 'lib/tarificador-lectura.ts'), 'utf8')
  assert.ok((src.match(/correduria_id = \$\{correduriaId\}/g) ?? []).length >= 2)
  assert.ok(!/evidencia_documento_id|html_documento_id/.test(src))
})

// ─── Último riesgo (pre-relleno del modal) ──────────────────────────────────

test('último riesgo: solo claves conocidas; nada de credenciales ni html', () => {
  const t = proyectarUltimoRiesgo({
    id: 'abc', created_at: new Date('2026-10-05T08:00:00Z'),
    riesgo: {
      ramo: 'comunidades', fechaEfecto: '2026-11-01', m2Construidos: 800, ascensor: true, piscina: null,
      password: 'x', html_documento_id: 'h1', error: { a: 1 },
      direccion: { via: 'Calle Sol', numero: '4', codigoPostal: '41003', token: 'zzz', municipio: ['x'] },
    },
  })
  assert.deepEqual(t.riesgo, { fechaEfecto: '2026-11-01', m2Construidos: 800, ascensor: true, direccion: { via: 'Calle Sol', numero: '4', codigoPostal: '41003' } })
  assert.equal(t.trabajoId, 'abc')
  assert.equal(t.creadoEn, '2026-10-05T08:00:00.000Z')
  const s = JSON.stringify(t)
  for (const x of ['password', 'html_documento_id', 'zzz', 'error']) assert.ok(!s.includes(x), x)
})

test('último riesgo: los capitales (edificación/contenido) pasan, como número', () => {
  const t = proyectarUltimoRiesgo({ id: 'a', created_at: new Date('2026-10-05T08:00:00Z'), riesgo: { capitalContinente: 1500000, capitalContenido: 20000, otro: 1 } })
  assert.deepEqual(t.riesgo, { capitalContinente: 1500000, capitalContenido: 20000 })
})

test('último riesgo: sin fila o riesgo no objeto → null (no se inventa)', () => {
  const vacio = { riesgo: null, trabajoId: null, creadoEn: null }
  assert.deepEqual(proyectarUltimoRiesgo(null), vacio)
  assert.deepEqual(proyectarUltimoRiesgo({ id: 'a', created_at: new Date(), riesgo: 'texto' }), vacio)
  assert.equal(riesgoPublico([1]), null)
  assert.equal(riesgoPublico({ otra: 1 }), null)
})

test('ruta último riesgo: Bearer primero, uuid 400, por correduría; SQL por cliente, más reciente, sin html/captura', () => {
  const src = leer('app/api/operador/tarificador/ultimo-riesgo/route.ts')
  assert.ok(src.indexOf('operadorAutorizado(req)') < src.indexOf('searchParams'), 'auth primero')
  assert.match(src, /status: 401/)
  assert.match(src, /UUID\.test\(clienteId\)/)
  assert.match(src, /status: 400/)
  assert.match(src, /correduriaUnica\(\)/)
  assert.ok(!src.includes('rpaActivo'))
  const lib = leer('lib/tarificador-lectura.ts')
  const sql = lib.slice(lib.indexOf('export async function leerUltimoRiesgo'), lib.indexOf('type FilaTrabajo'))
  assert.match(sql, /t\.correduria_id = \$\{correduriaId\}/)
  assert.match(sql, /t\.cliente_id = \$\{clienteId\}/)
  assert.match(sql, /order by t\.created_at desc\s+limit 1/)
  assert.ok(!/estado/.test(sql.replace(/^\s*\*.*$/gm, '')), 'cualquier estado: no se filtra por estado')
  assert.ok(!/evidencia_documento_id|html_documento_id|t\.error/.test(sql))
})
