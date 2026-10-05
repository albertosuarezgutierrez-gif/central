// Cepos del orquestador del tarificador RPA (05/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { configFly, leerResultadoWorker, peticionMaquina, rpaActivo } from './tarificador-reglas.ts'

const APP = join(import.meta.dirname, '..')
const JOB = '11111111-1111-4111-8111-111111111111'
const CFG = { token: 'fo1_tokendeprueba', app: 'asegura-tarificador', imagen: 'registry.fly.io/asegura-tarificador:x', apiUrl: 'https://api.grupoasegura.es' }

test('el interruptor es fail-closed: solo «1» exacto enciende', () => {
  assert.equal(rpaActivo({ TARIFICADOR_RPA_ACTIVO: '1' }), true)
  for (const v of [undefined, '', '0', 'true', 'si', ' 1', 'TRUE']) assert.equal(rpaActivo({ TARIFICADOR_RPA_ACTIVO: v }), false, String(v))
})

test('sin config de Fly no se lanza nada (y dice qué falta)', () => {
  const c = configFly({ FLY_API_TOKEN: 'x' })
  assert.equal(c.ok, false)
  assert.ok(!c.ok && c.faltan.includes('TARIFICADOR_FLY_IMAGE'))
})

test('la máquina es efímera, en cdg, 2 CPU compartidas / 2 GB, y SOLO recibe JOB_ID + URL', () => {
  const p = peticionMaquina(CFG, JOB)
  assert.equal(p.url, 'https://api.machines.dev/v1/apps/asegura-tarificador/machines')
  const b = JSON.parse(p.init.body)
  assert.equal(b.region, 'cdg')
  assert.equal(b.config.auto_destroy, true)
  assert.deepEqual(b.config.restart, { policy: 'no' })
  assert.deepEqual(b.config.guest, { cpu_kind: 'shared', cpus: 2, memory_mb: 2048 })
  assert.deepEqual(Object.keys(b.config.env).sort(), ['JOB_ID', 'TARIFICADOR_API_URL'])
  // Ni la cartera, ni el canal que gasta, ni el Bearer del worker, ni el token de Fly en la config.
  assert.ok(!/DATABASE_URL|CODEOSCOPIC|TARIFICADOR_WORKER_SECRET|CRED_|fo1_tokendeprueba/.test(JSON.stringify(b)))
})

test('resultado ok: valida ofertas y exige que el PDF sea un PDF', () => {
  const pdf = Buffer.from('%PDF-1.7 hola').toString('base64')
  const ok = leerResultadoWorker({
    trabajoId: JOB, resultado: 'ok', pdfs: [{ nombre: 'p.pdf', base64: pdf }],
    ofertas: [{ compania: 'Allianz', producto: 'Comunidades', primaAnualEur: 900, pdf: { indice: 0 } }],
  })
  assert.equal(ok.ok, true)
  const noPdf = leerResultadoWorker({
    trabajoId: JOB, resultado: 'ok', pdfs: [{ base64: Buffer.from('<html>').toString('base64') }],
    ofertas: [{ compania: 'Allianz', producto: 'C', primaAnualEur: 900 }],
  })
  assert.equal(noPdf.ok, false)
  assert.equal(leerResultadoWorker({ trabajoId: 'x', resultado: 'ok' }).ok, false)
})

test('resultado error: tipo conocido, captura PNG', () => {
  const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n...')]).toString('base64')
  const r = leerResultadoWorker({ trabajoId: JOB, resultado: 'error', error: { tipo: 'captcha', mensaje: 'reCAPTCHA en el login' }, capturaBase64: png })
  assert.equal(r.ok, true)
  assert.equal(leerResultadoWorker({ trabajoId: JOB, resultado: 'error', error: { tipo: 'raro', mensaje: 'x' } }).ok, false)
})

function rutas(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? rutas(p) : n === 'route.ts' ? [p] : []
  })
}

test('cada ruta de /api/tarificador exige el Bearer del WORKER y nunca abre con el de operador', () => {
  const lista = rutas(join(APP, 'app/api/tarificador'))
  assert.ok(lista.length >= 2, `se esperaban ≥2 rutas del worker y hay ${lista.length}`)
  for (const f of lista) {
    const src = readFileSync(f, 'utf8')
    assert.match(src, /workerAutorizado\(/, `${f} no llama a workerAutorizado()`)
    assert.ok(!/operadorAutorizado\(|ASEGURA_OPERADOR_SECRET/.test(src), `${f} no puede abrirse con el secreto de operador`)
  }
  const auth = readFileSync(join(APP, 'lib/tarificador-worker-auth.ts'), 'utf8')
  assert.match(auth, /requireSecret\('TARIFICADOR_WORKER_SECRET'\)/)
  assert.match(auth, /bearerAutorizado\(/)
})

test('el orquestador no toca Codeoscopic ni emite', () => {
  for (const f of ['lib/tarificador.ts', 'lib/tarificador-reglas.ts', ...rutas(join(APP, 'app/api/tarificador')).map((p) => p.slice(APP.length + 1)), 'app/api/operador/tarificador/encolar/route.ts']) {
    // Sin comentarios: documentar que NO se usa no es usarlo.
    const src = readFileSync(join(APP, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    assert.ok(!/from ['"][^'"]*codeoscopic/i.test(src), `${f} importa algo de codeoscopic`)
    assert.ok(!/CODEOSCOPIC_/.test(src), `${f} nombra una env de Codeoscopic`)
  }
})
