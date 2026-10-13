// Cepos del orquestador del tarificador RPA (05/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  bloqueaDuplicado, claveEncolar, configFly, huecosLibres, leaseVencido, leerResultadoWorker, peticionMaquina, repartirEnCurso, rpaActivo, validarEntradaRamo,
} from './tarificador-reglas.ts'

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

test('resultado ok: rechaza PDF sin base64', () => {
  const sinBase64 = leerResultadoWorker({
    trabajoId: JOB, resultado: 'ok', pdfs: [{ nombre: 'a.pdf' }],
    ofertas: [{ compania: 'Allianz', producto: 'C', primaAnualEur: 900 }],
  })
  assert.equal(sinBase64.ok, false)
  assert.ok(!sinBase64.ok && sinBase64.errores.some((e) => e.includes('pdfs[0].base64')), 'debe rechazar con error que contiene «pdfs[0].base64»')
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

// Moto (13/10/2026): asegura ya encola un FormularioAuto de moto (con seleccionVehiculo) y cada ramo usa SU validador.
const MOTO = {
  ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'hombre' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0, garajeNoche: true,
  seleccionVehiculo: { marca: 'MARCA DE PRUEBA', modelo: 'MODELO DE PRUEBA', clase: 2, cilindradaCc: 250 },
}

test('encolar: moto con FormularioAuto válido pasa (con seleccionVehiculo); inválido, auto y ramo desconocido, no', () => {
  const ok = validarEntradaRamo('moto', MOTO)
  assert.equal(ok.ok, true)
  if (ok.ok && ok.entrada.ramo === 'moto') assert.deepEqual(ok.entrada.riesgo.seleccionVehiculo, MOTO.seleccionVehiculo)
  assert.equal(validarEntradaRamo('moto', { ...MOTO, matricula: 'x' }).ok, false)
  assert.equal(validarEntradaRamo('moto', { ...MOTO, ramo: 'auto' }).ok, false, 'un formulario de auto no es un trabajo moto')
  assert.equal(validarEntradaRamo('moto', { ramo: 'comunidades' }).ok, false)
  assert.equal(validarEntradaRamo('comunidades', MOTO).ok, false, 'comunidades sigue con su validador')
  for (const r of ['auto', 'hogar', undefined, 'MOTO']) assert.equal(validarEntradaRamo(r, MOTO).ok, false, String(r))
})

// ─── Cola: lease, huecos y duplicados (13/10/2026) ───────────────────────────
const AHORA = new Date('2026-10-13T10:00:00Z')
const antes = (ms: number) => new Date(AHORA.getTime() - ms)
const despues = (ms: number) => new Date(AHORA.getTime() + ms)

test('lease: pasado o justo ahora = vencido; futuro = vivo; null = no se sabe → vivo (conservador)', () => {
  assert.equal(leaseVencido(antes(1), AHORA), true)
  assert.equal(leaseVencido(AHORA, AHORA), true)
  assert.equal(leaseVencido(despues(1), AHORA), false)
  assert.equal(leaseVencido(null, AHORA), false)
  assert.equal(leaseVencido(new Date('no-fecha'), AHORA), false)
})

test('un en_curso con lease vencido NO ocupa hueco (defecto 1: un colgado bloqueaba la cola)', () => {
  const filas = [{ id: 'a', leaseHasta: antes(60_000) }, { id: 'b', leaseHasta: despues(60_000) }, { id: 'c', leaseHasta: null }]
  const { vivos, vencidos } = repartirEnCurso(filas, AHORA)
  assert.deepEqual(vivos.map((f) => f.id), ['b', 'c'])
  assert.deepEqual(vencidos.map((f) => f.id), ['a'])
  // max 1 y el único en curso está colgado → hay hueco
  assert.equal(huecosLibres(1, repartirEnCurso([{ leaseHasta: antes(1) }], AHORA).vivos.length), 1)
})

test('huecos: max − vivos, nunca negativo; sin integración o tope raro → 0 (fail-closed)', () => {
  assert.equal(huecosLibres(1, 0), 1)
  assert.equal(huecosLibres(1, 1), 0)
  assert.equal(huecosLibres(3, 1), 2)
  assert.equal(huecosLibres(2, 5), 0)
  assert.equal(huecosLibres(null, 0), 0)
  assert.equal(huecosLibres(0, 0), 0)
  assert.equal(huecosLibres(1.5, 0), 0)
})

test('clave de deduplicación: cambia con cliente, compañía y ramo (no funde encargos distintos)', () => {
  const base = { correduriaId: 'c1', clienteId: 'k1', compania: 'allianz', ramo: 'moto' }
  const k = claveEncolar(base)
  assert.equal(k, claveEncolar({ ...base }))
  for (const otro of [{ clienteId: 'k2' }, { compania: 'mapfre' }, { ramo: 'comunidades' }, { correduriaId: 'c2' }]) {
    assert.notEqual(claveEncolar({ ...base, ...otro }), k, JSON.stringify(otro))
  }
})

test('duplicado: pendiente sí; en_curso solo con lease vivo; reintentable bajo el tope; terminados y emisión no', () => {
  const f = (estado: string, extra: Partial<{ leaseHasta: Date | null; intentos: number; modo: string | null }> = {}) =>
    bloqueaDuplicado({ estado, leaseHasta: null, intentos: 0, modo: null, ...extra }, AHORA, 2)
  assert.equal(f('pendiente'), true)
  assert.equal(f('en_curso', { leaseHasta: despues(1) }), true)
  assert.equal(f('en_curso', { leaseHasta: antes(1) }), false)
  assert.equal(f('error_reintentable', { intentos: 1 }), true)
  assert.equal(f('error_reintentable', { intentos: 2 }), false)
  for (const e of ['ok', 'error_definitivo', 'requiere_humano', 'cancelado']) assert.equal(f(e), false, e)
  assert.equal(f('pendiente', { modo: 'emision' }), false)
})

test('cableado: reclamar descuenta los vencidos, encolar deduplica bajo cerrojo y la cola tiene cron propio', () => {
  const src = readFileSync(join(APP, 'lib', 'tarificador.ts'), 'utf8')
  const tramo = (desde: string, hasta: string) => src.slice(src.indexOf(desde), src.indexOf(hasta, src.indexOf(desde)))
  const reclamar = tramo('export async function reclamarSiguiente', 'export type DepsLanzador')
  assert.match(reclamar, /repartirEnCurso\(/, 'reclamarSiguiente no separa los en_curso de lease vencido')
  assert.match(reclamar, /huecosLibres\(max, vivos\.length\)/, 'reclamarSiguiente no cuenta solo los vivos')
  assert.doesNotMatch(reclamar, /count\(\*\)/, 'reclamarSiguiente vuelve a contar en_curso a ciegas')
  const encolar = tramo('export async function encolarTrabajo', '// ─── Reclamar y lanzar')
  assert.match(encolar, /pg_advisory_xact_lock\(hashtext\(\$\{claveEncolar\(/, 'encolarTrabajo sin cerrojo por clave: dos peticiones simultáneas duplican')
  assert.match(encolar, /bloqueaDuplicado\(/, 'encolarTrabajo no deduplica')
  assert.match(encolar, /t\.oportunidad_id is not distinct from \$\{e\.oportunidadId \?\? null\}::uuid/, 'el dedupe ignora la oportunidad')
  assert.match(encolar, /t\.poliza_id is not distinct from \$\{polizaId \?\? null\}::uuid/, 'el dedupe ignora la póliza')
  assert.match(encolar, /\{ timeout: 15000, maxWait: 10000 \}/, 'encolarTrabajo sin timeout de transacción')
  assert.match(reclamar, /\{ timeout: 15000, maxWait: 10000 \}/, 'reclamarSiguiente sin timeout de transacción')
  assert.match(reclamar, /f\.tocada && v\.fly_machine_id/, 'maquinasVencidas sin comprobar que marcarFallo tocó fila')
  const vercel = JSON.parse(readFileSync(join(APP, 'vercel.json'), 'utf8')) as { crons: { path: string }[] }
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/tarificador-cola'), 'la cola no tiene cron propio (solo barría el de renovaciones)')
})

test('resultado «explorado» (13/10/2026): solo con un motivo de fin de la lista; nada de ofertas ni texto libre', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const r = leerResultadoWorker({ trabajoId: id, resultado: 'explorado', motivoFin: 'resultado', botVersion: '0.1.0' })
  assert.ok(r.ok && r.r.tipo === 'explorado' && r.r.motivoFin === 'resultado' && r.r.botVersion === '0.1.0')
  assert.equal(leerResultadoWorker({ trabajoId: id, resultado: 'explorado', motivoFin: 'cualquier cosa' }).ok, false)
  assert.equal(leerResultadoWorker({ trabajoId: id, resultado: 'explorado' }).ok, false)
})

test('registrarResultado: una exploración no devuelve ofertas, solo ella termina «explorado» y sus fallos no guardan captura', () => {
  const f = readFileSync(join(APP, 'lib', 'tarificador.ts'), 'utf8')
  assert.match(f, /if \(deExploracion && r\.tipo === 'ok'\) return \{ res: \{ estado: 'conflicto'/)
  assert.match(f, /if \(!deExploracion && r\.tipo === 'explorado'\) return \{ res: \{ estado: 'conflicto'/)
  assert.match(f, /const evidencia = deExploracion \? null : \{ trabajo: t, captura: r\.captura, html: r\.html \}/)
  // La cola filtra por modo (la exploración solo con su interruptor) y el worker declara lo que sabe hacer.
  assert.match(f, /and coalesce\(to_jsonb\(w\)->>'modo', 'tarificar'\) = any\(\$\{\[\.\.\.modos\]\}::text\[\]\)/)
  assert.match(f, /reclamarSiguiente\(correduriaId, compania, modosReclamables\(deps\.env\)\)/)
  assert.match(f, /const modo = f \? modoParaWorker\(f\.modo, modosWorker\) : null/)
})
