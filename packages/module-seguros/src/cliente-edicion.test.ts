import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO_DOCUMENTO_REQUERIDO,
  MOTIVO_CAMBIO_REQUERIDO,
  completaApellidos,
  coincidenciaBloquea,
  etiquetasIdentidad,
  documentoAcredita,
  documentosAcreditativos,
  acreditarCambioConDocumento,
  camposIdentidadTocados,
  estadoDocumentosIdentidad,
  enmascararDni,
  etiquetaContacto,
  normalizarDni,
  normalizarEmail,
  normalizarFechaNacimiento,
  normalizarTelefono,
  provinciaPorCp,
  revisarAlta,
  revisarEdicion,
  nombrePendiente,
  textoHistorialEdicion,
  FUENTES_ORIGEN,
  FUENTES_CANAL,
  esFuenteCanal,
  fuenteOrigen,
  tipoHistorial,
  tipoHistorialAlta,
  textoHistorialAlta,
  seraPrincipalAlAnadir,
} from './cliente-edicion.ts'
import type { DocumentoResumen } from './documentos.ts'

test('teléfono: español con espacios, +34 y 0034 → 9 dígitos; extranjero conserva el +', () => {
  assert.deepEqual(normalizarTelefono(' 954 22 05 48 '), { ok: true, valor: '954220548' })
  assert.deepEqual(normalizarTelefono('+34 600-12-34-56'), { ok: true, valor: '600123456' })
  assert.deepEqual(normalizarTelefono('0034600123456'), { ok: true, valor: '600123456' })
  assert.deepEqual(normalizarTelefono('+33 6 12 34 56 78'), { ok: true, valor: '+33612345678' })
  assert.equal(normalizarTelefono('123456789').ok, false)
  assert.equal(normalizarTelefono('60012345').ok, false)
  assert.equal(normalizarTelefono('').ok, false)
})

test('email: minúsculas y forma mínima', () => {
  assert.deepEqual(normalizarEmail(' JSuarez@Gmail.com '), { ok: true, valor: 'jsuarez@gmail.com' })
  assert.equal(normalizarEmail('jsuarez@gmail').ok, false)
  assert.equal(normalizarEmail('sin arroba').ok, false)
})

test('DNI/NIE comprueban la letra; CIF solo la forma; el tipo de persona sale de ahí', () => {
  assert.deepEqual(normalizarDni(' 12.345.678-z '), { ok: true, valor: { valor: '12345678Z', tipoPersona: 'fisica' } })
  assert.equal(normalizarDni('12345678A').ok, false)
  assert.deepEqual(normalizarDni('x-1234567-l'), { ok: true, valor: { valor: 'X1234567L', tipoPersona: 'fisica' } })
  assert.equal(normalizarDni('X1234567A').ok, false)
  assert.deepEqual(normalizarDni('b12345674'), { ok: true, valor: { valor: 'B12345674', tipoPersona: 'juridica' } })
  assert.equal(normalizarDni('1234').ok, false)
  assert.equal(enmascararDni('12345678Z'), '*****678Z')
  assert.equal(enmascararDni(null), null)
})

test('fecha de nacimiento: ISO o española, tiene que existir y ser pasada', () => {
  const hoy = new Date('2026-09-02T00:00:00Z')
  assert.deepEqual(normalizarFechaNacimiento('5/3/1980', hoy), { ok: true, valor: '1980-03-05' })
  assert.deepEqual(normalizarFechaNacimiento('1980-03-05', hoy), { ok: true, valor: '1980-03-05' })
  assert.equal(normalizarFechaNacimiento('31/02/1980', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('01/01/2027', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('01/01/1850', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('ayer', hoy).ok, false)
})

test('provincia por CP y etiquetas cerradas', () => {
  assert.equal(provinciaPorCp('41003'), 'Sevilla')
  assert.equal(provinciaPorCp('43800'), 'Tarragona')
  assert.equal(provinciaPorCp('99999'), null)
  assert.equal(etiquetaContacto('telefono', ' Móvil '), 'móvil')
  assert.equal(etiquetaContacto('telefono', 'personal'), null)
  assert.equal(etiquetaContacto('email', 'trabajo'), 'trabajo')
})

test('edición: identidad sin documento se rechaza con el motivo que la pantalla entiende', () => {
  const r = revisarEdicion({ identidad: { dni: '12345678Z' } })
  assert.deepEqual(r, { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
  const ok = revisarEdicion({ identidad: { dni: '12345678Z', fechaNacimiento: '5/3/1980' }, documentoId: 'd1' })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.tocaIdentidad, true)
    assert.deepEqual(ok.identidad.dni, { valor: '12345678Z', tipoPersona: 'fisica' })
    assert.equal(ok.identidad.fechaNacimiento, '1980-03-05')
  }
})

test('edición: lo libre no pide documento; CP valida y vacío = borrar; nada = sin cambios', () => {
  const r = revisarEdicion({ libre: { ciudad: '  Sevilla ', codigoPostal: '41003', direccion: '' } })
  assert.deepEqual(r, { ok: true, identidad: {}, libre: { ciudad: 'Sevilla', codigoPostal: '41003', direccion: null }, tocaIdentidad: false })
  const mal = revisarEdicion({ libre: { codigoPostal: '4100' } })
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.campo, 'codigoPostal')
  assert.equal(revisarEdicion({}).ok, false)
  const sinNombre = revisarEdicion({ identidad: { nombre: '   ' }, documentoId: 'd1' })
  assert.equal(sinNombre.ok, false)
  if (!sinNombre.ok) assert.equal(sinNombre.campo, 'nombre')
})

test('edición: dirección larga (urbanización+escalera+piso+puerta) cabe hasta 255, ciudad sigue topada en 100', () => {
  const larga = 'Urbanización Los Olivos, Avenida de la Constitución, número 34, escalera 2, piso 3º, puerta B, ' +
    'entre las calles Real y San Juan, junto al parque municipal'
  assert.ok(larga.length > 100 && larga.length <= 255)
  const ok = revisarEdicion({ libre: { direccion: larga } })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.libre.direccion, larga)

  const demasiadoLarga = 'x'.repeat(256)
  const mal = revisarEdicion({ libre: { direccion: demasiadoLarga } })
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.campo, 'direccion')

  const ciudadLarga = revisarEdicion({ libre: { ciudad: 'x'.repeat(101) } })
  assert.equal(ciudadLarga.ok, false)
  if (!ciudadLarga.ok) assert.equal(ciudadLarga.campo, 'ciudad')
})

test('el historial no lleva el DNI ni la dirección, sí la ciudad y el documento', () => {
  const r = revisarEdicion({ identidad: { dni: '12345678Z' }, libre: { ciudad: 'Sevilla', direccion: 'Calle X 1' }, documentoId: 'doc-9' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  const t = textoHistorialEdicion(r, { actor: 'alberto@x', documentoId: 'doc-9' })
  assert.match(t, /identidad \(DNI\) acreditada con el documento doc-9/)
  assert.match(t, /ciudad → Sevilla/)
  assert.match(t, /dirección cambiada/)
  assert.doesNotMatch(t, /12345678Z/)
  assert.doesNotMatch(t, /Calle X/)
})

test('documento que acredita: tipo dni y que haya llegado', () => {
  const d = (p: Partial<DocumentoResumen>): DocumentoResumen => ({
    id: 'd', tipo: 'dni', estado: 'recibido', nombre: null, mime: null, bytes: null, sha256: null, notas: null,
    subidoPor: 'corredor', clienteId: 'c', polizaId: null, siniestroId: null, creado: '', revisadoEn: null, ...p,
  })
  assert.equal(documentoAcredita(d({})), true)
  assert.equal(documentoAcredita(d({ estado: 'pedido' })), false)
  assert.equal(documentoAcredita(d({ tipo: 'poliza' })), false)
  assert.deepEqual(documentosAcreditativos(null), [])
  assert.equal(documentosAcreditativos([d({ id: 'a' }), d({ id: 'b', estado: 'pedido' })]).length, 1)
})

test('alta: nombre + algo por lo que encontrarla; provincia sale del CP; DNI repetido bloquea, teléfono no', () => {
  const sin = revisarAlta({ nombre: 'Ana' })
  assert.equal(sin.ok, false)
  const r = revisarAlta({ nombre: ' ana ', apellidos: 'López  Pérez', telefono: '600 12 34 56', codigoPostal: '41003', email: '' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.alta.nombre, 'ana')
    assert.equal(r.alta.apellidos, 'López Pérez')
    assert.equal(r.alta.telefono, '600123456')
    assert.equal(r.alta.email, null)
    assert.equal(r.alta.provincia, 'Sevilla')
    assert.equal(r.alta.tipoPersona, null)
  }
  const emp = revisarAlta({ nombre: 'Esquiansa SL', dni: 'B12345674' })
  assert.equal(emp.ok && emp.alta.tipoPersona, 'juridica')
  const mal = revisarAlta({ nombre: 'Ana', dni: '12345678A' })
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.campo, 'dni')
  assert.equal(coincidenciaBloquea([{ id: '1', nombre: 'x', por: 'telefono', tipo: 'lead' }]), false)
  assert.equal(coincidenciaBloquea([{ id: '1', nombre: 'x', por: 'dni', tipo: 'cliente' }]), true)
})

test('fuente del alta: vacía = null (no se inventa «otros»), desconocida se rechaza, canal = contacto', () => {
  assert.deepEqual(fuenteOrigen(undefined), { ok: true, valor: null })
  assert.deepEqual(fuenteOrigen('  '), { ok: true, valor: null })
  assert.deepEqual(fuenteOrigen(' WEB '), { ok: true, valor: 'web' })
  assert.equal(fuenteOrigen('facebook').ok, false)
  assert.equal(fuenteOrigen(3).ok, false)
  for (const f of FUENTES_CANAL) assert.ok(FUENTES_ORIGEN.includes(f), `${f} no está en FUENTES_ORIGEN`)
  assert.equal(esFuenteCanal('web'), true)
  assert.equal(esFuenteCanal('recomendacion'), false)
  assert.equal(esFuenteCanal(null), false)

  const sinFuente = revisarAlta({ nombre: 'Ana', telefono: '600123456' })
  assert.equal(sinFuente.ok && sinFuente.alta.fuente, null)
  const web = revisarAlta({ nombre: 'Ana', telefono: '600123456', fuente: 'web' })
  assert.equal(web.ok && web.alta.fuente, 'web')
  const mala = revisarAlta({ nombre: 'Ana', telefono: '600123456', fuente: 'tiktok' })
  assert.equal(mala.ok, false)
  if (!mala.ok) assert.equal(mala.campo, 'fuente')

  assert.equal(tipoHistorialAlta('web'), 'contacto')
  assert.equal(tipoHistorialAlta('portal'), 'contacto')
  assert.equal(tipoHistorialAlta('recomendacion'), 'nota')
  assert.equal(tipoHistorialAlta(null), 'nota')
  assert.equal(tipoHistorial('contacto'), 'contacto')
  assert.equal(tipoHistorial('borrado'), null)
})

test('el historial del alta dice por dónde entró el lead, sin datos de identidad', () => {
  const web = textoHistorialAlta({ fuente: 'web', notas: 'Quiere: auto. Tiene un Golf.' }, { actor: 'web' })
  assert.equal(web, 'Lead recibido por formulario web: Quiere: auto. Tiene un Golf.')
  const manual = textoHistorialAlta({ fuente: null, notas: 'lo que sea' }, { actor: 'alberto@x.es', compartido: true })
  assert.equal(manual, 'Alta manual desde plataforma por alberto@x.es (comparte teléfono/email con otra ficha, a sabiendas)')
  const reco = textoHistorialAlta({ fuente: 'recomendacion', notas: null }, { actor: 'alberto@x.es' })
  assert.equal(reco, 'Alta manual desde plataforma por alberto@x.es (fuente: recomendación)')
})

test('GLOBAL 2: a una empresa no se le pide DNI ni fecha de nacimiento', () => {
  const e = etiquetasIdentidad('juridica')
  assert.equal(e.documento, 'CIF')
  assert.equal(e.nombre, 'Razón social')
  assert.equal(e.fecha, 'Fecha de constitución')
  assert.equal(e.pedir, 'CIF')
})

test('sin clasificar NO es «física»: se queda el rótulo neutro', () => {
  // 32.520 fichas del volcado tienen tipo_persona a NULL.
  assert.equal(etiquetasIdentidad(null).documento, 'DNI / NIE / CIF')
  assert.equal(etiquetasIdentidad(null).fecha, 'Fecha de nacimiento')
  assert.equal(etiquetasIdentidad('fisica').documento, 'DNI / NIE / CIF')
})

test('ficha SIN NOMBRE: poner nombre y apellidos no exige documento; lo demás, sí (28/09/2026)', () => {
  assert.equal(nombrePendiente('(sin nombre)'), true)
  assert.equal(nombrePendiente('  (Sin  Nombre) '), true)
  assert.equal(nombrePendiente(''), true)
  assert.equal(nombrePendiente(null), true)
  assert.equal(nombrePendiente('Eduardo'), false)

  const ok = revisarEdicion({ identidad: { nombre: 'Eduardo', apellidos: 'Santos' } }, { fichaSinNombre: true })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(textoHistorialEdicion(ok, { actor: 'a' }).includes('sin documento'), true)
  // Con nombre ya puesto, la regla de siempre.
  assert.deepEqual(revisarEdicion({ identidad: { nombre: 'Eduardo' } }), { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
  // DNI o fecha colados en la misma edición: documento.
  assert.deepEqual(revisarEdicion({ identidad: { nombre: 'Eduardo', dni: '12345678Z' } }, { fichaSinNombre: true }), { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
  assert.deepEqual(revisarEdicion({ identidad: { nombre: 'Eduardo', fechaNacimiento: '1/1/1980' } }, { fichaSinNombre: true }), { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
  // Solo apellidos dejaría el marcador de nombre: documento.
  assert.deepEqual(revisarEdicion({ identidad: { apellidos: 'Santos' } }, { fichaSinNombre: true }), { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
})

test('🪤 un contacto «nuncaPrincipal» no asciende aunque la ficha no tenga principal (toma de cuenta del portal)', () => {
  assert.equal(seraPrincipalAlAnadir({ pedido: false, nuncaPrincipal: true, hayPrincipal: false }), false)
  assert.equal(seraPrincipalAlAnadir({ pedido: true, nuncaPrincipal: true, hayPrincipal: false }), false)
  assert.equal(seraPrincipalAlAnadir({ pedido: false, nuncaPrincipal: false, hayPrincipal: false }), true)
  assert.equal(seraPrincipalAlAnadir({ pedido: false, nuncaPrincipal: false, hayPrincipal: true }), false)
  assert.equal(seraPrincipalAlAnadir({ pedido: true, nuncaPrincipal: false, hayPrincipal: true }), true)
})

test('PÓLIZA con el DNI de la ficha acredita SOLO nombre y apellidos (Alberto, 05/10/2026)', () => {
  const poliza = { tipo: 'poliza', estado: 'recibido', dniCoincideFicha: true } as const
  const dni = { tipo: 'dni', estado: 'recibido', dniCoincideFicha: null } as const
  // póliza + nombre/apellidos → documento
  assert.deepEqual(acreditarCambioConDocumento(poliza, ['nombre', 'apellidos']), { ok: true, via: 'documento' })
  // póliza + DNI (o fecha) sin motivo → no acredita, aunque el corredor tenga vía motivo
  assert.deepEqual(acreditarCambioConDocumento(poliza, ['nombre', 'dni'], { permiteMotivo: true }), { ok: false, motivo: 'documento_no_acredita' })
  assert.deepEqual(acreditarCambioConDocumento(poliza, ['fechaNacimiento'], { permiteMotivo: true, motivo: 'x' }), { ok: false, motivo: 'documento_no_acredita' })
  // póliza + DNI con motivo → se acepta como MOTIVO, no como documento
  assert.deepEqual(acreditarCambioConDocumento(poliza, ['dni'], { permiteMotivo: true, motivo: '  hablado con él por teléfono ' }), { ok: true, via: 'motivo', motivoCambio: 'hablado con él por teléfono' })
  // el portal no tiene vía motivo: aunque lo mande, no vale
  assert.deepEqual(acreditarCambioConDocumento(poliza, ['dni'], { motivo: 'hablado con él por teléfono' }), { ok: false, motivo: 'documento_no_acredita' })
  // DNI-documento acredita todo
  assert.deepEqual(acreditarCambioConDocumento(dni, ['dni', 'fechaNacimiento', 'nombre']), { ok: true, via: 'documento' })
  // documento que no acredita (póliza sin DNI coincidente, nulo) → rechazo aunque haya motivo
  assert.deepEqual(acreditarCambioConDocumento({ ...poliza, dniCoincideFicha: null }, ['nombre'], { permiteMotivo: true, motivo: 'por teléfono' }), { ok: false, motivo: 'documento_no_acredita' })
  assert.deepEqual(acreditarCambioConDocumento(null, ['nombre']), { ok: false, motivo: 'documento_no_acredita' })
  assert.deepEqual(camposIdentidadTocados({ nombre: 'A', dni: null }), ['dni', 'nombre'])
})

test('Documentos: null = no se pudo leer (no se afirma que no haya DNI); [] = revisado y no hay', () => {
  const d = { id: 'd', tipo: 'dni', estado: 'recibido', nombre: null, mime: null, bytes: null, sha256: null, notas: null,
    subidoPor: 'corredor', clienteId: 'c', polizaId: null, siniestroId: null, creado: '', revisadoEn: null } as DocumentoResumen
  assert.equal(estadoDocumentosIdentidad(null), 'no_leidos')
  assert.equal(estadoDocumentosIdentidad([]), 'ninguno')
  assert.equal(estadoDocumentosIdentidad([{ ...d, estado: 'pedido' }]), 'ninguno')
  assert.equal(estadoDocumentosIdentidad([d]), 'hay')
})

// ─── Completar apellidos no es corregir identidad ────────────────────────────

const CTX = (apellidosActuales: string | null | undefined) => ({ permiteMotivo: true, apellidosActuales })

test('«Slava» → «Slava Antoli» sin documento ni motivo: pasa, y el historial lo dice sin mentir', () => {
  const r = revisarEdicion({ identidad: { apellidos: 'Slava Antoli' } }, CTX('Slava'))
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.motivoCambio, undefined)
  assert.deepEqual(r.apellidosCompletados, { antes: 'Slava', despues: 'Slava Antoli' })
  const t = textoHistorialEdicion(r, { actor: 'alberto' })
  assert.match(t, /apellidos completados sin documento: "Slava" → "Slava Antoli"/)
  assert.doesNotMatch(t, /no tenía nombre/)
})

test('apellidos actuales vacíos o null: rellenarlos no pide motivo; la comparación ignora tildes, mayúsculas y espacios', () => {
  assert.equal(revisarEdicion({ identidad: { apellidos: 'Slava Antoli' } }, CTX('')).ok, true)
  assert.equal(revisarEdicion({ identidad: { apellidos: 'Slava Antoli' } }, CTX(null)).ok, true)
  assert.equal(revisarEdicion({ identidad: { apellidos: 'pérez  garcía' } }, CTX('  Perez ')).ok, true)
  assert.equal(completaApellidos('Slava', 'SLAVA   Antoli'), true)
})

test('NO es completar: otro apellido, prefijo pegado, quitar o cambiar palabras, o no saber los actuales', () => {
  for (const nuevo of ['Pérez', 'Slavaxx', 'Slava', 'Antoli Slava', 'Slavo Antoli']) {
    const r = revisarEdicion({ identidad: { apellidos: nuevo } }, CTX('Slava'))
    assert.deepEqual(r.ok ? null : r.motivo, MOTIVO_CAMBIO_REQUERIDO, nuevo)
  }
  const quitar = revisarEdicion({ identidad: { apellidos: 'Slava' } }, CTX('Slava Antoli'))
  assert.deepEqual(quitar.ok ? null : quitar.motivo, MOTIVO_CAMBIO_REQUERIDO)
  const borrar = revisarEdicion({ identidad: { apellidos: null } }, CTX('Slava'))
  assert.deepEqual(borrar.ok ? null : borrar.motivo, MOTIVO_CAMBIO_REQUERIDO)
  // `undefined` = no se sabe lo que hay: el estado conservador.
  const nose = revisarEdicion({ identidad: { apellidos: 'Slava Antoli' } }, CTX(undefined))
  assert.deepEqual(nose.ok ? null : nose.motivo, MOTIVO_CAMBIO_REQUERIDO)
})

test('con cambio de nombre, DNI o fecha a la vez, la regla de siempre; con motivo, vía motivo', () => {
  const nombre = revisarEdicion({ identidad: { apellidos: 'Slava Antoli', nombre: 'Ana' } }, CTX('Slava'))
  assert.deepEqual(nombre.ok ? null : nombre.motivo, MOTIVO_CAMBIO_REQUERIDO)
  const dni = revisarEdicion({ identidad: { apellidos: 'Slava Antoli', dni: '12345678Z' } }, CTX('Slava'))
  assert.deepEqual(dni.ok ? null : dni.motivo, MOTIVO_CAMBIO_REQUERIDO)
  // Con motivo informado, sigue la vía del motivo (antes/después).
  const conMotivo = revisarEdicion({ identidad: { apellidos: 'Slava Antoli' }, motivo: 'segundo apellido por teléfono' }, CTX('Slava'))
  assert.equal(conMotivo.ok && conMotivo.motivoCambio !== undefined, true)
})
