import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS_SOLICITUD, camposAPreguntar, camposAlDia, camposSolicitud, casaZonaCp, conIdentidad, grupoSolicitud, tituloSolicitud, contrastarConDocumentos, mensajeSolicitud, normalizarLecturaSolicitud, validarRespuestas } from './solicitud-datos.ts'
import type { RamoSolicitud } from './solicitud-datos.ts'

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
    matricula: '1234 abc', marca: 'Yamaha', modelo: 'MT-07', fechaMatriculacion: '10/05/2018', garaje: 'calle', tieneSeguro: false, colado: 'x',
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
  assert.equal(por('tramoContenido')?.tipo, 'opcion')
  assert.equal(por('tramoContenido')?.obligatorio, false)
  assert.equal(por('valorContenido'), undefined, 'el contenido va por tramos desde el 26/10/2026')
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
const HOGAR_OK = { dni: '12345678Z', fechaNacimiento: '01/02/1980', ...VIVIENDA_OK, regimen: 'propietario', usoVivienda: 'habitual', alarma: false, hipoteca: false, tieneSeguro: false,
  tipoVivienda: 'piso', metrosCuadrados: '85', anioConstruccion: '1998', habitaciones: '3', propietarioEsTomador: true, urbanizacionCerrada: false, puertaPrincipalBlindada: true, ventanasSeguras: false }

test('HOGAR valida: lo que se deja en blanco es null (nunca 0 ni «»), y lo que cuelga de un «no» también', () => {
  // Confirmó la tarjeta del Catastro sin que viajaran m² ni año (portal antiguo): quedan null, no es un error.
  const r = validarRespuestas(camposSolicitud('hogar', todoConocido), { ...HOGAR_OK, confirmaCatastro: true, metrosCuadrados: undefined, anioConstruccion: undefined }, HOY)
  assert.ok(r.ok, JSON.stringify(r))
  if (!r.ok) return
  assert.equal(r.respuestas.tramoContenido, null)
  assert.equal(r.respuestas.paraBanco, null)
  assert.equal(r.respuestas.entidadHipoteca, null)
  assert.equal(r.respuestas.fechaEfecto, null)
  assert.equal(r.respuestas.viviendaPlanta, null)
  // 26/10/2026: lo opcional sin contestar es null; nunca false ni 0.
  for (const k of ['conMadera', 'vigilante', 'anioUltimaReforma', 'tramoContinente', 'metrosCuadrados', 'anioConstruccion', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos']) {
    assert.equal(r.respuestas[k], null, k)
  }
  assert.equal(r.respuestas.habitaciones, 3)
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

test('NIVELES y «No lo sé» en TODOS los ramos: esencial = obligatorio por defecto; identidad y dirección nunca admiten «No lo sé»', () => {
  for (const ramo of RAMOS_SOLICITUD) {
    for (const c of camposSolicitud(ramo, todoConocido)) {
      assert.ok(c.nivel === 'esencial' || c.nivel === 'opcional', `${ramo}.${c.clave} sin nivel`)
      if (c.obligatorio) assert.equal(c.nivel, 'esencial', `${ramo}.${c.clave}`)
      if (c.clave === 'dni' || c.clave === 'fechaNacimiento' || c.tipo === 'direccion') assert.equal(c.admiteNoLoSe, false, `${ramo}.${c.clave}`)
    }
  }
})

test('«No lo sé» en lo que NO es esencial para tarificar: se acepta como null (nunca false ni 0) y queda anotado; en el DNI no vale', () => {
  const campos = camposSolicitud('hogar', todoConocido)
  const r = validarRespuestas(campos, { ...HOGAR_OK, hipoteca: undefined, conMadera: undefined, _noLoSe: ['hipoteca', 'conMadera', 'dni'] }, HOY)
  assert.ok(r.ok, JSON.stringify(r))
  if (!r.ok) return
  assert.equal(r.respuestas.hipoteca, null)
  assert.equal(r.respuestas.conMadera, null)
  assert.equal(r.respuestas._noLoSe, 'hipoteca,conMadera')
  assert.equal(r.respuestas.dni, '12345678Z')
  const sinMarcar = validarRespuestas(campos, { ...HOGAR_OK, hipoteca: undefined }, HOY)
  assert.ok(!sinMarcar.ok)
  const a = camposAPreguntar(campos, r.respuestas)
  assert.ok(a.noLoSabe.includes('¿Tiene hipoteca?'))
  assert.ok(a.sinContestar.includes('Joyas guardadas en caja fuerte, en €'))
  assert.ok(!a.sinContestar.some((x) => /banco/i.test(x)), 'lo que cuelga de un «no» no se pregunta')
})

// 26/10/2026 (revisión del PR #5068): «No lo sé» nunca en lo esencial para tarificar.
const ESENCIALES_VEHICULO = ['marca', 'modelo', 'fechaMatriculacion', 'fechaCarnet', 'tipoCarnet', 'garaje', 'matricula']
const ESENCIALES_HOGAR = ['tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'habitaciones', 'regimen', 'usoVivienda', 'alarma', 'propietarioEsTomador', 'urbanizacionCerrada', 'puertaPrincipalBlindada', 'ventanasSeguras', 'tramoContenido']

test('NO LO SÉ: ningún esencial para tarificar lo ofrece (auto, moto, hogar, personas, mascota), ni en un enlace YA ENVIADO', () => {
  const casos: [RamoSolicitud, string[]][] = [
    ['moto', ESENCIALES_VEHICULO], ['auto', ESENCIALES_VEHICULO.filter((k) => k !== 'tipoCarnet')], ['hogar', ESENCIALES_HOGAR],
    ['salud', ['personasAsegurar']], ['accidentes', ['profesion']], ['mascotas', ['razaMascota', 'ppp']],
  ]
  for (const [ramo, claves] of casos) {
    const campos = camposSolicitud(ramo, nadaConocido)
    for (const k of claves) {
      const c = campos.find((x) => x.clave === k)
      assert.ok(c, `${ramo}.${k} no se pide`)
      assert.equal(c.admiteNoLoSe, false, `${ramo}.${k} ofrece «No lo sé»`)
      assert.equal(c.nivel, 'esencial', `${ramo}.${k} no es esencial`)
    }
  }
  // Enlace ya ENVIADO (campos guardados con «No lo sé» y la matriculación opcional): `camposAlDia` lo corrige.
  const guardados = camposSolicitud('moto', nadaConocido).map((c) => ({ ...c, admiteNoLoSe: true, ...(c.clave === 'fechaMatriculacion' ? { obligatorio: false, nivel: 'opcional' as const } : {}) }))
  const al = camposAlDia('moto', guardados)
  for (const k of ESENCIALES_VEHICULO) assert.equal(al.find((c) => c.clave === k)?.admiteNoLoSe, false, `enviado: ${k}`)
  const fm = al.find((c) => c.clave === 'fechaMatriculacion')
  assert.equal(fm?.obligatorio, true)
  assert.equal(fm?.nivel, 'esencial')
  assert.equal(al.find((c) => c.clave === 'kmAnuales')?.admiteNoLoSe, true, 'lo opcional sigue admitiéndolo')
})

test('NO LO SÉ: validarRespuestas rechaza null en los esenciales, también si llega marcado «No lo sé» o con el campo guardado viejo', () => {
  const MOTO = { dni: '12345678Z', fechaNacimiento: '01/02/1990', codigoPostal: '41003', tipoCarnet: 'A2', fechaCarnet: '15/03/2015', matricula: '1234ABC', marca: 'Yamaha', modelo: 'MT-07', fechaMatriculacion: '10/05/2018', garaje: 'calle', tieneSeguro: false }
  const guardados = camposSolicitud('moto', nadaConocido).map((c) => ({ ...c, admiteNoLoSe: true, ...(c.clave === 'fechaMatriculacion' ? { obligatorio: false } : {}) }))
  for (const campos of [camposSolicitud('moto', nadaConocido), camposAlDia('moto', guardados), guardados]) {
    assert.ok(validarRespuestas(campos, MOTO, HOY).ok)
    for (const k of ['marca', 'modelo', 'fechaCarnet', 'tipoCarnet', 'garaje']) {
      const r = validarRespuestas(campos, { ...MOTO, [k]: undefined, _noLoSe: [k] }, HOY)
      assert.ok(!r.ok && r.errores[k], `${k}: «No lo sé» no vale`)
    }
  }
  for (const campos of [camposSolicitud('moto', nadaConocido), camposAlDia('moto', guardados)]) {
    const r = validarRespuestas(campos, { ...MOTO, fechaMatriculacion: '', _noLoSe: ['fechaMatriculacion'] }, HOY)
    assert.ok(!r.ok && r.errores.fechaMatriculacion, 'la matriculación es obligatoria')
  }
  // Hogar: tipo, m², año y rejas se exigen salvo que confirmara la tarjeta del Catastro.
  const hogar = camposSolicitud('hogar', todoConocido)
  for (const k of ['tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'habitaciones', 'alarma']) {
    const r = validarRespuestas(hogar, { ...HOGAR_OK, [k]: undefined, _noLoSe: [k] }, HOY)
    assert.ok(!r.ok && r.errores[k], `hogar.${k}`)
  }
  const bajo = validarRespuestas(hogar, { ...HOGAR_OK, tipoVivienda: 'planta_baja', ventanasSeguras: undefined }, HOY)
  assert.ok(!bajo.ok && bajo.errores.ventanasSeguras, 'en un bajo las rejas se exigen')
  assert.ok(validarRespuestas(hogar, { ...HOGAR_OK, tipoVivienda: 'piso', ventanasSeguras: undefined }, HOY).ok, 'en un piso no se preguntan')
})

test('CATASTRO: si tras confirmar la tarjeta tipo, m² o año quedan null, salen «a preguntar»; las rejas de un piso no', () => {
  const hogar = camposSolicitud('hogar', todoConocido)
  const r = validarRespuestas(hogar, { ...HOGAR_OK, confirmaCatastro: true, tipoVivienda: undefined, metrosCuadrados: undefined, anioConstruccion: undefined, ventanasSeguras: undefined }, HOY)
  assert.ok(r.ok, JSON.stringify(r))
  if (!r.ok) return
  const a = camposAPreguntar(hogar, r.respuestas)
  for (const k of ['tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'ventanasSeguras']) {
    assert.ok(a.sinContestar.includes(hogar.find((c) => c.clave === k)!.etiqueta), `${k} a preguntar`)
  }
  // Con los valores que vio y confirmó, nada de eso queda a preguntar; y en un piso las rejas tampoco.
  const conValores = validarRespuestas(hogar, { ...HOGAR_OK, confirmaCatastro: true, tipoVivienda: 'piso', metrosCuadrados: '85', anioConstruccion: '1998', ventanasSeguras: undefined }, HOY)
  assert.ok(conValores.ok)
  if (!conValores.ok) return
  const b = camposAPreguntar(hogar, conValores.respuestas)
  for (const k of ['tipoVivienda', 'metrosCuadrados', 'anioConstruccion', 'ventanasSeguras']) {
    assert.ok(!b.sinContestar.includes(hogar.find((c) => c.clave === k)!.etiqueta), `${k} no a preguntar`)
  }
})

test('C: un enlace de hogar YA CREADO toma las preguntas vigentes al pintarse (los campos se guardan al crear)', () => {
  const viejo = [{ clave: 'dni', etiqueta: 'DNI', tipo: 'texto', obligatorio: true }, { clave: 'valorContenido', etiqueta: 'Contenido', tipo: 'numero', obligatorio: false }] as const
  const al = camposAlDia('hogar', [...viejo])
  assert.ok(al.some((c) => c.clave === 'puertaPrincipalBlindada'))
  assert.ok(!al.some((c) => c.clave === 'valorContenido'), 'sustituido por tramoContenido')
  const moto = camposAlDia('moto', [{ clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true }])
  assert.equal(moto.length, 1)
  assert.equal(moto[0].nivel, 'esencial')
})
