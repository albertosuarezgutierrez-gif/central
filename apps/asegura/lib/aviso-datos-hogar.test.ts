import test from 'node:test'
import assert from 'node:assert/strict'
import { esParaBanco, textoAvisoDatosHogar, type EntradaAvisoDatosHogar } from './aviso-datos-hogar.ts'

const BASE: EntradaAvisoDatosHogar = {
  respuestas: {
    dni: '12345678Z', fechaNacimiento: '1980-02-01',
    viviendaCp: '41003', viviendaProvincia: 'SEVILLA', viviendaMunicipio: 'SEVILLA', viviendaCalle: 'Calle Socorro', viviendaNumero: '24',
    viviendaPlanta: '2', viviendaPuerta: 'B', viviendaViaTipo: 'CL', viviendaViaNombre: 'SOCORRO',
    regimen: 'propietario', usoVivienda: 'habitual', valorContenido: 30000, alarma: false,
    hipoteca: true, paraBanco: true, entidadHipoteca: 'Caixabank <b>',
    tieneSeguro: true, companiaActual: 'Mapfre', vencimientoActual: '2026-12-15', fechaEfecto: '2026-12-15', comentario: null,
  },
  catastro: { estado: 'ok', referencia: '1234567AB1234C0001XY', metrosCuadrados: 90, anioConstruccion: 1975, uso: 'Residencial' },
  enlaceFicha: 'https://plataforma-ten-flame.vercel.app/correduria/cliente/abc',
  tercero: false,
  anotados: 9,
}

test('hogar para el certificado del banco: 🔴 con la entidad de beneficiario, escapada', () => {
  const t = textoAvisoDatosHogar(BASE)
  assert.match(t, /🔴 <b>Para el certificado del banco<\/b>: Caixabank &lt;b&gt; de beneficiario/)
  assert.equal(esParaBanco(BASE.respuestas), true)
})

test('resumen: dirección, Catastro, régimen/uso, contenido en €, vencimiento y efecto; nunca DNI ni nacimiento', () => {
  const t = textoAvisoDatosHogar(BASE)
  assert.match(t, /📍 CL SOCORRO 24, 2º B · 41003 SEVILLA/)
  assert.match(t, /ref\. 1234567AB1234C0001XY · 90 m² · año 1975/)
  assert.match(t, /Propietario · Vivienda habitual/)
  assert.match(t, /Contenido: 30\.000,00€/)
  assert.match(t, /Seguro actual: Mapfre · vence el 15\/12\/2026/)
  assert.match(t, /Efecto deseado: 15\/12\/2026/)
  assert.doesNotMatch(t, /12345678Z|1980/)
})

test('lo no contestado es «sin dato» (nunca «no» ni 0), y una hipoteca que no es para el banco no lleva 🔴', () => {
  const r = { ...BASE.respuestas, valorContenido: null, alarma: null, paraBanco: false, tieneSeguro: null, fechaEfecto: null }
  const t = textoAvisoDatosHogar({ ...BASE, respuestas: r, catastro: { estado: 'error' }, anotados: null })
  assert.match(t, /Contenido: sin dato · alarma: sin dato/)
  assert.doesNotMatch(t, /🔴/)
  assert.match(t, /no es para el banco/)
  assert.match(t, /Seguro actual: sin dato/)
  assert.match(t, /Efecto deseado: sin fecha/)
  assert.match(t, /no respondió/)
  assert.match(t, /No se han podido pasar al riesgo/)
})
