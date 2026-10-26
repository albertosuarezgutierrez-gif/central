// Qué se ofrece al crear la hoja de la nevera (26/10/2026): todo lo que la persona VE en su bóveda,
// con su titular, y nada que no salga de `carteraDeIdentidad()`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { polizasQueEnsenaLaHoja } from '@central/module-seguros-portal'

import type { CarteraPortal, PolizaPortal, TitularPortal } from './cartera-lectura.ts'
import { elegiblesDeCartera } from './hojas-elegibles.ts'

const poliza = (id: string, extra: Partial<PolizaPortal> = {}): PolizaPortal =>
  ({
    id,
    compania: 'Allianz',
    ramo: 'auto',
    numeroPoliza: `N-${id}`,
    vigencia: 'vigente',
    bien: { cosa: `Coche ${id}`, ubicacion: null, ubicacionCifrada: false },
    ...extra,
  }) as unknown as PolizaPortal

const titular = (clienteId: string, nombre: string, polizas: PolizaPortal[], extra: Partial<TitularPortal> = {}): TitularPortal =>
  ({ clienteId, nombre, tipoPersona: 'juridica', nivel: 'completo', polizas, ...extra }) as TitularPortal

type Vista = Pick<CarteraPortal, 'propias' | 'autorizadas' | 'intervinientes'>

// Pilar: ninguna propia viva, y Global2 (ficha 2604512a) la autoriza con `ver_economico` a la ficha entera.
const pilar: Vista = {
  propias: [titular('pilar', 'Pilar Piña', [])],
  autorizadas: [
    titular('2604512a', 'GLOBAL2', [poliza('coche1'), poliza('coche2')], {
      autorizacion: { ids: ['aut-global2'], alcances: ['ver_economico'], caducaEn: null, partes: [] },
    }),
  ],
  intervinientes: [],
}

test('🚨 una póliza de una ficha AUTORIZADA se ofrece en la hoja, diciendo de quién es', () => {
  const e = elegiblesDeCartera(pilar)
  assert.deepEqual(
    e.map((o) => [o.id, o.titular, o.propia]),
    [
      ['coche1', 'GLOBAL2', false],
      ['coche2', 'GLOBAL2', false],
    ],
  )
  assert.equal(e[0]?.etiqueta, 'Allianz · Auto · Coche coche1', 'el bien identifica la póliza, no el nº')
})

test('🚨 revocada la autorización (el titular ya no está en la cartera), la hoja ya creada deja de enseñarla', () => {
  // `carteraDeIdentidad` deja de traer al titular en cuanto `revocado_en` se rellena: la hoja relee
  // en vivo, así que el id guardado en la selección no encuentra nada.
  const revocada: Vista = { ...pilar, autorizadas: [] }
  assert.deepEqual(elegiblesDeCartera(revocada), [])
  const enLaHoja = polizasQueEnsenaLaHoja(elegiblesDeCartera(revocada), { todas: false, polizaIds: ['coche1'] })
  assert.deepEqual(enLaHoja, [])
})

test('🚨 una autorización ACOTADA a una póliza no abre las demás del otorgante', () => {
  // Concesión con `poliza_id` = coche1: la cartera trae SOLO esa póliza bajo el titular.
  const acotada: Vista = {
    ...pilar,
    autorizadas: [
      titular('2604512a', 'GLOBAL2', [poliza('coche1')], {
        autorizacion: { ids: ['aut-suelta'], alcances: ['ver'], caducaEn: null, partes: [] },
      }),
    ],
  }
  const enLaHoja = polizasQueEnsenaLaHoja(elegiblesDeCartera(acotada), { todas: false, polizaIds: ['coche1', 'coche2'] })
  assert.deepEqual(enLaHoja.map((o) => o.id), ['coche1'])
})

test('🚨 la póliza de una ficha SIN relación nunca aparece, aunque su id llegue en la selección', () => {
  const enLaHoja = polizasQueEnsenaLaHoja(elegiblesDeCartera(pilar), { todas: false, polizaIds: ['de-un-desconocido'] })
  assert.deepEqual(enLaHoja, [])
})

test('«todas» = solo las PROPIAS: una autorización nueva no se cuela sola en un papel ya impreso', () => {
  const alberto: Vista = {
    propias: [titular('alberto', 'Alberto', [poliza('mio')], { tipoPersona: 'fisica' })],
    autorizadas: [titular('madre', 'Su madre', [poliza('de-la-madre')], { tipoPersona: 'fisica' })],
    intervinientes: [titular('hermano', 'Su hermano', [poliza('donde-figura')], { tipoPersona: 'fisica' })],
  }
  const e = elegiblesDeCartera(alberto)
  assert.deepEqual(e.map((o) => o.id), ['mio', 'de-la-madre', 'donde-figura'], 'se OFRECEN todas las que ve')
  assert.deepEqual(polizasQueEnsenaLaHoja(e, { todas: true }).map((o) => o.id), ['mio'])
  assert.deepEqual(
    polizasQueEnsenaLaHoja(e, { todas: false, polizaIds: ['de-la-madre', 'donde-figura'] }).map((o) => o.id),
    ['de-la-madre', 'donde-figura'],
  )
})

test('una póliza vencida no se ofrece por ninguna vía', () => {
  const v: Vista = { ...pilar, autorizadas: [titular('x', 'X', [poliza('vieja', { vigencia: 'no_vigente' })])] }
  assert.deepEqual(elegiblesDeCartera(v), [])
})

test('🚨 una póliza AÑADIDA a mano (oportunidad, no cartera) no puede colarse en la hoja', async () => {
  // 26/10/2026: a Pilar le salía en la hoja una «Generali» que había subido ella
  // (`portal_poliza_declarada`, sin vencimiento → pasaba el filtro de vigor). La hoja es solo
  // cartera viva: ni el selector, ni `crearHoja`, ni la página pública leen las añadidas.
  const { readFileSync } = await import('node:fs')
  const sinComentarios = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const lib = sinComentarios(readFileSync(new URL('./hojas.ts', import.meta.url), 'utf8'))
  const pagina = sinComentarios(readFileSync(new URL('../app/hoja/[token]/page.tsx', import.meta.url), 'utf8'))
  for (const [nombre, src] of [['lib/hojas.ts', lib], ['app/hoja/[token]/page.tsx', pagina]] as const) {
    assert.doesNotMatch(src, /portalPolizaDeclarada|declaradasDeIdentidad|declaradaEnVigorParaHoja/, `${nombre} vuelve a leer las añadidas`)
  }
  assert.doesNotMatch(lib, /polizaDeclaradaId: id\b/, 'crearHoja vuelve a insertar ids de pólizas añadidas')
})

test('🚨 una póliza de INMUEBLE se identifica por su dirección, nunca por el nº (Mi QR, 26/10/2026)', () => {
  const hogar = poliza('casa', {
    compania: 'Occident',
    ramo: 'hogar',
    numeroPoliza: '548969197',
    bien: { cosa: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla', ubicacionCifrada: false },
  } as Partial<PolizaPortal>)
  const e = elegiblesDeCartera({ propias: [titular('a', 'Alberto', [hogar])], autorizadas: [], intervinientes: [] })
  assert.equal(e[0]?.etiqueta, 'Occident · Hogar · Calle Socorro 24, 41003 Sevilla')
  assert.doesNotMatch(e[0]?.etiqueta ?? '', /548969197|nº/)
})

test('inmueble cuya dirección NO es visible (tercero persona física): cae a nº solo como último recurso, sin inventar', () => {
  const hogar = poliza('casa2', {
    compania: 'Occident',
    ramo: 'hogar',
    numeroPoliza: '548969197',
    bien: { cosa: null, ubicacion: null, ubicacionCifrada: false },
  } as Partial<PolizaPortal>)
  const e = elegiblesDeCartera({ propias: [], autorizadas: [titular('m', 'Su madre', [hogar], { tipoPersona: 'fisica' })], intervinientes: [] })
  assert.equal(e[0]?.etiqueta, 'Occident · Hogar · nº 548969197')
})
