import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canalWhatsapp,
  enlaceWhatsappConMensaje,
  mensajeInvitacionWhatsapp,
  movilParaInvitar,
} from './invitacion-whatsapp.ts'
import type { PortalCartera } from './portal-cliente-asegura.ts'

const ENLACE = 'https://clientes.grupoasegura.es/boveda'

function portal(p: Partial<PortalCartera> = {}): PortalCartera {
  return {
    estado: 'invitable',
    ultimoAccesoEn: null,
    identidades: 0,
    emailInvitacion: 'ana@example.com',
    ...p,
  }
}

// ─── El correo que se nombra ────────────────────────────────────────────────

test('el mensaje nombra el correo EXACTO con el que entra, y el enlace', () => {
  const texto = mensajeInvitacionWhatsapp({ nombre: 'Ana', email: 'ana@example.com', enlace: ENLACE, yaEntraba: false })
  assert.ok(texto.includes('ana@example.com'))
  assert.ok(texto.includes(ENLACE))
})

test('sin nombre legible saluda sin nombre, no se lo inventa', () => {
  const texto = mensajeInvitacionWhatsapp({ nombre: null, email: 'a@b.es', enlace: ENLACE, yaEntraba: false })
  assert.ok(texto.startsWith('Hola:'))
  assert.ok(!texto.includes('null'))
  assert.ok(!/estimado cliente/i.test(texto))
})

test('a quien ya entraba no se le dice que ya puede entrar por primera vez', () => {
  const nuevo = mensajeInvitacionWhatsapp({ nombre: 'Ana', email: 'a@b.es', enlace: ENLACE, yaEntraba: false })
  const reenvio = mensajeInvitacionWhatsapp({ nombre: 'Ana', email: 'a@b.es', enlace: ENLACE, yaEntraba: true })
  assert.notEqual(nuevo, reenvio)
  assert.ok(nuevo.includes('Ya puedes consultar'))
  assert.ok(reenvio.includes('Te reenvío el enlace'))
  assert.ok(!reenvio.includes('Ya puedes consultar'))
})

test('un salto de línea en el nombre no parte el mensaje', () => {
  const texto = mensajeInvitacionWhatsapp({ nombre: 'Ana\nMaría', email: 'a@b.es', enlace: ENLACE, yaEntraba: false })
  assert.ok(texto.startsWith('Hola, Ana María:'))
})

// ─── El número ──────────────────────────────────────────────────────────────

test('elige el primer MÓVIL de la lista y se salta el fijo', () => {
  assert.equal(movilParaInvitar(['954 12 34 56', '612 34 56 78']), '612 34 56 78')
  assert.equal(movilParaInvitar([null, '  ', '+34 655 000 111']), '+34 655 000 111')
})

test('sin ningún móvil devuelve null (un fijo NO vale)', () => {
  assert.equal(movilParaInvitar(['954123456', '900 100 100', null]), null)
  assert.equal(movilParaInvitar([]), null)
})

test('el wa.me lleva el mensaje codificado y no un texto crudo', () => {
  const url = enlaceWhatsappConMensaje('612345678', 'Hola Ana:\nentra en https://x.es?a=1&b=2')
  assert.ok(url !== null)
  assert.ok(url.startsWith('https://wa.me/34612345678?text='))
  assert.ok(!url.includes('\n'))
  assert.ok(url.includes('%0A'))
  // El `&` del enlace, sin codificar, cortaría el mensaje por la mitad.
  assert.ok(!url.slice('https://wa.me/34612345678?text='.length).includes('&'))
})

test('un fijo no produce enlace de WhatsApp', () => {
  assert.equal(enlaceWhatsappConMensaje('954123456', 'hola'), null)
})

// ─── El cepo que de verdad importa: no rodear los frenos del correo ─────────

test('si no se puede invitar por correo, tampoco se ofrece WhatsApp', () => {
  for (const estado of ['ambiguo', 'resuelve_a_otra', 'sin_email', 'ilegible', 'no_comprobado'] as const) {
    const r = canalWhatsapp({
      accion: 'ninguna',
      // El caso peor: la dirección se lee perfectamente y aun así no se ofrece.
      portal: portal({ estado, emailInvitacion: 'ana@example.com' }),
      enlace: ENLACE,
      telefonos: ['612345678'],
      nombre: 'Ana',
    })
    assert.equal(r.estado, 'no_procede', `${estado} no puede ofrecer WhatsApp`)
  }
})

test('sin correo confirmado NO se ofrece, aunque haya móvil y enlace', () => {
  const r = canalWhatsapp({
    accion: 'invitar',
    portal: portal({ emailInvitacion: null }),
    enlace: ENLACE,
    telefonos: ['612345678'],
    nombre: 'Ana',
  })
  assert.equal(r.estado, 'sin_correo_que_nombrar')
})

test('sin portal configurado no se ofrece un «entra aquí» sin el aquí', () => {
  const r = canalWhatsapp({ accion: 'invitar', portal: portal(), enlace: null, telefonos: ['612345678'], nombre: 'Ana' })
  assert.equal(r.estado, 'sin_enlace')
})

test('con fijo únicamente: sin_movil, y lo explica', () => {
  const r = canalWhatsapp({ accion: 'invitar', portal: portal(), enlace: ENLACE, telefonos: ['954123456'], nombre: 'Ana' })
  assert.equal(r.estado, 'sin_movil')
  assert.ok(r.estado === 'sin_movil' && r.nota.includes('móvil'))
})

test('el caso bueno: enlace listo, con el correo del puerto dentro', () => {
  const r = canalWhatsapp({
    accion: 'invitar',
    portal: portal({ emailInvitacion: 'ana@example.com' }),
    enlace: ENLACE,
    telefonos: ['954123456', '612 34 56 78'],
    nombre: 'Ana',
  })
  assert.equal(r.estado, 'listo')
  if (r.estado !== 'listo') return
  assert.equal(r.telefono, '612 34 56 78')
  assert.ok(r.url.startsWith('https://wa.me/34612345678?text='))
  assert.ok(r.texto.includes('ana@example.com'))
  assert.ok(decodeURIComponent(r.url.split('?text=')[1]).includes(ENLACE))
})

test('a quien ya entra se le reenvía el enlace, con el texto de reenvío', () => {
  const r = canalWhatsapp({
    accion: 'reenviar',
    portal: portal({ estado: 'ya_entra', identidades: 1, emailInvitacion: 'ana@example.com' }),
    enlace: ENLACE,
    telefonos: ['612345678'],
    nombre: 'Ana',
  })
  assert.equal(r.estado, 'listo')
  assert.ok(r.estado === 'listo' && r.texto.includes('Te reenvío el enlace'))
})

// ─── Nada de la cartera viaja en el mensaje ─────────────────────────────────

test('el mensaje no puede contar nada de sus seguros', () => {
  const texto = mensajeInvitacionWhatsapp({ nombre: 'Ana', email: 'a@b.es', enlace: ENLACE, yaEntraba: false })
  for (const prohibido of ['póliza', 'poliza', 'prima', 'matrícula', 'matricula', 'DNI', 'compañía', 'compania', 'recibo', 'siniestro']) {
    assert.ok(!texto.toLowerCase().includes(prohibido.toLowerCase()), `el mensaje no puede nombrar «${prohibido}»`)
  }
})
