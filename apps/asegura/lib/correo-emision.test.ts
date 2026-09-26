// Cepo del correo tras emitir. Mismo criterio que la invitación al portal: la dirección la tecleó
// alguien, así que el correo no nombra NADA de la cartera. La función ni siquiera recibe esos datos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import { cuerpoCorreoEmision } from './correo-emision.ts'

const aplanar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ENLACE = 'https://clientes.grupoasegura.es/boveda'

test('no nombra ningún campo de la cartera, con baja y sin ella', () => {
  for (const conBaja of [true, false]) {
    const c = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja })
    const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
    const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => todo.includes(aplanar(campo)))
    assert.deepEqual(colados, [], `campos de la cartera en el correo: ${colados.join(', ')}`)
    for (const cia of ['mapfre', 'allianz', 'reale', 'axa', 'generali', 'occident']) assert.ok(!todo.includes(cia), cia)
  }
})

test('la firma de la baja sale SOLO si hay baja abierta, y el botón lleva al portal', () => {
  const con = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: true })
  const sin = cuerpoCorreoEmision({ nombre: 'Pablo', enlace: ENLACE, conBaja: false })
  assert.match(con.texto, /firma la baja de tu seguro anterior/i)
  assert.doesNotMatch(sin.texto, /baja/i)
  assert.match(con.html, new RegExp(`href="${ENLACE}"`))
  assert.match(sin.html, new RegExp(`href="${ENLACE}"`))
})

test('sin nombre saluda sin inventárselo, y un enlace no https no se envía', () => {
  assert.match(cuerpoCorreoEmision({ nombre: null, enlace: ENLACE, conBaja: false }).texto, /^Hola:/)
  assert.match(cuerpoCorreoEmision({ nombre: 'Ana<b>', enlace: ENLACE, conBaja: false }).html, /Ana&lt;b&gt;/)
  assert.throws(() => cuerpoCorreoEmision({ nombre: 'x', enlace: 'http://a.es', conBaja: false }))
})

test('🪤 la firma de la función no admite datos de la cartera', () => {
  const src = readFileSync(new URL('./correo-emision.ts', import.meta.url), 'utf8')
  const tipo = src.slice(src.indexOf('export type DatosCorreoEmision'), src.indexOf('export type CuerpoCorreoEmision'))
  for (const campo of ['compania', 'aseguradora', 'numero', 'matricula', 'prima', 'iban', 'dni']) {
    assert.doesNotMatch(tipo, new RegExp(`\\b${campo}`, 'i'), campo)
  }
})

test('🪤 tras emitir: solo con acuñado OK, y el correo de prueba no cuenta como enviado al cliente', () => {
  const ruta = readFileSync(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url), 'utf8')
  assert.equal(ruta.match(/await trasEmision\(/g)?.length, 2, 'los dos caminos que acuñan')
  assert.match(ruta, /acunadoAc\.ok \? await trasEmision\(/)
  assert.match(ruta, /acunado\.ok \? await trasEmision\(/)
  const tras = readFileSync(new URL('./tras-emision.ts', import.meta.url), 'utf8')
  assert.match(tras, /clienteId: opciones\.prueba \? null : e\.clienteId/)
  assert.match(tras, /if \(!opciones\.prueba && !correoEmisionActivo\(\)\) return/)
  // La baja se mira en la póliza SUSTITUIDA, no en cualquiera.
  assert.match(tras, /where poliza_id = \$\{e\.polizaOrigenId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = 'solicitada'/)
})

test('🪤 la firma del portal dispara el envío a la compañía SOLO cuando quedó firmada, y un fallo no la estropea', () => {
  const ruta = readFileSync(new URL('../app/api/portal/anulacion/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf("if (r.estado === 'firmada') {")
  assert.ok(i > 0 && ruta.indexOf('enviarAnulacionTrasFirma(correduria.id, anulacionId)') > i)
  assert.match(ruta.slice(i, i + 900), /try \{[\s\S]*\} catch \(e\) \{/)
})
