// Guarda de emisión de Occident + URL del formulario (07/10/2026). Puro: sin navegador ni red.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import { comprobarDescriptorOccident, comprobarUrlOccident, motivoProhibidoOccident, textoProhibidoOccident } from '../src/adapters/occident/guarda.ts'
import { ErrorMapaIncompleto, SEL, esUrlFormulario, esUrlSso, selObligatorio, urlEntradaPortal, urlFormularioTomador } from '../src/adapters/occident/mapa.ts'
import { ramoDelIframe } from '../src/adapters/occident/comunidades.ts'

const PROHIBIDOS = [
  'Emitir', 'Emisión', 'EMISION', 'Contratar', 'Contratación', 'Formalizar', 'Formalización', 'Grabar', 'Grabar póliza', 'Guardar proyecto',
  'Firmar', 'Firma digital', 'Aceptar', 'Aceptar y emitir', 'Confirmar', 'Confirmar contratación', 'Pagar', 'Pago', 'Domiciliación', 'Alta',
  'Solicitar', 'Tramitar', 'btnEmitir', 'btn-grabar', 'btnAccept', '¿Ha olvidado su clave?', 'Cambiar contraseña',
  'Gestión de proyectos y emisiones (PU)', '/productos/gestiondeproyectosyemisionespu', '/negocio/polizas/consultadepolizasysuplementosoccident',
]
const PERMITIDOS = ['Calcular', 'Tarificar', 'Iniciar sesión', 'SubmitCreds', 'Productos', 'Multirriesgos', 'Comunidades', 'Tarificación', 'Buscar', 'Siguiente', 'Volver']

test('guarda Occident: lo de emitir/contratar/grabar/firmar/pagar/… es prohibido', () => {
  for (const t of PROHIBIDOS) assert.ok(textoProhibidoOccident(t), `debería ser prohibido: ${t}`)
})

test('guarda Occident: los controles legítimos de tarificación pasan', () => {
  for (const t of PERMITIDOS) assert.equal(motivoProhibidoOccident(t), null, `no debería bloquear: ${t}`)
  assert.equal(textoProhibidoOccident(null), false)
  assert.equal(textoProhibidoOccident(''), false)
})

test('guarda Occident: un descriptor con UNA pista prohibida lanza EmisionBloqueadaError (id, onclick…)', () => {
  assert.throws(() => comprobarDescriptorOccident(['Continuar', null, null, null, 'btnGrabar', null, null, null, null]), EmisionBloqueadaError)
  assert.throws(() => comprobarDescriptorOccident(['Calcular', null, null, null, null, null, null, 'javascript:emitirPoliza()', null]), EmisionBloqueadaError)
  assert.doesNotThrow(() => comprobarDescriptorOccident(['Calcular', null, 'Calcular prima', null, 'btnCalcular', null, null, null, null]))
})

test('URL: lista blanca de hosts, https y sin patrón de emisión', () => {
  assert.doesNotThrow(() => comprobarUrlOccident('https://portaloccident.gco.global/productos/multirriesgos/comunidades/tarificacion'))
  assert.throws(() => comprobarUrlOccident('http://portaloccident.gco.global/'), ErrorTarificador)
  assert.throws(() => comprobarUrlOccident('https://evil.example/productos'), ErrorTarificador)
  assert.throws(() => comprobarUrlOccident('https://portaloccident.gco.global.evil.example/'), ErrorTarificador)
  assert.throws(() => comprobarUrlOccident('https://portaloccident.gco.global/productos/gestiondeproyectosyemisionespu'), EmisionBloqueadaError)
  assert.throws(() => comprobarUrlOccident('https://portaloccident.gco.global/x?accion=%C3%A9mitir'), EmisionBloqueadaError)
  assert.throws(() => comprobarUrlOccident('no es una url'), ErrorTarificador)
})

test('URL del formulario: construida solo con dígitos y sin token', () => {
  assert.equal(urlFormularioTomador(), 'https://catalanaaplicaciones.gco.global/FE/SGE.Tarifa.Generico.FE.ProyectoTomador/?ramoGco=90690')
  assert.equal(urlFormularioTomador('12345'), 'https://catalanaaplicaciones.gco.global/FE/SGE.Tarifa.Generico.FE.ProyectoTomador/?ramoGco=12345')
  for (const malo of ['', '9069a', '90690&x=1', '../', '90690#', ' 90690']) assert.throws(() => urlFormularioTomador(malo), ErrorTarificador, malo)
  assert.equal(urlEntradaPortal(), 'https://portaloccident.gco.global/productos/multirriesgos/comunidades/tarificacion')
})

test('esUrlSso / esUrlFormulario / ramoDelIframe', () => {
  assert.ok(esUrlSso('https://ssoaut.gco.global/my.policy'))
  assert.ok(!esUrlSso('https://portaloccident.gco.global/'))
  assert.ok(!esUrlSso('basura'))
  assert.ok(esUrlFormulario(urlFormularioTomador()))
  assert.ok(!esUrlFormulario('https://catalanaaplicaciones.gco.global/otra/ruta'))
  const base = 'https://portaloccident.gco.global/x'
  assert.equal(ramoDelIframe('https://catalanaaplicaciones.gco.global/FE/X/?ramoGco=12345', base), '12345')
  assert.equal(ramoDelIframe('https://catalanaaplicaciones.gco.global/FE/X/?ramoGco=abc', base), '90690')
  assert.equal(ramoDelIframe(null, base), '90690')
})

test('mapa incompleto: el paso de contraseña del SSO es un hueco tipado, no un selector adivinado', () => {
  assert.equal(SEL.ssoContrasena, null)
  assert.throws(() => selObligatorio(SEL.ssoContrasena, 'la contraseña'), (e: unknown) => e instanceof ErrorMapaIncompleto && e.tipo === 'portal' && /mapa incompleto: falta la contraseña/.test(e.message))
})

test('guarda Occident: una %-secuencia mal formada no desactiva la decodificación (fail-closed)', () => {
  for (const u of ['/%65mitir?x=%E0%A4%A', '/contrat%61r?x=%E0%A4%A', '/emisi%C3%B3n?x=%E0%A4%A', '/%67rabar?z=%']) {
    assert.ok(textoProhibidoOccident(u), `debería ser prohibido: ${u}`)
    assert.throws(() => comprobarUrlOccident(`https://portaloccident.gco.global${u}`), EmisionBloqueadaError)
  }
  assert.equal(motivoProhibidoOccident('/tarificar?x=%E0%A4%A'), null)
})
