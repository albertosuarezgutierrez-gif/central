// Cepos de la precarga/guardado de los campos extra de «Bots (gratis)» (20/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accionGuardarExtra, companiaGuardable, extraEfectivo, numeroPolizaAGuardar, valorCampoExtra } from './tarificador-bots-extra.ts'

test('valorCampoExtra: lo tecleado (aunque vacío) manda; luego lo precargado; luego el formulario (sexo/compañía); luego el defecto', () => {
  const f = { sexo: 'mujer', companiaAnterior: 'Compañía Uno' }
  assert.equal(valorCampoExtra('companiaAnterior', {}, undefined, f), 'Compañía Uno')
  assert.equal(valorCampoExtra('companiaAnterior', { companiaAnterior: '' }, undefined, f), '', 'vaciarlo es una decisión')
  assert.equal(valorCampoExtra('companiaAnterior', { companiaAnterior: 'Otra' }, undefined, f), 'Otra')
  assert.equal(valorCampoExtra('sexo', {}, { sexo: '' }, f, ''), 'mujer')
  assert.equal(valorCampoExtra('sexo', {}, { sexo: 'hombre' }, f), 'hombre')
  assert.equal(valorCampoExtra('sexo', {}, undefined, { sexo: 'otro' }), '', 'valor fuera del vocabulario: no se pinta')
  assert.equal(valorCampoExtra('cilindrada', {}, { cilindrada: '125' }, f), '125')
  assert.equal(valorCampoExtra('cilindrada', {}, undefined, f), '', 'sin dato no se inventa')
  assert.equal(valorCampoExtra('cilindrada', {}, undefined, null, 'x'), 'x')
})

test('extraEfectivo: lo tecleado pisa lo precargado', () => {
  assert.deepEqual(extraEfectivo({ a: '2' }, { a: '1', b: '3' }), { a: '2', b: '3' })
  assert.deepEqual(extraEfectivo({}, undefined), {})
})

test('companiaGuardable: sin valores de cajón, ni vacíos, ni largos', () => {
  assert.equal(companiaGuardable('  Línea   Directa '), 'Línea Directa')
  for (const v of ['', ' ', 'a', 'Otro', 'N/A', 'no consta', 'x'.repeat(81), null, undefined]) assert.equal(companiaGuardable(v), null, String(v))
})

test('accionGuardarExtra: cilindrada válida y distinta de la guardada, con oportunidad', () => {
  assert.deepEqual(accionGuardarExtra('cilindrada', '125', { oportunidadId: 'o1' }), { tipo: 'cilindrada', cc: 125 })
  assert.deepEqual(accionGuardarExtra('cilindrada', '1.000 cc', { oportunidadId: 'o1', guardado: '125' }), { tipo: 'cilindrada', cc: 1000 })
  assert.equal(accionGuardarExtra('cilindrada', '125', { oportunidadId: 'o1', guardado: '125' }), null, 'igual a lo guardado')
  assert.equal(accionGuardarExtra('cilindrada', '125', { oportunidadId: null }), null, 'sin oportunidad no hay dónde')
  for (const v of ['', 'abc', '50', '3001']) assert.equal(accionGuardarExtra('cilindrada', v, { oportunidadId: 'o1' }), null, v)
})

test('accionGuardarExtra: sexo solo si la ficha no lo tiene (no pisa uno guardado) y es hombre/mujer', () => {
  assert.deepEqual(accionGuardarExtra('sexo', 'mujer', { oportunidadId: null, sexoSinFicha: true }), { tipo: 'sexo', sexo: 'mujer' })
  assert.equal(accionGuardarExtra('sexo', 'mujer', { oportunidadId: 'o1', sexoSinFicha: false }), null)
  assert.equal(accionGuardarExtra('sexo', 'mujer', { oportunidadId: 'o1' }), null)
  assert.equal(accionGuardarExtra('sexo', '', { oportunidadId: 'o1', sexoSinFicha: true }), null, 'sin elegir no se guarda')
})

test('accionGuardarExtra: compañía anterior; nunca borra ni guarda cajón; clave desconocida no guarda', () => {
  assert.deepEqual(accionGuardarExtra('companiaAnterior', ' Línea Directa ', { oportunidadId: 'o1', guardado: 'Mapfre' }), { tipo: 'compania', texto: 'Línea Directa' })
  assert.equal(accionGuardarExtra('companiaAnterior', 'Línea Directa', { oportunidadId: 'o1', guardado: 'Línea Directa' }), null)
  assert.equal(accionGuardarExtra('companiaAnterior', '', { oportunidadId: 'o1', guardado: 'Mapfre' }), null, 'vaciar no borra lo guardado')
  assert.equal(accionGuardarExtra('companiaAnterior', 'Otro', { oportunidadId: 'o1' }), null)
  assert.equal(accionGuardarExtra('companiaAnterior', 'Mapfre', { oportunidadId: null }), null)
  assert.equal(accionGuardarExtra('uso', 'x', { oportunidadId: 'o1' }), null)
})

test('cableado: el bloque guarda al salir del campo y pinta lo precargado; el cotizador de moto manda la población', () => {
  const bloque = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(bloque, /onBlur=\{\(e\) => void guardarExtra\(c\.clave, e\.target\.value\)\}/)
  assert.match(bloque, /valorCampoExtra\(c\.clave, extra, inicialesExtra, formulario/)
  assert.match(bloque, /adaptador\.construir\(formulario, efectivo\)/)
  const moto = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', import.meta.url), 'utf8')
  assert.match(moto, /poblacion: poblacionParaBot\(\{ elegidoId: municipioId, municipios, cpMunicipios, cpCirculacionRiesgo: datosRiesgo\?\.cpCirculacion \}\)/)
})

test('cuerpoGuardarCompania: una sola llamada escribe aseguradora Y historialDeclarado.companiaActual', async () => {
  const { cuerpoGuardarCompania } = await import('./tarificador-bots-extra.ts')
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa'), { accion: 'editar', id: 'o1', aseguradora: 'Aseguradora Alfa', historialDeclarado: { companiaActual: 'Aseguradora Alfa' } })
})

test('opcionesDeCampoExtra: sexo vacío dice «Según la ficha» solo si la ficha ya lo tiene', async () => {
  const { opcionesDeCampoExtra } = await import('./tarificador-bots-extra.ts')
  const ops = [{ valor: '', etiqueta: 'Elegir…' }, { valor: 'hombre', etiqueta: 'Hombre' }]
  assert.equal(opcionesDeCampoExtra('sexo', ops, { sexoSinFicha: false })[0]!.etiqueta, 'Según la ficha')
  assert.equal(opcionesDeCampoExtra('sexo', ops, { sexoSinFicha: true })[0]!.etiqueta, 'Elegir…')
  assert.equal(opcionesDeCampoExtra('sexo', ops, null)[0]!.etiqueta, 'Elegir…')
  assert.equal(opcionesDeCampoExtra('otro', ops, { sexoSinFicha: false })[0]!.etiqueta, 'Elegir…')
  assert.equal(opcionesDeCampoExtra('sexo', ops, { sexoSinFicha: false })[1]!.etiqueta, 'Hombre')
})

test('cuerpoGuardarCompania: con un CÓDIGO ya en el historial o «sin seguro» solo viaja aseguradora (no se pisa ni se provoca el 422)', async () => {
  const { cuerpoGuardarCompania } = await import('./tarificador-bots-extra.ts')
  const solo = { accion: 'editar', id: 'o1', aseguradora: 'Aseguradora Alfa' }
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa', { companiaActual: 'C0058' }), solo)
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa', { companiaActual: null, tieneSeguroActual: false }), solo)
  const con = { ...solo, historialDeclarado: { companiaActual: 'Aseguradora Alfa' } }
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa', { companiaActual: 'Aseguradora Beta', tieneSeguroActual: true }), con)
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa', { companiaActual: null }), con)
  assert.deepEqual(cuerpoGuardarCompania('o1', 'Aseguradora Alfa', null), con)
})

test('Allianz moto: fecha de adquisición → datosVehiculo.fechaCompra; póliza y justificante → historialDeclarado (nunca borran, no repiten)', async () => {
  const { cuerpoGuardarHistorial } = await import('./tarificador-bots-extra.ts')
  const ctx = { oportunidadId: 'o1' }
  assert.deepEqual(accionGuardarExtra('fechaAdquisicion', '2023-05-10', { ...ctx, guardado: '' }), { tipo: 'fechaAdquisicion', fecha: '2023-05-10' })
  assert.equal(accionGuardarExtra('fechaAdquisicion', '2023-05-10', { ...ctx, guardado: '2023-05-10' }), null, 'igual a lo guardado')
  assert.equal(accionGuardarExtra('fechaAdquisicion', '', { ...ctx, guardado: '2023-05-10' }), null, 'vaciar no borra')
  assert.equal(accionGuardarExtra('fechaAdquisicion', '2023-02-30', ctx), null, 'fecha inexistente')
  assert.equal(accionGuardarExtra('fechaAdquisicion', '2023-05-10', { oportunidadId: null }), null)
  assert.deepEqual(accionGuardarExtra('polizaAnteriorUltimos5', '12345', { ...ctx, guardado: '' }), { tipo: 'poliza', ultimos5: '12345' })
  assert.deepEqual(accionGuardarExtra('polizaAnteriorUltimos5', 'AB-9912345', { ...ctx, guardado: '' }), { tipo: 'poliza', ultimos5: '12345' })
  assert.equal(accionGuardarExtra('polizaAnteriorUltimos5', '12345', { ...ctx, guardado: '12345' }), null)
  assert.equal(accionGuardarExtra('polizaAnteriorUltimos5', '123', ctx), null, 'menos de 5 cifras')
  assert.deepEqual(accionGuardarExtra('fotocopiaAnterior', 'proximo_anio', ctx), { tipo: 'justificante', valor: 'proximo_anio' })
  assert.equal(accionGuardarExtra('fotocopiaAnterior', 'proximo_anio', { ...ctx, guardado: 'proximo_anio' }), null)
  assert.equal(accionGuardarExtra('fotocopiaAnterior', '', { ...ctx, guardado: 'proximo_anio' }), null)
  assert.equal(accionGuardarExtra('fotocopiaAnterior', 'otro', ctx), null)
  assert.deepEqual(cuerpoGuardarHistorial('o1', 'numeroPoliza', '12345'), { accion: 'editar', id: 'o1', historialDeclarado: { numeroPoliza: '12345' } })
  assert.deepEqual(cuerpoGuardarHistorial('o1', 'fotocopiaAnterior', 'dos_ultimos_anios'), { accion: 'editar', id: 'o1', historialDeclarado: { fotocopiaAnterior: 'dos_ultimos_anios' } })
  // Cableado: PrecioBots guarda cada acción por su vía y el cotizador precarga desde fechaCompra / historial declarado.
  const bloque = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(bloque, /datosVehiculo: \{ fechaCompra: a\.fecha \}/)
  assert.match(bloque, /cuerpoGuardarHistorial\(oportunidadId, 'numeroPoliza', nPoliza \?\? a\.ultimos5\)/)
  assert.match(bloque, /numeroPolizaAGuardar\(historialDeclarado\?\.numeroPoliza, a\.ultimos5\)/)
  assert.match(bloque, /cuerpoGuardarHistorial\(oportunidadId, 'fotocopiaAnterior', a\.valor\)/)
  const moto = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', import.meta.url), 'utf8')
  assert.match(moto, /fechaAdquisicion: datosRiesgo\?\.fechaCompra \?\? ''/)
  assert.match(moto, /historialRiesgo\?\.numeroPoliza/)
  assert.match(moto, /historialRiesgo\?\.fotocopiaAnterior/)
})

test('numeroPolizaAGuardar: no pisa un nº completo que ya termina en esas 5 cifras; sin nº o distinto, guarda lo tecleado', () => {
  assert.equal(numeroPolizaAGuardar('AB-0099912345', '12345'), null, 'termina igual (solo dígitos)')
  assert.equal(numeroPolizaAGuardar('99912345', '12-345'), null)
  assert.equal(numeroPolizaAGuardar('12345', '12345'), null)
  assert.equal(numeroPolizaAGuardar(null, '12345'), '12345')
  assert.equal(numeroPolizaAGuardar('', '12345'), '12345')
  assert.equal(numeroPolizaAGuardar(undefined, '12345'), '12345')
  assert.equal(numeroPolizaAGuardar('99954321', '12345'), '12345', 'termina en otras cifras')
  assert.equal(numeroPolizaAGuardar('12345999', '12345'), '12345', 'las 5 cifras no al final')
})
