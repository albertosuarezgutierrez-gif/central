// Tomador = MEDIADOR en las exploraciones de patinete (28/10/2026). `node --test`. Los datos salen de `MEDIADOR`
// (`@central/module-seguros`): este test NO repite ningún literal, los importa, y vigila que nadie más lo escriba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENTRADAS_EXPLORACION, entradaConTomadorMediador, resolverDato } from '@central/module-tarificacion'
import { MEDIADOR } from '@central/module-seguros'
import { riesgoTomadorMediador } from './tarificador-explorador-mediador.ts'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ENTRADAS_PATINETE = ['allianz:autos:movilidad_personal', 'mapfre:automoviles:patinetes']
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

test('el resolver del explorador pone el NIF y la fecha de MEDIADOR (fecha en dd/mm/aaaa) solo con la marca de la entrada', () => {
  const r = riesgoTomadorMediador()
  const [a, m, d] = MEDIADOR.identidad.fechaNacimiento.split('-')
  for (const entrada of ENTRADAS_PATINETE) {
    const def = ENTRADAS_EXPLORACION[entrada]
    const marca = entradaConTomadorMediador(entrada)
    assert.equal(marca, true, entrada)
    assert.deepEqual(resolverDato('tomador.nif', ctx(def.ramo, marca, r)), { ok: true, valor: MEDIADOR.identidad.nif }, entrada)
    assert.deepEqual(resolverDato('tomador.fecha_nacimiento', ctx(def.ramo, marca, r)), { ok: true, valor: `${d}/${m}/${a}` }, entrada)
  }
  // Ninguna otra entrada: ni con el riesgo del mediador a mano se resuelve el NIF.
  for (const [k, def] of Object.entries(ENTRADAS_EXPLORACION).filter(([k]) => !ENTRADAS_PATINETE.includes(k))) {
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
