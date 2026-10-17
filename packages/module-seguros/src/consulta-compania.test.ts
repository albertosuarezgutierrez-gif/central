import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_IDENTIDAD_PROHIBIDOS,
  CAMPOS_MINIMOS_RC,
  CAMPOS_RIESGO_IA,
  ESTADOS_CONSULTA_COMPANIA,
  MARCADOR_DOC_TOMADOR,
  MARCADOR_NOMBRE_TOMADOR,
  PATRON_CODIGO_REF,
  agruparPorCompania,
  asegurarMarcadores,
  asuntoConCodigo,
  competenciaParaIA,
  faltanDatosConsulta,
  generarCodigoRef,
  leerDatosConsultaRc,
  leerResponderAntes,
  plantillaBorradorConsulta,
  promptBorradorConsulta,
  quedanMarcadores,
  responderAntesPropuesta,
  riesgoParaIA,
  sustituirMarcadores,
  validarDestinatarios,
  type ContactoParaConsulta,
  datosRamoParaConsulta,
  etiquetaFaltaConsulta,
} from './consulta-compania.ts'
import { validarDatosRiesgoLibre } from './datos-riesgo-libre.ts'
import { ETIQUETA_CAMPO_VIVIENDA } from './datos-vivienda-riesgo.ts'

const C = (id: string, compania: string, extra: Partial<ContactoParaConsulta> = {}): ContactoParaConsulta => ({
  id, companiaCodigoDgs: compania, email: `${id}@cia.es`, activo: true, ...extra,
})
const CONTACTOS = [C('a1', 'C0001'), C('a2', 'C0001'), C('b1', 'C0002'), C('x', 'C0001', { email: null }), C('z', 'C0001', { activo: false })]

// ─── Destinatarios ──────────────────────────────────────────────────────────────

test('destinatarios: vacío → rechaza', () => {
  assert.deepEqual(validarDestinatarios([], CONTACTOS), { ok: false, motivo: 'vacio' })
  assert.deepEqual(validarDestinatarios(['  '], CONTACTOS), { ok: false, motivo: 'vacio' })
})

test('destinatarios: un contacto de OTRA compañía → rechaza', () => {
  assert.equal(validarDestinatarios(['a1', 'b1'], CONTACTOS).ok, false)
  assert.deepEqual(validarDestinatarios(['a1', 'b1'], CONTACTOS), { ok: false, motivo: 'varias_companias' })
})

test('destinatarios: la compañía esperada manda', () => {
  assert.deepEqual(validarDestinatarios(['b1'], CONTACTOS, 'C0001'), { ok: false, motivo: 'varias_companias' })
})

test('destinatarios: un id desconocido no se ignora', () => {
  assert.deepEqual(validarDestinatarios(['a1', 'nadie'], CONTACTOS), { ok: false, motivo: 'desconocido', ids: ['nadie'] })
})

test('destinatarios: sin email o inactivo → rechaza', () => {
  assert.equal((validarDestinatarios(['x'], CONTACTOS) as { motivo: string }).motivo, 'sin_email')
  assert.equal((validarDestinatarios(['z'], CONTACTOS) as { motivo: string }).motivo, 'inactivo')
})

test('destinatarios: varias personas de la misma compañía, sin repetir', () => {
  assert.deepEqual(validarDestinatarios(['a1', 'a2', 'a1'], CONTACTOS), { ok: true, companiaCodigoDgs: 'C0001', contactoIds: ['a1', 'a2'] })
})

test('agrupar: un grupo por compañía y los desconocidos aparte', () => {
  const r = agruparPorCompania(['a1', 'b1', 'a2', 'nadie', 'a1'], CONTACTOS)
  assert.deepEqual(r.grupos, [
    { companiaCodigoDgs: 'C0001', contactoIds: ['a1', 'a2'] },
    { companiaCodigoDgs: 'C0002', contactoIds: ['b1'] },
  ])
  assert.deepEqual(r.desconocidos, ['nadie'])
})

// ─── 🪤 Lista blanca: la identidad no llega a la IA ─────────────────────────────

test('🪤 ningún campo de identidad está en la lista blanca de la IA', () => {
  for (const p of CAMPOS_IDENTIDAD_PROHIBIDOS) {
    assert.ok(!(CAMPOS_RIESGO_IA as readonly string[]).includes(p), `«${p}» no puede ir a la IA`)
  }
})

test('🪤 un objeto con identidad no la cuela en el riesgo para la IA', () => {
  const r = riesgoParaIA({ nombre: 'Ana', nif: '12345678Z', telefono: '600', email: 'a@b.es', direccion: 'C/ Sol 1', matricula: '1234ABC', fumador: true, actividad: 'Hostelería', provincia: 'Sevilla' })
  assert.deepEqual(Object.keys(r).sort(), ['actividad', 'provincia'])
})

test('🪤 el prompt no recibe ningún dato de identidad aunque vengan en las fuentes', () => {
  const riesgo = riesgoParaIA({ nombre: 'Ana Pérez', dni: '12345678Z', email: 'ana@x.es', actividad: 'Bar' })
  const { prompt, system } = promptBorradorConsulta({ ramo: 'responsabilidad_civil', companiaNombre: 'Mapfre', riesgo, competencia: null, responderAntes: null, incluirIdentidad: true })
  for (const t of ['Ana', '12345678Z', 'ana@x.es']) assert.ok(!prompt.includes(t) && !system.includes(t), `«${t}» en el prompt`)
  assert.ok(prompt.includes(MARCADOR_NOMBRE_TOMADOR) && prompt.includes(MARCADOR_DOC_TOMADOR))
})

test('riesgo: null = «no consta», nunca 0; el valor de cajón es null', () => {
  const r = riesgoParaIA({ facturacion: null, plantilla: 'N/A', capital: 0 })
  assert.equal(r.facturacion, null)
  assert.equal(r.plantilla, null)
  assert.equal(r.capital, 0) // un 0 tecleado es un dato
  const { prompt } = promptBorradorConsulta({ ramo: 'responsabilidad_civil', companiaNombre: 'X', riesgo: r, competencia: null, responderAntes: null, incluirIdentidad: false })
  assert.match(prompt, /Facturación anual \(€\): no consta/)
})

test('riesgo: una fuente con dato gana a otra con null', () => {
  assert.equal(riesgoParaIA({ actividad: null }, { actividad: 'Taller' }).actividad, 'Taller')
})

// ─── Competencia ────────────────────────────────────────────────────────────────

const POLIZA_COMP = { aseguradora: 'Allianz', prima: '1.234,50', coberturas: ['RC 600.000€', 'Defensa'], nPoliza: '999', iban: 'ES12 3456', tomador: 'Ana' }

test('competencia: sin la casilla, la IA no la recibe', () => {
  assert.equal(competenciaParaIA(POLIZA_COMP, false), null)
})

test('competencia: con la casilla, solo compañía/prima/coberturas', () => {
  const c = competenciaParaIA(POLIZA_COMP, true)
  assert.deepEqual(c, { compania: 'Allianz', prima: 1234.5, coberturas: 'RC 600.000€, Defensa' })
  const { prompt } = promptBorradorConsulta({ ramo: 'auto', companiaNombre: 'X', riesgo: {}, competencia: c, responderAntes: null, incluirIdentidad: false })
  assert.match(prompt, /Allianz por 1\.234,50€/)
  for (const t of ['999', 'ES12', 'Ana']) assert.ok(!prompt.includes(t), `«${t}» no puede salir`)
})

// ─── Datos mínimos ──────────────────────────────────────────────────────────────

test('datos mínimos RC: pide los seis; null = falta (nunca 0)', () => {
  assert.deepEqual(faltanDatosConsulta('responsabilidad_civil', { faltanRamo: [], datosRc: leerDatosConsultaRc({}) }), [...CAMPOS_MINIMOS_RC])
  const rc = leerDatosConsultaRc({ datosRiesgoLibre: { actividad: 'Bar', cnae: '5630', facturacion: 0, plantilla: 3, siniestralidad3Anios: 'ninguno', limiteDeseado: null } })
  assert.deepEqual(faltanDatosConsulta('responsabilidad_civil', { faltanRamo: [], datosRc: rc }), ['limiteDeseado'])
})

test('datos mínimos RC: se leen del bloque que edita la pantalla (datosRiesgoLibre), no de otra clave', () => {
  const rc = leerDatosConsultaRc({ datosConsultaRc: { actividad: 'Bar' }, datosRiesgoLibre: { cnae: '5630' } })
  assert.equal(rc.actividad, null)
  assert.equal(rc.cnae, '5630')
})

test('datos mínimos RC: el editor del bloque libre admite los seis', () => {
  const v = validarDatosRiesgoLibre({ actividad: 'Bar', cnae: '5630', facturacion: '250.000', plantilla: 3, siniestralidad3Anios: 'ninguno', limiteDeseado: 600000 })
  assert.ok(v.ok)
  assert.equal(v.ok && v.valor.facturacion, 250000)
})

test('datos mínimos: fuera de RC no se cuentan los campos de RC para la IA', () => {
  const d = datosRamoParaConsulta('comunidades', { descripcion: 'Comunidad', actividad: null, cnae: null })
  assert.deepEqual(d, { descripcion: 'Comunidad' })
  assert.deepEqual(datosRamoParaConsulta('responsabilidad_civil', { actividad: null }), { actividad: null })
})

test('datos mínimos: la etiqueta de una clave de faltan es legible (y una desconocida sale tal cual)', () => {
  assert.equal(etiquetaFaltaConsulta('responsabilidad_civil', 'limiteDeseado'), 'Límite de indemnización deseado')
  assert.equal(etiquetaFaltaConsulta('hogar', 'metrosCuadrados'), ETIQUETA_CAMPO_VIVIENDA.metrosCuadrados)
  assert.equal(etiquetaFaltaConsulta('hogar', 'xyz'), 'xyz')
})

test('datos mínimos: los demás ramos devuelven los `faltan` del bloque', () => {
  assert.deepEqual(faltanDatosConsulta('hogar', { faltanRamo: ['metrosCuadrados'] }), ['metrosCuadrados'])
  assert.equal(faltanDatosConsulta('auto', { faltanRamo: null }), null, 'no se pudo calcular ≠ no falta nada')
  assert.deepEqual(faltanDatosConsulta('auto', { faltanRamo: [] }), [])
})

// ─── Fecha límite ───────────────────────────────────────────────────────────────

test('responder antes: vencimiento − 15 días; sin vencimiento → null', () => {
  assert.equal(responderAntesPropuesta('2026-12-01'), '2026-11-16')
  assert.equal(responderAntesPropuesta(new Date('2027-01-10T00:00:00Z')), '2026-12-26')
  assert.equal(responderAntesPropuesta(null), null)
  assert.equal(responderAntesPropuesta('basura'), null)
})

test('responder antes: si ya pasó respecto a hoy → null', () => {
  assert.equal(responderAntesPropuesta('2026-10-20', '2026-10-15'), null)
  assert.equal(responderAntesPropuesta('2026-11-20', '2026-10-15'), '2026-11-05')
})

test('leerResponderAntes valida aaaa-mm-dd', () => {
  assert.equal(leerResponderAntes('2026-11-05'), '2026-11-05')
  assert.equal(leerResponderAntes(null), null)
  assert.equal(leerResponderAntes('2026-02-30'), undefined)
  assert.equal(leerResponderAntes('5/11/2026'), undefined)
})

// ─── Código y asunto ────────────────────────────────────────────────────────────

test('codigo_ref con formato ASG-XXXX', () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigoRef(), PATRON_CODIGO_REF)
  assert.equal(generarCodigoRef(() => 0), 'ASG-AAAA')
  assert.equal(generarCodigoRef(() => 0.9999999), 'ASG-9999')
})

test('el asunto siempre lleva [ASG-XXXX]', () => {
  assert.equal(asuntoConCodigo('Consulta RC', 'ASG-AB23'), '[ASG-AB23] Consulta RC')
  assert.equal(asuntoConCodigo('[ASG-AB23] Consulta RC', 'ASG-AB23'), '[ASG-AB23] Consulta RC')
})

// ─── Marcadores ─────────────────────────────────────────────────────────────────

const CUERPO = `Hola:\n\nTomador: ${MARCADOR_NOMBRE_TOMADOR} (${MARCADOR_DOC_TOMADOR})\n\nDatos del riesgo.`

test('🪤 sin identidad no sale nombre ni documento ni quedan marcadores', () => {
  const s = sustituirMarcadores(CUERPO, { incluirIdentidad: false, nombre: 'Ana Pérez', documento: '12345678Z' })
  assert.ok(!s.includes('Ana') && !s.includes('12345678Z'))
  assert.equal(quedanMarcadores(s), false)
})

test('con identidad se sustituyen los dos y no quedan marcadores', () => {
  const s = sustituirMarcadores(CUERPO, { incluirIdentidad: true, nombre: 'Ana Pérez', documento: '12345678Z' })
  assert.match(s, /Tomador: Ana Pérez \(12345678Z\)/)
  assert.equal(quedanMarcadores(s), false)
  assert.match(sustituirMarcadores(CUERPO, { incluirIdentidad: true, nombre: null, documento: null }), /\(no consta\)/)
})

test('asegurarMarcadores: añade la línea si la IA la omitió, y la quita sin identidad', () => {
  const sin = 'Hola, pedimos precio.'
  assert.ok(asegurarMarcadores(sin, true).startsWith(`Tomador: ${MARCADOR_NOMBRE_TOMADOR} (${MARCADOR_DOC_TOMADOR})`))
  assert.equal(quedanMarcadores(asegurarMarcadores(CUERPO, false)), false)
  assert.equal(asegurarMarcadores(CUERPO, true), CUERPO)
})

test('la plantilla sin IA respeta la identidad y la fecha', () => {
  const base = { ramo: 'responsabilidad_civil', companiaNombre: 'X', riesgo: {}, competencia: null, responderAntes: '2026-11-05' }
  assert.ok(plantillaBorradorConsulta({ ...base, incluirIdentidad: true }).includes(MARCADOR_DOC_TOMADOR))
  assert.equal(quedanMarcadores(plantillaBorradorConsulta({ ...base, incluirIdentidad: false })), false)
  assert.match(plantillaBorradorConsulta({ ...base, incluirIdentidad: false }), /05\/11\/2026/)
})

test('los estados son la lista completa del SQL', () => {
  assert.deepEqual([...ESTADOS_CONSULTA_COMPANIA], ['borrador', 'enviada', 'respondida', 'pide_info', 'rechazada', 'sin_respuesta', 'descartada', 'cancelada'])
})

// ─── Ida y vuelta con la pantalla ───────────────────────────────────────────────
import { cuerpoLlevaIdentidad, cuerpoParaPantalla, cuerpoTieneDocumentoEnmascarado, volverAMarcadores } from './consulta-compania.ts'

test('🪤 la pantalla nunca ve el DNI entero, y al volver recupera los marcadores', () => {
  const e = { incluirIdentidad: true, nombre: 'Ana Pérez', documentoEnmascarado: '*****678Z' }
  const pantalla = cuerpoParaPantalla(CUERPO, e)
  assert.ok(!pantalla.includes('12345678Z'))
  assert.match(pantalla, /Ana Pérez \(\*{5}678Z\)/)
  const editado = pantalla.replace('Datos del riesgo.', 'Datos del riesgo, revisados.')
  const vuelta = volverAMarcadores(editado, { nombre: 'Ana Pérez', documentoEnmascarado: '*****678Z' })
  assert.ok(vuelta.includes(MARCADOR_NOMBRE_TOMADOR) && vuelta.includes(MARCADOR_DOC_TOMADOR))
  assert.equal(cuerpoTieneDocumentoEnmascarado(vuelta), false)
  assert.equal(cuerpoLlevaIdentidad(vuelta), true)
})

test('un DNI enmascarado suelto se detecta para no enviarlo', () => {
  assert.equal(cuerpoTieneDocumentoEnmascarado('DNI: *****678Z'), true)
  assert.equal(cuerpoTieneDocumentoEnmascarado('Tomador: [documento no consta]'), true)
  assert.equal(cuerpoTieneDocumentoEnmascarado('Sin identidad'), false)
})

test('sin identidad, la pantalla no tiene marcadores ni nombre', () => {
  const p = cuerpoParaPantalla(CUERPO, { incluirIdentidad: false, nombre: 'Ana', documentoEnmascarado: '*9Z' })
  assert.equal(quedanMarcadores(p), false)
  assert.ok(!p.includes('Ana'))
})

import { leerRamosContacto } from './consulta-compania.ts'

test('ramos de contacto: null = sin clasificar, [] = revisado sin ramos, desconocido se declara', () => {
  assert.deepEqual(leerRamosContacto(null), { ok: true, ramos: null })
  assert.deepEqual(leerRamosContacto([]), { ok: true, ramos: [] })
  assert.deepEqual(leerRamosContacto(['responsabilidad_civil', 'auto', 'auto']), { ok: true, ramos: ['responsabilidad_civil', 'auto'] })
  assert.deepEqual(leerRamosContacto(['rc']), { ok: false, desconocidos: ['rc'] })
  assert.equal(leerRamosContacto('auto').ok, false)
})
