import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cepos de fuente: lo que la regla pura no puede vigilar porque vive en el SQL.
const src = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const crear = src.slice(src.indexOf('export async function crearOportunidad'), src.indexOf('export async function editarOportunidad'))
const editar = src.slice(src.indexOf('export async function editarOportunidad'), src.indexOf('export type OportunidadDeCliente'))
const lista = src.slice(src.indexOf('export async function oportunidadesDeCliente'), src.indexOf('async function anotarEnFicha'))

test('crear: no abre una segunda del mismo ramo mientras haya una abierta', () => {
  assert.match(crear, /tipo::text = \$\{a\.ramo\} and estado::text in \('competencia', 'en_negociacion', 'pendiente_cliente'\)/)
  assert.match(crear, /pg_advisory_xact_lock/)
})

test('crear: oportunidad, primer paso e historial en la MISMA transacción', () => {
  const tx = crear.slice(crear.indexOf('$transaction'))
  for (const t of ['insert into oportunidades', 'insert into gestiones', 'insert into oportunidad_historial']) {
    assert.ok(tx.includes(t), `falta ${t} dentro de la transacción`)
  }
})

test('crear y editar filtran por correduría (BYPASSRLS: un id ajeno no falla, escribe en otra)', () => {
  assert.match(crear, /from clientes\s+where id = \$\{clienteId\}::uuid and correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(editar, /where id = \$\{id\}::uuid and correduria_id = \$\{correduriaId\}::uuid for update/)
  assert.match(lista, /o\.correduria_id = \$\{correduriaId\}::uuid and o\.cliente_id = \$\{clienteId\}::uuid/)
})

test('editar: una cerrada no se corrige (se reabre antes, con su rastro)', () => {
  assert.match(editar, /fila\.estado === 'ganada' \|\| fila\.estado === 'perdida'/)
  assert.match(editar, /insert into oportunidad_historial[\s\S]*'editada'/)
})

test('el historial no guarda la compañía tecleada ni la nota: solo que cambió', () => {
  assert.match(editar, /detalle\.aseguradora = \{ cambiado: true/)
  assert.doesNotMatch(crear, /nota: a\.tarea\.observaciones|observaciones: a\.tarea/)
})

test('editar: cambiar el ramo tampoco cuela una segunda abierta del mismo seguro', () => {
  assert.match(editar, /id <> \$\{id\}::uuid\s+and tipo::text = \$\{c\.ramo\} and estado::text in \('competencia', 'en_negociacion', 'pendiente_cliente'\)/)
})

test('la próxima tarea de la ficha es la misma que lista «Hoy» (solo seguimiento)', () => {
  assert.match(lista, /g\.origen_trigger = 'central:seguimiento'/)
})

test('una póliza que se va no se puede cerrar como «abierta por error»', () => {
  const ev = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')
  const rv = ev.slice(ev.indexOf('export function revisionValida'), ev.indexOf('export async function revisarEvento'))
  assert.match(rv, /MOTIVOS_PERDIDA_VENTA as readonly string\[\]\)\.includes\(o\.motivo\)/)
  const fugas = readFileSync(new URL('../../plataforma/app/api/correduria/fugas/route.ts', import.meta.url), 'utf8')
  assert.match(fugas, /motivos: MOTIVOS_PERDIDA_VENTA/)
})
