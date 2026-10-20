import test from 'node:test'
import assert from 'node:assert/strict'
import { BLOQUES_OBLIGATORIO, obligatoriosPara } from '@central/module-tarificacion'
import { adaptadorDeRamo } from './tarificador-bots-ramos.ts'
import { pendientesPorBloque, type PendientesPorBloque } from './tarificador-pendientes.ts'

const AUTO = {
  matricula: '1234BCD', marca: null, modelo: null, version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: null,
  numeroPolizaActual: 'POL-2026-00012345', // 20/10/2026: con seguro anterior Allianz/Mapfre piden la póliza; consta (sintética)
}
const MOTO = {
  matricula: '1234BCD', marca: 'Honda', modelo: 'PCX', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
}
const todas = (r: PendientesPorBloque) => BLOQUES_OBLIGATORIO.flatMap((b) => r.bloques[b])
const auto = (formulario: object, extra: Record<string, string>, companias: string[]) =>
  pendientesPorBloque({ adaptador: adaptadorDeRamo('auto')!, formulario, extra, companias })
const moto = (formulario: object, extra: Record<string, string>, companias: string[]) =>
  pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario, extra, companias })

test('unión Allianz + Mapfre (moto): cada clave UNA vez, con las compañías que la piden y en su bloque', () => {
  const r = moto(MOTO, { cilindrada: '125' }, ['allianz', 'mapfre'])
  const claves = todas(r).map((p) => p.clave)
  assert.equal(new Set(claves).size, claves.length, 'sin claves repetidas')
  // Compartida: la piden las dos y sale una sola vez.
  const anios = todas(r).filter((p) => p.clave === 'aniosAseguradoAnterior')
  assert.equal(anios.length, 1)
  assert.deepEqual(anios[0]!.companias, ['allianz', 'mapfre'])
  assert.equal(anios[0]!.bloque, 'poliza')
  // Solo Allianz (sexo; el Sr./Sra. de la ficha no lo da aquí → ficha). El NIF del tomador (de la ficha) lo piden los DOS bots de moto
  // (Allianz 0.7.5+ si el tomador es conductor/propietario; Mapfre siempre) y sale una sola vez.
  assert.deepEqual(todas(r).find((p) => p.clave === 'conductor.sexo')?.companias, ['allianz'])
  assert.equal(todas(r).find((p) => p.clave === 'conductor.sexo')?.bloque, 'personas')
  assert.deepEqual(todas(r).find((p) => p.clave === 'documentoTomador')?.companias, ['allianz', 'mapfre'])
  assert.deepEqual(r.companias.map((c) => c.compania), ['allianz', 'mapfre'])
  // Una compañía repetida en la entrada no duplica nada.
  const dup = moto(MOTO, { cilindrada: '125' }, ['allianz', 'mapfre', 'allianz'])
  assert.deepEqual(dup, r)
})

test('compañía anterior: solo se pide con años asegurado > 0', () => {
  const con = auto(AUTO, {}, ['mapfre'])
  assert.deepEqual(todas(con).filter((p) => p.clave === 'companiaAnterior').map((p) => [p.estado, p.bloque, p.campoExtra]), [['falta', 'poliza', 'companiaAnterior']])
  const cero = auto({ ...AUTO, aniosAsegurado: '0' }, {}, ['mapfre'])
  assert.ok(!todas(cero).some((p) => p.clave === 'companiaAnterior'), 'con 0 años no se pide')
  // Con ella tecleada deja de ser pendiente.
  const dada = auto(AUTO, { companiaAnterior: 'Línea Directa' }, ['mapfre'])
  assert.ok(!todas(dada).some((p) => p.clave === 'companiaAnterior'))
})

test('lo que viene de la ficha NO es pendiente: estado «ficha», no cuenta en faltan y el chip queda «listo»; nunca se pinta su valor', () => {
  const r = auto(AUTO, { companiaAnterior: 'Línea Directa' }, ['mapfre'])
  const nif = todas(r).find((p) => p.clave === 'documentoTomador')
  assert.equal(nif?.estado, 'ficha')
  assert.equal(nif?.bloque, 'personas')
  assert.deepEqual(r.companias, [{ compania: 'mapfre', estado: 'listo', faltan: 0, supuestos: 0 }])
  assert.ok(todas(r).every((p) => p.estado === 'ficha'), 'solo queda lo de la ficha')
  const json = JSON.stringify(r)
  for (const valor of ['1234BCD', '1980-05-17', '2000-06-01', '41003', 'Línea Directa']) assert.ok(!json.includes(valor), `ningún valor (${valor})`)
})

test('compañía sin declaración → no_disponible (nunca «listo»), sin aportar pendientes; con formulario completo o roto', () => {
  const r = auto(AUTO, { companiaAnterior: 'Línea Directa' }, ['zurich', 'mapfre'])
  assert.deepEqual(r.companias[0], { compania: 'zurich', estado: 'no_disponible', faltan: 0, supuestos: 0 })
  assert.ok(todas(r).every((p) => !p.companias.includes('zurich')))
  assert.equal(auto({ ...AUTO, matricula: '' }, {}, ['zurich']).companias[0]!.estado, 'no_disponible')
  assert.equal(auto(AUTO, {}, []).companias.length, 0)
})

test('un supuesto es para confirmar: el chip NO es «listo» y cuenta en faltan/supuestos', () => {
  // Moto con cilindrada y sexo dados, pero años y siniestros sin dato → supuestos favorables declarados.
  const r = moto({ ...MOTO, sexo: 'hombre' }, { cilindrada: '125' }, ['allianz'])
  const supuestos = todas(r).filter((p) => p.estado === 'supuesto').map((p) => p.clave).sort()
  assert.deepEqual(supuestos, ['aniosAseguradoAnterior', 'siniestrosUltimos5Anios'])
  // 20/10/2026 (bot 0.7.11): + compañía anterior, póliza, justificante y fecha de adquisición (el formulario aún no recoge los tres últimos).
  assert.deepEqual(r.companias[0], { compania: 'allianz', estado: 'faltan', faltan: 6, supuestos: 2 })
  // Antecedentes confirmados (dato real): ya no son supuestos; siguen faltando los datos del seguro anterior y la fecha de adquisición.
  const ok = moto({ ...MOTO, sexo: 'hombre', aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0' }, { cilindrada: '125' }, ['allianz'])
  assert.deepEqual(ok.companias[0], { compania: 'allianz', estado: 'faltan', faltan: 4, supuestos: 0 })
})

test('estado de la clave compartida = el más urgente; formulario incompleto → chip «faltan» y los generales aparte', () => {
  const r = moto(MOTO, {}, ['allianz', 'mapfre']) // sin cilindrada: el formulario aún no vale
  assert.ok(r.generales.some((g) => /Cilindrada/.test(g)))
  assert.deepEqual(r.companias.map((c) => [c.estado, c.faltan > 0]), [['faltan', true], ['faltan', true]])
  assert.equal(todas(r).length, 0)
})

test('campos sueltos de los bots: bloque válido y coherente con el obligatorio que completan', () => {
  const bloqueDe = (compania: string, ramo: string, clave: string) => obligatoriosPara(compania, ramo)!.find((o) => o.clave === clave)!.bloque
  const esperado: Record<string, string> = {
    cilindrada: 'riesgo', usoVehiculo: 'riesgo', ambitoCirculacion: 'riesgo', sexo: 'personas', clasePermiso: 'personas', companiaAnterior: 'poliza',
  }
  for (const ramo of ['moto', 'auto', 'hogar']) {
    for (const c of adaptadorDeRamo(ramo)!.campos) {
      assert.ok((BLOQUES_OBLIGATORIO as readonly string[]).includes(c.bloque), `${ramo}/${c.clave}`)
      if (esperado[c.clave]) assert.equal(c.bloque, esperado[c.clave], `${ramo}/${c.clave}`)
    }
  }
  assert.equal(adaptadorDeRamo('moto')!.campos.find((c) => c.clave === 'cilindrada')!.bloque, bloqueDe('allianz', 'moto', 'seleccionVehiculo.cilindradaCc'))
  assert.equal(adaptadorDeRamo('moto')!.campos.find((c) => c.clave === 'sexo')!.bloque, bloqueDe('allianz', 'moto', 'conductor.sexo'))
  assert.equal(adaptadorDeRamo('auto')!.campos.find((c) => c.clave === 'companiaAnterior')!.bloque, bloqueDe('mapfre', 'auto', 'companiaAnterior'))
})

test('Allianz moto: fecha de adquisición (Riesgo), póliza anterior y justificante (Póliza) son pendientes editables y dejan de serlo al rellenarlos', () => {
  const F = { ...MOTO, tieneSeguroActual: true, aniosAsegurado: '4', aniosSinSiniestros: '4', siniestrosUltimos5: '0', companiaAnterior: 'Compañía Beta' }
  const r = moto(F, { cilindrada: '125', sexo: 'hombre' }, ['allianz'])
  const claves = Object.fromEntries(todas(r).map((p) => [p.clave, p]))
  assert.deepEqual([claves.fechaAdquisicion?.bloque, claves.fechaAdquisicion?.estado, claves.fechaAdquisicion?.campoExtra], ['riesgo', 'falta', 'fechaAdquisicion'])
  assert.deepEqual([claves.polizaAnteriorUltimos5?.bloque, claves.polizaAnteriorUltimos5?.estado, claves.polizaAnteriorUltimos5?.campoExtra], ['poliza', 'falta', 'polizaAnteriorUltimos5'])
  assert.deepEqual([claves.fotocopiaAnterior?.bloque, claves.fotocopiaAnterior?.estado, claves.fotocopiaAnterior?.campoExtra], ['poliza', 'falta', 'fotocopiaAnterior'])
  const campos = adaptadorDeRamo('moto')!.campos
  assert.equal(campos.find((c) => c.clave === 'polizaAnteriorUltimos5')?.etiqueta, 'Nº de póliza anterior (últimas 5 cifras)')
  assert.equal(campos.find((c) => c.clave === 'fotocopiaAnterior')?.etiqueta, 'Justificante del seguro anterior')
  assert.deepEqual(campos.find((c) => c.clave === 'fotocopiaAnterior')?.opciones?.map((o) => o.etiqueta), ['Elegir…', 'Recibo del próximo año / certificado', 'Recibos de los 2 últimos años'])
  const dados = moto(F, { cilindrada: '125', sexo: 'hombre', fechaAdquisicion: '2023-05-10', polizaAnteriorUltimos5: '12345', fotocopiaAnterior: 'proximo_anio' }, ['allianz'])
  for (const k of ['fechaAdquisicion', 'polizaAnteriorUltimos5', 'fotocopiaAnterior']) assert.ok(!todas(dados).some((p) => p.clave === k), `${k} ya no es pendiente`)
  // Por defecto = matriculación: con ella (y sin fecha explícita) deja de ser pendiente; una explícita manda; sin ninguna, falta.
  const conMatr = moto({ ...F, fechaMatriculacion: '2023-05-10' }, { cilindrada: '125', sexo: 'hombre' }, ['allianz'])
  assert.ok(!todas(conMatr).some((p) => p.clave === 'fechaAdquisicion'), 'la matriculación cubre la adquisición')
  const vacia = moto({ ...F, fechaMatriculacion: '2023-05-10' }, { cilindrada: '125', sexo: 'hombre', fechaAdquisicion: '' }, ['allianz'])
  assert.ok(!todas(vacia).some((p) => p.clave === 'fechaAdquisicion'), 'vacía + matriculación: no falta')
  const sinMatr = moto({ ...F, fechaMatriculacion: '' }, { cilindrada: '125', sexo: 'hombre' }, ['allianz'])
  assert.ok(todas(sinMatr).some((p) => p.clave === 'fechaAdquisicion' && p.estado === 'falta'), 'sin ninguna: falta')
  // Sin seguro anterior (0 años) solo se pide la fecha de adquisición.
  const sin = moto({ ...F, aniosAsegurado: '0' }, { cilindrada: '125', sexo: 'hombre' }, ['allianz'])
  assert.deepEqual(todas(sin).filter((p) => ['fechaAdquisicion', 'polizaAnteriorUltimos5', 'fotocopiaAnterior'].includes(p.clave)).map((p) => p.clave), ['fechaAdquisicion'])
})
