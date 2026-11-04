import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  avisoActivo, avisoVencimientoDisponible, claveAviso, configAviso, diasHasta, enVentana, fechaEs, motivoOmision, movilParaMeta,
  parametrosPlantilla, primerNombre, rangoVentana, seleccionar, textoRenderizado, textoTelegramAviso, type Candidato,
} from './aviso-vencimiento-reglas.ts'
import { cuerpoPlantilla, enviarPlantilla, limpiarParametro } from '../whatsapp-salida/plantilla.ts'

const HOY = '2026-11-04'
const ENV_OK = { ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO: '1', WHATSAPP_PLANTILLA_VENCIMIENTO: 'aviso_vencimiento_poliza' }

const base = (o: Partial<Candidato> = {}): Candidato => ({
  origen: 'poliza', id: 'p1', clienteId: 'c1', conversacionId: 'v1', nombre: 'MARÍA LÓPEZ', tipo: 'auto', vencIso: '2027-01-03',
  telefono: '600123456', candidatos: 1, conversacionesFicha: 1, optOut: false, estadoConversacion: 'abierta', iniciadaPorAlberto: true, ...o,
})
const ctx = (o: Partial<Parameters<typeof seleccionar>[1]> = {}) => ({ hoyIso: HOY, yaAvisadas: new Set<string>(), clientesRecientes: new Set<string>(), restanteHoy: 10, ...o })

test('apagado por defecto y exige plantilla bien escrita para poder prometer avisos', () => {
  assert.equal(avisoActivo({}), false)
  assert.equal(avisoActivo({ ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO: 'true' }), false)
  assert.equal(avisoVencimientoDisponible({}), false)
  assert.equal(avisoVencimientoDisponible({ ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO: '1' }), false, 'sin plantilla no se puede prometer')
  assert.equal(avisoVencimientoDisponible({ ...ENV_OK, WHATSAPP_PLANTILLA_VENCIMIENTO: 'Mal Nombre' }), false)
  assert.equal(avisoVencimientoDisponible(ENV_OK), true)
  assert.equal(avisoVencimientoDisponible({ WHATSAPP_PLANTILLA_VENCIMIENTO: 'aviso_vencimiento_poliza' }), false, 'plantilla sin activar')
})

test('config: idioma y tope con valores por defecto y sin adivinar los malos', () => {
  assert.deepEqual(configAviso(ENV_OK), { plantilla: 'aviso_vencimiento_poliza', idioma: 'es', tope: 15 })
  assert.equal(configAviso({ ...ENV_OK, WHATSAPP_AVISO_VENCIMIENTO_TOPE: '0' }), null)
  assert.equal(configAviso({ ...ENV_OK, WHATSAPP_AVISO_VENCIMIENTO_TOPE: 'mucho' }), null)
  assert.equal(configAviso({ ...ENV_OK, WHATSAPP_PLANTILLA_VENCIMIENTO_IDIOMA: 'español!' }), null)
  assert.equal(configAviso({ ...ENV_OK, WHATSAPP_PLANTILLA_VENCIMIENTO_IDIOMA: 'es_ES', WHATSAPP_AVISO_VENCIMIENTO_TOPE: '40' })?.tope, 40)
})

test('ventana: 60 días antes, con una semana de recuperación; fechas inyectadas', () => {
  assert.equal(diasHasta('2027-01-03', HOY), 60)
  assert.equal(diasHasta(null, HOY), null)
  assert.equal(diasHasta('03/01/2027', HOY), null)
  assert.equal(enVentana(60), true)
  assert.equal(enVentana(54), true)
  assert.equal(enVentana(53), false)
  assert.equal(enVentana(61), false)
  assert.equal(enVentana(-3), false, 'una vencida no se avisa')
  assert.equal(enVentana(null), false)
  assert.deepEqual(rangoVentana(HOY), { desde: '2026-12-28', hasta: '2027-01-03' })
})

test('parámetros de la plantilla en español: nombre de pila, ramo, fecha dd/mm/aaaa', () => {
  assert.equal(fechaEs('2027-01-03'), '03/01/2027')
  assert.equal(primerNombre('MARÍA LÓPEZ'), 'María')
  assert.equal(primerNombre('  '), 'cliente')
  assert.equal(primerNombre('X'), 'cliente')
  assert.equal(primerNombre('Ana\nMaría'), 'Ana')
  assert.deepEqual(parametrosPlantilla({ nombre: 'MARÍA LÓPEZ', tipo: 'auto', vencIso: '2027-01-03' }), ['María', 'coche', '03/01/2027'])
  assert.deepEqual(parametrosPlantilla({ nombre: null, tipo: 'raro', vencIso: '2027-01-03' }), ['cliente', 'seguro', '03/01/2027'])
  assert.match(textoRenderizado(['María', 'coche', '03/01/2027']), /Hola María.*seguro de coche vence el 03\/01\/2027/)
})

test('móvil: solo móviles; fijo español y basura no pasan', () => {
  assert.equal(movilParaMeta('600123456'), '34600123456')
  assert.equal(movilParaMeta('+34 700 123 456'), '34700123456')
  assert.equal(movilParaMeta('34600123456'), '34600123456')
  assert.equal(movilParaMeta('954123456'), null, 'fijo')
  assert.equal(movilParaMeta('+34954123456'), null)
  assert.equal(movilParaMeta('123'), null)
  assert.equal(movilParaMeta(null), null)
  assert.equal(movilParaMeta('+447911123456'), '447911123456')
})

test('cada filtro deja fuera con su motivo', () => {
  assert.equal(motivoOmision(base(), HOY), null)
  assert.equal(motivoOmision(base({ vencIso: '2026-12-01' }), HOY), 'fuera_de_ventana')
  assert.equal(motivoOmision(base({ optOut: true }), HOY), 'opt_out')
  assert.equal(motivoOmision(base({ candidatos: 2 }), HOY), 'ficha_no_unica')
  assert.equal(motivoOmision(base({ candidatos: null }), HOY), 'ficha_no_unica', 'no se sabe ≠ única')
  assert.equal(motivoOmision(base({ conversacionesFicha: 2 }), HOY), 'ficha_no_unica')
  assert.equal(motivoOmision(base({ telefono: null }), HOY), 'sin_movil')
  assert.equal(motivoOmision(base({ telefono: '954123456' }), HOY), 'sin_movil')
  assert.equal(motivoOmision(base({ iniciadaPorAlberto: false }), HOY), 'sin_conversacion_previa')
  assert.equal(motivoOmision(base({ estadoConversacion: 'descartada_personal' }), HOY), 'sin_conversacion_previa')
})

test('idempotencia: ya avisada, cliente reciente y un solo aviso por cliente', () => {
  const clave = claveAviso('poliza', 'p1', '2027-01-03')
  assert.equal(clave, 'poliza:p1:2027-01-03')
  assert.equal(seleccionar([base()], ctx({ yaAvisadas: new Set([clave]) })).enviar.length, 0)
  assert.equal(seleccionar([base()], ctx({ yaAvisadas: new Set([clave]) })).omitidos.ya_avisada, 1)
  assert.equal(seleccionar([base()], ctx({ clientesRecientes: new Set(['c1']) })).omitidos.cliente_reciente, 1)
  // Mismo vencimiento de OTRA póliza del mismo cliente: va una hoy, la otra después.
  const dos = seleccionar([base(), base({ id: 'p2', tipo: 'hogar' })], ctx())
  assert.equal(dos.enviar.length, 1)
  assert.equal(dos.omitidos.cliente_repetido, 1)
  // Vencimiento distinto de la misma póliza (renovada) = clave distinta.
  assert.equal(seleccionar([base({ vencIso: '2027-01-02' })], ctx({ yaAvisadas: new Set([clave]) })).enviar.length, 1)
})

test('tope diario: manda lo más urgente primero y cuenta el resto', () => {
  const cs = [base({ id: 'a', clienteId: 'c1', vencIso: '2027-01-03' }), base({ id: 'b', clienteId: 'c2', vencIso: '2026-12-30' }), base({ id: 'c', clienteId: 'c3', vencIso: '2027-01-01' })]
  const r = seleccionar(cs, ctx({ restanteHoy: 2 }))
  assert.deepEqual(r.enviar.map((c) => c.id), ['b', 'c'])
  assert.equal(r.omitidos.tope, 1)
  assert.equal(seleccionar(cs, ctx({ restanteHoy: 0 })).enviar.length, 0)
})

test('Telegram: sin teléfono ni texto del cliente, nombre de pila y fechas en español', () => {
  const t = textoTelegramAviso({ hoyIso: HOY, soloContar: false, candidatas: 5, fallidos: 1, omitidos: { tope: 2, fuera_de_ventana: 9 }, enviados: [{ nombre: 'MARÍA <LÓPEZ>', tipo: 'auto', vencIso: '2027-01-03' }] })
  assert.match(t, /04\/11\/2026/)
  assert.match(t, /María · coche · vence 03\/01\/2027/)
  assert.match(t, /fallidos: 1/)
  assert.match(t, /2 tope diario/)
  assert.doesNotMatch(t, /fuera de ventana|600|LÓPEZ|<LÓPEZ>/)
  assert.match(textoTelegramAviso({ hoyIso: HOY, soloContar: true, candidatas: 0, fallidos: 0, omitidos: {}, enviados: [] }), /ensayo/)
})

// ── Envío (fetch falso) ─────────────────────────────────────────────────────────
const ENTRADA = { version: 'v24.0', phoneNumberId: '123456789', token: 'TOKEN_SECRETO_1234', to: '34600123456', plantilla: 'aviso_vencimiento_poliza', idioma: 'es', parametros: ['María', 'coche', '03/01/2027'] }
const respuesta = (status: number, cuerpo: unknown) => async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

test('plantilla: cuerpo exacto de Meta, un solo POST y wamid devuelto', async () => {
  const visto: { url: string; init?: RequestInit }[] = []
  const r = await enviarPlantilla({ ...ENTRADA, fetch: async (url, init) => { visto.push({ url, init }); return respuesta(200, { messages: [{ id: 'wamid.ABC123' }] })() } })
  assert.deepEqual(r, { ok: true, wamid: 'wamid.ABC123' })
  assert.equal(visto.length, 1)
  assert.equal(visto[0].url, 'https://graph.facebook.com/v24.0/123456789/messages')
  assert.equal(visto[0].init?.method, 'POST')
  const cuerpo = JSON.parse(String(visto[0].init?.body)) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(JSON.stringify(cuerpo), JSON.stringify(cuerpoPlantilla(ENTRADA)))
  assert.equal(cuerpo.type, 'template')
  assert.deepEqual(cuerpo.template.language, { code: 'es' })
  assert.deepEqual(cuerpo.template.components[0].parameters.map((p: { text: string }) => p.text), ['María', 'coche', '03/01/2027'])
})

test('plantilla: errores 4xx son definitivos, red/5xx/200 raro son ambiguos, y el token no sale en el error', async () => {
  const e4 = await enviarPlantilla({ ...ENTRADA, fetch: respuesta(400, { error: { code: 132000, message: 'Number of parameters does not match' } }) })
  assert.deepEqual(e4, { ok: false, http: 400, codigo: 132000, mensaje: 'Number of parameters does not match', definitivo: true })
  const e5 = await enviarPlantilla({ ...ENTRADA, fetch: respuesta(503, {}) })
  assert.equal(e5.ok === false && e5.definitivo, false)
  const red = await enviarPlantilla({ ...ENTRADA, fetch: async () => { throw new Error('TOKEN_SECRETO_1234 caído') } })
  assert.deepEqual(red, { ok: false, http: 0, codigo: null, mensaje: 'red', definitivo: false })
  const raro = await enviarPlantilla({ ...ENTRADA, fetch: respuesta(200, { nada: 1 }) })
  assert.equal(raro.ok === false && raro.definitivo, false)
  for (const r of [e4, e5, red, raro]) assert.doesNotMatch(JSON.stringify(r), /TOKEN_SECRETO/)
})

test('plantilla: entradas inválidas no llegan a la red; parámetros sin saltos de línea', async () => {
  let llamadas = 0
  const f = async () => { llamadas++; return respuesta(200, {})() }
  for (const mala of [{ phoneNumberId: 'abc' }, { to: '+34600123456' }, { plantilla: 'Con Espacios' }, { idioma: 'español' }]) {
    const r = await enviarPlantilla({ ...ENTRADA, ...mala, fetch: f })
    assert.equal(r.ok, false)
  }
  assert.equal(llamadas, 0)
  assert.equal(limpiarParametro('a\nb\t\tc    d'), 'a b c d')
})

// ── Cepos de código ─────────────────────────────────────────────────────────────
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'generated') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) ficheros(p, salida)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) salida.push(p)
  }
  return salida
}

test('CEPO: solo lib/whatsapp-salida/{plantilla,texto}.ts envían a Meta (`/messages`); lib/whatsapp sigue sin hablar con Graph', () => {
  const conEnvio = [...ficheros(join(RAIZ, 'lib')), ...ficheros(join(RAIZ, 'app'))]
    .filter((f) => /\/messages\b/.test(sinComentarios(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(RAIZ.length))
  // `lib/whatsapp-salida/texto.ts` es el enviador de TEXTO de la respuesta automática (otro encargo): no es de este aviso.
  assert.ok(conEnvio.includes('lib/whatsapp-salida/plantilla.ts'))
  assert.deepEqual(conEnvio.filter((f) => f !== 'lib/whatsapp-salida/plantilla.ts' && f !== 'lib/whatsapp-salida/texto.ts'), [], 'ningún otro fichero envía')
  const aviso = sinComentarios(readFileSync(new URL('./aviso-vencimiento.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(aviso, /texto\.ts|crearEnviador|enviarTexto|graph\.facebook|\/messages/, 'el aviso solo manda PLANTILLAS, por plantilla.ts')
})

test('CEPO: ni plantilla.ts ni el aviso loguean token o teléfono, y el aviso solo escribe en su tabla y en mensajes', () => {
  const sal = sinComentarios(readFileSync(new URL('../whatsapp-salida/plantilla.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(sal, /console\./)
  const av = sinComentarios(readFileSync(new URL('./aviso-vencimiento.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(av, /console\.\w+\([^)]*(token|telefono|to\b)/i)
  const escrituras = [...av.matchAll(/(?:insert into|update|delete from)\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
  assert.deepEqual([...new Set(escrituras)].sort(), ['mensajes', 'whatsapp_avisos_vencimiento'])
  assert.match(av, /correduria_id/)
  assert.match(av, /on conflict \(correduria_id, clave\) do nothing/)
})
