import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '../../legal-templates/src/encargado.ts'
import { variablesContrato, renderContrato, sustituir, sha256Hex, marcasPendientes, markdownAHtml, type DatosCuenta } from './contrato.ts'
import { PLANTILLA_ENCARGO_V1 } from './plantilla-encargo-v1.ts'

const cuenta: DatosCuenta = {
  razonSocial: 'Talleres de Automoción G2, S.L.', cif: 'B88936158',
  domicilio: { via: 'Calle Ejemplo', numero: '3', cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
}
const firmante = { nombre: 'Manuel Pruebas', nif: '28823484E', titulo: 'administrador' as const, email: 'Manuel@Example.com' }
const base = { cuenta, firmante, encargado: MEDIADOR, herramientas: ['contabilidad', 'rrhh'] as const, numero: 'ENC-B88936158', version: 1, plantillaVersion: 'v1', fecha: new Date('2026-11-07T10:00:00Z') }

test('variables completas → ok, con el encargado de MEDIADOR (no literales)', () => {
  const r = variablesContrato({ ...base, herramientas: [...base.herramientas] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.variables.encargado.nif, MEDIADOR.identidad.nif)
  assert.equal(r.variables.firmante.email, 'manuel@example.com')
  assert.equal(r.variables.firmante.cargo, 'Administrador')
  assert.equal(r.variables.fecha, '07/11/2026')
})

test('CEPO: variable ausente → NO emite y dice qué falta (nunca «N/A»)', () => {
  const r = variablesContrato({ ...base, herramientas: [...base.herramientas], cuenta: { ...cuenta, domicilio: { ...cuenta.domicilio, via: 'N/A' } }, firmante: { ...firmante, titulo: null } })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.faltan.some((f) => f.startsWith('domicilio social')), r.faltan.join(' · '))
  assert.ok(r.faltan.some((f) => f.startsWith('título del firmante')), r.faltan.join(' · '))
  const sinFirmante = variablesContrato({ ...base, herramientas: [...base.herramientas], firmante: null })
  assert.equal(sinFirmante.ok, false)
  const nifMalo = variablesContrato({ ...base, herramientas: [...base.herramientas], firmante: { ...firmante, nif: '28823484A' } })
  assert.equal(nifMalo.ok, false)
  const nominasSola = variablesContrato({ ...base, herramientas: ['nominas'] })
  assert.equal(nominasSola.ok, false, 'nóminas sin rrhh/contabilidad no se emite')
})

test('render: sin {{…}} residuales, anexo SOLO de lo activado, encargado de MEDIADOR, determinista', async () => {
  const r = variablesContrato({ ...base, herramientas: ['contabilidad'] })
  assert.ok(r.ok)
  if (!r.ok) return
  const html = renderContrato(PLANTILLA_ENCARGO_V1.texto, r.variables)
  assert.ok(!/\{\{/.test(html))
  assert.match(html, /I\.A Contabilidad/)
  assert.ok(!/I\.B RRHH/.test(html), 'el anexo incluye un bloque no activado')
  assert.ok(!/I\.C Gestión de taller/.test(html))
  assert.ok(html.includes(MEDIADOR.identidad.claveDgsfp) && html.includes(MEDIADOR.identidad.domicilio))
  assert.match(html, /<ol start="2">/, 'el punto 2 de «Exponen» sigue numerado como 2')
  assert.equal(await sha256Hex(html), await sha256Hex(renderContrato(PLANTILLA_ENCARGO_V1.texto, r.variables)))
})

test('render escapa lo tecleado: una razón social con HTML no inyecta nada', () => {
  const r = variablesContrato({ ...base, herramientas: ['contabilidad'], cuenta: { ...cuenta, razonSocial: '<script>alert(1)</script> **SL**' } })
  assert.ok(r.ok)
  if (!r.ok) return
  const html = renderContrato(PLANTILLA_ENCARGO_V1.texto, r.variables)
  assert.ok(!html.includes('<script>'))
})

test('sustituir lanza si la plantilla trae una variable desconocida', () => {
  const r = variablesContrato({ ...base, herramientas: ['contabilidad'] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.throws(() => sustituir('Hola {{empresa.iban}}', r.variables), /sin sustituir/)
})

test('la plantilla v1 es BORRADOR: tiene marcas «pendiente de confirmar» y no literales del encargado', () => {
  assert.equal(PLANTILLA_ENCARGO_V1.estado, 'borrador')
  assert.ok(marcasPendientes(PLANTILLA_ENCARGO_V1.texto) > 0)
  for (const lit of [MEDIADOR.identidad.nif, MEDIADOR.identidad.nombre, MEDIADOR.identidad.email, MEDIADOR.identidad.claveDgsfp]) {
    assert.ok(!PLANTILLA_ENCARGO_V1.texto.includes(lit), `literal del encargado en la plantilla: ${lit}`)
  }
})

test('markdown mínimo: tabla sin cabecera → filas con th de fila', () => {
  assert.match(markdownAHtml('| | |\n|---|---|\n| **A** | b |'), /<th scope="row"><strong>A<\/strong><\/th><td>b<\/td>/)
})
