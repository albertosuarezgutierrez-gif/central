// 🛡️ Guardián de la PROPUESTA DE ESCENARIOS (07/10/2026): varios presupuestos de una oportunidad juntos.
// `node --test` (gate en CI vía `pnpm test:guardia`). Cada `test` vigila UN brazo. Para verlos en rojo:
//   · `ordenarEscenarios` → marca la prima MÁXIMA en vez de la mínima               → cae el brazo 1.
//   · `crearBarreraLote` → `abortar()` no hace nada                                 → cae el brazo 2.
//   · `avisarPropuesta` → quita `if (e.confirmar !== true) …`                       → cae el brazo 3.
//   · proxy de plataforma → reenvía `cuerpo` entero o `confirmar` sin `=== true`     → cae el brazo 4.
//   · `avisarPropuesta` → deja de agrupar por tomador (un aviso con todos)          → cae el brazo 5.
//   · SQL → quita `REVOKE … crm_seguros` o el trigger de misma correduría           → cae el brazo 6.
//   · `interpretarPropuestas` → trata `sin_tabla` como lista vacía                  → cae el brazo 7.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { figurasDePeticion, ordenarEscenarios, seguroAnteriorDePeticion, type EscenarioEntrada } from '../packages/module-seguros/src/propuesta-escenarios.ts'
import { crearBarreraLote } from '../apps/asegura/lib/barrera-lote.ts'
import { interpretarPropuestas, resumenAviso } from '../apps/plataforma/lib/propuesta-escenarios-asegura.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*|--)/.test(l)).join('\n')

const persona = (dni: string, name: string) => ({ identificationDocument: { id: dni }, name, surname: 'X' })
const ANA = persona('11111111H', 'Ana')
const RAFAEL = persona('22222222J', 'Rafael')
const esc = (id: string, holder: object, primas: number[]): EscenarioEntrada => {
  const pet = { holder, risk: { owner: RAFAEL, primaryDriver: ANA } }
  return {
    presupuestoId: id, referencia: null, ramo: 'auto', figuras: figurasDePeticion(pet), seguroAnterior: seguroAnteriorDePeticion(pet),
    opciones: primas.map((p) => ({ compania: 'C', producto: null, modalidad: null, primaEur: p, coberturas: [] })),
  }
}

test('1 · «la más económica» es el escenario de prima mínima, y va primero', () => {
  const r = ordenarEscenarios([esc('P1', ANA, [1234.56, 900]), esc('P2', RAFAEL, [498.75])])
  assert.deepEqual(r.map((e) => [e.presupuestoId, e.masEconomica]), [['P2', true], ['P1', false]])
  assert.equal(r[0]!.etiqueta, 'Tomador: Rafael · Conductor: Ana · Propietario: Rafael')
})

test('2 · por correo, si un escenario no puede salir no sale NINGUNO (nadie recibe medio lote)', async () => {
  let salidas = 0
  const b = crearBarreraLote<number>(2, async () => { salidas++; return 'enviado' })
  const primero = b.unirse(1)
  b.abortar()
  assert.equal(await primero, 'cancelado')
  assert.equal(await b.unirse(2), 'cancelado')
  assert.equal(salidas, 0)
})

test('3 · avisar el lote exige `confirmar: true` antes de leer o escribir nada', () => {
  const src = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios.ts'))
  const avisar = src.slice(src.indexOf('export async function avisarPropuesta'))
  const guarda = avisar.indexOf("if (e.confirmar !== true) return error('sin_confirmar'")
  assert.ok(guarda > 0, 'falta la guarda de confirmación')
  for (const s of ['leerPropuesta(', 'prepararAviso(', 'ejecutarAviso(']) {
    const i = avisar.indexOf(s)
    assert.ok(i > 0 && guarda < i, `la confirmación va antes de ${s}`)
  }
  // Y crear NO avisa: `crearPropuesta` no llama a ningún envío.
  const crear = src.slice(src.indexOf('export async function crearPropuesta'), src.indexOf('export async function leerPropuesta'))
  assert.doesNotMatch(crear, /avisarPresupuesto|prepararAviso|ejecutarAviso|mandarCorreo|enviarCorreo/)
})

test('4 · plataforma solo reenvía `confirmar` si es exactamente `true`, y el `actor` lo pone el servidor, el último', () => {
  const ruta = sinComentarios(leer('apps/plataforma/app/api/correduria/presupuesto/propuesta/route.ts'))
  assert.match(ruta, /limpio\.confirmar = cuerpo\.confirmar === true/)
  assert.doesNotMatch(ruta, /accionPropuestaAsegura\(cuerpo/, 'no se reenvía el cuerpo tal cual')
  const lib = sinComentarios(leer('apps/plataforma/lib/propuesta-escenarios-asegura.ts'))
  assert.match(lib, /JSON\.stringify\(\{ \.\.\.cuerpo, actor \}\)/)
})

test('5 · un aviso por TOMADOR: el portal solo enseña un presupuesto a su tomador', () => {
  const src = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios.ts'))
  const avisar = src.slice(src.indexOf('export async function avisarPropuesta'), src.indexOf('async function avisarGrupoPorCorreo'))
  assert.match(avisar, /const tomadores = gruposPorTomador\(v\.escenarios\)/)
  assert.match(avisar, /for \(const g of tomadores\)/)
  const agrupar = src.slice(src.indexOf('export function gruposPorTomador'), src.indexOf('function textoError'))
  assert.match(agrupar, /x\.clienteId === e\.tomador\.clienteId/, 'se agrupa por la FICHA del tomador, no por el nombre')
})

test('6 · SQL: RLS, sin ingesta ni portal, y item/propuesta/presupuesto de la MISMA correduría', () => {
  const sql = sinComentarios(leer('apps/asegura/prisma/sql/2026-10-07e_presupuesto_propuesta.sql'))
  for (const t of ['presupuesto_propuesta_contador', 'presupuesto_propuesta', 'presupuesto_propuesta_item']) {
    assert.match(sql, new RegExp(`ALTER TABLE seguros\\.${t}\\s+ENABLE ROW LEVEL SECURITY`), `${t} sin RLS`)
    assert.match(sql, new RegExp(`REVOKE ALL ON seguros\\.${t}\\s+FROM PUBLIC, anon, authenticated, crm_seguros`), `${t} sin REVOKE`)
  }
  assert.doesNotMatch(sql, /prisma_asegura_portal/, 'el portal no recibe nada aquí')
  assert.match(sql, /CREATE TRIGGER presupuesto_propuesta_item_misma_correduria/)
  assert.match(sql, /v_pres IS DISTINCT FROM NEW\.correduria_id/)
})

test('7 · sin la tabla no es «no hay propuestas», y un aviso a medias no se pinta como enviado', () => {
  assert.equal(interpretarPropuestas(503, { estado: 'error', motivo: 'sin_tabla', detalle: 'falta el SQL' }).estado, 'sin_tabla')
  assert.equal(interpretarPropuestas(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.deepEqual(interpretarPropuestas(200, { estado: 'ok', propuestas: [] }), { estado: 'ok', propuestas: [] })
  const parcial = resumenAviso(207, { estado: 'parcial', grupos: [{ nombre: 'Ana', numeros: [2], estado: 'enviado', detalle: 'ok' }, { nombre: 'Rafael', numeros: [1], estado: 'error', detalle: 'sin correo' }] })
  assert.equal(parcial.ok, false)
  assert.equal(resumenAviso(502, null).ok, false)
})
