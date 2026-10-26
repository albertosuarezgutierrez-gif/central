import test from 'node:test'
import assert from 'node:assert/strict'

import { ALCANCES_CONCEDIBLES } from './autorizacion.ts'
import { ALCANCE_FLOTA } from './flota.ts'
import { pestanasPortal } from './vista-portal.ts'
import {
  HECHOS_DESCONOCIDOS,
  contactosEnCuenta,
  contactosVisibles,
  entradasVisibles,
  esTitular,
  herramientasVisibles,
  type HechosMenu,
} from './menu-visible.ts'

// Un autorizado «puro»: solo tiene lo que otros le han dado (Consulta, Gestión o Total, con o sin `poliza_id`).
const AUTORIZADO: HechosMenu = {
  fichasPropias: 0,
  polizasAportadas: 0,
  patrimonio: 0,
  flota: 0,
  puedeConceder: false,
  porAceptar: 0,
}
// Un titular normal.
const TITULAR: HechosMenu = { ...AUTORIZADO, fichasPropias: 1, puedeConceder: true }

test('un autorizado puro ve Inicio, Seguros y Cuenta: ni Herramientas ni Contactos', () => {
  assert.deepEqual(entradasVisibles(AUTORIZADO), ['inicio', 'seguros', 'cuenta'])
})

test('un titular ve las cinco entradas', () => {
  assert.deepEqual(entradasVisibles(TITULAR), ['inicio', 'seguros', 'herramientas', 'contactos', 'cuenta'])
})

test('las entradas salen en el orden de pestanasPortal() y todas existen en él', () => {
  const ids = pestanasPortal().map((p) => p.id)
  const v = entradasVisibles(TITULAR)
  assert.deepEqual(v, ids)
  // Y cualquier combinación es un subconjunto ordenado de ese orden.
  for (const h of [AUTORIZADO, HECHOS_DESCONOCIDOS, { ...AUTORIZADO, flota: 1 }, { ...AUTORIZADO, porAceptar: 2 }]) {
    const r = entradasVisibles(h)
    assert.deepEqual(r, ids.filter((i) => r.includes(i)))
  }
})

test('Inicio, Seguros y Cuenta se ofrecen siempre, también sin saber nada', () => {
  for (const h of [AUTORIZADO, TITULAR, HECHOS_DESCONOCIDOS]) {
    const r = entradasVisibles(h)
    for (const f of ['inicio', 'seguros', 'cuenta'] as const) assert.ok(r.includes(f), `falta ${f}`)
  }
})

test('Patrimonio abre Herramientas aunque la persona no sea titular', () => {
  const h = { ...AUTORIZADO, patrimonio: 1 }
  assert.ok(entradasVisibles(h).includes('herramientas'))
  const t = herramientasVisibles(h)
  assert.equal(t.patrimonio, true)
  assert.equal(t.flota, false)
  assert.equal(t.calendario, true, 'sus fechas de patrimonio van en el calendario')
  assert.equal(t.resumen, false, 'Mi resumen es de pólizas propias')
  assert.equal(t.catalogo, false)
})

test('Flota (jefe de flota) abre Herramientas pero solo la flota', () => {
  const h = { ...AUTORIZADO, flota: 2 }
  assert.ok(entradasVisibles(h).includes('herramientas'))
  const t = herramientasVisibles(h)
  assert.deepEqual(
    { p: t.patrimonio, f: t.flota, c: t.calendario, r: t.resumen, k: t.catalogo },
    { p: false, f: true, c: false, r: false, k: false },
  )
})

test('quien ha aportado una póliza suya es titular aunque no tenga ficha', () => {
  const h = { ...AUTORIZADO, polizasAportadas: 1 }
  assert.equal(esTitular(h), true)
  assert.ok(entradasVisibles(h).includes('herramientas'))
  assert.equal(herramientasVisibles(h).calendario, true)
})

test('Contactos: se ofrece si puede conceder', () => {
  assert.equal(contactosVisibles({ ...AUTORIZADO, puedeConceder: true }), true)
})

test('Contactos: se ofrece si tiene un acceso por aceptar', () => {
  const h = { ...AUTORIZADO, porAceptar: 1 }
  assert.equal(contactosVisibles(h), true)
  assert.ok(entradasVisibles(h).includes('contactos'))
})

test('Contactos: sin conceder ni nada por aceptar, el menú no lo trae y Cuenta sí', () => {
  assert.equal(contactosVisibles(AUTORIZADO), false)
  assert.equal(contactosEnCuenta(AUTORIZADO), true)
  assert.equal(contactosEnCuenta(TITULAR), false)
})

test('lo que NO se ha podido comprobar nunca esconde una entrada', () => {
  assert.deepEqual(entradasVisibles(HECHOS_DESCONOCIDOS), ['inicio', 'seguros', 'herramientas', 'contactos', 'cuenta'])
  // Un dato sin leer entre varios a cero basta para ofrecerla.
  assert.ok(entradasVisibles({ ...AUTORIZADO, flota: null }).includes('herramientas'))
  assert.ok(entradasVisibles({ ...AUTORIZADO, patrimonio: null }).includes('herramientas'))
  assert.ok(entradasVisibles({ ...AUTORIZADO, fichasPropias: null }).includes('herramientas'))
  assert.ok(entradasVisibles({ ...AUTORIZADO, puedeConceder: null }).includes('contactos'))
  assert.ok(entradasVisibles({ ...AUTORIZADO, porAceptar: null }).includes('contactos'))
  assert.equal(contactosEnCuenta(HECHOS_DESCONOCIDOS), false)
})

test('CEPO de supuestos: ningún nivel que se concede es el alcance de una herramienta', () => {
  // El menú del autorizado se apoya en que Consulta/Gestión/Total NO abren Patrimonio ni Flota. Si algún día un nivel
  // concedible los abre, este test falla y hay que revisar `HechosMenu` antes de seguir.
  assert.ok(!(ALCANCES_CONCEDIBLES as readonly string[]).includes(ALCANCE_FLOTA))
  for (const a of ALCANCES_CONCEDIBLES) assert.ok(!String(a).startsWith('patrimonio'), `${a} parece de patrimonio`)
})
