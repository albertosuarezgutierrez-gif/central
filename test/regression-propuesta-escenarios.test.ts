// 🛡️ Guardián de la PROPUESTA DE ESCENARIOS (07/10/2026): varios presupuestos de una oportunidad juntos.
// `node --test` (gate en CI vía `pnpm test:guardia`). Cada `test` vigila UN brazo. Para verlos en rojo:
//   · `ordenarEscenarios` → marca la prima MÁXIMA en vez de la mínima               → cae el brazo 1.
//   · `crearBarreraLote` → `abortar()` no hace nada                                 → cae el brazo 2.
//   · `avisarPropuesta` → quita `if (e.confirmar !== true) …`                       → cae el brazo 3.
//   · proxy de plataforma → reenvía `cuerpo` entero o `confirmar` sin `=== true`     → cae el brazo 4.
//   · `avisarPropuesta` → deja de agrupar por tomador (un aviso con todos)          → cae el brazo 5.
//   · SQL → quita `REVOKE … crm_seguros` o el trigger de misma correduría           → cae el brazo 6.
//   · `interpretarPropuestas` → trata `sin_tabla` como lista vacía                  → cae el brazo 7.
//   · SQL → quita un `REVOKE DELETE, TRUNCATE` o el `REVOKE UPDATE` del item         → cae el brazo 6b.
//   · `confirmarWhatsappPropuesta` → recorre `v.escenarios` (todo el lote)          → cae el brazo 8.
//   · `estadoDelLote` → `marcarAvisado` con un grupo bien (no todos)                 → cae el brazo 9.
//   · `separarYaEnviados` → no aparta los grupos ya enviados                         → cae el brazo 9.
//   · `avisarPropuesta` → saca `avisarGrupoPorCorreo` del try                        → cae el brazo 9.
//   · `leerPropuesta` → vuelve a `?? 'auto'`; plataforma → `creadoAt … ?? ''`        → cae el brazo 10.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { figurasDePeticion, ordenarEscenarios, seguroAnteriorDePeticion, type EscenarioEntrada } from '../packages/module-seguros/src/propuesta-escenarios.ts'
import { crearBarreraLote } from '../apps/asegura/lib/barrera-lote.ts'
import { interpretarPropuestas, resumenAviso } from '../apps/plataforma/lib/propuesta-escenarios-asegura.ts'
import { escenariosDelTomador, estadoDelLote, separarYaEnviados } from '../apps/asegura/lib/propuesta-aviso-grupos.ts'

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
  assert.match(avisar, /const todos = gruposPorTomador\(v\.escenarios\)/)
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

test('6b · SQL: la app no BORRA nada de la propuesta ni REESCRIBE un item (los default privileges dan arwd)', () => {
  const sql = sinComentarios(leer('apps/asegura/prisma/sql/2026-10-07e_presupuesto_propuesta.sql'))
  for (const t of ['presupuesto_propuesta_contador', 'presupuesto_propuesta', 'presupuesto_propuesta_item']) {
    assert.match(sql, new RegExp(`REVOKE DELETE, TRUNCATE ON seguros\\.${t}\\s+FROM prisma_seguros;`), `${t}: falta quitar DELETE/TRUNCATE`)
  }
  assert.match(sql, /REVOKE UPDATE\s+ON seguros\.presupuesto_propuesta_item\s+FROM prisma_seguros;/, 'el item no se reescribe')
  assert.doesNotMatch(sql, /GRANT[^;]*(DELETE|TRUNCATE)[^;]*prisma_seguros/, 'ningún GRANT devuelve DELETE/TRUNCATE')
})

test('7 · sin la tabla no es «no hay propuestas», y un aviso a medias no se pinta como enviado', () => {
  assert.equal(interpretarPropuestas(503, { estado: 'error', motivo: 'sin_tabla', detalle: 'falta el SQL' }).estado, 'sin_tabla')
  assert.equal(interpretarPropuestas(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.deepEqual(interpretarPropuestas(200, { estado: 'ok', propuestas: [] }), { estado: 'ok', propuestas: [] })
  const parcial = resumenAviso(207, { estado: 'parcial', grupos: [{ nombre: 'Ana', numeros: [2], estado: 'enviado', detalle: 'ok' }, { nombre: 'Rafael', numeros: [1], estado: 'error', detalle: 'sin correo' }] })
  assert.equal(parcial.ok, false)
  assert.equal(resumenAviso(502, null).ok, false)
})

const ESC = [
  { presupuestoId: 'p1', numero: 1, tomador: { clienteId: 'ana' } },
  { presupuestoId: 'p2', numero: 2, tomador: { clienteId: 'rafael' } },
  { presupuestoId: 'p3', numero: 3, tomador: { clienteId: 'ana' } },
]

test('8 · «Ya lo he mandado» es POR TOMADOR: solo se confirman los escenarios de esa ficha', () => {
  assert.deepEqual(escenariosDelTomador(ESC, 'ana').map((x) => x.presupuestoId), ['p1', 'p3'])
  assert.deepEqual(escenariosDelTomador(ESC, 'otro'), [])
  const src = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios.ts'))
  const conf = src.slice(src.indexOf('export async function confirmarWhatsappPropuesta'))
  assert.match(conf, /const suyos = escenariosDelTomador\(v\.escenarios, e\.clienteId\)/)
  assert.match(conf, /for \(const x of suyos\)/)
  assert.doesNotMatch(conf, /for \(const x of v\.escenarios\)/, 'no se confirma el lote entero')
  assert.match(conf, /if \(v\.retiradaAt\) return error\('retirada'/, 'una propuesta retirada no se confirma')
  const ruta = sinComentarios(leer('apps/plataforma/app/api/correduria/presupuesto/propuesta/route.ts'))
  assert.match(ruta, /cuerpo\.accion === 'confirmar_whatsapp'\) limpio\.clienteId =/)
  const ui = leer('apps/plataforma/app/(usuario)/correduria/oportunidad/[id]/PropuestaEscenarios.tsx')
  assert.match(ui, /accion: 'confirmar_whatsapp', clienteId: d\.clienteId/, 'cada botón manda SU tomador')
})

test('9 · correo por tomador: un fallo da `parcial`, el lote solo consta avisado con TODOS, y lo ya enviado no se reenvía', () => {
  assert.deepEqual(estadoDelLote([{ estado: 'enviado' }, { estado: 'error' }]), { estado: 'parcial', marcarAvisado: false })
  assert.deepEqual(estadoDelLote([{ estado: 'enviado' }, { estado: 'enviado' }]), { estado: 'ok', marcarAvisado: true })
  assert.deepEqual(estadoDelLote([{ estado: 'error' }]), { estado: 'error', marcarAvisado: false })
  assert.deepEqual(estadoDelLote([]), { estado: 'error', marcarAvisado: false })
  const grupos = [{ id: 'ana', escenarios: [ESC[0]!, ESC[2]!] }, { id: 'rafael', escenarios: [ESC[1]!] }]
  const r = separarYaEnviados(grupos, new Set(['p1', 'p3']))
  assert.deepEqual([r.yaEnviados.map((g) => g.id), r.pendientes.map((g) => g.id)], [['ana'], ['rafael']])
  // Medio grupo sellado no es «ya salió»: se trata como pendiente.
  assert.deepEqual(separarYaEnviados(grupos, new Set(['p1'])).yaEnviados, [])
  const src = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios.ts'))
  const avisar = src.slice(src.indexOf('export async function avisarPropuesta'), src.indexOf('async function presupuestosConCorreoDelLote'))
  assert.match(avisar, /try \{\s*r = await avisarGrupoPorCorreo\(/, 'el fallo de un tomador se captura')
  assert.equal((avisar.match(/avisarGrupoPorCorreo\(/g) ?? []).length, 1, 'y no hay otra llamada fuera del try')
  assert.match(avisar, /separarYaEnviados\(todos, await presupuestosConCorreoDelLote\(/)
  assert.ok(avisar.indexOf('separarYaEnviados(') < avisar.indexOf('prepararAviso('), 'se apartan ANTES de preparar (y rotar)')
  assert.match(avisar, /if \(lote\.marcarAvisado/, '`avisado_at` solo con todos los grupos fuera')
  assert.match(avisar, /sellarGrupoEnviado\(/)
})

test('10 · lo que no consta es `null`: ni ramo «auto» supuesto ni fecha de creación vacía', () => {
  const src = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios.ts'))
  assert.match(src, /ramo: cab\.tipo \?\? items\[0\]\?\.ramo \?\? null,/)
  assert.doesNotMatch(src, /\?\? 'auto'/)
  const lib = sinComentarios(leer('apps/plataforma/lib/propuesta-escenarios-asegura.ts'))
  assert.match(lib, /creadoAt: txt\(p\.creadoAt\),/)
  const pdf = sinComentarios(leer('apps/asegura/lib/propuesta-escenarios-pdf.ts'))
  assert.match(pdf, /sin ramo/)
})
