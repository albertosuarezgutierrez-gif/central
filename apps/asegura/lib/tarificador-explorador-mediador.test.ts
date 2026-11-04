// Tomador = MEDIADOR en las exploraciones de patinete (28/10/2026) y de Pelayo Auto/Hogar (0.3.41, 04/11/2026). `node --test`. Los datos salen de `MEDIADOR`
// (`@central/module-seguros`): este test NO repite ningún literal, los importa, y vigila que nadie más lo escriba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENTRADAS_EXPLORACION, entradaConTomadorMediador, redactarValoresInventario, resolverDato, valoresSensiblesExploracion, type InventarioDom } from '@central/module-tarificacion'
import { MEDIADOR } from '@central/module-seguros'
import { riesgoTomadorMediador } from './tarificador-explorador-mediador.ts'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ENTRADAS_PATINETE = ['allianz:autos:movilidad_personal', 'mapfre:automoviles:patinetes']
const ENTRADAS_PELAYO = ['pelayo:presupuestos:auto', 'pelayo:presupuestos:hogar']
const ENTRADAS_MEDIADOR = [...ENTRADAS_PATINETE, ...ENTRADAS_PELAYO]
const ctx = (ramo: string, tomadorMediador: boolean, riesgo: unknown) => ({ ramo, conDatosReales: false, tomadorMediador, riesgo, env: {}, hoy: new Date('2026-10-28T10:00:00Z') })

test('el riesgo del tomador sale de MEDIADOR (nif, nombre y fecha de nacimiento), nunca de un literal', () => {
  const id = MEDIADOR.identidad
  const { tomador } = riesgoTomadorMediador()
  assert.equal(tomador.nif, id.nif)
  assert.equal(tomador.nombreCompleto, id.nombre)
  assert.equal(tomador.fechaNacimiento, id.fechaNacimiento)
  assert.match(id.fechaNacimiento, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(`${tomador.nombre} ${tomador.apellido1} ${tomador.apellido2}`, id.nombre, 'tres palabras = nombre + dos apellidos')
})

test('el resolver del explorador pone el NIF y la fecha de MEDIADOR (fecha en dd/mm/aaaa) solo con la marca de la entrada (patinete y Pelayo)', () => {
  const r = riesgoTomadorMediador()
  const [a, m, d] = MEDIADOR.identidad.fechaNacimiento.split('-')
  for (const entrada of ENTRADAS_MEDIADOR) {
    const def = ENTRADAS_EXPLORACION[entrada]
    const marca = entradaConTomadorMediador(entrada)
    assert.equal(marca, true, entrada)
    assert.deepEqual(resolverDato('tomador.nif', ctx(def.ramo, marca, r)), { ok: true, valor: MEDIADOR.identidad.nif }, entrada)
    assert.deepEqual(resolverDato('tomador.fecha_nacimiento', ctx(def.ramo, marca, r)), { ok: true, valor: `${d}/${m}/${a}` }, entrada)
  }
  // Ninguna otra entrada: ni con el riesgo del mediador a mano se resuelve el NIF.
  for (const [k, def] of Object.entries(ENTRADAS_EXPLORACION).filter(([k]) => !ENTRADAS_MEDIADOR.includes(k))) {
    assert.deepEqual(resolverDato('tomador.nif', ctx(def.ramo, entradaConTomadorMediador(k), r)), { ok: false, motivo: 'dato_sensible_requerido' }, k)
  }
})

test('si MEDIADOR no trae la fecha o el nombre no se parte sin adivinar, el dato se OMITE (el explorador para)', () => {
  const sin = riesgoTomadorMediador({ nombre: 'Una Sola Palabra Mas Cuatro', nif: 'X' }).tomador
  assert.equal(sin.fechaNacimiento, undefined)
  assert.equal(sin.nombre, undefined)
  assert.equal(sin.apellido1, undefined)
  assert.equal(sin.nombreCompleto, 'Una Sola Palabra Mas Cuatro')
  assert.equal(riesgoTomadorMediador({ nombre: 'A B C', nif: 'X', fechaNacimiento: '03/02/1970' }).tomador.fechaNacimiento, undefined, 'solo ISO')
})

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === 'dist') continue
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) ficheros(p, salida)
    else if (/\.(ts|tsx|mjs|sql|yml|json)$/.test(n)) salida.push(p)
  }
  return salida
}

test('el NIF y la fecha de nacimiento del mediador no están escritos en el explorador, el worker, el CRM de la correduría ni sus tests', () => {
  const nif = MEDIADOR.identidad.nif
  const [a, m, d] = MEDIADOR.identidad.fechaNacimiento.split('-')
  const prohibidos = [nif, MEDIADOR.identidad.fechaNacimiento, `${d}/${m}/${a}`, `${d}-${m}-${a}`]
  const carpetas = ['packages/module-tarificacion/src', 'services/tarificador-rpa/src', 'services/tarificador-rpa/test', 'apps/asegura/lib', 'apps/asegura/app/api/tarificador', 'apps/asegura/app/api/operador/tarificador']
  const hallazgos: string[] = []
  for (const c of carpetas) {
    for (const f of ficheros(path.join(RAIZ, c))) {
      const txt = readFileSync(f, 'utf8')
      for (const lit of prohibidos) if (lit && txt.includes(lit)) hallazgos.push(`${path.relative(RAIZ, f)} contiene un dato del mediador`)
    }
  }
  for (const f of ['2026-10-28b_tarificador_allianz_patinete.sql', '2026-10-28c_tarificador_mapfre_patinete.sql']) {
    const txt = readFileSync(path.join(RAIZ, 'apps/asegura/prisma/sql', f), 'utf8')
    for (const lit of prohibidos) if (lit && txt.includes(lit)) hallazgos.push(`${f} contiene un dato del mediador`)
  }
  assert.deepEqual([...new Set(hallazgos)], [])
})

test('cableado: el reclamo del worker y el redactado del inventario añaden al mediador SOLO en la respuesta (nunca se guarda en BD)', () => {
  const t = readFileSync(path.join(RAIZ, 'apps/asegura/lib/tarificador.ts'), 'utf8')
  assert.match(t, /entradaConTomadorMediador\(x\[0\]\.entrada\) && !f\.con_cliente/)
  assert.match(t, /riesgoConTomadorMediador\(riesgo\)/)
  const e = readFileSync(path.join(RAIZ, 'apps/asegura/lib/tarificador-explorador.ts'), 'utf8')
  assert.match(e, /entrada_solo_sintetica/, 'con ancla (cliente real) la entrada del mediador se rechaza')
  assert.ok(!/riesgoTomadorMediador/.test(e), 'el encolado no escribe los datos del mediador en la BD')
  const p = readFileSync(path.join(RAIZ, 'apps/asegura/app/api/tarificador/explorador/paso/route.ts'), 'utf8')
  assert.match(p, /valoresSensiblesExploracion\(\{[^}]*tomadorMediador/, 'el NIF del mediador se quita del inventario antes de la IA y de la BD')
})

// 0.3.41 · Pelayo «Datos del Tomador»: tras rellenar, el portal puede ENSEÑAR el NIF, el nombre o el móvil del mediador (resumen,
// aviso, rótulo). El inventario que se GUARDA (estado del pilotaje y paso del explorador) pasa por `redactarValoresInventario` con los
// valores de `valoresPilotaje` = `valoresSensiblesExploracion({ riesgo: riesgoTomadorMediador(), tomadorMediador })`: ninguno sobrevive.
function inventarioQueEnsena(textos: string[]): InventarioDom {
  return {
    version: 1, totalElementos: textos.length, recortado: null, textosDescartados: 0,
    marcos: [{
      url: 'https://mediadores.pelayo.com/portalmediador-presupuestos/', nombre: null, titulos: ['Datos del Tomador'], titulosPantalla: textos, avisosPortal: textos,
      elementos: textos.map((t, i) => ({ ref: `e${i}`, tag: 'span', texto: t, etiqueta: t })),
    }],
  } as unknown as InventarioDom
}

test('Pelayo (pilotaje y exploración): el NIF, el nombre, los apellidos, el móvil y el correo del mediador NO salen en el inventario guardado', () => {
  const id = MEDIADOR.identidad
  const r = riesgoTomadorMediador()
  const sueltos = [id.nif, id.nombre, r.tomador.apellido1!, r.tomador.apellido2!, r.tomador.telefono!, id.telefono, id.email]
  assert.ok(sueltos.every((x) => typeof x === 'string' && x.length >= 3), 'el mapeo trae todos los datos que se van a rellenar')
  const ensenados = [`NIF ${id.nif}`, `Tomador: ${id.nombre}`, `Apellido 1 ${r.tomador.apellido1}`, `Apellido 2 ${r.tomador.apellido2}`, `Teléfono ${id.telefono}`, `Móvil ${r.tomador.telefono}`, `Email ${id.email}`]
  for (const entrada of ENTRADAS_PELAYO) {
    const tomadorMediador = entradaConTomadorMediador(entrada)
    assert.equal(tomadorMediador, true, entrada)
    // Lo MISMO que `valoresPilotaje` (tarificador-pilotaje.ts) y la ruta del paso del explorador.
    const valores = valoresSensiblesExploracion({ conDatosReales: false, riesgo: riesgoTomadorMediador(), env: {}, tomadorMediador })
    assert.ok(valores !== null, entrada)
    const guardado = JSON.stringify(redactarValoresInventario(inventarioQueEnsena(ensenados), valores!))
    for (const x of sueltos) assert.ok(!guardado.includes(x), `${entrada}: un dato del mediador sobrevive a la redacción`)
    assert.ok(guardado.includes('Datos del Tomador'), 'el rótulo del formulario sí queda (el mapa sigue sirviendo)')
  }
})

test('cableado del pilotaje: la redacción de asegura usa el riesgo del mediador con la marca de la entrada', () => {
  const t = readFileSync(path.join(RAIZ, 'apps/asegura/lib/tarificador-pilotaje.ts'), 'utf8')
  assert.match(t, /valoresSensiblesExploracion\(\{ conDatosReales: false, riesgo: tomadorMediador \? riesgoTomadorMediador\(\) : null, env, tomadorMediador \}\)/)
  assert.match(t, /redactarValoresInventario\(p\.inventario, valores\)/)
})
