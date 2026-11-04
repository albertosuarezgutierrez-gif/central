/* eslint-disable @typescript-eslint/no-explicit-any */
// Ruta cron /api/cron/purgar-fotos: autenticación por Bearer CRON_SECRET y que no borre nada que no toque.
// Cepo visto fallar el 04/11/2026: en lib/cron-purga.ts cambiar `!secretoCoincide(...)` por `false` → rojo en los 401.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { manejarCronPurga } from '../lib/cron-purga.ts'
import { T, T2 } from './_escenario.ts'
import { almacenFalso, montarPurga, sembrarOt } from './_purga.ts'

const SECRETO = 'cron-secreto-de-prueba-0123456789'
const peticion = (auth?: string) => new Request('http://localhost/api/cron/purgar-fotos', { headers: auth === undefined ? {} : { authorization: auth } })

function montarCron(secreto: string | null = SECRETO) {
  const m = montarPurga({ t: 120, t2: 365 })
  const toca = sembrarOt(m, T, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1, fotosDano: 1 })
  const noToca = [
    sembrarOt(m, T, { estado: 'entregado', entregadoHace: 60, fotosTrabajo: 1 }),
    sembrarOt(m, T, { estado: 'en_curso', entregadoHace: null, fotosTrabajo: 1 }),
    sembrarOt(m, T2, { estado: 'entregado', entregadoHace: 200, fotosTrabajo: 1 }), // su taller conserva 365 días
  ]
  const alm = almacenFalso()
  const deps = { secreto, talleres: async () => [T, T2], conTaller: m.conTaller as any, almacen: () => alm.almacen, ahora: () => new Date('2026-11-04T10:00:00Z') }
  return { m, toca, noToca, alm, deps }
}

test('sin cabecera Authorization: 401 y no se borra nada', async () => {
  const c = montarCron()
  const r = await manejarCronPurga(peticion(), c.deps)
  assert.equal(r.status, 401)
  assert.equal(c.alm.intentos.length, 0)
  assert.equal(c.m.bd.filas('otFoto').filter((f) => f.purgadaEn != null).length, 0)
})

test('secreto equivocado, de otro esquema o truncado: 401', async () => {
  for (const auth of ['Bearer otro', `Bearer ${SECRETO}x`, `Bearer ${SECRETO.slice(0, -1)}`, SECRETO, `Basic ${SECRETO}`, 'Bearer ', 'Bearer']) {
    const c = montarCron()
    assert.equal((await manejarCronPurga(peticion(auth), c.deps)).status, 401, auth)
    assert.equal(c.alm.intentos.length, 0, auth)
  }
})

test('CRON_SECRET sin configurar (null o vacío): nadie entra, ni siquiera con «Bearer »', async () => {
  for (const s of [null, '']) {
    const c = montarCron(s)
    for (const auth of ['Bearer ', 'Bearer undefined', 'Bearer null', `Bearer ${SECRETO}`]) {
      assert.equal((await manejarCronPurga(peticion(auth), c.deps)).status, 401, `${s}/${auth}`)
    }
    assert.equal(c.alm.intentos.length, 0)
  }
})

test('con el secreto correcto: 200, borra lo que toca y NADA más', async () => {
  const c = montarCron()
  const r = await manejarCronPurga(peticion(`Bearer ${SECRETO}`), c.deps)
  assert.equal(r.status, 200)
  const cuerpo = await r.json()
  assert.equal(cuerpo.borradas, 2)
  assert.equal(cuerpo.talleresConError, 0)
  assert.deepEqual([...c.alm.borrados].sort(), [...c.toca.rutasTrabajo, ...c.toca.rutasDano].sort())
  for (const o of c.noToca) for (const ruta of [...o.rutasTrabajo, ...o.rutasDano, o.firmaRecepcion]) assert.ok(!c.alm.intentos.includes(ruta), ruta)
  assert.ok(!c.alm.intentos.includes(c.toca.firmaRecepcion))
  assert.equal(JSON.stringify(cuerpo).includes(T), false, 'la respuesta no lleva ids de talleres')
})

test('almacén sin configurar tras autenticar: 500 y sin tocar la BD', async () => {
  const c = montarCron()
  const r = await manejarCronPurga(peticion(`Bearer ${SECRETO}`), { ...c.deps, almacen: () => { throw new Error('SUPABASE_URL no configurado') } })
  assert.equal(r.status, 500)
  assert.equal(c.m.bd.filas('otFoto').filter((f) => f.purgadaEn != null).length, 0)
})

// ── Cableado (código fuente): la ruta, el cron de Vercel y el middleware ──
const APP = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(APP, p), 'utf8')

test('la ruta exige requireSecret(CRON_SECRET), delega en el manejador y no compara con ===', () => {
  const ruta = leer('app/api/cron/purgar-fotos/route.ts')
  assert.match(ruta, /requireSecret\('CRON_SECRET'\)/)
  assert.match(ruta, /manejarCronPurga/)
  assert.doesNotMatch(ruta, /CRON_SECRET[^\n]*===|===[^\n]*CRON_SECRET/)
  const manejador = leer('lib/cron-purga.ts')
  assert.match(manejador, /secretoCoincide\(/)
  assert.doesNotMatch(manejador, /token\s*[!=]==|[!=]==\s*d\.secreto/)
})

test('vercel.json: cron diario de madrugada y el ignoreCommand intacto', () => {
  const v = JSON.parse(leer('vercel.json'))
  assert.equal(v.ignoreCommand, 'node ../../scripts/vercel-ignore-build.mjs apps/taller --sin-previews')
  const cron = (v.crons as Array<{ path: string; schedule: string }>).find((x) => x.path === '/api/cron/purgar-fotos')
  assert.ok(cron, 'falta el cron')
  const [min, hora, dia, mes, semana] = cron.schedule.split(' ')
  assert.ok(/^\d+$/.test(min) && /^\d+$/.test(hora) && Number(hora) >= 0 && Number(hora) <= 5, 'de madrugada, una vez al día')
  assert.deepEqual([dia, mes, semana], ['*', '*', '*'])
})

test('el middleware deja pasar /api/cron/ sin PIN (la ruta se autentica sola)', () => {
  assert.match(leer('middleware.ts'), /const PUBLIC = \[[^\]]*'\/api\/cron\/'/)
})
