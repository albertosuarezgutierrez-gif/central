// Cepos de la PRUEBA NOCTURNA DE HUMO (15/10/2026, src/humo.ts). Sin navegador ni red: las decisiones puras y la forma del fichero.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { MODOS_SOPORTADOS } from '../src/api.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { HUMO_COMPANIAS_SOPORTADAS, hayMenuNegocio, HUMO_VERSION, HumoRequiereSms, PRUEBAS_HUMO, claveHumo, decidirHumo, humoRequiereSms, mensajeFalloHumo, motivoOmitidoSms, pruebaDeHumo, ramosConBotDe } from '../src/humo.ts'
import { ErrorVerificacionHumana } from '../src/errores.ts'
import { leerDispositivo } from '../src/sesion-manual.ts'
import { sellarSesion } from '../src/boveda-sesion.ts'
import { randomBytes } from 'node:crypto'

const SRC = readFileSync(join(import.meta.dirname, '../src/humo.ts'), 'utf8')
const CODIGO = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('claveHumo normaliza compañía y ramo', () => {
  assert.equal(claveHumo(' Allianz ', 'Auto'), 'allianz/auto')
  assert.equal(claveHumo('MAPFRE', 'moto'), 'mapfre/moto')
})

test('pruebaDeHumo: las parejas conocidas la tienen y lo desconocido (incluidas claves de Object.prototype) no', () => {
  assert.ok(pruebaDeHumo('allianz', 'comunidades'))
  assert.ok(pruebaDeHumo('Mapfre', 'auto'))
  assert.equal(pruebaDeHumo('zurich', 'auto'), null)
  assert.equal(pruebaDeHumo('__proto__', 'constructor'), null)
  assert.equal(pruebaDeHumo('allianz', 'toString'), null)
})

const REG = ['allianz::auto', 'allianz::comunidades', 'mapfre::moto', 'mapfre::auto']

test('ramosConBotDe: solo ramos con adaptador registrado Y prueba, en orden estable', () => {
  assert.deepEqual(ramosConBotDe('Allianz', REG), ['auto', 'comunidades'])
  assert.deepEqual(ramosConBotDe('mapfre', REG), ['auto', 'moto'])
  assert.deepEqual(ramosConBotDe('occident', [...REG, 'occident::hogar']), [], 'registrado pero sin prueba: no cuenta')
  assert.deepEqual(ramosConBotDe('zurich', REG), [])
})

test('decidirHumo: el WORKER elige el ramo (el pedido si tiene bot activo; si no, el primero); sin bot activo se OMITE', () => {
  const sop = new Set(['allianz', 'mapfre'])
  assert.deepEqual(decidirHumo('mapfre', 'moto', REG, sop), { accion: 'probar', ramo: 'moto', ramosConBot: ['auto', 'moto'] })
  const sinBotPedido = decidirHumo('allianz', 'hogar', REG, sop)
  assert.deepEqual(sinBotPedido, { accion: 'probar', ramo: 'auto', ramosConBot: ['auto', 'comunidades'] }, 'allianz/hogar no tiene bot: prueba otro ramo y lo dice')
  const occ = decidirHumo('occident', 'hogar', REG, sop)
  assert.equal(occ.accion, 'omitir')
  assert.deepEqual(occ.ramosConBot, [])
  assert.equal(decidirHumo('allianz', 'auto', REG, new Set(['mapfre'])).accion, 'omitir', 'compañía fuera de la constante')
})

test('HUMO_COMPANIAS_SOPORTADAS sale de los adaptadores registrados (no incluye occident, que no está registrado)', () => {
  assert.deepEqual([...HUMO_COMPANIAS_SOPORTADAS].sort(), [...new Set(adaptadores.claves().map((k) => k.split('::')[0]))].sort())
  assert.ok(HUMO_COMPANIAS_SOPORTADAS.has('allianz') && HUMO_COMPANIAS_SOPORTADAS.has('mapfre'))
  assert.ok(!HUMO_COMPANIAS_SOPORTADAS.has('occident'))
})

test('mensajeFalloHumo: fase delante, redactado, una línea y ≤300', () => {
  const m = mensajeFalloHumo('login', 'no aparece   «Mediador»\n  tras el login secreto123', (t) => t.replace('secreto123', '[REDACTADO]'))
  assert.equal(m, 'humo (login): no aparece «Mediador» tras el login [REDACTADO]')
  assert.equal(mensajeFalloHumo('menú', 'x'.repeat(1000)).length, 300)
})

test('todo adaptador registrado en la imagen tiene su prueba, con SU credencial', () => {
  const claves = adaptadores.claves()
  assert.ok(claves.length >= 3, 'el registro no está vacío')
  for (const k of claves) {
    const [compania, ramo] = k.split('::')
    const prueba = pruebaDeHumo(compania, ramo)
    assert.ok(prueba, `${k} está registrado y no tiene prueba de humo (src/humo.ts)`)
    assert.equal(prueba.credencial, adaptadores.obtener(compania, ramo)!.credencial, `${k}: la prueba usa otra credencial que el adaptador`)
  }
})

test('cada prueba declara credencial, login y menú', () => {
  for (const [k, p] of Object.entries(PRUEBAS_HUMO)) {
    assert.match(p.credencial, /^[A-Z0-9_]+$/, k)
    assert.equal(typeof p.login, 'function', k)
    assert.equal(typeof p.menu, 'function', k)
  }
})

test('la imagen declara el modo «humo» (si no, asegura no le sirve el trabajo)', () => {
  assert.ok((MODOS_SOPORTADOS as readonly string[]).includes('humo'))
  assert.match(HUMO_VERSION, /^\d+\.\d+\.\d+$/)
})

test('humo.ts: solo login y entrada. Nada de rellenar, avanzar, proyecto, guardado, exploración ni emisión', () => {
  // Las puertas guardadas que NO son de entrada: ni importadas ni nombradas.
  assert.ok(!/pulsarEmision|pulsarAvance|pulsarProyecto|pulsarGuardado|pulsarExploracion|pulsarContinuar|marcarOpcion|elegirTomador|confirmarVehiculo/.test(CODIGO), 'nombra una puerta de avance/guardado/emisión')
  // Ni escribe ni actúa sobre la página por su cuenta (los login de los adaptadores sí rellenan usuario y contraseña, no este fichero).
  assert.ok(!/\.(click|dblclick|tap|fill|type|press|check|setChecked|selectOption|dispatchEvent|evaluate)\s*\(/.test(CODIGO), 'actúa sobre la página directamente')
  // Los clics, solo por los guardas: ctx.pulsar = pulsar(boton, guard) y el enlace de entrada exacto.
  assert.match(CODIGO, /pulsar: async \(boton\) => \{\s*await ctx\.pausaAccion\(\)\s*await pulsar\(boton, guard\)\s*\}/)
  assert.ok(!/pulsarEnlaceEntrada|abrirNuevaAlta|abrirTarificacion|abrirComunidades|abrirFormulario/.test(CODIGO), 'la entrada no se abre ni se pulsa: solo se comprueba que el menú es visible')
  // El menú se comprueba VISIBLE, nunca pulsado: ninguna prueba recibe `ctx.pulsar` en su función de menú.
  const menus = CODIGO.match(/async function menu\w+\([^)]*\)/g) ?? []
  assert.equal(menus.length, 3) // allianz, mapfre, generali (18/10/2026; generali recibe el guard para la puerta del mediador, 19/10/2026)
  for (const m of menus) assert.ok(!/ctx/.test(m), `${m}: el menú no recibe el contexto (no puede pulsar)`)
  assert.equal((CODIGO.match(/waitFor\(\{ state: 'visible'/g) ?? []).length, 1)
  assert.match(CODIGO, /localizar\(page, \['tab'\], PESTANA_NUEVA_PRODUCCION/)
  // Lo que un adaptador usaría para tarificar está PROHIBIDO en este contexto.
  for (const n of ['adjuntarPdf', 'elegirOpcion', 'avanzarATarificar', 'abrirProyecto']) assert.match(CODIGO, new RegExp(`${n}: prohibido\\('${n}'\\)`), `${n} tiene que lanzar`)
  // Sin riesgo: no lee ni valida datos de cliente; sin sesión previa; sin tracing; sin disco.
  assert.ok(!/trabajo\.riesgo|prepararTrabajo|validarRiesgo|tracing|from ['"](node:)?fs/.test(CODIGO), 'toca riesgo, tracing o disco')
  // Sesión previa: SOLO el dispositivo de Okta leído de la bóveda (leerDispositivo, que nunca escribe ni borra).
  assert.deepEqual(CODIGO.match(/storageState[^,)}]*/g), ['storageState: dispositivo as never '])
  assert.ok(!/guardarNueva|refrescar|invalidar|\.borrar\(|\.guardar\(/.test(CODIGO), 'el humo no escribe en la bóveda')
  // SMS de Okta: ni se pide ni se envía ni se verifica de madrugada.
  assert.ok(!/pulsarEnviarSmsGenerali|verificarCodigoSmsGenerali|relevarCodigoSmsGenerali|puertoCodigoHttp/.test(CODIGO), 'el humo no releva el SMS')
  // Las únicas puertas guardadas tras el login: el botón del mediador y el «ENTRAR» de Generali (listas blancas del guard).
  assert.deepEqual([...new Set(CODIGO.match(/pulsar[A-Z]\w*/g) ?? [])].sort(), ['pulsarEntrarGenerali', 'pulsarMediadorGenerali'])
  assert.match(CODIGO, /sesionReutilizada: false/)
})

test('SMS de Okta en el humo: se OMITE («requiere SMS»), no es fallo ni credenciales ni aviso de verificación', () => {
  const OKTA = 'https://access.generali.es/signin/verify/okta/sms'
  assert.equal(humoRequiereSms(new HumoRequiereSms(), 'https://x.test/', false), true)
  assert.equal(humoRequiereSms(new ErrorVerificacionHumana('generali'), OKTA, false), true, 'el detector genérico en la pantalla del SMS → omitido')
  assert.equal(humoRequiereSms(new Error('tope'), OKTA, false), true)
  assert.equal(humoRequiereSms(new HumoRequiereSms(), OKTA, true), false, 'una violación del guard manda siempre')
  assert.equal(humoRequiereSms(new ErrorVerificacionHumana('allianz'), 'https://www.e-pacallianz.com/login', false), false, 'otra verificación sigue siendo la de siempre')
  const m = motivoOmitidoSms('ninguna')
  assert.match(m, /^requiere SMS: /)
  assert.match(m, /sin dispositivo guardado en la bóveda \(ninguna\)/)
  assert.ok(!/requiere_verificacion_humana/.test(m), 'no casa con el aviso de verificación de asegura')
  assert.ok(m.length <= 200)
  assert.match(motivoOmitidoSms('ok'), /el dispositivo guardado no evitó el SMS/)
  // El omitido lo manda el flujo antes que cualquier `error` (y el reclasificador de credenciales lo salta).
  assert.match(CODIGO, /if \(fallo instanceof HumoRequiereSms\) \{\s*const st = await enviarResultado\(cfg, \{ trabajoId: trabajo\.id, resultado: 'humo', omitido: motivoOmitidoSms/)
  assert.match(CODIGO, /if \(fallo && !\(fallo instanceof HumoRequiereSms\) && clasificar\(fallo\)\.tipo === 'portal'\)/)
  assert.match(CODIGO, /if \(esUrlOktaSmsGenerali\(page\.url\(\)\)\) throw new HumoRequiereSms\(\)\s*await exigirSinVerificacion/)
})

test('leerDispositivo (humo): SOLO lee; caducado o ilegible → sin estado y sin borrar; almacén caído → motivo sin datos', async () => {
  const clave = randomBytes(32)
  const estado = { cookies: [{ name: 'DT', value: 'x' }], origins: [] }
  const { token } = sellarSesion(estado, { compania: 'generali', clave, ahora: 1_000, maxMs: 10_000 })
  let escrituras = 0
  const alm = { leer: async () => token, guardar: async () => { escrituras++ }, borrar: async () => { escrituras++ } }
  assert.deepEqual(await leerDispositivo(alm, clave, 'generali', 2_000), { estado, motivo: 'ok' })
  assert.deepEqual(await leerDispositivo(alm, clave, 'generali', 99_999), { estado: null, motivo: 'caducada' })
  assert.deepEqual(await leerDispositivo({ leer: async () => null }, clave, 'generali'), { estado: null, motivo: 'ninguna' })
  assert.deepEqual(await leerDispositivo({ leer: async () => { throw new Error('almacén de sesión: leer respondió 503') } }, clave, 'generali'), { estado: null, motivo: 'almacen_leer_503' })
  assert.equal(escrituras, 0)
})

// 22/10/2026: en CorredorPortal.po «NEGOCIO» es un <a> sin href que puede estar plegado (no «visible»); basta con que esté en el DOM.
test('hayMenuNegocio: NEGOCIO presente en el DOM pero plegado (no visible) cuenta como menú presente', async () => {
  const marco = (enDom: number, visibles: number, desacoplado = false) => ({
    isDetached: () => desacoplado,
    getByText: () => ({ count: async () => enDom, filter: () => ({ count: async () => visibles }) }),
  })
  const pagina = (...m: ReturnType<typeof marco>[]) => ({ frames: () => m }) as never
  assert.equal(await hayMenuNegocio(pagina(marco(1, 0))), true)
  assert.equal(await hayMenuNegocio(pagina(marco(0, 0), marco(1, 0))), true)
  assert.equal(await hayMenuNegocio(pagina(marco(0, 0))), false)
  assert.equal(await hayMenuNegocio(pagina(marco(1, 1, true))), false)
})
