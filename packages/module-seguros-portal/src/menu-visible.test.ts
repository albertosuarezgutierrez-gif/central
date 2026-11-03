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
  puertaAbierta,
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
  patrimonioRecibido: 0,
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

// ─── Las puertas de servidor (26/10/2026): la MISMA regla que el menú, y lo dudoso cierra solo al escribir ───

test('puerta: el autorizado puro no entra al calendario (ni a leer ni a escribir) ni concede', () => {
  assert.equal(puertaAbierta(AUTORIZADO, 'calendario', 'lectura'), false)
  assert.equal(puertaAbierta(AUTORIZADO, 'calendario', 'escritura'), false)
  assert.equal(puertaAbierta(AUTORIZADO, 'conceder', 'escritura'), false)
})

test('puerta: el autorizado puro con algo POR ACEPTAR sigue sin calendario (Contactos no tiene puerta)', () => {
  const h = { ...AUTORIZADO, porAceptar: 1 }
  assert.equal(puertaAbierta(h, 'calendario', 'lectura'), false)
  assert.equal(puertaAbierta(h, 'conceder', 'escritura'), false)
  assert.equal(contactosVisibles(h), true)
})

test('puerta: el titular entra al calendario y concede, en los dos modos', () => {
  for (const modo of ['lectura', 'escritura'] as const) {
    assert.equal(puertaAbierta(TITULAR, 'calendario', modo), true)
    assert.equal(puertaAbierta(TITULAR, 'conceder', modo), true)
  }
})

test('puerta: quien solo aportó una póliza (sin ficha) es titular: calendario sí', () => {
  const h = { ...AUTORIZADO, polizasAportadas: 2 }
  assert.equal(puertaAbierta(h, 'calendario', 'escritura'), true)
})

test('puerta: titular cuyo vínculo NO opera (dueño de empresa) puede intentar conceder; lo decide conceder()', () => {
  const h = { ...AUTORIZADO, fichasPropias: 1, puedeConceder: false }
  assert.equal(contactosVisibles(h), false)
  assert.equal(puertaAbierta(h, 'conceder', 'escritura'), true)
})

test('puerta: sin ser titular pero con patrimonio a la vista, el calendario abre (sus fechas van ahí)', () => {
  const h = { ...AUTORIZADO, patrimonio: 1 }
  assert.equal(puertaAbierta(h, 'calendario', 'lectura'), true)
  assert.equal(puertaAbierta(h, 'calendario', 'escritura'), true)
  assert.equal(puertaAbierta(h, 'conceder', 'escritura'), false)
})

test('puerta: lectura caída → la PÁGINA abre (como el menú) y la ESCRITURA cierra', () => {
  assert.equal(puertaAbierta(HECHOS_DESCONOCIDOS, 'calendario', 'lectura'), true)
  assert.equal(puertaAbierta(HECHOS_DESCONOCIDOS, 'calendario', 'escritura'), false)
  assert.equal(puertaAbierta(HECHOS_DESCONOCIDOS, 'conceder', 'escritura'), false)
  // Una sola lectura caída basta para cerrar la escritura si lo demás no abre.
  const h = { ...AUTORIZADO, fichasPropias: null }
  assert.equal(puertaAbierta(h, 'calendario', 'lectura'), true)
  assert.equal(puertaAbierta(h, 'calendario', 'escritura'), false)
  // Pero un hecho SABIDO que abre manda aunque otro esté caído.
  assert.equal(puertaAbierta({ ...h, polizasAportadas: 1 }, 'calendario', 'escritura'), true)
})

test('puerta y menú dicen lo mismo en lectura: calendario ⇔ herramientasVisibles().calendario', () => {
  const casos: HechosMenu[] = [AUTORIZADO, TITULAR, HECHOS_DESCONOCIDOS, { ...AUTORIZADO, patrimonio: 1 }, { ...AUTORIZADO, flota: 3 }, { ...AUTORIZADO, fichasPropias: null }]
  for (const h of casos) assert.equal(puertaAbierta(h, 'calendario', 'lectura'), herramientasVisibles(h).calendario)
})

// ─── Las puertas de «Herramientas» (26/10/2026): cada una ES su campo de herramientasVisibles() ───

const PUERTAS_HERRAMIENTAS = ['herramientas', 'resumen', 'patrimonio', 'flota', 'catalogo'] as const

test('puerta: el autorizado puro no entra a ninguna herramienta, ni a leer ni a escribir', () => {
  for (const p of PUERTAS_HERRAMIENTAS) {
    for (const modo of ['lectura', 'escritura'] as const) assert.equal(puertaAbierta(AUTORIZADO, p, modo), false, `${p} ${modo}`)
  }
  // Algo por aceptar en «Contactos» no abre ninguna herramienta.
  for (const p of PUERTAS_HERRAMIENTAS) assert.equal(puertaAbierta({ ...AUTORIZADO, porAceptar: 2 }, p, 'lectura'), false, p)
})

test('puerta: el titular entra en Herramientas, Mi resumen y el catálogo; Patrimonio y Flota, solo si los tiene (como el menú)', () => {
  for (const modo of ['lectura', 'escritura'] as const) {
    assert.equal(puertaAbierta(TITULAR, 'herramientas', modo), true)
    assert.equal(puertaAbierta(TITULAR, 'resumen', modo), true)
    assert.equal(puertaAbierta(TITULAR, 'catalogo', modo), true)
    assert.equal(puertaAbierta(TITULAR, 'patrimonio', modo), false)
    assert.equal(puertaAbierta(TITULAR, 'flota', modo), false)
    assert.equal(puertaAbierta({ ...TITULAR, patrimonio: 1, flota: 1 }, 'patrimonio', modo), true)
    assert.equal(puertaAbierta({ ...TITULAR, patrimonio: 1, flota: 1 }, 'flota', modo), true)
  }
})

test('puerta: patrimonio o flota por alcance (sin nada propio) abren SU herramienta, no el resumen ni el catálogo', () => {
  const conPatrimonio = { ...AUTORIZADO, patrimonio: 1 }
  // `flota` incluye el nombramiento de jefe de flota por aceptar (se acepta dentro de /flota): `hechosDeMenu` los suma.
  const conFlota = { ...AUTORIZADO, flota: 1 }
  for (const modo of ['lectura', 'escritura'] as const) {
    assert.equal(puertaAbierta(conPatrimonio, 'patrimonio', modo), true)
    assert.equal(puertaAbierta(conPatrimonio, 'herramientas', modo), true)
    assert.equal(puertaAbierta(conPatrimonio, 'flota', modo), false)
    assert.equal(puertaAbierta(conFlota, 'flota', modo), true)
    assert.equal(puertaAbierta(conFlota, 'herramientas', modo), true)
    assert.equal(puertaAbierta(conFlota, 'patrimonio', modo), false)
    for (const h of [conPatrimonio, conFlota]) {
      assert.equal(puertaAbierta(h, 'resumen', modo), false)
      assert.equal(puertaAbierta(h, 'catalogo', modo), false)
    }
  }
})

test('puerta de herramientas: lectura caída ABRE la página y CIERRA la escritura', () => {
  for (const p of PUERTAS_HERRAMIENTAS) {
    assert.equal(puertaAbierta(HECHOS_DESCONOCIDOS, p, 'lectura'), true, p)
    assert.equal(puertaAbierta(HECHOS_DESCONOCIDOS, p, 'escritura'), false, p)
  }
  // El patrimonio sin comprobar no se escribe aunque sea titular.
  assert.equal(puertaAbierta({ ...TITULAR, patrimonio: null }, 'patrimonio', 'lectura'), true)
  assert.equal(puertaAbierta({ ...TITULAR, patrimonio: null }, 'patrimonio', 'escritura'), false)
})

test('puerta y menú dicen lo mismo en lectura, herramienta a herramienta', () => {
  const casos: HechosMenu[] = [
    AUTORIZADO, TITULAR, HECHOS_DESCONOCIDOS, { ...AUTORIZADO, patrimonio: 1 }, { ...AUTORIZADO, flota: 3 },
    { ...AUTORIZADO, fichasPropias: null }, { ...AUTORIZADO, polizasAportadas: 1 }, { ...AUTORIZADO, flota: null },
  ]
  for (const h of casos) {
    const ver = herramientasVisibles(h)
    assert.equal(puertaAbierta(h, 'herramientas', 'lectura'), ver.alguna)
    assert.equal(puertaAbierta(h, 'herramientas', 'lectura'), entradasVisibles(h).includes('herramientas'))
    for (const p of ['resumen', 'patrimonio', 'flota', 'catalogo'] as const) assert.equal(puertaAbierta(h, p, 'lectura'), ver[p], p)
  }
})

test('27/10/2026: con un acceso de PATRIMONIO recibido y vigente, «Contactos» se ofrece (ahí lo ve y renuncia), sin abrir conceder', () => {
  const h = { ...AUTORIZADO, patrimonio: 1, patrimonioRecibido: 1 }
  assert.ok(contactosVisibles(h))
  assert.ok(entradasVisibles(h).includes('contactos'))
  assert.equal(contactosEnCuenta(h), false)
  // Solo VISIBILIDAD: no le abre la puerta de conceder ni en lectura ni en escritura.
  assert.equal(puertaAbierta(h, 'conceder', 'lectura'), false)
  assert.equal(puertaAbierta(h, 'conceder', 'escritura'), false)
  // Sin acceso recibido, el autorizado puro sigue sin «Contactos» en el menú (y lo tiene en «Cuenta»).
  assert.equal(contactosVisibles({ ...AUTORIZADO, patrimonio: 1 }), false)
  // Tres estados: una lectura caída nunca oculta la entrada.
  assert.ok(contactosVisibles({ ...AUTORIZADO, patrimonioRecibido: null }))
})
