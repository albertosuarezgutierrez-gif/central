import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CATALOGO_GARANTIAS, clasificarCoberturas, asistenciaAmpliada, asistenciaHogarAmpliada, descuentosDeOpciones, garantiasDeOpciones, noReconocidas, subcoberturas } from './catalogo-garantias.ts'
import { filtrarPorGarantias, interruptoresGarantias } from './filtro-garantias.ts'

// Nombres REALES de coberturas de moto de Codeoscopic (presupuesto de Manuel, 28/09/2026).
const MOTO_REAL = [
  'Responsabilidad civil obligatoria', 'Responsabilidad civil voluntaria', 'Defensa jurídica', 'Defensa en multas',
  'Retirada de carné', 'Asistencia en viaje', 'Robo', 'Incendio', 'Daños propios', 'Grandes daños / Pérdida total',
  'Vehículo de sustitución', 'Seguro del conductor/ocupantes', 'Rotura del faro/Casco o  Vestimenta', 'Accesorios',
]

test('moto: cada nombre real cae en su garantía', () => {
  const g = clasificarCoberturas('moto', MOTO_REAL.map((nombre) => ({ nombre, incluida: true })))
  for (const [clave, estado] of Object.entries(g.porClave)) {
    if (clave === 'fenomenos_atmosfericos' || clave === 'asistencia_ampliada' || clave === 'colision_animales') assert.equal(estado, 'no_consta')
    else assert.equal(estado, 'si', clave)
  }
  assert.deepEqual(noReconocidas('moto', [{ nombre: 'Daños al cargador', incluida: false }, { nombre: 'Robo', incluida: true }]), ['Daños al cargador'])
})

test('🪤 nunca «no» sin incluida === false: lo no reconocido o sin dato es no_consta', () => {
  const g = clasificarCoberturas('auto', [{ nombre: 'Rotura de lunas', incluida: null }, { nombre: 'Cosa rara', incluida: false }])
  assert.equal(g.porClave.lunas, 'no_consta')
  assert.ok(Object.values(g.porClave).every((e) => e !== 'no'))
  assert.ok(Object.values(clasificarCoberturas('hogar', null).porClave).every((e) => e === 'no_consta'))
  assert.equal(clasificarCoberturas('auto', [{ nombre: 'Lunas', incluida: false }]).porClave.lunas, 'no')
})

test('varias coberturas sobre la misma garantía: gana sí', () => {
  const g = clasificarCoberturas('auto', [{ nombre: 'Asistencia en viaje', incluida: false }, { nombre: 'Grúa desde km 0', incluida: true }])
  assert.equal(g.porClave.asistencia_viaje, 'si')
})

test('falsos amigos: robo de accesorios no es robo; defensa en multas no es defensa jurídica; cristales según ramo', () => {
  const a = clasificarCoberturas('moto', [{ nombre: 'Robo de accesorios', incluida: true }, { nombre: 'Defensa en multas', incluida: true }])
  assert.equal(a.porClave.robo, 'no_consta')
  assert.equal(a.porClave.defensa_juridica, 'no_consta')
  assert.equal(clasificarCoberturas('auto', [{ nombre: 'Cristales', incluida: true }]).porClave.lunas, 'si')
  assert.equal(clasificarCoberturas('hogar', [{ nombre: 'Rotura de cristales', incluida: true }]).porClave.cristales, 'si')
})

test('hogar: el vocabulario habitual cae en su garantía', () => {
  const g = clasificarCoberturas('hogar', ['Continente', 'Contenido', 'Daños por agua', 'Responsabilidad civil familiar', 'Robo y expoliación', 'Asistencia en el hogar', 'Daños eléctricos', 'Joyas'].map((nombre) => ({ nombre, incluida: true })))
  for (const c of ['continente', 'contenido', 'danos_agua', 'rc_familiar', 'robo', 'asistencia_hogar', 'danos_electricos', 'joyas']) assert.equal(g.porClave[c], 'si', c)
})

test('las claves del catálogo no se repiten dentro de un ramo', () => {
  for (const [ramo, lista] of Object.entries(CATALOGO_GARANTIAS)) {
    assert.equal(new Set(lista.map((g) => g.clave)).size, lista.length, ramo)
  }
})

const op = (id: string, prima: number | null, lunas: 'si' | 'no' | 'no_consta' | null) => ({
  id, compania: id.split('-')[0]!, primaEur: prima,
  garantias: lunas === null ? null : { version: 1, porClave: { lunas } },
})

test('🪤 filtro: sí → visibles por prima; no consta → aparte, nunca desaparece; no → descartada', () => {
  const r = filtrarPorGarantias([op('A-1', 500, 'si'), op('B-1', 300, 'si'), op('C-1', 200, 'no_consta'), op('D-1', 100, 'no'), op('E-1', 150, null)], ['lunas'])
  assert.deepEqual(r.visibles.map((o) => o.id), ['B-1', 'A-1'])
  assert.deepEqual(r.sinDato.map((o) => o.id), ['E-1', 'C-1'])
  assert.equal(r.descartadas, 1)
})

test('filtro sin garantías marcadas: todas visibles, sin prima al final; y por compañía', () => {
  const r = filtrarPorGarantias([op('A-1', null, 'si'), op('B-1', 300, 'no'), op('A-2', 100, 'si')], [])
  assert.deepEqual(r.visibles.map((o) => o.id), ['A-2', 'B-1', 'A-1'])
  assert.deepEqual(filtrarPorGarantias([op('A-1', 1, 'si'), op('B-1', 2, 'si')], [], { companias: ['B'] }).visibles.map((o) => o.id), ['B-1'])
})

test('interruptores: solo garantías que alguna opción incluye, con su recuento', () => {
  const i = interruptoresGarantias('auto', [op('A-1', 1, 'si'), op('B-1', 2, 'no'), op('C-1', 3, 'si')])
  assert.deepEqual(i.map((x) => [x.clave, x.conSi]), [['lunas', 2]])
})

test('decesos, salud y vida también tienen catálogo', () => {
  const d = clasificarCoberturas('decesos', ['Servicio fúnebre y sepelio', 'Traslado nacional', 'Repatriación desde el extranjero', 'Asistencia psicológica'].map((nombre) => ({ nombre, incluida: true })))
  for (const c of ['servicio_funerario', 'traslado', 'repatriacion', 'asistencia_psicologica']) assert.equal(d.porClave[c], 'si', c)
  const s = clasificarCoberturas('salud', ['Especialistas', 'Urgencias 24 h', 'Hospitalización', 'Cobertura dental', 'Reembolso de gastos'].map((nombre) => ({ nombre, incluida: true })))
  for (const c of ['especialistas', 'urgencias', 'hospitalizacion', 'dental', 'reembolso']) assert.equal(s.porClave[c], 'si', c)
  const v = clasificarCoberturas('vida', [{ nombre: 'Fallecimiento', incluida: true }, { nombre: 'Fallecimiento por accidente', incluida: false }, { nombre: 'Invalidez absoluta y permanente', incluida: true }])
  assert.equal(v.porClave.fallecimiento, 'si')
  assert.equal(v.porClave.fallecimiento_accidente, 'no')
  assert.equal(v.porClave.invalidez, 'si')
})

test('asistencia ampliada: la opción tarificada manda; el texto de Occident dice «no»; sin señal, no_consta', () => {
  const asist = (texto: string | null) => [{ nombre: 'Asistencia en viaje', incluida: true, texto }]
  // Allianz: la opción «Estándar» es un NO explícito.
  assert.equal(asistenciaAmpliada(asist(null), [{ etiqueta: 'Asistencia en Viaje', valor: 'Estándar' }]), 'no')
  assert.equal(asistenciaAmpliada(asist(null), [{ etiqueta: 'Asistencia en viaje', valor: 'Ampliada' }]), 'si')
  // Reale: «SIN vehículo de sustitución» no habla del nivel de asistencia.
  assert.equal(asistenciaAmpliada(asist('» Asistencia Global Incluida'), [{ etiqueta: 'Asistencia en viaje', valor: 'SIN vehículo de sustitución' }]), 'no_consta')
  // Occident: el texto real de la cobertura.
  assert.equal(asistenciaAmpliada(asist('» Asistencia en viaje amplia: Opcional (no incluida)..» Asistencia en viaje básica: Incluida.'), null), 'no')
  assert.equal(asistenciaAmpliada(asist('Asistencia en viaje ampliada: incluida'), null), 'si')
  assert.equal(asistenciaAmpliada(asist('Desde el Km 0'), null), 'no_consta')
  assert.equal(asistenciaAmpliada(null, null), 'no_consta')
  // Entra en la clasificación de auto y moto, no en hogar.
  const g = clasificarCoberturas('auto', asist(null), [{ etiqueta: 'Asistencia en Viaje', valor: 'Estándar' }])
  assert.equal(g.porClave.asistencia_ampliada, 'no')
  assert.equal(g.porClave.asistencia_viaje, 'si')
  assert.ok(!('asistencia_ampliada' in clasificarCoberturas('hogar', null).porClave))
})

test('opciones del producto: sustitución, retirada de carné y multas, con los valores REALES de cada compañía', () => {
  // Allianz, Reale, Generali — tal cual vienen en `tarificacion_precios.opciones`.
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Vehículo de sustitución', valor: 'No' }]), { vehiculo_sustitucion: 'no' })
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Asistencia en viaje', valor: 'SIN vehículo de sustitución' }]), { vehiculo_sustitucion: 'no' })
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Asistencia en viaje', valor: 'CON vehículo de sustitución' }]), { vehiculo_sustitucion: 'si' })
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Retirada de carnet', valor: 'Sin contratar' }]), { retirada_carnet: 'no' })
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Retirada de carnet', valor: 'Excluida - 0 €' }]), { retirada_carnet: 'no' })
  assert.deepEqual(garantiasDeOpciones([{ etiqueta: 'Reclamación de multas', valor: 'Excluida' }]), { defensa_multas: 'no' })
  // 🪤 Preguntas de tarificación que casarían con los patrones del catálogo: NO son garantías.
  const ruido = [
    { etiqueta: 'El conductor habitual es hijo de asegurado', valor: 'No' },
    { etiqueta: 'Puntos carnet conductor habitual', valor: '12' },
    { etiqueta: 'Aviso y gestión de multas de tráfico', valor: 'No' },
    { etiqueta: 'Vehículo renting/leasing', valor: 'No' },
    { etiqueta: 'Asistencia en Viaje', valor: 'Estándar' },
  ]
  assert.deepEqual(garantiasDeOpciones(ruido), {})
  // La opción manda sobre la lista de coberturas, y solo en las claves del ramo.
  const g = clasificarCoberturas('auto', [{ nombre: 'Vehículo de sustitución', incluida: true }, { nombre: 'Conductor', incluida: true }], ruido.concat([{ etiqueta: 'Vehículo de sustitución', valor: 'No' }]))
  assert.equal(g.porClave.vehiculo_sustitucion, 'no')
  assert.equal(g.porClave.conductor, 'si')
  assert.ok(!('vehiculo_sustitucion' in clasificarCoberturas('hogar', null, [{ etiqueta: 'Vehículo de sustitución', valor: 'No' }]).porClave))
})

test('hogar: todo riesgo, restauración estética, animales y asistencia básica/ampliada con los textos REALES de Allianz y Fidelidade', () => {
  // Fidelidade: el todo riesgo llega dos veces, una marcada «no» y otra sin marcar con «(OPCIONAL)».
  const fidelidade = [
    { nombre: 'Todo Riesgo Accidental', incluida: false, texto: null },
    { nombre: 'Todo Riesgo Accidental', incluida: null, texto: 'TODO RIESGO ACCIDENTAL (OPCIONAL)  - Franquicia: 150€/siniestro.' },
    { nombre: 'Restauración estética', incluida: true, texto: 'RESTAURACIÓN ESTÉTICA. Restauración estética continente.' },
    { nombre: 'Animales domésticos', incluida: true, texto: 'ANIMALES DE COMPAÑÍA (CONTENIDO)' },
    { nombre: 'Asistencia en el hogar', incluida: true, texto: 'ASISTENCIA HOGAR BÁSICA. Asistencia 24h: reparaciones y emergencias.' },
    { nombre: 'Asistencia en viaje / Accidentes', incluida: false, texto: null },
  ]
  const f = clasificarCoberturas('hogar', fidelidade, [{ etiqueta: 'Todo riesgo accidental', valor: 'No' }])
  assert.equal(f.porClave.todo_riesgo_accidental, 'no')
  assert.equal(f.porClave.restauracion_estetica, 'si')
  assert.equal(f.porClave.animales, 'si')
  assert.equal(f.porClave.asistencia_hogar, 'si')
  assert.equal(f.porClave.asistencia_hogar_ampliada, 'no')
  // Allianz marca el todo riesgo `incluida: true` aunque el texto diga «(opcional)»: manda el vendor.
  const allianz = clasificarCoberturas('hogar', [
    { nombre: 'Todo Riesgo Accidental', incluida: true, texto: '•Todo riesgo Accidental (opcional). 3.000€ Franquicia 150€.' },
    { nombre: 'Todo Riesgo Accidental', incluida: null, texto: '• Paneles Solares' },
    { nombre: 'Asistencia en el hogar', incluida: true, texto: '• Asistencia y urgencias en el hogar' },
  ])
  assert.equal(allianz.porClave.todo_riesgo_accidental, 'si')
  assert.equal(allianz.porClave.asistencia_hogar_ampliada, 'no_consta')
  assert.equal(asistenciaHogarAmpliada([{ nombre: 'Asistencia en el hogar', incluida: true, texto: 'ASISTENCIA HOGAR AMPLIADA. Servicio informático' }]), 'si')
  // La ampliada marcada NO incluida es un no explícito, no un «no consta».
  assert.equal(asistenciaHogarAmpliada([{ nombre: 'Asistencia en el hogar', incluida: false, texto: 'ASISTENCIA HOGAR AMPLIADA.' }]), 'no')
  assert.equal(asistenciaHogarAmpliada([{ nombre: 'Asistencia en el hogar', incluida: null, texto: 'ASISTENCIA HOGAR AMPLIADA.' }]), 'no_consta')
  // 🪤 Solo la «asistencia en viaje» marcada no incluida NO es un «no» de asistencia en el hogar.
  assert.equal(clasificarCoberturas('hogar', [{ nombre: 'Asistencia en viaje / Accidentes', incluida: false }]).porClave.asistencia_hogar, 'no_consta')
  // Cada señal sola basta: solo el texto «(OPCIONAL)», o solo la opción de Fidelidade.
  assert.equal(clasificarCoberturas('hogar', [fidelidade[1]!]).porClave.todo_riesgo_accidental, 'no')
  assert.equal(clasificarCoberturas('hogar', null, [{ etiqueta: 'Todo riesgo accidental', valor: 'No' }]).porClave.todo_riesgo_accidental, 'no')
  // «(opcional)» sin paréntesis o con `incluida` marcada no cambia nada.
  assert.equal(clasificarCoberturas('hogar', [{ nombre: 'Todo riesgo accidental', incluida: null, texto: 'Opcional según capital' }]).porClave.todo_riesgo_accidental, 'no_consta')
})

test('descuentos comerciales de las opciones: valores REALES; null ≠ [] ≠ 0', () => {
  assert.deepEqual(descuentosDeOpciones([
    { etiqueta: 'Descuento comercial % (CAP)', valor: '25' },
    { etiqueta: 'Descuento comercial % (venta cruzada)', valor: '0' },
    { etiqueta: 'Tipo de comisión sobre la prima', valor: 'A' },
  ]), [{ etiqueta: 'CAP', pct: 25 }, { etiqueta: 'venta cruzada', pct: 0 }])
  assert.deepEqual(descuentosDeOpciones([{ etiqueta: 'Descuento comercial', valor: '30' }]), [{ etiqueta: 'comercial', pct: 30 }])
  assert.deepEqual(descuentosDeOpciones([{ etiqueta: 'Vehículo Km 0', valor: 'No' }]), [])
  assert.equal(descuentosDeOpciones(null), null)
  // 🪤 Vacío no es 0.
  assert.deepEqual(descuentosDeOpciones([{ etiqueta: 'Descuento comercial', valor: '  ' }]), [])
})

// 29/09/2026: Occident «Terceros básico» (moto) manda «Daños propios» incluida con SOLO animales dentro.
test('un bloque «Daños propios» que enumera solo animales NO es daños propios', () => {
  const soloAnimales = clasificarCoberturas('moto', [{ nombre: 'Daños propios', incluida: true, texto: '» Animales cinegéticos y domésticos: Incluida.  : CONTRATADA' }])
  assert.equal(soloAnimales.porClave.danos_propios, 'no')
  assert.equal(soloAnimales.porClave.colision_animales, 'si')
  const conFenomenos = clasificarCoberturas('auto', [{ nombre: 'Daños propios', incluida: true, texto: '» Animales cinegéticos y domésticos: Incluida.  : CONTRATADA.» Fenómenos atmosféricos con franquicia: Franquicia 600 €.  : CONTRATADA' }])
  assert.equal(conFenomenos.porClave.danos_propios, 'no')
  assert.equal(conFenomenos.porClave.fenomenos_atmosfericos, 'si')
  const todoRiesgo = clasificarCoberturas('auto', [{ nombre: 'Daños propios', incluida: true, texto: '» Daños propios, incendio y robo con franquicia: Franquicia 600 €.  : CONTRATADA.» Animales cinegéticos y domésticos: Incluida.  : CONTRATADA' }])
  assert.equal(todoRiesgo.porClave.danos_propios, 'si')
  assert.equal(todoRiesgo.porClave.robo, 'no_consta', 'el robo lo dice su propia cobertura, no una parte de otra')
  // «Rc incendio» dentro de la RC obligatoria no es la garantía de incendio.
  const rc = clasificarCoberturas('moto', [{ nombre: 'Responsabilidad civil obligatoria', incluida: null, texto: '» Rc incendio: 100.000 €.  : CONTRATADA' }, { nombre: 'Incendio', incluida: false }])
  assert.equal(rc.porClave.incendio, 'no')
  // En prosa no se trocea: manda el nombre, como siempre.
  const prosa = clasificarCoberturas('moto', [{ nombre: 'Daños propios', incluida: true, texto: 'Cubre los daños que pueda sufrir la motocicleta asegurada.' }])
  assert.equal(prosa.porClave.danos_propios, 'si')
  assert.equal(prosa.porClave.colision_animales, 'no_consta')
})

test('subcoberturas: una parte «NO CONTRATADA» es un no', () => {
  const s = subcoberturas('» Lunas: Incluida. : CONTRATADA.» Asistencia ampliada: Opcional. : NO CONTRATADA')
  assert.deepEqual(s.map((x) => x.estado), ['si', 'no'])
  // Texto REAL de Occident: el «Exceso de equipamiento opcional (… daños propios)» no afirma daños propios.
  const t = clasificarCoberturas('auto', [{ nombre: 'Daños propios', incluida: true, texto: '» Fenómenos atmosféricos: Incluida..» Animales cinegéticos y domésticos: Incluida..» Exceso de equipamiento opcional (incendio, robo y daños propios): 1.500 €.' }])
  assert.equal(t.porClave.danos_propios, 'no')
  // «excluida franquicia» habla de la franquicia, no excluye la garantía.
  const tr = clasificarCoberturas('auto', [{ nombre: 'Daños propios', incluida: true, texto: '» Fenómenos atmosféricos: Incluida..» Daños propios con franquicia, incendio y robo: Incluida. Franquicia TR con franquicia de 300 euros.   (Robo e incendio excluida franquicia).» Daños propios con franquicia, incendio y robo ampliados: Opcional (no incluida).  ( Robo e incendio excluida franquicia).' }])
  assert.equal(tr.porClave.danos_propios, 'si')
})
