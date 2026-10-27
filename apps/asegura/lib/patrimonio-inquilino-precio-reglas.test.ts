import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CLAVES_INFO_RIESGO,
  ORIGEN_INQUILINO_PRECIO,
  cuerpoAltaInquilino,
  infoRiesgoSolicitud,
  ramoSolicitudInquilino,
  textoAvisoInquilino,
  textoTareaInquilino,
  validarSolicitudInquilino,
} from './patrimonio-inquilino-precio-reglas.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const BASE = { identidadId: ID, que: 'ambos', nombre: 'Lucía Pérez', canal: 'correo', contacto: 'lucia@example.com' }

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('validar: lee SOLO sus cinco campos; lo del propietario o un «ofertas» se ignoran', () => {
  const r = validarSolicitudInquilino({ ...BASE, clienteId: ID, contratoId: ID, inmuebleId: ID, titularId: ID, ofertas: true })
  assert.ok(r.ok)
  assert.deepEqual(Object.keys(r.datos).sort(), ['canal', 'contacto', 'identidadId', 'nombre', 'que'])
})

test('validar: rechaza lo que no es de la lista cerrada o viene vacío', () => {
  assert.deepEqual(validarSolicitudInquilino({ ...BASE, identidadId: 'x' }), { ok: false, campo: 'identidadId' })
  assert.deepEqual(validarSolicitudInquilino({ ...BASE, que: 'vida' }), { ok: false, campo: 'que' })
  assert.deepEqual(validarSolicitudInquilino({ ...BASE, nombre: '   ' }), { ok: false, campo: 'nombre' })
  assert.deepEqual(validarSolicitudInquilino({ ...BASE, canal: 'whatsapp' }), { ok: false, campo: 'canal' })
  assert.deepEqual(validarSolicitudInquilino({ ...BASE, contacto: '' }), { ok: false, campo: 'contacto' })
  assert.deepEqual(validarSolicitudInquilino(null), { ok: false, campo: 'identidadId' })
})

test('🚨 info_riesgo: ninguna clave ata la petición al propietario (inmueble, contrato, titular, ficha)', () => {
  const r = validarSolicitudInquilino(BASE)
  assert.ok(r.ok)
  const info = infoRiesgoSolicitud(r.datos)
  assert.deepEqual(Object.keys(info).sort(), [...CLAVES_INFO_RIESGO].sort())
  for (const k of Object.keys(info)) assert.doesNotMatch(k, /inmueble|contrato|titular|cliente|poliza|renta|direccion/i)
})

test('🚨 el origen NO cae en ningún lector de peticiones del propietario (`portal:patrimonio` exacto o por prefijo)', () => {
  assert.notEqual(ORIGEN_INQUILINO_PRECIO, 'portal:patrimonio')
  assert.ok(!ORIGEN_INQUILINO_PRECIO.startsWith('portal:patrimonio'))
})

test('🚨 alta: SIEMPRE ficha nueva (forzar), fuente portal, un solo contacto en su campo, sin consentimiento comercial', () => {
  const correo = cuerpoAltaInquilino({ identidadId: ID, que: 'rc', nombre: 'L', canal: 'correo', contacto: 'a@b.es' })
  assert.equal(correo.forzar, true)
  assert.equal(correo.fuente, 'portal')
  assert.equal(correo.email, 'a@b.es')
  assert.equal(correo.telefono, undefined)
  const tel = cuerpoAltaInquilino({ identidadId: ID, que: 'rc', nombre: 'L', canal: 'telefono', contacto: '600000000' })
  assert.equal(tel.telefono, '600000000')
  assert.equal(tel.email, undefined)
  for (const c of [correo, tel]) {
    assert.equal(c.consentimiento, undefined, 'la petición no es un consentimiento')
    assert.equal(c.id, undefined)
    assert.equal(c.clienteId, undefined)
  }
})

test('ramo: solo RC → responsabilidad_civil; contenido o ambos → hogar', () => {
  assert.equal(ramoSolicitudInquilino('rc'), 'responsabilidad_civil')
  assert.equal(ramoSolicitudInquilino('contenido'), 'hogar')
  assert.equal(ramoSolicitudInquilino('ambos'), 'hogar')
})

test('Telegram solo ids; la tarea dice el canal y avisa si el contacto está en otra ficha', () => {
  const aviso = textoAvisoInquilino({ oportunidadId: 'op-1', que: 'ambos' })
  assert.match(aviso, /op-1/)
  assert.doesNotMatch(aviso, /Lucía|@|\d{9}/)
  assert.match(textoTareaInquilino({ que: 'ambos', canal: 'telefono', contactoEnOtraFicha: false }), /por teléfono/)
  assert.doesNotMatch(textoTareaInquilino({ que: 'ambos', canal: 'correo', contactoEnOtraFicha: false }), /OTRA ficha/)
  assert.match(textoTareaInquilino({ que: 'ambos', canal: 'correo', contactoEnOtraFicha: true }), /OTRA ficha/)
})

test('🚨 el lado con BD no toca el patrimonio del propietario ni escribe consentimientos', () => {
  const src = sinComentarios(readFileSync(new URL('./patrimonio-inquilino-precio-portal.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(src, /portal_patrimonio_|portalPatrimonio/, 'no lee ni escribe tablas del patrimonio')
  assert.doesNotMatch(src, /consent_logs|comercial/i, 'la petición no se convierte en consentimiento comercial')
  assert.doesNotMatch(src, /console\.[a-z]+\([^)]*(nombre|contacto)/, 'ningún dato personal al log')
})
