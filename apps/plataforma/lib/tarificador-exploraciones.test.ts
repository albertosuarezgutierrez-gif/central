import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENTRADAS_EXPLORACION } from '@central/module-tarificacion'
import {
  ENCOLAR_DISPONIBLE,
  ENTRADA_POR_DEFECTO,
  OPCIONES_NUEVA,
  costeExploracion,
  esEntradaNueva,
  estadoExploracion,
  leerDetalle,
  leerEncolar,
  leerLista,
  mensajeError,
  motivoFinTexto,
  puedeAprobarMapa,
  refCosteExplorador,
  textoAccion,
  type ResumenExploracion,
} from './tarificador-exploraciones.ts'

const base: ResumenExploracion = {
  id: 'e1', trabajoId: 't1', compania: 'allianz', producto: 'hogar', entrada: 'allianz:particulares:hogar', estadoTrabajo: 'ok',
  estadoMapa: 'borrador', conDatosReales: false, pasos: 6, llamadasIA: 5, costeEstimadoEur: 0.42, costeRealEur: null, modelo: 'anthropic/claude-sonnet-4.5',
  motivoFin: 'resultado', tieneMapa: true, revisadoPor: null, revisadoEn: null, creadoEn: '2026-10-13T10:00:00Z', cerradaEn: '2026-10-13T10:05:00Z',
}

test('leerLista: ok, forma rara y errores del puerto no se confunden con «vacío»', () => {
  assert.deepEqual(leerLista(200, { estado: 'ok', exploraciones: [] }), { ok: true, lista: [] })
  assert.equal(leerLista(200, { estado: 'ok', exploraciones: [base] }).ok, true)
  const sinForma = leerLista(200, { estado: 'ok' })
  assert.equal(sinForma.ok, false)
  const sql = leerLista(503, { estado: 'explorador_sin_esquema', mensaje: 'Falta aplicar el SQL' })
  assert.equal(sql.ok, false)
  assert.match(sql.ok ? '' : sql.mensaje, /Falta aplicar/)
  assert.equal(leerLista(502, null).ok, false)
})

test('leerDetalle: exige id, pasos y mapa o null', () => {
  const d = { ...base, pasosLista: [], mapa: null, mapaInvalido: false }
  assert.equal(leerDetalle(200, { estado: 'ok', exploracion: d }).ok, true)
  assert.equal(leerDetalle(200, { estado: 'ok', exploracion: { ...d, pasosLista: 'x' } }).ok, false)
  assert.equal(leerDetalle(404, { estado: 'no_encontrada' }).ok, false)
})

test('mensajeError: red, permiso, sin configurar y 409 de aprobar', () => {
  assert.equal(mensajeError(200, {}, 'Leer'), null)
  assert.match(mensajeError(502, null, 'Leer')!, /red/)
  assert.match(mensajeError(503, { estado: 'sin_configurar' }, 'Leer')!, /ASEGURA_OPERADOR_SECRET/)
  assert.match(mensajeError(401, null, 'Leer')!, /permiso/i)
  assert.match(mensajeError(409, { estado: 'sin_cerrar' }, 'Aprobar')!, /sigue abierta/)
  assert.match(mensajeError(409, { estado: 'sin_mapa' }, 'Aprobar')!, /no tiene mapa/)
  assert.match(mensajeError(500, null, 'Aprobar')!, /HTTP 500/)
})

test('estadoExploracion: el mapa aprobado/descartado manda; si no, el estado del trabajo', () => {
  assert.equal(estadoExploracion({ ...base, estadoMapa: 'revisado' }).texto, 'Mapa aprobado')
  assert.equal(estadoExploracion({ ...base, estadoMapa: 'descartado' }).texto, 'Descartada')
  assert.equal(estadoExploracion({ ...base, estadoTrabajo: 'en_curso', tieneMapa: false }).texto, 'Explorando')
  assert.equal(estadoExploracion({ ...base, estadoTrabajo: 'pendiente', tieneMapa: false }).texto, 'En cola')
  assert.equal(estadoExploracion({ ...base, estadoTrabajo: 'requiere_humano' }).tono, 'aviso')
  assert.equal(estadoExploracion({ ...base, estadoTrabajo: 'error_definitivo' }).tono, 'negativo')
  assert.equal(estadoExploracion(base).texto, 'Mapa por revisar')
  // Un estado que no conocemos no se disfraza de algo bueno.
  assert.equal(estadoExploracion({ ...base, estadoTrabajo: 'raro', tieneMapa: false }).tono, 'neutral')
})

test('motivoFinTexto: legible; sin motivo → «—»; desconocido se enseña tal cual', () => {
  assert.match(motivoFinTexto('cerca_de_emision'), /emisión/i)
  assert.match(motivoFinTexto('otp'), /verificación|OTP|SMS/i)
  assert.equal(motivoFinTexto(null), '—')
  assert.equal(motivoFinTexto('inventado'), 'inventado')
})

test('costeExploracion: real si lo hay, si no estimado marcado; nunca 0 inventado', () => {
  assert.deepEqual(costeExploracion({ costeRealEur: 0.4, costeEstimadoEur: 0.5 }), { texto: '0,40€', real: true })
  assert.deepEqual(costeExploracion({ costeRealEur: null, costeEstimadoEur: 0.5 }), { texto: '≈0,50€', real: false })
  assert.deepEqual(costeExploracion({ costeRealEur: null, costeEstimadoEur: Number.NaN }), { texto: '—', real: false })
  assert.equal(costeExploracion({ costeRealEur: 0, costeEstimadoEur: 0 }).texto, '0,00€')
})

test('textoAccion: acción por clave, sin valores', () => {
  assert.equal(textoAccion({ accion: 'rellenar', ref: 'm1e1', dato: 'inmueble.superficie_m2', detalle: null }), 'Rellenar m1e1 ← inmueble.superficie_m2')
  assert.equal(textoAccion({ accion: 'avanzar', ref: 'm1e9', dato: null, detalle: 'calcular' }), 'Avanzar m1e9 (calcular)')
  assert.equal(textoAccion({ accion: 'parar', ref: null, dato: null, detalle: 'otp' }), 'Parar (otp)')
  assert.equal(textoAccion({ accion: 'terminar', ref: null, dato: null, detalle: null }), 'Terminar: precio a la vista')
})

test('puedeAprobarMapa: solo con mapa válido, cerrada y sin aprobar ya', () => {
  const d = { ...base, pasosLista: [], mapa: {} as never, mapaInvalido: false }
  assert.equal(puedeAprobarMapa(d).ok, true)
  assert.equal(puedeAprobarMapa({ ...d, estadoMapa: 'revisado' }).ok, false)
  assert.equal(puedeAprobarMapa({ ...d, mapa: null }).ok, false)
  assert.equal(puedeAprobarMapa({ ...d, mapaInvalido: true }).ok, false)
  assert.equal(puedeAprobarMapa({ ...d, cerradaEn: null }).ok, false)
  assert.equal(puedeAprobarMapa({ ...d, estadoMapa: 'descartado' }).ok, false)
})

test('nueva exploración: lista cerrada = ENTRADAS_EXPLORACION, por defecto Allianz Hogar; encolar conectado (fase B)', () => {
  assert.deepEqual(OPCIONES_NUEVA.map((o) => o.entrada).sort(), Object.keys(ENTRADAS_EXPLORACION).sort())
  assert.equal(ENTRADA_POR_DEFECTO, 'allianz:particulares:hogar')
  assert.equal(ENCOLAR_DISPONIBLE, true)
  assert.equal(esEntradaNueva('allianz:particulares:hogar'), true)
  assert.equal(esEntradaNueva('allianz:particulares:auto'), false)
  assert.equal(esEntradaNueva(undefined), false)
})

test('leerEncolar: 503 apagado → «Explorador apagado» (y no es un error de red)', () => {
  const r = leerEncolar(503, { estado: 'apagado', mensaje: 'el explorador IA está apagado (TARIFICADOR_EXPLORADOR_ACTIVO)' })
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.apagado && r.mensaje.startsWith('Explorador apagado'))
})

test('leerEncolar: 202 encolada (lanzada o en cola), 409 con motivo, 503 sin «apagado» no es apagado', () => {
  assert.deepEqual(leerEncolar(202, { estado: 'encolado', trabajoId: 't1', lanzado: true }), { ok: true, trabajoId: 't1', lanzado: true, texto: 'Exploración encolada y en marcha.' })
  const cola = leerEncolar(202, { estado: 'encolado', trabajoId: 't2', lanzado: false })
  assert.ok(cola.ok && !cola.lanzado)
  assert.equal(leerEncolar(202, { estado: 'raro' }).ok, false)
  const r409 = leerEncolar(409, { estado: 'rechazado', motivo: 'exploracion_viva' })
  assert.ok(!r409.ok && !r409.apagado && r409.mensaje.includes('exploracion_viva'))
  const sinEsquema = leerEncolar(503, { estado: 'error', mensaje: 'explorador_sin_esquema' })
  assert.ok(!sinEsquema.ok && !sinEsquema.apagado)
})

test('cableado: la pantalla llama al POST de plataforma y la ruta exige correduría y reenvía al encolar de asegura', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/correduria/tarificador/exploraciones/route.ts'), 'utf8')
  const post = ruta.slice(ruta.indexOf('export async function POST'))
  assert.ok(post.indexOf('exigirCorreduria()') >= 0 && post.indexOf('exigirCorreduria()') < post.indexOf('encolarExploracionAsegura('), 'POST sin exigirCorreduria antes de reenviar')
  assert.match(post, /esEntradaNueva\(b\?\.entrada\)/)
  const red = readFileSync(join(import.meta.dirname, 'tarificador-exploraciones-asegura.ts'), 'utf8')
  assert.match(red, /puerto\('exploracion', \{ method: 'POST'/)
  const ui = readFileSync(join(import.meta.dirname, '..', 'app/(usuario)/correduria/tarificador/exploraciones/Exploraciones.tsx'), 'utf8')
  assert.match(ui, /pedir\(API, \{ method: 'POST'/)
  assert.match(ui, /leerEncolar\(r\.status, r\.json\)/)
})

test('refCosteExplorador: la misma clave que graba la pasarela', () => {
  assert.equal(refCosteExplorador('abc'), 'explorador:abc')
})
