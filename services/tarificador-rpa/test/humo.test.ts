// Cepos de la PRUEBA NOCTURNA DE HUMO (15/10/2026, src/humo.ts). Sin navegador ni red: las decisiones puras y la forma del fichero.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { MODOS_SOPORTADOS } from '../src/api.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { HUMO_COMPANIAS_SOPORTADAS, HUMO_VERSION, PRUEBAS_HUMO, claveHumo, decidirHumo, mensajeFalloHumo, pruebaDeHumo, ramosConBotDe } from '../src/humo.ts'

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
  assert.equal(menus.length, 3) // allianz, mapfre, generali (18/10/2026)
  for (const m of menus) assert.ok(!/ctx/.test(m), `${m}: el menú no recibe el contexto (no puede pulsar)`)
  assert.equal((CODIGO.match(/waitFor\(\{ state: 'visible'/g) ?? []).length, 1)
  assert.match(CODIGO, /localizar\(page, \['tab'\], PESTANA_NUEVA_PRODUCCION/)
  // Lo que un adaptador usaría para tarificar está PROHIBIDO en este contexto.
  for (const n of ['adjuntarPdf', 'elegirOpcion', 'avanzarATarificar', 'abrirProyecto']) assert.match(CODIGO, new RegExp(`${n}: prohibido\\('${n}'\\)`), `${n} tiene que lanzar`)
  // Sin riesgo: no lee ni valida datos de cliente; sin sesión previa; sin tracing; sin disco.
  assert.ok(!/trabajo\.riesgo|prepararTrabajo|validarRiesgo|storageState|tracing|from ['"](node:)?fs/.test(CODIGO), 'toca riesgo, sesión, tracing o disco')
  assert.match(CODIGO, /sesionReutilizada: false/)
})
