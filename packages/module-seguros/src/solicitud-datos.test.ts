import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS_SOLICITUD, camposSolicitud, casaZonaCp, conIdentidad, grupoSolicitud, tituloSolicitud, contrastarConDocumentos, mensajeSolicitud, normalizarLecturaSolicitud, validarRespuestas } from './solicitud-datos.ts'

const nadaConocido = { dni: false, fechaNacimiento: false, codigoPostal: false, carnetMoto: false, carnetCoche: false }
const todoConocido = { dni: true, fechaNacimiento: true, codigoPostal: true, carnetMoto: true, carnetCoche: true }
const HOY = new Date('2026-09-24T10:00:00Z')

test('no se le vuelve a pedir lo que la ficha ya tiene, salvo DNI y nacimiento (se confirman)', () => {
  const claves = camposSolicitud('moto', todoConocido).map((c) => c.clave)
  for (const k of ['codigoPostal', 'tipoCarnet', 'fechaCarnet']) assert.ok(!claves.includes(k), k)
  for (const k of ['dni', 'fechaNacimiento']) assert.ok(claves.includes(k), `${k} se pide siempre`)
  const viejo = conIdentidad([{ clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true }]).map((c) => c.clave)
  assert.deepEqual(viejo, ['dni', 'fechaNacimiento', 'matricula'], 'un enlace viejo gana DNI y nacimiento')
  assert.equal(conIdentidad(camposSolicitud('moto', nadaConocido)).filter((c) => c.clave === 'dni').length, 1, 'sin duplicar')
  assert.ok(claves.includes('matricula') && claves.includes('marca'))
  const todo = camposSolicitud('moto', nadaConocido).map((c) => c.clave)
  for (const k of ['dni', 'fechaNacimiento', 'codigoPostal', 'tipoCarnet', 'fechaCarnet']) assert.ok(todo.includes(k), k)
})

test('en coche no se pregunta el tipo de carné de moto', () => {
  const claves = camposSolicitud('auto', nadaConocido).map((c) => c.clave)
  assert.ok(!claves.includes('tipoCarnet'))
  assert.ok(claves.includes('fechaCarnet'))
})

test('valida y normaliza; un error por campo; lo no pedido se ignora', () => {
  const campos = camposSolicitud('moto', nadaConocido)
  const bien = validarRespuestas(campos, {
    dni: '12345678z', fechaNacimiento: '01/02/1990', codigoPostal: '41003', tipoCarnet: 'A2', fechaCarnet: '15/03/2015',
    matricula: '1234 abc', marca: 'Yamaha', modelo: 'MT-07', garaje: 'calle', tieneSeguro: false, colado: 'x',
  }, HOY)
  assert.ok(bien.ok)
  if (bien.ok) {
    assert.equal(bien.respuestas.dni, '12345678Z')
    assert.equal(bien.respuestas.matricula, '1234ABC')
    assert.equal(bien.respuestas.fechaCarnet, '2015-03-15')
    assert.equal(bien.respuestas.companiaActual, null, 'sin seguro, la compañía ni se mira')
    assert.equal('colado' in bien.respuestas, false)
  }
  const mal = validarRespuestas(campos, { dni: '12345678A', fechaCarnet: '31/02/2020', garaje: 'tejado', tieneSeguro: 'si' }, HOY)
  assert.equal(mal.ok, false)
  if (!mal.ok) {
    assert.match(mal.errores.dni, /letra/)
    assert.ok(mal.errores.fechaCarnet && mal.errores.garaje && mal.errores.tieneSeguro && mal.errores.matricula)
  }
})

test('una fecha de carné futura no vale; el vencimiento del seguro actual sí puede ser futuro', () => {
  const campos = camposSolicitud('moto', { ...todoConocido, carnetMoto: false })
  const r = validarRespuestas(campos, {
    tipoCarnet: 'A', fechaCarnet: '2030-01-01', matricula: '1234ABC', marca: 'x', modelo: 'y', garaje: 'calle',
    tieneSeguro: true, vencimientoActual: '2027-01-10',
  }, HOY)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.errores.fechaCarnet)
    assert.equal(r.errores.vencimientoActual, undefined)
  }
})

test('el mensaje para el cliente no lleva ningún dato suyo, solo el enlace', () => {
  const m = mensajeSolicitud('moto', 'https://x/datos/abc')
  assert.match(m, /tu moto/)
  assert.match(m, /https:\/\/x\/datos\/abc$/)
})

test('lo leído de un documento solo propone campos pedidos y válidos', () => {
  const campos = camposSolicitud('moto', nadaConocido)
  const r = normalizarLecturaSolicitud({
    tipo: 'carnet', dni: '12345678Z', fechaNacimiento: '1990-02-01',
    carnets: [{ clase: 'B', fecha: '2010-01-01' }, { clase: 'A2', fecha: '2015-03-15' }, { clase: 'AM', fecha: '2006-01-01' }],
    matricula: 'dudoso', marca: '',
  }, 'moto', campos, HOY)
  assert.equal(r.tipo, 'carnet')
  assert.equal(r.valores.dni, '12345678Z')
  assert.equal(r.valores.tipoCarnet, 'A2', 'la clase de moto más alta con fecha')
  assert.equal(r.valores.fechaCarnet, '2015-03-15')
  assert.equal('matricula' in r.valores, false, 'una matrícula que no valida no se propone')
  assert.equal('marca' in r.valores, false)
  const conocido = normalizarLecturaSolicitud({ tipo: 'carnet', carnets: [{ clase: 'A2', fecha: '2015-03-15' }] }, 'moto', camposSolicitud('moto', todoConocido), HOY)
  assert.equal('fechaCarnet' in conocido.valores, false, 'lo que no se pidió no se propone')
  assert.equal(normalizarLecturaSolicitud({ tipo: 'pasaporte' }, 'moto', campos, HOY).tipo, 'otro')
})

test('el contraste avisa si lo declarado no casa con el papel, sin tener en cuenta espacios ni guiones', () => {
  const lecturas = [{ documentoId: 'd1', tipo: 'permiso_circulacion' as const, valores: { matricula: '1234ABC', fechaMatriculacion: '2020-05-01' } }]
  assert.deepEqual(contrastarConDocumentos({ matricula: '1234 abc', fechaMatriculacion: '2020-05-01' }, lecturas), [])
  const d = contrastarConDocumentos({ matricula: '1234ABD' }, lecturas)
  assert.equal(d.length, 1)
  assert.equal(d[0].clave, 'matricula')
  assert.equal(d[0].documento, '1234ABC')
})

test('el DNI y el nacimiento solo salen del DNI o del carné: la póliza y el permiso traen al tomador o titular', () => {
  const campos = camposSolicitud('moto', nadaConocido)
  const poliza = normalizarLecturaSolicitud({ tipo: 'poliza', dni: '12345678Z', fechaNacimiento: '1960-01-01', matricula: '1234ABC', companiaActual: 'Mapfre' }, 'moto', campos, HOY)
  assert.equal('dni' in poliza.valores, false)
  assert.equal('fechaNacimiento' in poliza.valores, false)
  assert.equal(poliza.valores.matricula, '1234ABC', 'lo del vehículo sí vale')
  const permiso = normalizarLecturaSolicitud({ tipo: 'permiso_circulacion', dni: '12345678Z' }, 'moto', campos, HOY)
  assert.equal('dni' in permiso.valores, false)
  // Una lectura guardada de antes (póliza con DNI del padre) no dispara «no casa».
  const viejas = [{ documentoId: 'd1', tipo: 'poliza' as const, valores: { dni: '12345678Z' } }]
  assert.deepEqual(contrastarConDocumentos({ dni: '87654321X' }, viejas), [])
  // El DNI del propio carné sí se contrasta.
  const carne = [{ documentoId: 'd2', tipo: 'carnet' as const, valores: { dni: '12345678Z' } }]
  assert.equal(contrastarConDocumentos({ dni: '87654321X' }, carne).length, 1)
})

// ─── 25/10/2026: todos los ramos (definición declarativa por grupo) ──────────

test('auto y moto piden EXACTAMENTE lo de antes (no se rompen al generalizar)', () => {
  assert.deepEqual(camposSolicitud('moto', nadaConocido).map((c) => c.clave), [
    'dni', 'fechaNacimiento', 'codigoPostal', 'tipoCarnet', 'fechaCarnet', 'matricula', 'marca', 'modelo', 'fechaMatriculacion',
    'garaje', 'kmAnuales', 'tieneSeguro', 'companiaActual', 'vencimientoActual', 'aniosSinSiniestros', 'comentario',
  ])
  assert.deepEqual(camposSolicitud('auto', todoConocido).map((c) => c.clave), [
    'dni', 'fechaNacimiento', 'matricula', 'marca', 'modelo', 'fechaMatriculacion',
    'garaje', 'kmAnuales', 'tieneSeguro', 'companiaActual', 'vencimientoActual', 'aniosSinSiniestros', 'comentario',
  ])
  assert.equal(camposSolicitud('auto', nadaConocido)[0].etiqueta, 'DNI o NIE del conductor principal')
})

test('todo ramo de oportunidad tiene formulario: identidad, seguro actual y comentario; claves sin repetir', () => {
  for (const r of RAMOS_SOLICITUD) {
    const claves = camposSolicitud(r, nadaConocido).map((c) => c.clave)
    assert.equal(new Set(claves).size, claves.length, `${r}: clave repetida`)
    for (const k of ['dni', 'tieneSeguro', 'companiaActual', 'vencimientoActual', 'comentario']) assert.ok(claves.includes(k), `${r} sin ${k}`)
    // Todo `siMarcado` apunta a un sí/no que existe.
    for (const c of camposSolicitud(r, nadaConocido)) {
      if (c.siMarcado) assert.equal(camposSolicitud(r, nadaConocido).find((x) => x.clave === c.siMarcado)?.tipo, 'si_no', `${r}.${c.clave}`)
    }
    assert.ok(tituloSolicitud(r, false).length > 10)
  }
  // Los títulos de auto/moto, como antes.
  assert.equal(tituloSolicitud('moto', true), 'Datos de la persona que figurará en el seguro de la moto')
  assert.equal(tituloSolicitud('auto', false), 'Datos para tu presupuesto de coche')
  assert.equal(tituloSolicitud('hogar', false), 'Datos para el presupuesto de tu seguro de hogar')
  assert.equal(grupoSolicitud('hogar'), 'hogar')
  assert.equal(grupoSolicitud('comunidades'), 'generico')
})

test('HOGAR: dirección CP-primero, régimen, uso, contenido, alarma, hipoteca → banco/certificado + entidad, seguro actual y efecto', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const por = (k: string) => campos.find((c) => c.clave === k)
  assert.equal(por('vivienda')?.tipo, 'direccion')
  assert.equal(por('vivienda')?.obligatorio, true)
  assert.deepEqual(por('regimen')?.opciones?.map((o) => o.valor), ['propietario', 'inquilino'])
  assert.deepEqual(por('usoVivienda')?.opciones?.map((o) => o.valor), ['habitual', 'secundaria', 'alquilada'])
  assert.equal(por('valorContenido')?.tipo, 'numero')
  assert.equal(por('valorContenido')?.obligatorio, false)
  assert.equal(por('alarma')?.tipo, 'si_no')
  assert.equal(por('paraBanco')?.siMarcado, 'hipoteca')
  assert.equal(por('entidadHipoteca')?.siMarcado, 'hipoteca')
  assert.equal(por('vencimientoActual')?.siMarcado, 'tieneSeguro')
  assert.equal(por('fechaEfecto')?.soloFutura, true)
})

const VIVIENDA_OK = {
  viviendaCp: '41003', viviendaProvincia: 'SEVILLA', viviendaMunicipio: 'SEVILLA', viviendaCalle: 'Calle Socorro', viviendaNumero: '24',
  viviendaViaTipo: 'CL', viviendaViaNombre: 'Socorro',
}
const HOGAR_OK = { dni: '12345678Z', fechaNacimiento: '01/02/1980', ...VIVIENDA_OK, regimen: 'propietario', usoVivienda: 'habitual', alarma: false, hipoteca: false, tieneSeguro: false }

test('HOGAR valida: lo que se deja en blanco es null (nunca 0 ni «»), y lo que cuelga de un «no» también', () => {
  const r = validarRespuestas(camposSolicitud('hogar', todoConocido), HOGAR_OK, HOY)
  assert.ok(r.ok, JSON.stringify(r))
  if (!r.ok) return
  assert.equal(r.respuestas.valorContenido, null)
  assert.equal(r.respuestas.paraBanco, null)
  assert.equal(r.respuestas.entidadHipoteca, null)
  assert.equal(r.respuestas.fechaEfecto, null)
  assert.equal(r.respuestas.viviendaPlanta, null)
  assert.equal(r.respuestas.viviendaCp, '41003')
  // Sin validación del servidor, la calle que manda el cliente NO es oficial («por validar»).
  assert.equal(r.respuestas.viviendaViaNombre, null)
  assert.equal(r.respuestas.viviendaViaTipo, null)
  assert.equal(r.respuestas.alarma, false)
})

test('HOGAR: con hipoteca hay que decir si es para el banco; la dirección exige CP válido, municipio, calle y número', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const conHipoteca = validarRespuestas(campos, { ...HOGAR_OK, hipoteca: true }, HOY)
  assert.ok(!conHipoteca.ok && conHipoteca.errores.paraBanco)
  const banco = validarRespuestas(campos, { ...HOGAR_OK, hipoteca: true, paraBanco: true, entidadHipoteca: ' Caixabank ' }, HOY)
  assert.ok(banco.ok && banco.respuestas.paraBanco === true && banco.respuestas.entidadHipoteca === 'Caixabank')
  const mal = validarRespuestas(campos, { ...HOGAR_OK, viviendaCp: '99999', viviendaMunicipio: '', viviendaNumero: ' ' }, HOY)
  assert.ok(!mal.ok)
  if (!mal.ok) for (const k of ['viviendaCp', 'viviendaMunicipio', 'viviendaNumero']) assert.ok(mal.errores[k], k)
  // Calle oficial a medias = texto libre (por validar), no media vía.
  const media = validarRespuestas(campos, { ...HOGAR_OK, viviendaViaNombre: '' }, HOY)
  assert.ok(media.ok && media.respuestas.viviendaViaTipo === null && media.respuestas.viviendaViaNombre === null)
})

test('fecha de efecto: hoy o futura; el vencimiento del seguro actual admite futuro', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const pasada = validarRespuestas(campos, { ...HOGAR_OK, fechaEfecto: '01/01/2026' }, HOY)
  assert.ok(!pasada.ok && pasada.errores.fechaEfecto)
  const futura = validarRespuestas(campos, { ...HOGAR_OK, fechaEfecto: '2026-11-01', tieneSeguro: true, companiaActual: 'Mapfre', vencimientoActual: '15/12/2026' }, HOY)
  assert.ok(futura.ok && futura.respuestas.fechaEfecto === '2026-11-01' && futura.respuestas.vencimientoActual === '2026-12-15')
})

test('genéricos: una empresa o comunidad da CIF y no tiene que dar fecha de nacimiento', () => {
  const r = validarRespuestas(camposSolicitud('comunidades', nadaConocido), {
    dni: 'H41000000', codigoPostal: '41003', descripcionRiesgo: 'Comunidad de 12 vecinos', tieneSeguro: false,
  }, HOY)
  assert.ok(r.ok, JSON.stringify(r))
})

test('el mensaje nombra el riesgo de cada ramo, sin datos del cliente', () => {
  const url = 'https://clientes.grupoasegura.es/datos/abc'
  assert.match(mensajeSolicitud('hogar', url), /presupuesto de tu seguro de hogar/)
  assert.match(mensajeSolicitud('mascotas', url, true), /el seguro de la mascota/)
  assert.equal(mensajeSolicitud('moto', url), `Hola, soy Alberto de Grupo ASegura. Para prepararte el presupuesto de tu moto necesito unos datos; te lleva dos minutos: ${url}`)
})

test('la calle es OFICIAL solo si el servidor la validó contra el callejero (y casa con la que manda el cliente)', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const ok = validarRespuestas(campos, HOGAR_OK, HOY, { viaValidada: () => ({ tipo: 'CL', nombre: 'SOCORRO' }) })
  assert.ok(ok.ok && ok.respuestas.viviendaViaTipo === 'CL' && ok.respuestas.viviendaViaNombre === 'SOCORRO')
  const otra = validarRespuestas(campos, HOGAR_OK, HOY, { viaValidada: () => ({ tipo: 'AV', nombre: 'SOCORRO' }) })
  assert.ok(otra.ok && otra.respuestas.viviendaViaTipo === null && otra.respuestas.viviendaViaNombre === null)
  const sinValidar = validarRespuestas(campos, HOGAR_OK, HOY, { viaValidada: () => null })
  assert.ok(sinValidar.ok && sinValidar.respuestas.viviendaViaNombre === null)
})

test('provincia y municipio tienen que ser los del CP (si la tabla lo sabe)', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const zona = () => ({ provincias: ['Sevilla'], municipios: ['Sevilla'] })
  assert.ok(validarRespuestas(campos, { ...HOGAR_OK, viviendaMunicipio: 'sevilla' }, HOY, { zonaCp: zona }).ok)
  const mal = validarRespuestas(campos, { ...HOGAR_OK, viviendaProvincia: 'Madrid', viviendaMunicipio: 'Espartinas' }, HOY, { zonaCp: zona })
  assert.ok(!mal.ok && mal.errores.viviendaProvincia && mal.errores.viviendaMunicipio)
  // La tabla no conoce el CP: no se contrasta.
  assert.ok(validarRespuestas(campos, { ...HOGAR_OK, viviendaMunicipio: 'Otro' }, HOY, { zonaCp: () => ({ provincias: null, municipios: null }) }).ok)
  // Grafías bilingües: «Alicante/Alacant».
  assert.deepEqual(casaZonaCp('alicante', 'Alacant', { provincias: ['Alicante'], municipios: ['Alicante/Alacant'] }), { provincia: true, municipio: true })
})
