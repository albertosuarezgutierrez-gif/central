// Cable del inventario de estructura de pantalla (13/10/2026). `node --test`. Fixtures SINTÉTICAS (NIF inventado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerResultadoWorker } from './tarificador-reglas.ts'

const JOB = '33333333-3333-4333-8333-333333333333'
const base = { trabajoId: JOB, resultado: 'error', error: { tipo: 'portal', mensaje: 'allianz/auto: mapa incompleto: faltan el formulario', url: null } }
const inventario = {
  version: 1,
  marcos: [{ url: 'https://cloud.example.test/ngx-motor-azs/', nombre: 'appArea', elementos: [{ tag: 'input', id: 'matricula', formControlName: 'plate' }] }],
  totalElementos: 1,
  recortado: null,
  textosDescartados: 0,
}

test('el resultado de error conserva el inventario saneado', () => {
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: inventario } })
  assert.ok(l.ok && l.r.tipo === 'error')
  assert.deepEqual(l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom : null, inventario)
})

test('se re-sanea: un value o un dato personal que llegue por el cable NO se guarda', () => {
  const sucio = { ...inventario, marcos: [{ url: 'https://x.test/a?nif=12345678Z', nombre: 'appArea', elementos: [{ tag: 'input', id: 'nif', value: 'Pepa Pérez', ariaLabel: '12345678Z' }] }] }
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: sucio } })
  assert.ok(l.ok && l.r.tipo === 'error')
  const s = JSON.stringify(l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom : null)
  assert.ok(!s.includes('Pepa') && !s.includes('12345678Z'))
})

test('inventario sin forma → se descarta sin rechazar el resultado; con tope de tamaño', () => {
  const malo = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: 'x' } })
  assert.ok(malo.ok && malo.r.tipo === 'error' && malo.r.error.inventarioDom === undefined)
  const enorme = { marcos: [{ url: 'https://x.test', nombre: null, elementos: Array.from({ length: 600 }, (_, i) => ({ tag: 'button', id: `b${i}`, texto: 'Acción '.repeat(10) })) }] }
  const l = leerResultadoWorker({ ...base, error: { ...base.error, inventarioDom: { marcos: Array.from({ length: 5 }, () => enorme.marcos[0]) } } })
  assert.ok(l.ok && l.r.tipo === 'error' && l.r.error.inventarioDom)
  const inv = l.ok && l.r.tipo === 'error' ? l.r.error.inventarioDom! : null
  assert.ok(Buffer.byteLength(JSON.stringify(inv)) <= 60 * 1024)
  assert.ok(inv!.recortado && inv!.recortado.elementosDescartados > 0)
})

// Recorrido del trabajo (15/10/2026): capturas ligeras de cada pantalla/paso/diálogo. Se re-sanea al recibirlo.
const captura = (extra: Record<string, unknown> = {}) => ({
  n: 1, ms: 1200, motivo: 'dialogo', url: 'https://portal.example.test/nsei/alta?token=abc', titulo: 'Alta de tomador',
  encabezados: ['Datos del tomador'], etiquetas: ['Nombre', 'NIF'], botones: ['Aceptar', 'Cancelar'], enlaces: [],
  dialogos: [{ rol: 'dialog', id: 'dlgTomador', clase: 'mat-dialog-container', titulo: 'Tomador existente', botones: ['Aceptar'] }],
  tablas: [3], campos: 2, ...extra,
})

test('el resultado de error conserva el recorrido saneado (sin query en la URL)', () => {
  const l = leerResultadoWorker({ ...base, error: { ...base.error, recorrido: { version: 1, capturas: [captura()], descartadas: 0 } } })
  assert.ok(l.ok && l.r.tipo === 'error')
  const rec = l.ok && l.r.tipo === 'error' ? l.r.error.recorrido : undefined
  assert.equal(rec?.capturas.length, 1)
  assert.equal(rec?.capturas[0].url, 'https://portal.example.test/nsei/alta')
  assert.equal(rec?.capturas[0].dialogos[0].id, 'dlgTomador')
})

test('recorrido: se re-sanea (NIF, correo, fecha, nombre tras «tomador») y se respeta el tope; sin forma se descarta', () => {
  const sucio = captura({ etiquetas: ['Tomador: Pepa Pérez', 'Contacto pepa@correo.test', 'Nacido el 15/01/1980', 'NIF 12345678Z'], valor: 'Pepa', value: 'Pepa' })
  const l = leerResultadoWorker({ ...base, error: { ...base.error, recorrido: { version: 1, capturas: [sucio] } } })
  assert.ok(l.ok && l.r.tipo === 'error')
  const s = JSON.stringify(l.ok && l.r.tipo === 'error' ? l.r.error.recorrido : null)
  for (const dato of ['Pepa', 'pepa@', '15/01/1980', '12345678Z']) assert.ok(!s.includes(dato), dato)
  const malo = leerResultadoWorker({ ...base, error: { ...base.error, recorrido: 'x' } })
  assert.ok(malo.ok && malo.r.tipo === 'error' && malo.r.error.recorrido === undefined)
  const muchas = Array.from({ length: 120 }, (_, i) => captura({ n: i + 1, botones: Array.from({ length: 30 }, (_, j) => `Botón largo número ${i}-${j} con texto`), etiquetas: Array.from({ length: 40 }, (_, j) => `Campo ${i}-${j} descripción`) }))
  const g = leerResultadoWorker({ ...base, error: { ...base.error, recorrido: { version: 1, capturas: muchas } } })
  const rec = g.ok && g.r.tipo === 'error' ? g.r.error.recorrido : undefined
  assert.ok(rec && Buffer.byteLength(JSON.stringify(rec)) <= 60 * 1024)
  assert.ok(rec!.capturas.every((c) => Buffer.byteLength(JSON.stringify(c)) <= 4 * 1024))
  assert.ok(rec!.descartadas > 0)
})
