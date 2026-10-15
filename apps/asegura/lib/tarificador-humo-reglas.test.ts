// Cepos de la PRUEBA NOCTURNA DE HUMO (15/10/2026): reglas puras + cableado en el resto del tarificador. `node --test`.
// Sin datos personales: compañías y ramos de catálogo y mensajes de portal inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  HORA_ENCOLAR_HUMO,
  MAX_LINEAS_AVISO_HUMO,
  MENSAJE_HUMO_OMITIDO_CREDENCIALES,
  PREFIJO_HUMO_NO_SOPORTADO,
  RIESGO_HUMO,
  esHoraDeEncolarHumo,
  esHoraDeInformarHumo,
  estadoTrasFalloHumo,
  horaEnMadrid,
  humoActivo,
  humoPideParar,
  motivoCorto,
  motivoNadaProbado,
  textoNadaProbado,
  motivoPausaHumo,
  parejasParaHumo,
  resumirHumo,
  textoAvisoHumo,
  type FilaHumo,
} from './tarificador-humo-reglas.ts'
import { bloqueaDuplicado, leerResultadoWorker } from './tarificador-reglas.ts'
import { modoParaWorker, modosReclamables } from './tarificador-explorador-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(APP, r), 'utf8')

test('interruptor: apagado por defecto y solo con «1»', () => {
  assert.equal(humoActivo({}), false)
  assert.equal(humoActivo({ TARIFICADOR_HUMO_ACTIVO: 'true' }), false)
  assert.equal(humoActivo({ TARIFICADOR_HUMO_ACTIVO: ' 1 ' }), true)
})

test('03:15 de Madrid: verano (UTC+2) y invierno (UTC+1) con las dos entradas de vercel.json', () => {
  // Verano: 01:15 UTC = 03:15 Madrid; 02:15 UTC = 04:15 (no toca encolar).
  assert.equal(esHoraDeEncolarHumo(new Date('2026-07-15T01:15:00Z')), true)
  assert.equal(esHoraDeEncolarHumo(new Date('2026-07-15T02:15:00Z')), false)
  // Invierno: 02:15 UTC = 03:15 Madrid; 01:15 UTC = 02:15 (no toca).
  assert.equal(esHoraDeEncolarHumo(new Date('2026-12-15T02:15:00Z')), true)
  assert.equal(esHoraDeEncolarHumo(new Date('2026-12-15T01:15:00Z')), false)
  // Informe a las 04:15 Madrid: 02:15 UTC en verano, 03:15 UTC en invierno.
  assert.equal(esHoraDeInformarHumo(new Date('2026-07-15T02:15:00Z')), true)
  assert.equal(esHoraDeInformarHumo(new Date('2026-12-15T03:15:00Z')), true)
  assert.equal(horaEnMadrid(new Date('2026-10-25T00:30:00Z')), 2) // la noche del cambio de hora: 02:30 CEST
  assert.equal(HORA_ENCOLAR_HUMO, 3)
})

test('vercel.json: cada cron de humo lleva sus dos entradas UTC (verano e invierno) y la ruta existe', () => {
  const v = JSON.parse(leer('vercel.json')) as { crons: { path: string; schedule: string }[] }
  const de = (p: string) => v.crons.filter((c) => c.path === p).map((c) => c.schedule).sort()
  assert.deepEqual(de('/api/cron/tarificador-humo'), ['15 1 * * *', '15 2 * * *'])
  assert.deepEqual(de('/api/cron/tarificador-humo-informe'), ['15 2 * * *', '15 3 * * *'])
  for (const p of ['tarificador-humo', 'tarificador-humo-informe']) assert.ok(readFileSync(join(APP, `app/api/cron/${p}/route.ts`), 'utf8').includes('isCronAuthorized'))
})

test('UN humo por compañía: la primera pareja activa (orden estable); varias parejas de la misma compañía no se apilan', () => {
  const r = parejasParaHumo([
    { compania: 'allianz', ramo: 'auto', pausada: false, humoVivo: false },
    { compania: 'allianz', ramo: 'comunidades', pausada: false, humoVivo: false },
    { compania: 'allianz', ramo: 'moto', pausada: false, humoVivo: false },
    { compania: 'mapfre', ramo: 'auto', pausada: false, humoVivo: false },
    { compania: 'mapfre', ramo: 'moto', pausada: false, humoVivo: false },
  ])
  assert.deepEqual(r.lanzar, [{ compania: 'allianz', ramo: 'auto' }, { compania: 'mapfre', ramo: 'auto' }])
  assert.deepEqual(r.omitidas, [])
})

test('compañía con CUALQUIER pareja pausada o con un humo vivo: no se lanza (la credencial es de la compañía)', () => {
  const r = parejasParaHumo([
    { compania: 'allianz', ramo: 'auto', pausada: false, humoVivo: false },
    { compania: 'allianz', ramo: 'moto', pausada: true, humoVivo: false },
    { compania: 'mapfre', ramo: 'auto', pausada: false, humoVivo: true },
    { compania: 'zurich', ramo: 'hogar', pausada: false, humoVivo: false },
  ])
  assert.deepEqual(r.lanzar, [{ compania: 'zurich', ramo: 'hogar' }])
  assert.deepEqual(r.omitidas, [{ compania: 'allianz', ramo: 'auto', motivo: 'pausada' }, { compania: 'mapfre', ramo: 'auto', motivo: 'humo_vivo' }])
})

test('«integración activa sin bot»: el omitido NO cuenta como probado pero se menciona; los ramos activos sin bot se listan', () => {
  const omit: FilaHumo = { ...f('occident', 'hogar', 'cancelado', 'datos', `${PREFIJO_HUMO_NO_SOPORTADO}: occident no tiene bot activo en esta imagen`), conBot: [] }
  const ok: FilaHumo = { ...f('allianz', 'auto', 'ok'), conBot: ['auto', 'comunidades'] }
  const activas = [{ compania: 'allianz', ramo: 'auto' }, { compania: 'allianz', ramo: 'hogar' }, { compania: 'occident', ramo: 'hogar' }, { compania: 'occident', ramo: 'comunidades' }]
  const r = resumirHumo([omit, ok], activas)
  assert.deepEqual({ total: r.total, ok: r.ok, fallos: r.fallos.length, omitidos: r.omitidos }, { total: 1, ok: 1, fallos: 0, omitidos: 1 })
  assert.deepEqual(r.sinBot, [{ compania: 'occident', ramos: ['comunidades', 'hogar'] }, { compania: 'allianz', ramos: ['hogar'] }])
  const t = textoAvisoHumo(r)!
  assert.match(t, /sin fallos, con avisos/)
  assert.match(t, /• <b>Occident<\/b> \(comunidades, hogar\): integración activa sin bot/)
  assert.match(t, /• <b>Allianz<\/b> \(hogar\): integración activa sin bot/)
  // Sin integraciones sin bot ni fallos, no se avisa.
  assert.equal(textoAvisoHumo(resumirHumo([ok], [{ compania: 'allianz', ramo: 'auto' }])), null)
  const l = leerResultadoWorker({ trabajoId: '11111111-1111-4111-8111-111111111111', resultado: 'humo', omitido: ' sin\nbot ', ramosConBot: [], ramoProbado: 'auto' })
  assert.ok(l.ok && l.r.tipo === 'humo' && l.r.omitido === 'sin bot' && l.r.ramosConBot?.length === 0 && l.r.ramoProbado === 'auto')
  const ok2 = leerResultadoWorker({ trabajoId: '11111111-1111-4111-8111-111111111111', resultado: 'humo', ramosConBot: ['auto'] })
  assert.ok(ok2.ok && ok2.r.tipo === 'humo' && ok2.r.omitido === null && ok2.r.ramosConBot?.[0] === 'auto')
  const malo = leerResultadoWorker({ trabajoId: '11111111-1111-4111-8111-111111111111', resultado: 'humo', ramosConBot: ['<b>x'] })
  assert.ok(malo.ok && malo.r.tipo === 'humo' && malo.r.ramosConBot === null)
})

const CTX = { rpaActivo: true, esquemaHumo: true, companiasActivas: 2, companiasPausadas: 0, filas: 2, omitidos: 0 }

test('el silencio no vale como «todo bien»: 0 probadas → aviso corto con el motivo, sea cual sea la causa', () => {
  assert.match(motivoNadaProbado({ ...CTX, rpaActivo: false }), /RPA está apagado/)
  assert.match(motivoNadaProbado({ ...CTX, esquemaHumo: false }), /SQL del humo/)
  assert.match(motivoNadaProbado({ ...CTX, companiasActivas: 0, filas: 0 }), /no hay integraciones activas/)
  assert.match(motivoNadaProbado({ ...CTX, filas: 0, companiasPausadas: 2 }), /todas las compañías están en pausa/)
  assert.match(motivoNadaProbado({ ...CTX, filas: 0 }), /no se encoló ninguna prueba/)
  assert.match(motivoNadaProbado({ ...CTX, omitidos: 2 }), /ninguna compañía activa tiene bot/)
  assert.match(motivoNadaProbado(CTX), /no dieron resultado/)
  assert.equal(textoNadaProbado('el RPA está apagado'), '🌙 <b>Prueba nocturna</b>: no se probó nada (el RPA está apagado)')
  assert.match(textoNadaProbado('x <y>'), /\(x &lt;y&gt;\)/, 'el motivo va escapado')
  const sinProbar = resumirHumo([], [])
  assert.equal(sinProbar.total, 0)
})

test('informe: sin probar → aviso aunque no haya fallos; idempotente (marca el día ANTES de enviar y desmarca si falla); SQL con CHECK y tabla', () => {
  const h = leer('lib/tarificador-humo.ts')
  assert.match(h, /if \(resumen\.total === 0\) \{\s+nadaProbado = motivoNadaProbado\(/)
  const marca = h.indexOf('insert into seguros.tarificador_humo_informes')
  const envio = h.indexOf('await enviar(texto)')
  assert.ok(marca > 0 && envio > marca, 'el día se marca ANTES de enviar')
  assert.match(h, /on conflict \(correduria_id, dia\) do nothing/)
  assert.match(h, /if \(n === 0\) return \{ estado: 'ya_informado'/)
  assert.match(h, /if \(id === null && marcado\)[\s\S]{0,200}delete from seguros\.tarificador_humo_informes/)
  const sql = leer('prisma/sql/2026-10-15d_tarificador_humo.sql')
  assert.match(sql, /CHECK \(modo <> 'humo' OR riesgo = '\{\}'::jsonb\)/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.tarificador_humo_informes \([\s\S]*PRIMARY KEY \(correduria_id, dia\)/)
})

test('el riesgo del humo está vacío y congelado; un fallo de humo no se reintenta; solo «credenciales» abre pausa', () => {
  assert.deepEqual({ ...RIESGO_HUMO }, {})
  assert.ok(Object.isFrozen(RIESGO_HUMO))
  assert.equal(estadoTrasFalloHumo(), 'error_definitivo')
  assert.equal(humoPideParar('credenciales'), true)
  for (const t of ['portal', 'infra', 'datos', 'captcha', null, undefined]) assert.equal(humoPideParar(t), false)
  assert.match(motivoPausaHumo('allianz', 'auto'), /CRED_…_PASS/)
  assert.ok(motivoPausaHumo('allianz', 'auto').length <= 600, 'el CHECK de tarificador_pausas.motivo es de 600')
})

test('motivoCorto: sin nota del runner, sin URL, una línea, ≤110', () => {
  assert.equal(motivoCorto('portal', '[2.º intento (x)] humo (login): no aparece «Mediador» https://portal.test/a?b=1  tras el login'), 'humo (login): no aparece «Mediador» tras el login')
  assert.equal(motivoCorto('infra', 'tope de la prueba'), 'infraestructura: tope de la prueba')
  assert.equal(motivoCorto('portal', 'x'.repeat(500)).length, 110)
  assert.equal(motivoCorto('portal', '   '), 'fallo (portal)')
  assert.equal(motivoCorto(null, null), 'fallo sin detalle')
})

const f = (compania: string, ramo: string, estado: string, tipoError: string | null = null, mensaje: string | null = null): FilaHumo => ({ compania, ramo, estado, tipoError, mensaje })

test('resumen: todo bien → sin aviso', () => {
  const r = resumirHumo([f('allianz', 'comunidades', 'ok'), f('mapfre', 'auto', 'ok')])
  assert.deepEqual({ total: r.total, ok: r.ok, fallos: r.fallos.length }, { total: 2, ok: 2, fallos: 0 })
  assert.equal(textoAvisoHumo(r), null)
})

test('resumen: cuenta la prueba más reciente de cada pareja y trata lo no terminado como fallo', () => {
  const r = resumirHumo([f('allianz', 'auto', 'ok'), f('allianz', 'auto', 'error_definitivo', 'portal', 'viejo'), f('mapfre', 'moto', 'pendiente'), f('mapfre', 'auto', 'en_curso')])
  assert.equal(r.total, 3)
  assert.equal(r.ok, 1)
  assert.deepEqual(r.fallos.map((x) => `${x.compania}/${x.ramo}`), ['mapfre/moto', 'mapfre/auto'])
  assert.match(r.fallos[0].motivo, /no llegó a terminar/)
})

test('aviso: UN solo mensaje con la lista de las que fallan y el motivo corto (compañía + ramos), todo escapado', () => {
  const r = resumirHumo([
    f('allianz', 'comunidades', 'ok'),
    f('allianz', 'auto', 'error_definitivo', 'portal', 'humo (menú): «Nueva Alta» <b>no aparece</b>'),
    f('allianz', 'moto', 'error_definitivo', 'portal', 'humo (menú): «Nueva Alta» <b>no aparece</b>'),
    f('mapfre', 'auto', 'error_definitivo', 'credenciales', 'credenciales_rechazadas: Mapfre: el portal rechaza la contraseña'),
  ])
  const t = textoAvisoHumo(r)!
  assert.match(t, /fallan 3 de 4/)
  assert.equal(t.split('\n').filter((l) => l.startsWith('•')).length, 2, 'una línea por compañía y motivo')
  assert.match(t, /• <b>Allianz<\/b> \(auto, moto\): humo \(menú\): «Nueva Alta» &lt;b&gt;no aparece&lt;\/b&gt;/)
  assert.match(t, /• <b>Mapfre<\/b> \(auto\): credenciales_rechazadas/)
  assert.ok(!/<b>no aparece/.test(t), 'el HTML del portal no pasa sin escapar')
})

test('aviso: un humo omitido por credenciales de otra pareja solo se lista si su compañía no tiene ya otro fallo', () => {
  const omitido = f('allianz', 'moto', 'cancelado', null, MENSAJE_HUMO_OMITIDO_CREDENCIALES)
  const con = resumirHumo([f('allianz', 'auto', 'error_definitivo', 'credenciales', 'credenciales_rechazadas: Allianz'), omitido])
  assert.deepEqual(con.fallos.map((x) => x.ramo), ['auto'])
  const solo = resumirHumo([omitido])
  assert.equal(solo.fallos.length, 1)
  assert.match(solo.fallos[0].motivo, /no se probó/)
})

test('aviso: tope de líneas', () => {
  const filas = Array.from({ length: 30 }, (_, i) => f(`compania${i}`, 'auto', 'error_definitivo', 'portal', 'x'))
  const t = textoAvisoHumo(resumirHumo(filas))!
  assert.equal(t.split('\n').filter((l) => l.startsWith('•')).length, MAX_LINEAS_AVISO_HUMO)
  assert.match(t, /… y 15 más/)
})

test('deduplicación: un humo ni bloquea un trabajo real ni es bloqueado por él', () => {
  const ahora = new Date('2026-10-16T01:20:00Z')
  const vivo = { estado: 'pendiente', leaseHasta: null, intentos: 0 }
  assert.equal(bloqueaDuplicado({ ...vivo, modo: 'tarificar' }, ahora, 2), true, 'control: un pendiente real sí bloquea')
  assert.equal(bloqueaDuplicado({ ...vivo, modo: 'humo' }, ahora, 2), false)
  assert.match(leer('lib/tarificador.ts'), /coalesce\(to_jsonb\(t\)->>'modo', 'tarificar'\) not in \('exploracion', 'humo'\)/, 'la consulta de duplicados excluye el humo')
})

test('SQL e inserción: un humo vivo por COMPAÑÍA (índice y consulta de encolar)', () => {
  assert.match(leer('prisma/sql/2026-10-15d_tarificador_humo.sql'), /idx_trabajo_humo_vivo ON seguros\.tarificacion_trabajos \(correduria_id, compania\)\s+WHERE modo = 'humo'/)
  const h = leer('lib/tarificador-humo.ts')
  assert.match(h, /x\.compania = \$\{p\.compania\}\n\s+and to_jsonb\(x\)->>'modo'/, 'el not exists de encolar mira la compañía, no la pareja')
})

test('cola: el humo solo se sirve a un worker que lo declara y solo se reclama con su interruptor', () => {
  assert.equal(modoParaWorker('humo', ['tarificar', 'emision']), null)
  assert.equal(modoParaWorker('humo', ['tarificar', 'humo']), 'humo')
  assert.deepEqual(modosReclamables({}), ['tarificar', 'emision'])
  assert.deepEqual(modosReclamables({ TARIFICADOR_HUMO_ACTIVO: '1' }), ['tarificar', 'emision', 'humo'])
  assert.deepEqual(modosReclamables({ TARIFICADOR_HUMO_ACTIVO: '1', TARIFICADOR_EXPLORADOR_ACTIVO: '1' }).sort(), ['emision', 'exploracion', 'humo', 'tarificar'])
})

test('el humo no cuenta como tarificación: estadísticas, bandeja, panel y avisos lo dejan fuera', () => {
  const est = leer('lib/tarificador-estadisticas.ts')
  const filtros = est.match(/coalesce\(to_jsonb\(t\)->>'modo', 'tarificar'\) = 'tarificar'/g) ?? []
  assert.equal(filtros.length, 3, 'las tres consultas de estadísticas filtran modo = tarificar (el humo queda fuera de éxitos y fallos)')
  assert.ok(!/humo/.test(est.replace(/\/\/.*$/gm, '')), 'estadísticas no trata el humo como un modo más: lo excluye por NO ser tarificar')
  for (const [fichero, n] of [['lib/tarificador-bandeja.ts', 3], ['lib/tarificador-ops.ts', 2], ['lib/tarificador-verificacion.ts', 1]] as const) {
    const veces = (leer(fichero).match(/not in \('exploracion', 'humo'\)/g) ?? []).length
    assert.equal(veces, n, `${fichero}: el filtro «no es exploración ni humo» tiene que estar en ${n} consulta(s)`)
  }
})

test('cableado de la cola: resultado «humo», fallo sin reintento, pausa por credenciales y sin evidencia', () => {
  const t = leer('lib/tarificador.ts')
  assert.match(t, /r\.tipo === 'humo'/)
  assert.match(t, /estadoTrasFalloHumo\(\)/)
  assert.match(t, /humoPideParar\(error\.tipo\)/)
  // evaluarCorte (tarificar) y atasco no corren para el humo.
  assert.match(t, /!deEmision && !deExploracion && !deHumo\) await evaluarCorte/)
  assert.match(t, /const atasco = !deEmision && !deExploracion && !deHumo/)
  // El NIF y los datos del tomador (Mapfre) no se inyectan a un humo: no hay cliente.
  assert.match(t, /modo !== 'exploracion' && modo !== 'humo' && necesitaNifTomador/)
  assert.match(t, /modo !== 'exploracion' && modo !== 'humo' && necesitaDatosTomador/)
})
