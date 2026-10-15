// Cepos del orquestador del tarificador RPA (05/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  avisoTraza, aplicarNifTomador, aplicarDatosTomador, fechaIsoDeFicha, lecturaTomadorFicha, necesitaDatosTomador, riesgoParaEncolar, faltaCompaniaAnteriorRiesgo, riesgoSinNifTomador, tipoFalloNifTomador, bloqueaDuplicado, claveEncolar, lecturaNifFicha, necesitaNifTomador, configFly, huecosLibres, leaseVencido, leerResultadoWorker, peticionMaquina, repartirEnCurso, rpaActivo, validarEntradaRamo,
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

test('la máquina recibe TARIFICADOR_EXPLORADOR_VISTA solo con dom|aria|ambas exactos', () => {
  for (const v of ['dom', 'aria', 'ambas']) {
    assert.equal(JSON.parse(peticionMaquina(CFG, JOB, v).init.body).config.env.TARIFICADOR_EXPLORADOR_VISTA, v)
  }
  for (const v of [undefined, null, '', 'ARIA', ' aria', 'todo']) {
    const env = JSON.parse(peticionMaquina(CFG, JOB, v).init.body).config.env
    assert.deepEqual(Object.keys(env).sort(), ['JOB_ID', 'TARIFICADOR_API_URL'], String(v))
  }
  assert.deepEqual(Object.keys(JSON.parse(peticionMaquina(CFG, JOB).init.body).config.env).sort(), ['JOB_ID', 'TARIFICADOR_API_URL'])
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
  for (const r of ['hogar', undefined, 'MOTO', 'AUTO']) assert.equal(validarEntradaRamo(r, MOTO).ok, false, String(r))
  assert.equal(validarEntradaRamo('auto', MOTO).ok, false, 'un formulario de moto no es un trabajo auto')
})

test('encolar: auto (coche, Mapfre NSEI, 14/10/2026) con FormularioAuto de auto pasa; el mismo validador y su ramo', () => {
  const COCHE = { ...MOTO, ramo: 'auto', seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } }
  const ok = validarEntradaRamo('auto', COCHE)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.entrada.ramo, 'auto')
  assert.equal(validarEntradaRamo('auto', { ...COCHE, matricula: 'x' }).ok, false)
  assert.equal(validarEntradaRamo('moto', COCHE).ok, false, 'un formulario de coche no es un trabajo moto')
  const sinHistorial = validarEntradaRamo('auto', { ...COCHE, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null })
  assert.equal(sinHistorial.ok, true, 'null = no consta: el validador no lo convierte en 0 (lo decide el bot)')
  if (sinHistorial.ok && sinHistorial.entrada.ramo === 'auto') assert.equal(sinHistorial.entrada.riesgo.siniestrosUltimos5Anios, null)
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
  // ATASCO (F2): espera a Alberto y volverá a la cola: pedir lo mismo es duplicado.
  assert.equal(f('atascado'), true)
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
  // Sin presupuesto (imagen anterior o sin guardado): `null`.
  assert.ok(r.ok && r.r.tipo === 'explorado' && r.r.presupuesto === null)
})

test('resultado «explorado» con PRESUPUESTO guardado (14/10/2026): un PDF de verdad y referencia sin forma de dato personal', () => {
  const id = '00000000-0000-4000-8000-000000000009'
  const pdf = Buffer.from('%PDF-1.4 presupuesto de prueba').toString('base64')
  const r = leerResultadoWorker({ trabajoId: id, resultado: 'explorado', motivoFin: 'resultado', presupuesto: { referencia: 'P2026-000123', pdf: { nombre: 'presupuesto-allianz.pdf', base64: pdf } } })
  assert.ok(r.ok && r.r.tipo === 'explorado' && r.r.presupuesto?.referencia === 'P2026-000123' && r.r.presupuesto.pdf?.contenido.subarray(0, 5).toString() === '%PDF-')
  const soloRef = leerResultadoWorker({ trabajoId: id, resultado: 'explorado', motivoFin: 'resultado', presupuesto: { referencia: null, pdf: null } })
  assert.ok(soloRef.ok && soloRef.r.tipo === 'explorado' && soloRef.r.presupuesto?.pdf === null)
  for (const malo of [
    { referencia: '12345678Z' },
    { referencia: 'P1234', pdf: { base64: Buffer.from('<html>').toString('base64') } },
    { referencia: 'P1234', extra: 1 },
    'P1234',
  ]) assert.equal(leerResultadoWorker({ trabajoId: id, resultado: 'explorado', motivoFin: 'resultado', presupuesto: malo }).ok, false, JSON.stringify(malo))
})

test('registrarResultado: el PDF del presupuesto explorado va a documentos (solo con cliente/póliza) y a evidencia_documento_id', () => {
  const f = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  assert.match(f, /r\.presupuesto\?\.pdf && \(t\.cliente_id \|\| t\.poliza_id\)\s*\? await guardarAdjunto\(/)
  assert.match(f, /evidencia_documento_id = coalesce\(\$\{pdfDoc\}::uuid, evidencia_documento_id\)/)
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

// ─── Traza: nunca muda (14/10/2026) y compatible con la imagen Fly ya desplegada ───
const JOB_T = '11111111-1111-4111-8111-111111111111'

test('avisoTraza: prefijo fijo, id y motivo; quita URLs y recorta', () => {
  const m = avisoTraza(JOB_T, new Error('fallo en postgresql://u:secreto@host/db y ' + 'x'.repeat(500)))
  assert.ok(m.startsWith(`[tarificador-traza] trabajo ${JOB_T}: `))
  assert.doesNotMatch(m, /secreto|postgresql/)
  assert.ok(m.length < 400)
})

test('compat hacia atrás: traza actual (5 claves), sin traza y con traza vacía se leen igual', () => {
  const base = { trabajoId: JOB_T, resultado: 'error', error: { tipo: 'portal', mensaje: 'x' } }
  const pasos = [
    { paso: 'login', inicio: '2026-10-14T10:00:00.000Z', duracionMs: 900, ok: true, errorCodigo: null },
    { paso: 'formulario', inicio: '2026-10-14T10:00:01.000Z', duracionMs: 5000, ok: false, errorCodigo: 'portal' },
  ]
  const a = leerResultadoWorker({ ...base, pasos, botVersion: '0.2.0' })
  assert.ok(a.ok)
  if (a.ok) assert.deepEqual([a.r.pasos.length, a.r.botVersion, a.r.trazaRechazada], [2, '0.2.0', undefined])
  for (const cuerpo of [base, { ...base, pasos: [] }, { ...base, pasos: null }]) {
    const b = leerResultadoWorker(cuerpo)
    assert.ok(b.ok)
    if (b.ok) assert.deepEqual([b.r.pasos, b.r.trazaRechazada], [[], undefined])
  }
  // Traza mala: el resultado se acepta igual, sin pasos, con el motivo (clave, no valor).
  const c = leerResultadoWorker({ ...base, pasos: [{ ...pasos[0], dni: '12345678Z' }] })
  assert.ok(c.ok)
  if (c.ok) {
    assert.deepEqual(c.r.pasos, [])
    assert.match(c.r.trazaRechazada!.join(' '), /dni/)
    assert.doesNotMatch(c.r.trazaRechazada!.join(' '), /12345678Z/)
  }
})

test('🪤 la traza rechazada o no guardada NO es muda: console.error con [tarificador-traza] y sin romper el resultado', () => {
  const ruta = readFileSync(join(APP, 'app/api/tarificador/resultado/route.ts'), 'utf8')
  assert.match(ruta, /console\.error\(avisoTraza\(l\.r\.trabajoId/)
  const f = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  const cuerpo = f.slice(f.indexOf('export async function registrarResultado'), f.indexOf('async function guardarTarificacionRpa'))
  const tras = cuerpo.slice(cuerpo.indexOf('if (interno.traza) {'))
  assert.match(tras, /catch \(e\) \{[\s\S]*console\.error\(avisoTraza\(/)
  assert.doesNotMatch(tras, /console\.warn/)
  assert.match(tras, /el worker no mandó ningún paso/)
  assert.match(tras, /no existe: no se guarda la traza/)
  assert.doesNotMatch(tras, /throw /)
})

test('los nombres de paso y códigos que genera el worker real (crearTraza) pasan validarTraza', async () => {
  const { crearTraza } = await import('@central/module-tarificacion')
  const t = crearTraza((e) => (e instanceof Error ? 'portal' : 'desconocido'))
  for (const n of ['login', 'navegacion', 'formulario', 'tarificar', 'lectura_primas'] as const) await t.paso(n, async () => 1)
  await t.paso('tarificar', async () => { throw new Error('x') }).catch(() => undefined)
  t.anotar('formulario', Date.now() - 100, { e: new Error('y') })
  const v = leerResultadoWorker({ trabajoId: JOB_T, resultado: 'error', error: { tipo: 'portal', mensaje: 'x' }, pasos: t.pasos() })
  assert.ok(v.ok)
  if (v.ok) assert.deepEqual([v.r.trazaRechazada, v.r.pasos.length], [undefined, 7])
})

// ─── NIF del tomador para Mapfre (14/10/2026) ────────────────────────────────

const NIF = '00000000T'
// Completo para llegar a precio (15/10/2026, `faltanParaTarificar`): estas pruebas miran el NIF/los datos de la ficha, no
// lo que falta del riesgo (eso, en «Obligatorios para tarificar» más abajo).
const RIESGO_MOTO = {
  ramo: 'moto', matricula: '0000BBB', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'hombre' },
  tomadorEsConductor: true, aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: 0,
  seleccionVehiculo: { marca: 'MARCA DE PRUEBA', modelo: 'MODELO DE PRUEBA', clase: 2, cilindradaCc: 250 },
}
const noLeer = () => { throw new Error('no debería leer la ficha') }
// Datos del tomador de la ficha (alta en Mapfre). Placeholders, no datos reales.
const DATOS_TOMADOR = { tipo: 'fisica', nombre: 'NOMBRE PRUEBA', apellido1: 'APELLIDOUNO', apellido2: 'APELLIDODOS', fechaNacimiento: '1980-01-02' } as const
const datosOk = () => ({ estado: 'ok' as const, datos: DATOS_TOMADOR })

test('NIF Mapfre: solo Mapfre + auto/moto + riesgo sin documento lo necesita', () => {
  assert.equal(necesitaNifTomador('mapfre', 'moto', RIESGO_MOTO), true)
  assert.equal(necesitaNifTomador(' MAPFRE ', 'auto', RIESGO_MOTO), true)
  assert.equal(necesitaNifTomador('allianz', 'moto', RIESGO_MOTO), false)
  assert.equal(necesitaNifTomador('mapfre', 'comunidades', {}), false)
  assert.equal(necesitaNifTomador('mapfre', 'moto', { ...RIESGO_MOTO, documentoTomador: NIF }), false)
  assert.equal(necesitaNifTomador('mapfre', 'moto', { ...RIESGO_MOTO, tomador: { documentoIdentidad: NIF } }), false)
})

test('NIF Mapfre: lectura de la ficha en tres estados (sin NIF ≠ ilegible) y valida la letra', () => {
  const desc = (v: string) => v.slice(3)
  assert.deepEqual(lecturaNifFicha(null, desc), { estado: 'sin_nif' })
  assert.deepEqual(lecturaNifFicha('  ', desc), { estado: 'sin_nif' })
  assert.deepEqual(lecturaNifFicha(`v1:${NIF}`, desc), { estado: 'ok', documento: NIF })
  assert.deepEqual(lecturaNifFicha('00000000-t', desc), { estado: 'ok', documento: NIF }, 'legado en claro, normalizado')
  assert.deepEqual(lecturaNifFicha('v1:xx', () => { throw new Error('clave') }), { estado: 'ilegible' })
  assert.deepEqual(lecturaNifFicha('v1:00000000A', desc), { estado: 'no_valido' })
})

test('NIF Mapfre: se añade al riesgo desde la ficha; sin NIF/ilegible/no válido → rechazo SIN el documento en el motivo', () => {
  const ok = aplicarNifTomador('mapfre', 'moto', RIESGO_MOTO, () => ({ estado: 'ok', documento: NIF }))
  assert.ok(ok.ok)
  assert.deepEqual(ok.ok && ok.riesgo, { ...RIESGO_MOTO, documentoTomador: NIF })
  // Si el riesgo ya lo trae, no se lee la ficha ni se toca.
  const trae = { ...RIESGO_MOTO, documentoTomador: 'X0000000T' }
  assert.deepEqual(aplicarNifTomador('mapfre', 'moto', trae, noLeer), { ok: true, riesgo: trae })
  for (const [estado, status] of [['sin_nif', 422], ['no_valido', 422], ['ilegible', 503]] as const) {
    const r = aplicarNifTomador('mapfre', 'moto', RIESGO_MOTO, () => ({ estado }))
    assert.equal(r.ok, false, estado)
    assert.ok(!r.ok && r.status === status && /nif_tomador/.test(r.motivo), estado)
    assert.ok(!JSON.stringify(r).includes('00000000'), 'el motivo no lleva documento')
  }
})

test('NIF Mapfre: otra compañía no lee la ficha y QUITA un documentoTomador que no va a usar', () => {
  assert.deepEqual(aplicarNifTomador('allianz', 'moto', { ...RIESGO_MOTO, documentoTomador: NIF }, noLeer), { ok: true, riesgo: RIESGO_MOTO })
  assert.deepEqual(aplicarNifTomador('allianz', 'comunidades', { ramo: 'comunidades' }, noLeer), { ok: true, riesgo: { ramo: 'comunidades' } })
})

// 🔒 14/10/2026 (seguridad): el NIF descifrado NO se persiste en `tarificacion_trabajos.riesgo`; solo viaja al worker.

test('NIF Mapfre · ENCOLAR: el riesgo que se guarda NUNCA lleva el documento (ni el de la ficha ni uno que viniera)', () => {
  const leido = { n: 0 }
  const ok = riesgoParaEncolar('mapfre', 'moto', RIESGO_MOTO, () => { leido.n++; return { estado: 'ok', documento: NIF } }, datosOk)
  assert.ok(ok.ok)
  assert.equal(leido.n, 1, 'se comprueba la ficha')
  assert.deepEqual(ok.ok && ok.riesgo, RIESGO_MOTO)
  assert.ok(!JSON.stringify(ok).includes('00000000'), 'el riesgo persistido no contiene el documento')
  // Un `documentoTomador` que venga en la entrada tampoco se guarda (es el campo que pone asegura al entregar).
  const trae = riesgoParaEncolar('mapfre', 'moto', { ...RIESGO_MOTO, documentoTomador: 'X0000000T' }, () => ({ estado: 'ok', documento: NIF }), datosOk)
  assert.ok(trae.ok && !JSON.stringify(trae.riesgo).includes('0000000T'))
  assert.deepEqual(riesgoParaEncolar('allianz', 'moto', { ...RIESGO_MOTO, documentoTomador: NIF }, noLeer, noLeer), { ok: true, riesgo: RIESGO_MOTO })
  assert.deepEqual(riesgoSinNifTomador({ a: 1, documentoTomador: NIF }), { a: 1 })
  assert.equal(riesgoSinNifTomador(null), null)
})

test('NIF Mapfre · ENCOLAR: ficha sin NIF / no válido / ilegible → rechazo (422/422/503) sin documento en el motivo', () => {
  for (const [estado, status] of [['sin_nif', 422], ['no_valido', 422], ['ilegible', 503]] as const) {
    const r = riesgoParaEncolar('mapfre', 'moto', RIESGO_MOTO, () => ({ estado }), noLeer)
    assert.ok(!r.ok && r.status === status && /nif_tomador/.test(r.motivo), estado)
  }
  assert.equal(tipoFalloNifTomador(422), 'datos')
  assert.equal(tipoFalloNifTomador(503), 'infra', 'ilegible = «no se sabe»: fallo de infraestructura, no de la ficha')
})

test('NIF Mapfre · ENTREGA al worker: el riesgo GUARDADO + la ficha → el worker SÍ recibe el NIF (solo Mapfre auto/moto)', () => {
  const guardado = riesgoParaEncolar('mapfre', 'moto', RIESGO_MOTO, () => ({ estado: 'ok', documento: NIF }), datosOk)
  assert.ok(guardado.ok)
  const alWorker = aplicarNifTomador('mapfre', 'moto', guardado.ok && guardado.riesgo, () => ({ estado: 'ok', documento: NIF }))
  assert.deepEqual(alWorker.ok && alWorker.riesgo, { ...RIESGO_MOTO, documentoTomador: NIF })
  // Otras compañías / ramos: ni se lee la ficha ni reciben documento.
  assert.deepEqual(aplicarNifTomador('allianz', 'moto', RIESGO_MOTO, noLeer), { ok: true, riesgo: RIESGO_MOTO })
  assert.deepEqual(aplicarNifTomador('mapfre', 'comunidades', { ramo: 'comunidades' }, noLeer), { ok: true, riesgo: { ramo: 'comunidades' } })
})

test('NIF Mapfre: encolarTrabajo GUARDA el riesgo sin NIF (comprobado tras el cliente) y trabajoParaWorker lo inyecta sin escribirlo', () => {
  const src = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function encolarTrabajo'), src.indexOf('// ─── Reclamar y lanzar'))
  const cliente = fn.indexOf("'cliente_no_encontrado'")
  const comprueba = fn.indexOf('riesgoParaEncolar(')
  const json = fn.indexOf('const riesgoJson = JSON.stringify(guardar.riesgo)')
  assert.ok(cliente > -1 && comprueba > cliente && json > comprueba, 'cliente comprobado → NIF comprobado → riesgo SIN NIF serializado')
  assert.ok(fn.search(/insert into \w+\.tarificacion_trabajos/) > json)
  assert.ok(!/JSON\.stringify\(e\.riesgo\)/.test(fn), 'nada encola el riesgo sin pasar por riesgoParaEncolar')
  assert.ok(!fn.includes('aplicarNifTomador('), 'encolar NO inyecta el NIF (eso es al entregar)')
  assert.match(fn, /leerDniFicha\(e\.correduriaId, clienteId\)/)
  assert.match(src, /select dni from \w+\.clientes where id = \$\{clienteId\}::uuid and correduria_id = \$\{correduriaId\}::uuid/)
  assert.ok(fn.indexOf("return { estado: 'rechazado', status: guardar.status, motivo: guardar.motivo }") > comprueba, 'sin NIF no se encola')
  // Entrega: se inyecta en la respuesta (no en exploración) y la función no escribe el riesgo en BD.
  const w = src.slice(src.indexOf('export async function trabajoParaWorker'), src.indexOf('// ─── Resultado'))
  assert.match(w, /if \(modo !== 'exploracion' && necesitaNifTomador\(f\.compania, f\.ramo, riesgo\)\)/)
  assert.match(w, /aplicarNifTomador\(f\.compania, f\.ramo, riesgo, \(\) => lecturaNifFicha\(dni, decryptField\)\)/)
  assert.match(w, /const base = \{ id: f\.id, compania: f\.compania, ramo: f\.ramo, riesgo,/)
  assert.ok(!/update\s+\w+\.tarificacion_trabajos|insert into/i.test(w), 'el NIF nunca se escribe al entregar')
  assert.ok(!/riesgo\s*=/.test(w.replace(/let riesgo = f\.riesgo|riesgo = conNif\.riesgo|riesgo = conDatos\.riesgo/g, '')), 'el riesgo solo se toca para la respuesta')
})

// ─── Datos del tomador para el alta en Mapfre (revisión PR #4710): como el NIF, comprobados al encolar e inyectados al entregar ───
// Placeholders: ningún dato real.
const desc = (v: string) => v.slice(3)
const FILA = { dni: `v1:${NIF}`, nombre: 'NOMBRE PRUEBA', apellidos: 'APELLIDOUNO APELLIDODOS', fechaNacimiento: 'v1:02/01/1980', tipoPersona: 'fisica' }

test('Datos tomador: lectura de la ficha (descifra, parte apellidos, normaliza la fecha); falta ≠ ilegible; valor de cajón = falta', () => {
  assert.deepEqual(lecturaTomadorFicha(FILA, desc), { estado: 'ok', datos: { tipo: 'fisica', nombre: 'NOMBRE PRUEBA', apellido1: 'APELLIDOUNO', apellido2: 'APELLIDODOS', fechaNacimiento: '1980-01-02' } })
  const r = lecturaTomadorFicha({ ...FILA, nombre: 'lead', apellidos: '', fechaNacimiento: null }, desc)
  assert.deepEqual(r, { estado: 'incompleta', faltan: ['el nombre', 'el primer apellido', 'la fecha de nacimiento'] })
  assert.deepEqual(lecturaTomadorFicha({ ...FILA, fechaNacimiento: 'v1:01/02/03' }, desc), { estado: 'incompleta', faltan: ['una fecha de nacimiento válida'] }, 'no se adivina el orden')
  assert.deepEqual(lecturaTomadorFicha(FILA, () => { throw new Error('clave') }), { estado: 'ilegible' })
  assert.deepEqual(lecturaTomadorFicha(null, desc), { estado: 'incompleta', faltan: ['la ficha'] })
  // Empresa: por tipo de persona, o sin tipo y con CIF. Razón social = nombre + apellidos (como la guarda la cartera).
  assert.deepEqual(lecturaTomadorFicha({ ...FILA, tipoPersona: 'juridica', nombre: 'EMPRESA PRUEBA', apellidos: 'SL' }, desc), { estado: 'ok', datos: { tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA SL' } })
  assert.deepEqual(lecturaTomadorFicha({ ...FILA, tipoPersona: null, dni: 'B00000000', nombre: '', apellidos: '' }, desc), { estado: 'incompleta', faltan: ['la razón social'] })
  assert.equal(fechaIsoDeFicha('1980-01-02'), '1980-01-02')
  assert.equal(fechaIsoDeFicha('31/02/1980'), null)
})

test('Datos tomador · ENCOLAR: faltan → 422 `falta_datos_tomador` «falta X en la ficha» sin valores; ilegible → 503; el riesgo guardado nunca los lleva', () => {
  const ok = riesgoParaEncolar('mapfre', 'auto', { ...RIESGO_MOTO, ramo: 'auto', datosTomador: DATOS_TOMADOR }, () => ({ estado: 'ok', documento: NIF }), datosOk)
  assert.ok(ok.ok)
  assert.ok(!JSON.stringify(ok).includes('APELLIDOUNO') && !JSON.stringify(ok).includes('1980'), 'nada de la ficha en lo que se guarda')
  const falta = riesgoParaEncolar('mapfre', 'auto', RIESGO_MOTO, () => ({ estado: 'ok', documento: NIF }), () => ({ estado: 'incompleta', faltan: ['el nombre', 'la fecha de nacimiento'] }))
  assert.deepEqual(falta.ok ? null : [falta.status, falta.motivo.split(':')[0]], [422, 'falta_datos_tomador'])
  assert.match(!falta.ok ? falta.motivo : '', /falta el nombre y la fecha de nacimiento en la ficha/)
  const ileg = riesgoParaEncolar('mapfre', 'auto', RIESGO_MOTO, () => ({ estado: 'ok', documento: NIF }), () => ({ estado: 'ilegible' }))
  assert.ok(!ileg.ok && ileg.status === 503 && /^datos_tomador_ilegibles/.test(ileg.motivo))
  // Sin NIF manda el motivo del NIF (no se lee lo demás).
  const sinNif = riesgoParaEncolar('mapfre', 'auto', RIESGO_MOTO, () => ({ estado: 'sin_nif' }), noLeer)
  assert.ok(!sinNif.ok && /^falta_nif_tomador/.test(sinNif.motivo))
  // Otra compañía o riesgo con su bloque `tomador`: ni se lee la ficha.
  assert.equal(necesitaDatosTomador('allianz', 'auto', RIESGO_MOTO), false)
  assert.equal(necesitaDatosTomador('mapfre', 'auto', { ...RIESGO_MOTO, tomador: { documentoIdentidad: NIF } }), false)
  assert.equal(necesitaDatosTomador('mapfre', 'comunidades', {}), false)
  assert.deepEqual(aplicarDatosTomador('allianz', 'auto', { ...RIESGO_MOTO, datosTomador: DATOS_TOMADOR }, noLeer), { ok: true, riesgo: RIESGO_MOTO })
})

test('Datos tomador · ENTREGA: el riesgo GUARDADO + la ficha → el worker recibe `datosTomador` (solo Mapfre auto/moto)', () => {
  const guardado = riesgoParaEncolar('mapfre', 'auto', RIESGO_MOTO, () => ({ estado: 'ok', documento: NIF }), datosOk)
  assert.ok(guardado.ok)
  const r = aplicarDatosTomador('mapfre', 'auto', guardado.ok && guardado.riesgo, datosOk)
  assert.deepEqual(r.ok && r.riesgo, { ...RIESGO_MOTO, datosTomador: DATOS_TOMADOR })
})

test('Datos tomador: encolarTrabajo los COMPRUEBA (leerTomadorFicha) y trabajoParaWorker los inyecta sin escribirlos', () => {
  const src = readFileSync(join(APP, 'lib/tarificador.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function encolarTrabajo'), src.indexOf('// ─── Reclamar y lanzar'))
  assert.match(fn, /leerTomadorFicha\(e\.correduriaId, clienteId\)/)
  assert.match(fn, /riesgoParaEncolar\(e\.compania, e\.ramo, e\.riesgo, \(\) => lecturaNifFicha\(dniFicha, decryptField\), \(\) => lecturaTomadorFicha\(fichaTomador, decryptField\)\)/)
  assert.ok(!fn.includes('aplicarDatosTomador('), 'encolar NO inyecta (eso es al entregar)')
  assert.match(src, /from seguros\.clientes where id = \$\{clienteId\}::uuid and correduria_id = \$\{correduriaId\}::uuid`\n  const f = filas\[0\]/)
  const w = src.slice(src.indexOf('export async function trabajoParaWorker'), src.indexOf('// ─── Resultado'))
  assert.match(w, /if \(modo !== 'exploracion' && necesitaDatosTomador\(f\.compania, f\.ramo, riesgo\)\)/)
  assert.match(w, /aplicarDatosTomador\(f\.compania, f\.ramo, riesgo, \(\) => lecturaTomadorFicha\(ficha, decryptField\)\)/)
  assert.ok(w.indexOf('aplicarDatosTomador(') < w.indexOf('const base = {'), 'se inyecta antes de armar la respuesta')
})

// bot_version nunca vacío (14/10/2026): las exploraciones ok de Allianz hogar salían sin versión porque la rama «explorado»
// de registrarResultado no la escribía; y un worker sin versión dejaba NULL silencioso.
test('bot_version: la versión semver del worker llega en «explorado»; sin ella queda null («no se sabe»)', () => {
  const ok = leerResultadoWorker({ trabajoId: JOB, resultado: 'explorado', motivoFin: 'resultado', botVersion: '0.3.1' })
  assert.ok(ok.ok && ok.r.botVersion === '0.3.1')
  const sin = leerResultadoWorker({ trabajoId: JOB, resultado: 'explorado', motivoFin: 'resultado' })
  assert.ok(sin.ok && sin.r.botVersion === null)
})

test('bot_version: TODA rama de registrarResultado que cierra el trabajo escribe la versión (explorado, ok, error, sin_cierre)', () => {
  const src = readFileSync(join(APP, 'lib', 'tarificador.ts'), 'utf8')
  const ini = src.indexOf('export async function registrarResultado')
  const cuerpo = src.slice(ini, src.indexOf('\nexport ', ini + 10))
  const rama = cuerpo.slice(cuerpo.indexOf("if (r.tipo === 'explorado') {"), cuerpo.indexOf('const docs: string[]'))
  assert.match(rama, /bot_version = coalesce\(\$\{r\.botVersion\}/, 'la rama explorado debe escribir bot_version')
  assert.match(rama, /exploracion_sin_cierre[^\n]*r\.botVersion/, 'el fallo exploracion_sin_cierre debe pasar la versión')
  assert.match(cuerpo, /marcarFallo\(tx, t\.id, t\.intentos, r\.error, evidencia, conBot \? r\.botVersion/)
  assert.match(cuerpo, /set estado = 'ok', tarificacion_id[^`]*bot_version = coalesce\(\$\{r\.botVersion\}/)
})

// 🔒 15/10/2026: Mapfre auto con años asegurado > 0 pide el NOMBRE de la compañía anterior; se corta al encolar (422), sin máquina.
const RIESGO_AUTO_CON_ANIOS = { ramo: 'auto', matricula: '0000BBB', codigoPostal: '41003', aniosAseguradoAnterior: 4 }

test('compañía anterior · Mapfre auto con años y sin nombre: 422 falta_compania_anterior, sin leer la ficha', () => {
  const r = riesgoParaEncolar('mapfre', 'auto', RIESGO_AUTO_CON_ANIOS, noLeer, noLeer)
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.status === 422 && /^falta_compania_anterior: falta la compañía anterior/.test(r.motivo))
  assert.ok(!r.ok && !r.motivo.includes('0000BBB'), 'el motivo no lleva datos del riesgo')
})

test('compañía anterior · con nombre, sin años, otra compañía u otro ramo: no se corta por esto', () => {
  assert.equal(faltaCompaniaAnteriorRiesgo('mapfre', 'auto', { ...RIESGO_AUTO_CON_ANIOS, companiaAnterior: 'Línea Directa' }), null)
  assert.equal(faltaCompaniaAnteriorRiesgo('mapfre', 'auto', { ...RIESGO_AUTO_CON_ANIOS, aniosAseguradoAnterior: 0 }), null)
  assert.equal(faltaCompaniaAnteriorRiesgo('mapfre', 'auto', { ...RIESGO_AUTO_CON_ANIOS, aniosAseguradoAnterior: null }), null)
  assert.equal(faltaCompaniaAnteriorRiesgo('allianz', 'auto', RIESGO_AUTO_CON_ANIOS), null)
  assert.equal(faltaCompaniaAnteriorRiesgo('mapfre', 'moto', RIESGO_AUTO_CON_ANIOS), null)
  assert.equal(faltaCompaniaAnteriorRiesgo('mapfre', 'auto', 'no es un objeto'), null)
})

// ─── Obligatorios para tarificar (15/10/2026): fuente única `faltanParaTarificar` de module-tarificacion ─────────────

test('Obligatorios · validarEntradaRamo con compañía: rechaza con la lista legible lo que el bot necesita (sin mirar la ficha)', () => {
  const sinSiniestros = { ...MOTO, ramo: 'auto', seleccionVehiculo: undefined, siniestrosUltimos5Anios: null, companiaAnterior: 'COMPAÑÍA DE PRUEBA' }
  const v = validarEntradaRamo('auto', sinSiniestros, 'mapfre')
  assert.equal(v.ok, false)
  if (!v.ok) {
    assert.equal(v.mensaje, 'Falta: siniestros con culpa de los últimos 5 años.')
    assert.deepEqual(v.faltan?.map((f) => f.clave), ['siniestrosUltimos5Anios'])
  }
  // Sin compañía: solo la forma (como antes). NIF y datos del tomador (ficha) no se miran aquí.
  assert.equal(validarEntradaRamo('auto', sinSiniestros).ok, true)
  assert.equal(validarEntradaRamo('auto', { ...sinSiniestros, siniestrosUltimos5Anios: 0 }, 'mapfre').ok, true)
  // Allianz moto: sexo del conductor (el portal asumiría «Hombre»).
  const sinSexo = validarEntradaRamo('moto', { ...MOTO, conductor: { ...MOTO.conductor, sexo: null } }, 'allianz')
  assert.ok(!sinSexo.ok && sinSexo.mensaje === 'Falta: sexo del conductor.')
  // Compañía sin declaración: aquí no se rechaza (lo hace riesgoParaEncolar).
  assert.equal(validarEntradaRamo('moto', MOTO, 'generali').ok, true)
})

test('Obligatorios · riesgoParaEncolar: falta algo → 422 `faltan_datos` con la lista; sin declaración → fail-closed; sin valores en el motivo', () => {
  const r = riesgoParaEncolar('allianz', 'moto', { ...RIESGO_MOTO, conductor: { ...RIESGO_MOTO.conductor, sexo: null }, aniosAseguradoAnterior: null }, noLeer, noLeer)
  assert.ok(!r.ok && r.status === 422)
  if (!r.ok) {
    assert.equal(r.motivo, 'faltan_datos: Faltan: sexo del conductor, años asegurado en la compañía anterior.')
    assert.deepEqual(r.faltan?.map((f) => f.clave), ['conductor.sexo', 'aniosAseguradoAnterior'])
    assert.ok(!JSON.stringify(r).includes('0000BBB'))
  }
  const sinBot = riesgoParaEncolar('generali', 'moto', RIESGO_MOTO, noLeer, noLeer)
  assert.ok(!sinBot.ok && sinBot.status === 422 && sinBot.motivo.startsWith('sin_obligatorios_declarados: generali/moto'))
  // Mapfre: se evalúa con la ficha aplicada EN MEMORIA (NIF + datos) y lo guardado sigue SIN ellos.
  const ok = riesgoParaEncolar('mapfre', 'auto', { ...RIESGO_MOTO, ramo: 'auto' }, () => ({ estado: 'ok', documento: NIF }), datosOk)
  assert.ok(ok.ok)
  assert.ok(ok.ok && !('documentoTomador' in (ok.riesgo as object)) && !('datosTomador' in (ok.riesgo as object)))
  // «Tomador es conductor» sin dato: vale si la ficha dice que el tomador nació el día del conductor (regla del adaptador).
  const sinTec = { ...RIESGO_MOTO, ramo: 'auto', tomadorEsConductor: null, conductor: { ...RIESGO_MOTO.conductor, fechaNacimiento: DATOS_TOMADOR.fechaNacimiento } }
  assert.ok(riesgoParaEncolar('mapfre', 'auto', sinTec, () => ({ estado: 'ok', documento: NIF }), datosOk).ok)
  const otraFecha = () => ({ estado: 'ok' as const, datos: { ...DATOS_TOMADOR, fechaNacimiento: '1970-05-05' } })
  const r2 = riesgoParaEncolar('mapfre', 'auto', sinTec, () => ({ estado: 'ok', documento: NIF }), otraFecha)
  assert.ok(!r2.ok && r2.motivo === 'faltan_datos: Falta: si el tomador es el conductor habitual.')
})
