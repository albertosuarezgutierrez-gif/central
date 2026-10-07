// Cepos de «Presupuestos de compañías» desde la oportunidad (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  companiasDisponibles, comunConRiesgo, extrasConGuardado, extrasIniciales, formularioComunInicial, idOportunidadCreada,
  leerPresupuestos, mensajePedido, prepararPedido, ramosConBot, ultimoPorCompania, sembrarDesdeRiesgoLibre, avisoRamoSinTarifa,
  AVISO_COTIZA_POR_BOTS, type FormularioComun,
} from './presupuestos-companias.ts'

const APP = join(import.meta.dirname, '..')
const HOY = new Date('2026-10-07T10:00:00Z')

const lleno = (): FormularioComun => ({
  ...formularioComunInicial({ codigoPostal: '41003', ciudad: 'Sevilla' }, HOY),
  m2Construidos: '1200', anioConstruccion: '1975', plantas: '5', numViviendasYLocales: '20', capitalContinente: '1.500.000',
})

test('registro: hoy solo Allianz cotiza comunidades; otro ramo no tiene bots', () => {
  assert.deepEqual(ramosConBot(), ['comunidades'])
  assert.deepEqual(companiasDisponibles('comunidades').map((c) => c.compania), ['allianz'])
  assert.deepEqual(companiasDisponibles('hogar'), [])
})

test('el formulario común no lleva los desplegables de Allianz: son extras de su capacidad', () => {
  const f = formularioComunInicial(null, HOY)
  assert.ok(!('tipoVivienda' in f) && !('uso' in f) && !('listaPropietarios' in f))
  const x = extrasIniciales(companiasDisponibles('comunidades'))
  assert.equal(x.allianz.tipoVivienda, 'Viviendas Pisos en Alto')
  assert.equal(x.allianz.modalidad, '')
})

test('prepararPedido: válido → formulario canónico + extras por compañía; vacío = null, nunca 0/false', () => {
  const disp = companiasDisponibles('comunidades')
  const p = prepararPedido(lleno(), extrasIniciales(disp), ['allianz'], disp, HOY)
  assert.ok(p.ok)
  if (p.ok) {
    assert.equal(p.formulario.capitalContinente, 1500000)
    assert.equal(p.formulario.capitalContenido, null)
    assert.equal(p.formulario.ascensor, null)
    assert.deepEqual(p.companias, ['allianz'])
    assert.equal(p.extras.allianz.uso, 'Habitual')
    assert.ok(!('tipoVivienda' in p.formulario))
  }
})

test('prepararPedido: errores legibles antes de encolar (forma, dominio, extras y sin compañía)', () => {
  const disp = companiasDisponibles('comunidades')
  const sinCompania = prepararPedido(lleno(), extrasIniciales(disp), [], disp, HOY)
  assert.ok(!sinCompania.ok && sinCompania.errores.includes('Elige al menos una compañía'))
  const sinCapital = prepararPedido({ ...lleno(), capitalContinente: '' }, extrasIniciales(disp), ['allianz'], disp, HOY)
  assert.ok(!sinCapital.ok && sinCapital.errores.some((e) => /valor de reposición/.test(e)))
  const caducada = prepararPedido({ ...lleno(), fechaEfecto: '2026-10-01' }, extrasIniciales(disp), ['allianz'], disp, HOY)
  assert.ok(!caducada.ok && caducada.errores.some((e) => /ya ha pasado/.test(e)))
  const sinExtra = prepararPedido(lleno(), { allianz: { tipoVivienda: '', uso: 'Habitual', listaPropietarios: '> 50%' } }, ['allianz'], disp, HOY)
  assert.ok(!sinExtra.ok && sinExtra.errores.includes('Allianz · Tipo de vivienda: obligatorio'))
  // Una compañía no disponible para el ramo no cuenta como elegida.
  const ajena = prepararPedido(lleno(), extrasIniciales(disp), ['mapfre'], disp, HOY)
  assert.ok(!ajena.ok && ajena.errores.includes('Elige al menos una compañía'))
})

test('pre-relleno: lo guardado manda; un riesgo antiguo de Allianz rellena sus extras', () => {
  const disp = companiasDisponibles('comunidades')
  const base = formularioComunInicial(null, HOY)
  const riesgo = { m2Construidos: 900, capitalContinente: 1000000, tipoVivienda: 'Otra etiqueta', direccion: { codigoPostal: '41001' } }
  const f = comunConRiesgo(base, riesgo, HOY)
  assert.equal(f.m2Construidos, '900')
  assert.equal(f.capitalContinente, '1.000.000')
  assert.equal(f.codigoPostal, '41001')
  assert.ok(!('tipoVivienda' in f))
  const deRiesgo = extrasConGuardado(extrasIniciales(disp), disp, null, riesgo)
  assert.equal(deRiesgo.allianz.tipoVivienda, 'Otra etiqueta')
  const guardado = extrasConGuardado(extrasIniciales(disp), disp, { allianz: { uso: 'Secundaria' } }, riesgo)
  assert.equal(guardado.allianz.uso, 'Secundaria')
  assert.equal(guardado.allianz.tipoVivienda, 'Viviendas Pisos en Alto', 'con guardado, el riesgo antiguo no se mezcla')
})

test('lectura: forma desconocida → null; trabajos sin id/compañía se descartan; último por compañía', () => {
  assert.equal(leerPresupuestos({ estado: 'error' }), null)
  const l = leerPresupuestos({
    estado: 'ok', ramo: 'comunidades', guardado: null, previoCliente: { riesgo: null },
    trabajos: [
      { id: 'a', compania: 'allianz', estado: 'ok', creadoEn: '2026-10-07T09:00:00Z', ofertas: [{ primaTotalAnual: 300 }] },
      { id: 'b', compania: 'allianz', estado: 'error_definitivo', creadoEn: '2026-10-06T09:00:00Z', error: { tipo: 'datos', mensaje: 'x' } },
      { compania: 'allianz', estado: 'ok' },
    ],
  })
  assert.ok(l)
  assert.equal(l!.previo, null, 'previo sin riesgo = no hay pre-relleno, no un riesgo vacío')
  assert.equal(l!.trabajos.length, 2)
  const { ultimos, anteriores } = ultimoPorCompania(l!.trabajos)
  assert.deepEqual(ultimos.map((t) => t.id), ['a'])
  assert.deepEqual(anteriores.map((t) => t.id), ['b'])
})

test('mensajes: 202 por compañía, 409 = no autorizada, 400 con errores, apagado', () => {
  const ok = mensajePedido(202, { resultados: [{ compania: 'allianz', estado: 'encolado', trabajoId: 't' }, { compania: 'mapfre', estado: 'rechazado', status: 409, motivo: 'modo_no_automatizable' }] }, { allianz: 'Allianz' })
  assert.ok(ok.ok && ok.resultados[0].ok && !ok.resultados[1].ok && /no está autorizada/.test(ok.resultados[1].texto))
  const mal = mensajePedido(400, { errores: ['Allianz · Uso: obligatorio'] }, {})
  assert.ok(!mal.ok && /Uso: obligatorio/.test(mal.mensaje))
  const apagado = mensajePedido(503, { estado: 'apagado' }, {})
  assert.ok(!apagado.ok && /apagado/.test(apagado.mensaje))
})

test('ficha → oportunidad: crear abre la nueva; 409 duplicada abre la ya abierta; otro error, nada', () => {
  const id = '11111111-2222-3333-4444-555555555555'
  assert.equal(idOportunidadCreada(201, { estado: 'ok', id }), id)
  assert.equal(idOportunidadCreada(409, { estado: 'duplicada', id }), id)
  assert.equal(idOportunidadCreada(422, { estado: 'invalido', motivo: 'x' }), null)
  assert.equal(idOportunidadCreada(201, { estado: 'ok', id: 'no-uuid' }), null)
})

test('la ficha ya no cotiza: solo enlaza a la oportunidad; la oportunidad monta la sección', () => {
  const cab = readFileSync(join(APP, 'app/(usuario)/correduria/cliente/[id]/Cabecera.tsx'), 'utf8')
  assert.ok(!cab.includes('PrecioAllianzBot'))
  assert.match(cab, /<PedirPresupuestoBot clienteId=\{clienteId\} \/>/)
  const boton = readFileSync(join(APP, 'app/(usuario)/correduria/cliente/[id]/PedirPresupuestoBot.tsx'), 'utf8')
  assert.ok(!boton.includes('tarificador/encolar') && !boton.includes('tarificador/oportunidad'), 'el botón de la ficha no encola nada')
  assert.match(boton, /#presupuestos/)
  const pantalla = readFileSync(join(APP, 'app/(usuario)/correduria/oportunidad/[id]/RiesgoPantalla.tsx'), 'utf8')
  assert.match(pantalla, /<PresupuestosCompanias\s+oportunidadId=\{op\.id\}\s+ramo=\{op\.ramo\}\s+riesgoLibre=\{/, 'y le pasa el capital y la dirección del riesgo para sembrar el formulario')
  const seccion = readFileSync(join(APP, 'app/(usuario)/correduria/oportunidad/[id]/PresupuestosCompanias.tsx'), 'utf8')
  assert.match(seccion, /prepararPedido\(f, extras, elegidas, disponibles\)/, 'se valida antes de encolar')
  assert.match(seccion, /LOTE_ANTERIORES/, 'las peticiones anteriores no se montan de golpe')
  assert.match(seccion, /sembrarDesdeRiesgoLibre\(f0, libreRef\.current\)/, 'lo guardado/previo manda y el riesgo solo rellena huecos')
})

test('siembra desde «Datos del riesgo»: capital y dirección solo en los campos vacíos; lo tecleado manda; null ≠ 0', () => {
  const base = formularioComunInicial(null, HOY)
  const a = sembrarDesdeRiesgoLibre(base, { capital: 1500000, direccion: 'Calle Socorro 24, 41003 Sevilla' })
  assert.equal(a.formulario.capitalContinente, '1.500.000')
  assert.equal(a.formulario.via, 'Calle Socorro 24, 41003 Sevilla')
  assert.equal(a.formulario.codigoPostal, '41003')
  assert.deepEqual(a.sembrados, ['capital', 'dirección', 'código postal'])
  // Lo ya puesto no se pisa.
  const lleno2 = { ...base, capitalContinente: '900.000', via: 'Avenida X 1', codigoPostal: '41010' }
  const b = sembrarDesdeRiesgoLibre(lleno2, { capital: 1500000, direccion: 'Calle Socorro 24, 41003' })
  assert.equal(b.formulario.capitalContinente, '900.000')
  assert.equal(b.formulario.via, 'Avenida X 1')
  assert.equal(b.formulario.codigoPostal, '41010')
  assert.deepEqual(b.sembrados, [])
  // Sin dato no se inventa: capital 0 o null y dirección vacía no siembran nada; dos CP distintos no se adivinan.
  for (const libre of [null, undefined, { capital: null, direccion: null }, { capital: 0, direccion: '  ' }]) {
    const c = sembrarDesdeRiesgoLibre(base, libre)
    assert.deepEqual(c.formulario, base)
    assert.deepEqual(c.sembrados, [])
  }
  assert.equal(sembrarDesdeRiesgoLibre(base, { capital: null, direccion: 'Pl. 41001 y 41002' }).formulario.codigoPostal, base.codigoPostal)
  assert.equal(sembrarDesdeRiesgoLibre(base, { capital: null, direccion: 'Ref 1234567' }).formulario.codigoPostal, base.codigoPostal, 'siete cifras no son un CP')
})

test('el aviso de «se cotiza fuera» solo si ningún bot cotiza el ramo', () => {
  assert.equal(avisoRamoSinTarifa('comunidades', 'FUERA'), AVISO_COTIZA_POR_BOTS)
  assert.match(AVISO_COTIZA_POR_BOTS, /bots/)
  for (const r of ['comercio', 'responsabilidad_civil', 'otros']) assert.equal(avisoRamoSinTarifa(r, 'FUERA'), 'FUERA', r)
})
