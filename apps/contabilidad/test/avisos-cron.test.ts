// Cron diario de avisos: 401 sin Bearer (y con Bearer malo / sin la variable), una empresa que falla no frena a las demás, avisos
// deduplicados por clave (dos pasadas = una sola vez), «hoy» inyectado y NINGÚN canal externo.
// Cepos vistos fallar el 05/11/2026: (1) en `crearManejadorCronAvisos` quitar la comprobación `deps.autorizado` → rojo en los 401;
// (2) en `generarAvisosEmpresa` quitar `await repo.insertarAviso` de la condición (enviar siempre) → rojo en deduplicación. Restaurados → verde.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Aviso, type CanalAviso, type HechoContable } from '@central/module-contabilidad'
import { crearManejadorCronAvisos, cronAutorizado, generarAvisosEmpresa } from '../lib/avisos.ts'
import { recibirHecho } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const SECRETO = 'cron-secreto-de-prueba'

beforeEach(() => { process.env.CRON_SECRET = SECRETO })
afterEach(() => { delete process.env.CRON_SECRET })

const peticion = (cab: Record<string, string> = {}) => new Request('https://c.test/api/cron/avisos', { headers: cab })

test('cron: 401 sin Bearer, con Bearer malo, sin esquema Bearer y SIN la variable CRON_SECRET (fail-closed); 200 con el Bearer bueno', async () => {
  let llamadas = 0
  const GET = crearManejadorCronAvisos({ autorizado: cronAutorizado, empresas: async () => { llamadas += 1; return [] }, procesar: async () => ({ evaluados: 0, nuevos: 0 }) })
  const malos: Record<string, string>[] = [{}, { authorization: 'Bearer otro' }, { authorization: SECRETO }, { authorization: 'Basic abc' }, { authorization: `Bearer ${SECRETO}x` }]
  for (const cab of malos) {
    assert.equal((await GET(peticion(cab))).status, 401, JSON.stringify(cab))
  }
  assert.equal(llamadas, 0, 'sin autorización no se toca ninguna empresa')
  delete process.env.CRON_SECRET
  assert.equal((await GET(peticion({ authorization: 'Bearer undefined' }))).status, 401)
  assert.equal((await GET(peticion({ authorization: 'Bearer ' }))).status, 401)
  process.env.CRON_SECRET = SECRETO
  assert.equal((await GET(peticion({ authorization: `Bearer ${SECRETO}` }))).status, 200)
})

test('cron: una empresa que falla no frena a las demás; si no se pueden listar → 500 sin tocar nada', async () => {
  const vistas: string[] = []
  const GET = crearManejadorCronAvisos({
    autorizado: () => true, empresas: async () => [A, B],
    procesar: async (id) => { vistas.push(id); if (id === A) throw new Error('boom'); return { evaluados: 2, nuevos: 2 } },
  })
  const r = await GET(peticion())
  assert.deepEqual(vistas, [A, B])
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { empresas: 2, nuevos: 2, fallidas: 1 })
  const roto = crearManejadorCronAvisos({ autorizado: () => true, empresas: async () => { throw new Error('no existe la función') }, procesar: async () => ({ evaluados: 0, nuevos: 0 }) })
  assert.equal((await roto(peticion())).status, 500)
})

test('la ruta usa CRON_SECRET vía bearerValido (tiempo constante), nunca `Bearer ${process.env.CRON_SECRET}` a pelo', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app', 'api', 'cron', 'avisos', 'route.ts'), 'utf8')
  const lib = readFileSync(join(import.meta.dirname, '..', 'lib', 'avisos.ts'), 'utf8')
  assert.doesNotMatch(ruta + lib, /Bearer \$\{\s*process\.env\.CRON_SECRET\s*\}/)
  assert.match(lib, /bearerValido\(req\.headers\.get\('authorization'\), ENV_CRON\)/)
  const vercel = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'vercel.json'), 'utf8'))
  assert.deepEqual(vercel.crons.map((c: { path: string }) => c.path), ['/api/cron/avisos'])
  assert.match(vercel.ignoreCommand, /vercel-ignore-build\.mjs apps\/contabilidad --sin-previews/)
  assert.match(readFileSync(join(import.meta.dirname, '..', 'middleware.ts'), 'utf8'), /'\/api\/cron\/'/)
})

test('avisos de una empresa: calendario fiscal con hoy inyectado, deduplicado entre pasadas; el canal solo ve los NUEVOS', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const enviados: Aviso[] = []
  const canal: CanalAviso = { async enviar(_d, a) { enviados.push(a) } }
  const hoy = new Date(Date.UTC(2027, 3, 12)) // 8 días antes del 20/04/2027
  const r1 = await generarAvisosEmpresa(al.repo(A), hoy, canal)
  assert.ok(r1.nuevos >= 1)
  assert.ok(al.datos(A).avisos.some((a) => a.clave === 'fiscal:2027-abr-q1:10'))
  const r2 = await generarAvisosEmpresa(al.repo(A), hoy, canal)
  assert.equal(r2.nuevos, 0, 'misma clave = no se repite')
  assert.equal(enviados.length, r1.nuevos)
  // Cinco días antes: umbral nuevo = aviso nuevo.
  const r3 = await generarAvisosEmpresa(al.repo(A), new Date(Date.UTC(2027, 3, 15)), canal)
  assert.ok(al.datos(A).avisos.some((a) => a.clave === 'fiscal:2027-abr-q1:5'))
  assert.ok(r3.nuevos >= 1)
  // Otra empresa no ve estos avisos.
  assert.equal(al.datos(B).avisos.length, 0)
})

test('avisos de una empresa: hechos rechazados y cobro en efectivo ≥ 1.000 € salen de los hechos recibidos; sin datos no inventa caída ni tesorería', async () => {
  const al = crearAlmacen(); al.empresaLista(A).origenes.add('taller')
  const hoy = new Date(Date.UTC(2026, 5, 10))
  const malo = { tipo: 'nomina', fecha: '2026-06-01', ref: 'N-1', bruto: 1000, ssEmpresa: 0, irpf: 0, ssTrabajador: 0, liquido: 999 } as HechoContable
  assert.equal((await recibirHecho(al.repo(A), 'taller', malo)).resultado, 'rechazado')
  const efectivo = { tipo: 'cobro', fecha: '2026-06-05', ref: 'K-9', importe: 150000, medio: 'efectivo' } as HechoContable
  assert.equal((await recibirHecho(al.repo(A), 'taller', efectivo)).resultado, 'asentado')
  await generarAvisosEmpresa(al.repo(A), hoy)
  const claves = al.datos(A).avisos.map((a) => a.clave)
  assert.ok(claves.includes('hechos:rechazados:1'))
  assert.ok(claves.includes('efectivo:K-9'))
  assert.equal(claves.some((k) => k.startsWith('ventas:') || k.startsWith('margen:')), false)
})
