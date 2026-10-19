import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lineaContactosLead, textoAvisoLeadCorreo, type LeadCorreo } from './lead-correduria.ts'
import { interpretarContactosLead } from '../seguimiento-asegura.ts'

// 🪤 Lead de correo → Google Contacts al momento (19/10/2026). El aviso dice qué pasó con UNA línea 📇, sin
// datos personales, y la llamada nunca bloquea el alta ni el aviso.

test('la línea 📇: añadido / ya estaba / no se pudo (motivo), sin PII', () => {
  assert.equal(lineaContactosLead({ estado: 'anadido', motivo: 'creado' }), '📇 añadido a Contactos')
  assert.equal(lineaContactosLead({ estado: 'ya_estaba', motivo: 'adoptado' }), '📇 ya estaba en Contactos')
  assert.equal(lineaContactosLead({ estado: 'no_activada', motivo: 'pendiente_activar' }), '📇 no se pudo añadir a Contactos (la sincronización con Google no está activada)')
  assert.equal(lineaContactosLead({ estado: 'revision', motivo: 'nombre_distinto' }), '📇 no se pudo añadir a Contactos (dudoso: está en la cola de revisión de Google Contactos)')
  assert.equal(lineaContactosLead({ estado: 'error', motivo: 'red' }), '📇 no se pudo añadir a Contactos (sin respuesta a tiempo: míralo en Contactos)')
  assert.equal(lineaContactosLead({ estado: 'error', motivo: null }), '📇 no se pudo añadir a Contactos (error sin detalle)')
  assert.equal(lineaContactosLead(null), null)
})

test('interpretar el puerto: solo sus seis estados; lo que no se entiende es error, nunca «añadido»', () => {
  assert.deepEqual(interpretarContactosLead({ status: 200, json: { estado: 'anadido', motivo: 'creado' } }), { estado: 'anadido', motivo: 'creado' })
  assert.deepEqual(interpretarContactosLead({ status: 200, json: { estado: 'sin_conexion', motivo: 'revocada' } }), { estado: 'sin_conexion', motivo: 'revocada' })
  assert.deepEqual(interpretarContactosLead({ status: 502, json: { estado: 'error', motivo: 'red' } }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarContactosLead({ status: 200, json: { estado: 'ok' } }), { estado: 'error', motivo: 'http_200' })
  assert.deepEqual(interpretarContactosLead({ status: 500, json: null }), { estado: 'error', motivo: 'http_500' })
  // Un motivo con texto libre (podría llevar datos) no pasa.
  assert.deepEqual(interpretarContactosLead({ status: 200, json: { estado: 'error', motivo: 'Ana 600112233' } }), { estado: 'error', motivo: null })
})

test('el aviso del lead lleva la línea 📇 (y no la lleva si no se intentó)', () => {
  const l = { nombre: 'Ana', ramos: [], esLead: true } as unknown as LeadCorreo
  const base = { remitente: 'Ana', asunto: 'x', lead: l, ficha: { estado: 'nueva' as const, id: 'id1', url: 'https://p/c/id1' }, oportunidades: [], plantilla: null }
  assert.match(textoAvisoLeadCorreo({ ...base, contactos: { estado: 'anadido', motivo: 'creado' } }), /📇 añadido a Contactos/)
  assert.doesNotMatch(textoAvisoLeadCorreo(base), /📇/)
})

test('el proceso llama a Contactos SOLO con ficha propia, tras el alta y ANTES del aviso, sin poder romperlo', () => {
  const src = readFileSync(new URL('./lead-correduria-proceso.ts', import.meta.url), 'utf8')
  const iAlta = src.indexOf('await altaClienteAsegura(')
  const iContactos = src.indexOf('await anadirLeadAContactosAsegura(')
  const iAviso = src.indexOf("tgAviso('correduria.lead-correo', textoAvisoLeadCorreo({", iAlta)
  assert.ok(iAlta > 0 && iContactos > iAlta && iAviso > iContactos)
  const tramo = src.slice(src.lastIndexOf('\n', src.lastIndexOf('if (', iContactos)), iContactos)
  assert.match(tramo, /if \(ficha\.estado === 'nueva' \|\| ficha\.estado === 'existente'\)/)
  assert.match(src.slice(iContactos, iContactos + 200), /\.catch\(\(\) => /, 'un fallo de red no puede tumbar el lead')
  assert.match(src.slice(iAviso, iAviso + 400), /contactos,/)
})
