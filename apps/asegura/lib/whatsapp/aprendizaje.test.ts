// Aprendizaje y autonomía gradual de las propuestas de WhatsApp (spec 2026-11-04 § «Aprendizaje y autonomía»).
// Cada cepo se ha visto en ROJO rompiendo lo que protege (mutación de cada guarda, 04/11/2026) y vuelto a verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ACTOR_AUTONOMO,
  TIPOS_AUTONOMIZABLES,
  UMBRAL_POR_DEFECTO,
  autonomiaActiva,
  calcularRacha,
  casoParaIA,
  decidirAutonomia,
  elegirCasos,
  extractoRedactado,
  leerCorreccion,
  leerUmbral,
  palabrasClave,
  type CasoAprendido,
  type EventoRacha,
} from './aprendizaje-reglas.ts'
import {
  ACCIONES_WAP,
  CALLBACK_APLICAR,
  CALLBACK_DESCARTAR,
  CALLBACK_DESHACER,
  CALLBACK_MODIFICAR,
  CALLBACK_SILENCIAR,
  TIPOS_PROPUESTA,
  botonDeshacer,
  botonSilenciar,
  botonesPropuesta,
  leerCallbackWap,
  puedeDeshacer,
  validarResolucion,
} from './propuestas-reglas.ts'

const ID = '33333333-3333-4333-8333-333333333333'
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
const fuente = (f: string) => sinComentarios(readFileSync(new URL(f, import.meta.url), 'utf8'))

const t0 = Date.parse('2026-01-01T00:00:00Z')
const at = (min: number) => new Date(t0 + min * 60_000)
const HUMANO = 'humano:cuenta-alberto'
const aprobada = (min: number): EventoRacha => ({ resolucion: 'aplicada', autonoma: false, deshechaAt: null, resueltaAt: at(min), actor: HUMANO })
const aprobadas = (n: number, desde = 0) => Array.from({ length: n }, (_, i) => aprobada(desde + i))

// ── Umbral y racha ──────────────────────────────────────────────────────────────

test('racha: N aprobadas seguidas sin modificar = N', () => {
  assert.equal(calcularRacha([]), 0)
  assert.equal(calcularRacha(aprobadas(20)), 20)
})

test('umbral: con 19 aprobadas no es autónoma; con 20 sí (por defecto 20)', () => {
  assert.equal(UMBRAL_POR_DEFECTO, 20)
  const base = { flag: '1', umbral: undefined, tipo: 'fecha_cobro' }
  assert.deepEqual(decidirAutonomia({ ...base, racha: calcularRacha(aprobadas(19)) }), { autonoma: false, motivo: 'racha_corta' })
  assert.deepEqual(decidirAutonomia({ ...base, racha: calcularRacha(aprobadas(20)) }), { autonoma: true })
  assert.deepEqual(decidirAutonomia({ ...base, umbral: '25', racha: 24 }), { autonoma: false, motivo: 'racha_corta' })
  assert.deepEqual(decidirAutonomia({ ...base, umbral: '25', racha: 25 }), { autonoma: true })
})

test('umbral mal configurado → nunca autónomo (0, 1, negativo, texto); vacío → 20', () => {
  assert.equal(leerUmbral(''), 20)
  assert.equal(leerUmbral(undefined), 20)
  for (const v of ['0', '1', '4', '-3', 'veinte', '20.5', '1001']) {
    assert.equal(leerUmbral(v), null, v)
    assert.deepEqual(decidirAutonomia({ flag: '1', umbral: v, tipo: 'pagado', racha: 999 }), { autonoma: false, motivo: 'umbral_invalido' }, v)
  }
})

test('reset por DESCARTE: un ❌ corta la racha (lo anterior ya no cuenta)', () => {
  const ev = [...aprobadas(30), { resolucion: 'descartada', autonoma: false, deshechaAt: null, resueltaAt: at(100), actor: HUMANO } as EventoRacha, ...aprobadas(3, 200)]
  assert.equal(calcularRacha(ev), 3)
})

test('reset por MODIFICACIÓN: un ✏️ corta la racha', () => {
  const ev = [...aprobadas(30), { resolucion: 'modificada', autonoma: false, deshechaAt: null, resueltaAt: at(100), actor: HUMANO } as EventoRacha]
  assert.equal(calcularRacha(ev), 0)
})

test('reset por DESHACER: cuenta en la fecha del ↩️, no en la de la aplicación', () => {
  const autonomaDeshecha: EventoRacha = { resolucion: 'aplicada', autonoma: true, deshechaAt: at(500), resueltaAt: at(50), actor: ACTOR_AUTONOMO }
  // 30 aprobadas, una autónoma a los 50 min, 5 aprobadas más (100-104) y el ↩️ a los 500 → racha 0.
  assert.equal(calcularRacha([...aprobadas(30), autonomaDeshecha, ...aprobadas(5, 100)]), 0)
  // Tras el ↩️, vuelve a contar desde cero.
  assert.equal(calcularRacha([...aprobadas(30), autonomaDeshecha, ...aprobadas(2, 600)]), 2)
})

test('una autónoma NO deshecha ni suma ni corta (la autonomía no se alimenta a sí misma)', () => {
  const autonoma: EventoRacha = { resolucion: 'aplicada', autonoma: true, deshechaAt: null, resueltaAt: at(300), actor: ACTOR_AUTONOMO }
  assert.equal(calcularRacha([...aprobadas(20), autonoma, autonoma]), 20)
})

// ── Flag global ─────────────────────────────────────────────────────────────────

test('CEPO flag apagado ⇒ nunca autónomo, con cualquier racha y tipo', () => {
  for (const flag of [undefined, '', '0', 'true', 'si', ' 1x', 'TRUE']) {
    for (const tipo of TIPOS_AUTONOMIZABLES) {
      assert.deepEqual(decidirAutonomia({ flag, umbral: '5', tipo, racha: 10_000 }), { autonoma: false, motivo: 'flag_apagado' }, `${flag}/${tipo}`)
    }
  }
  assert.equal(autonomiaActiva('1'), true)
  assert.equal(autonomiaActiva(' 1 '), true)
})

test('CEPO aplicarSiAutonoma mira el flag ANTES de leer nada y solo aplica con decidirAutonomia', () => {
  const src = fuente('./propuestas.ts')
  const cuerpo = src.slice(src.indexOf('export async function aplicarSiAutonoma'), src.indexOf('export type ResultadoDeshacer'))
  const flag = cuerpo.indexOf('if (!autonomiaActiva(process.env[ENV_AUTONOMIA])) return false')
  assert.ok(flag > 0, 'el flag es la primera puerta')
  assert.ok(flag < cuerpo.indexOf('$queryRaw') && flag < cuerpo.indexOf('rachaDe('), 'apagado, no se lee nada')
  assert.ok(cuerpo.indexOf('if (!v.autonoma) return false') < cuerpo.indexOf('resolverPropuesta('), 'sin veredicto, no se aplica')
  assert.match(cuerpo, /resolverPropuesta\(correduriaId, id, 'aplicar', ACTOR_AUTONOMO, ahora, \{ autonoma: true \}\)/)
})

test('racha ilegible (tabla sin aplicar o error) → nunca autónomo', () => {
  assert.deepEqual(decidirAutonomia({ flag: '1', umbral: '5', tipo: 'pagado', racha: null }), { autonoma: false, motivo: 'racha_ilegible' })
  assert.deepEqual(decidirAutonomia({ flag: '1', umbral: '5', tipo: 'pagado', racha: -1 }), { autonoma: false, motivo: 'racha_ilegible' })
})

// ── RPA / terceros: NUNCA autónomo ─────────────────────────────────────────────

test('CEPO bots RPA / tarificar / enviar: nunca autónomos, con flag y racha a tope', () => {
  for (const tipo of ['tarificar', 'tarificar_bots', 'lanzar_bots', 'rpa', 'clp_tar', 'enviar_presupuesto', 'enviar_whatsapp', 'emitir', '']) {
    assert.deepEqual(decidirAutonomia({ flag: '1', umbral: '5', tipo, racha: 10_000 }), { autonoma: false, motivo: 'tipo_no_autonomizable' }, tipo)
  }
  // La lista blanca son EXACTAMENTE los tres tipos de propuesta (cartera propia, reversible).
  assert.deepEqual([...TIPOS_AUTONOMIZABLES].sort(), [...TIPOS_PROPUESTA].sort())
  for (const t of TIPOS_AUTONOMIZABLES) assert.doesNotMatch(t, /tarif|bot|rpa|envi|emit|avant|codeoscopic/i)
})

test('CEPO el camino autónomo no importa ni llama a bots, tarificación, Avant2 ni envíos', () => {
  const prohibido = /tarificador|tarificacion|codeoscopic|avant2|encolarTrabajo|lanzarBots|bots-rpa|graph\.ts|enviarMensaje|\/messages|core-email|sendMail|envio-presupuesto|enviarCorreo/i
  for (const f of ['./aprendizaje-reglas.ts', './aprendizaje.ts', './propuestas.ts', './propuestas-reglas.ts']) {
    const src = fuente(f)
    const imports = (src.match(/^\s*import[^\n]*$/gm) ?? []).join('\n')
    assert.doesNotMatch(imports, prohibido, `${f} importa algo que sale a terceros o lanza bots`)
    assert.doesNotMatch(src, /lanzarBots|encolarTrabajo|tarificar\(|\/insurances|tgSendDocument|whatsapp\.com|graph\.facebook/i, `${f} llama a algo prohibido`)
  }
  assert.equal(ACTOR_AUTONOMO.startsWith('agente:'), true)
})

// ── Deshacer: un uso, solo autónoma ───────────────────────────────────────────

test('deshacer: solo una aplicada SOLA, con previo, y una sola vez', () => {
  const base = { estado: 'aplicada', resultado: { autonoma: true, previo: { fechaPrometida: null } } }
  assert.deepEqual(puedeDeshacer(base), { ok: true })
  assert.equal(puedeDeshacer({ ...base, resultado: { ...base.resultado, deshecha_at: '2026-11-04T10:00:00Z' } }).ok, false)
  assert.deepEqual(puedeDeshacer({ ...base, resultado: { ...base.resultado, deshecha_at: '2026-11-04T10:00:00Z' } }), { ok: false, estado: 'ya_deshecha', status: 409 })
  assert.deepEqual(puedeDeshacer({ estado: 'aplicada', resultado: { previo: {} } }), { ok: false, estado: 'no_autonoma', status: 409 }, 'aplicada por una persona: no')
  assert.deepEqual(puedeDeshacer({ estado: 'pendiente', resultado: null }), { ok: false, estado: 'no_autonoma', status: 409 })
  assert.deepEqual(puedeDeshacer({ estado: 'aplicada', resultado: { autonoma: true } }), { ok: false, estado: 'sin_previo', status: 409 })
})

test('CEPO deshacer es de un solo uso en BD: reclama con UPDATE condicionado a «no deshecha» y autónoma', () => {
  const src = fuente('./propuestas.ts')
  const cuerpo = src.slice(src.indexOf('export async function deshacerPropuesta'), src.indexOf('async function revertir'))
  assert.match(cuerpo, /not \(resultado \? 'deshecha_at'\)/, 'la reclamación exige que no se haya deshecho antes')
  assert.match(cuerpo, /resultado->'autonoma' = 'true'::jsonb/, 'solo una aplicada sola')
  assert.match(cuerpo, /estado = 'aplicada'/)
  assert.ok(cuerpo.indexOf("jsonb_build_object('deshecha_at'") < cuerpo.indexOf('revertir('), 'se reclama ANTES de revertir')
})

test('CEPO deshacer y modificar: el endpoint exige actor HUMANO (titular), nunca agente ni sistema', () => {
  const src = sinComentarios(readFileSync(new URL('../../app/api/operador/whatsapp/propuesta/route.ts', import.meta.url), 'utf8'))
  const guarda = src.indexOf("(v.decision === 'modificar' || v.decision === 'deshacer') && actor.tipo !== 'humano'")
  assert.ok(guarda > 0, 'falta la guarda de actor humano')
  assert.ok(guarda < src.indexOf('deshacerPropuesta('), 'la guarda va ANTES de deshacer')
})

// ── ✏️ Corrección ────────────────────────────────────────────────────────────────

test('corrección: fecha en varios formatos, observación aparte, y fechas imposibles → null', () => {
  const hoy = '2026-11-04'
  assert.deepEqual(leerCorreccion('20/11/2026', 'fecha_cobro', hoy), { fecha: '2026-11-20', observacion: null })
  assert.deepEqual(leerCorreccion('2026-12-01', 'vencimiento', hoy), { fecha: '2026-12-01', observacion: null })
  assert.deepEqual(leerCorreccion('30/11, dice que a final de mes', 'fecha_cobro', hoy), { fecha: '2026-11-30', observacion: 'dice que a final de mes' })
  assert.deepEqual(leerCorreccion('3/2', 'vencimiento', hoy), { fecha: '2027-02-03', observacion: null }, 'sin año: la próxima')
  assert.deepEqual(leerCorreccion('15-12-27', 'vencimiento', hoy), { fecha: '2027-12-15', observacion: null })
  assert.deepEqual(leerCorreccion('llamarle antes', 'fecha_cobro', hoy), { fecha: null, observacion: 'llamarle antes' })
  assert.deepEqual(leerCorreccion('pagó por transferencia el 02/11', 'pagado', hoy), { fecha: null, observacion: 'pagó por transferencia el 02/11' })
  assert.equal(leerCorreccion('30/02/2027', 'fecha_cobro', hoy), null)
  assert.equal(leerCorreccion('   ', 'fecha_cobro', hoy), null)
  assert.equal(leerCorreccion('x'.repeat(501), 'pagado', hoy), null)
})

test('endpoint: modificar exige corrección; deshacer solo id', () => {
  assert.deepEqual(validarResolucion({ id: ID, decision: 'modificar', correccion: '20/11/2026' }), { ok: true, id: ID, decision: 'modificar', correccion: '20/11/2026' })
  assert.equal(validarResolucion({ id: ID, decision: 'modificar' }).ok, false)
  assert.equal(validarResolucion({ id: ID, decision: 'modificar', correccion: ' ' }).ok, false)
  assert.deepEqual(validarResolucion({ id: ID, decision: 'deshacer' }), { ok: true, id: ID, decision: 'deshacer' })
})

test('CEPO modificar reinicia la racha: resolverPropuesta registra «modificada» (no «aplicada»)', () => {
  const src = fuente('./propuestas.ts')
  assert.match(src, /await aprender\(decision === 'modificar' \? 'modificada' : 'aplicada'/)
  assert.match(src, /await aprender\('descartada', null\)/)
})

// ── Prefijos `wap_*` ──────────────────────────────────────────────────────────

test('CEPO prefijos wap_*: cinco acciones distintas, ≤64 bytes, ida y vuelta, y nada ajeno', () => {
  const callbacks = [CALLBACK_APLICAR, CALLBACK_DESCARTAR, CALLBACK_MODIFICAR, CALLBACK_DESHACER, CALLBACK_SILENCIAR]
  assert.equal(new Set(callbacks).size, 5, 'callbacks repetidos')
  assert.deepEqual(callbacks.map((c) => c.split('_')[1]), [...ACCIONES_WAP])
  for (const c of callbacks) assert.match(c, /^wap_[a-z]{2}$/)
  const todos = [...botonesPropuesta(ID), ...botonDeshacer(ID), ...botonSilenciar(ID)]
  assert.equal(new Set(todos.map((b) => b.callback)).size, 5)
  for (const b of todos) {
    assert.ok(Buffer.byteLength(b.callback) <= 64)
    const l = leerCallbackWap(b.callback)
    assert.ok(l && l.id === ID && (ACCIONES_WAP as readonly string[]).includes(l.accion), b.callback)
  }
  assert.equal(leerCallbackWap(`wap_xx:${ID}`), null)
  assert.equal(leerCallbackWap(`wap_un:${ID}:1`), null)
})

test('CEPO plataforma acepta EXACTAMENTE las acciones wap_* que emite asegura', () => {
  const tg = readFileSync(new URL('../../../plataforma/lib/correduria/whatsapp-propuesta-tg.ts', import.meta.url), 'utf8')
  const m = /export const ACCIONES_WAP = \[([^\]]*)\] as const/.exec(tg)
  assert.ok(m, 'plataforma no declara ACCIONES_WAP')
  const dePlataforma = m[1].split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean)
  assert.deepEqual(dePlataforma, [...ACCIONES_WAP])
})

// ── Contexto sin PII y casos parecidos ────────────────────────────────────────

test('extracto: redactado (DNI, IBAN, teléfono, email, nombre) y ≤300', () => {
  const e = extractoRedactado('Soy Marta Pérez, DNI 12345678Z, IBAN ES9121000418450200051332, móvil 612345678, marta@correo.es: os lo pago el 15', ['Marta Pérez'])
  assert.ok(e)
  assert.doesNotMatch(e!, /12345678Z|ES9121000418450200051332|612345678|marta@correo\.es|Marta|Pérez/)
  assert.ok(extractoRedactado('a'.repeat(1000))!.length <= 300)
  assert.equal(extractoRedactado(null), null)
})

const caso = (extracto: string, min: number, extra: Partial<CasoAprendido> = {}): CasoAprendido => ({
  tipo: 'fecha_cobro', origenSaliente: 'recibo_devuelto', extracto, resolucion: 'aplicada', autonoma: false, deshecha: false,
  propuesto: { fecha: '2026-11-15' }, final: { fecha: '2026-11-15' }, observacion: null, resueltaAt: at(min), ...extra,
})

test('casos parecidos: primero los que comparten palabras, con hueco para los más recientes', () => {
  assert.deepEqual(palabrasClave('Hola, [DNI] te lo pago a final de mes 2026'), ['final'])
  const casos = [
    caso('te lo pago a final de mes', 1, { resolucion: 'modificada', final: { fecha: '2026-11-30' } }),
    caso('ya está pagado por transferencia', 2, { tipo: 'pagado' }),
    caso('el seguro del coche vence en marzo', 3, { tipo: 'vencimiento', origenSaliente: 'recaptacion' }),
    caso('mándamelo otra vez al banco', 4),
  ]
  const elegidos = elegirCasos(casos, { extracto: 'os lo pago a final de este mes', origenSaliente: 'recibo_devuelto' }, 3, 2)
  assert.equal(elegidos[0].extracto, 'te lo pago a final de mes', 'el parecido va primero')
  assert.equal(elegidos.length, 3)
  assert.ok(elegidos.some((c) => c.extracto === 'mándamelo otra vez al banco'), 'reserva para lo reciente')
  const ia = casoParaIA(elegidos[0])
  assert.deepEqual(Object.keys(ia).sort(), ['decision', 'final', 'mensaje_cliente', 'observacion_corredor', 'origen_saliente', 'propuesto', 'tipo'])
  assert.equal(ia.decision, 'modificada')
  assert.equal(casoParaIA(caso('x', 9, { autonoma: true, deshecha: true })).decision, 'aplicada_sola_y_deshecha_por_el_corredor')
})

test('CEPO los casos entran al prompt solo con ficha única y póliza en vigor; null ≠ []', () => {
  const src = fuente('./analizar.ts')
  assert.match(src, /const casos = fichaUnica && enVigor === true \? await casosResueltos\(correduriaId\) : undefined/)
  assert.match(src, /casos_previos: casos === null \? null :/)
})
