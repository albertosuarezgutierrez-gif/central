// Cepos de las reglas PREVIAS al bot de motor (20/10/2026). `node --test`. Datos sintéticos; el reloj va inyectado (`HOY`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOQUE_REGLA_PREVIA, carneDemasiadoJoven, edadEnFecha, edadMinimaCarne, etiquetaCarneJoven, huboSeguroAnterior, reglaCarne, reglaMatriculacionGenerali,
  reglaPolizaAnterior, reglaSiniestrosMoto, reglasPrevias, reglasTomadorAllianzTurismos, tomadorSinEnFicha,
} from './tarificador-reglas-previas.ts'
import { adaptadorDeRamo, checklistBot } from './tarificador-bots-ramos.ts'
import { pendientesPorBloque } from './tarificador-pendientes.ts'
import { formularioBotAuto, type EntradaBotAuto } from './tarificador-auto-formulario.ts'

const HOY = new Date('2026-10-20T10:00:00Z')

// ─── Edad y carné ────────────────────────────────────────────────────────────

test('edadEnFecha: años cumplidos; el día del cumpleaños ya cuenta y el anterior no', () => {
  assert.equal(edadEnFecha('2000-06-15', '2018-06-15'), 18)
  assert.equal(edadEnFecha('2000-06-15', '2018-06-14'), 17)
  assert.equal(edadEnFecha('2000-06-15', '2018-12-31'), 18)
  assert.equal(edadEnFecha('2000-06-15', '2000-06-14'), -1)
})

test('edadEnFecha: nacido el 29/02 cumple el 1/03 en año no bisiesto (como el bot de Allianz) y el 29/02 en bisiesto', () => {
  assert.equal(edadEnFecha('2004-02-29', '2022-02-28'), 17, '28/02 de un año no bisiesto: aún 17')
  assert.equal(edadEnFecha('2004-02-29', '2022-03-01'), 18, '1/03: ya 18')
  assert.equal(edadEnFecha('2000-02-29', '2020-02-28'), 19, 'en año bisiesto cumple el 29')
  assert.equal(edadEnFecha('2000-02-29', '2020-02-29'), 20)
})

test('edadEnFecha: fechas inexistentes o con otra forma → null (no se inventa una edad)', () => {
  for (const mala of ['2001-02-29', '2000-13-01', '15/06/2000', '', null, undefined, 20000615]) {
    assert.equal(edadEnFecha(mala, '2020-01-01'), null, String(mala))
    assert.equal(edadEnFecha('2000-01-01', mala), null, String(mala))
  }
})

test('edadMinimaCarne: 18 años; 16 solo con A1 o AM (cualquier caja); el resto, 18', () => {
  assert.equal(edadMinimaCarne(), 18)
  assert.equal(edadMinimaCarne(null), 18)
  assert.equal(edadMinimaCarne('b'), 18)
  assert.equal(edadMinimaCarne('a'), 18)
  assert.equal(edadMinimaCarne('a2'), 18)
  assert.equal(edadMinimaCarne('A1'), 16)
  assert.equal(edadMinimaCarne(' am '), 16)
})

test('carneDemasiadoJoven: 17 años → avisa; 18 → no; A1 con 16 → no; A1 con 15 → avisa; sin una fecha → null', () => {
  assert.deepEqual(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-14' }), { edad: 17, minima: 18 })
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-15' }), null)
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: '2016-06-15', clasePermiso: 'a1' }), null)
  assert.deepEqual(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: '2015-06-15', clasePermiso: 'a1' }), { edad: 15, minima: 16 })
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: 'ficha', fechaCarne: '2018-06-14' }), null, 'una fecha «de la ficha» no se evalúa')
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: undefined }), null)
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: '2000-06-15', fechaCarne: '1999-01-01' }), null, 'carné anterior al nacimiento: lo dice el validador de forma')
})

test('carneDemasiadoJoven: nacido el 29/02, 18 años justos el 1/03 de un año no bisiesto', () => {
  assert.deepEqual(carneDemasiadoJoven({ fechaNacimiento: '2004-02-29', fechaCarne: '2022-02-28' }), { edad: 17, minima: 18 })
  assert.equal(carneDemasiadoJoven({ fechaNacimiento: '2004-02-29', fechaCarne: '2022-03-01' }), null)
})

test('etiquetaCarneJoven: dice la edad y el mínimo, en singular/plural, y NUNCA una fecha', () => {
  const t = etiquetaCarneJoven({ edad: 17, minima: 18 })
  assert.match(t, /da 17 años/)
  assert.match(t, /18 o más/)
  assert.match(etiquetaCarneJoven({ edad: 1, minima: 16 }), /da 1 año /)
  assert.doesNotMatch(t, /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)
})

test('reglaCarne: auto y moto sí (con el permiso del riesgo); otro ramo o sin fechas, no', () => {
  const riesgo = (nac: unknown, carne: unknown, extra: object = {}) => ({ conductor: { fechaNacimiento: nac, fechaCarne: carne }, ...extra })
  assert.equal(reglaCarne('auto', riesgo('2000-06-15', '2018-06-14'))?.clave, 'conductor.fechaCarne.edad')
  assert.equal(reglaCarne('moto', riesgo('2000-06-15', '2018-06-14'))?.bloque, 'personas')
  assert.equal(reglaCarne('auto', riesgo('2000-06-15', '2018-06-15')), null)
  assert.equal(reglaCarne('auto', riesgo('2000-06-15', '2016-06-15', { clasePermiso: 'a1' })), null, 'A1 a los 16')
  assert.notEqual(reglaCarne('auto', riesgo('2000-06-15', '2016-06-15', { clasePermiso: 'b' })), null, 'B a los 16 avisa')
  assert.equal(reglaCarne('hogar', riesgo('2000-06-15', '2018-06-14')), null)
  assert.equal(reglaCarne('auto', {}), null)
})

// ─── Póliza anterior (auto: Allianz Turismos y Mapfre) ─────────────────────

const AUTO: EntradaBotAuto = {
  matricula: '1234BCD', marca: null, modelo: null, version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: 'Línea Directa',
  fechaVencimiento: '2027-01-15', // ⇒ Allianz Turismos: «ya lo tenía (cambio de seguro)»
}
const riesgoAuto = (e: Partial<EntradaBotAuto> = {}) => {
  const r = formularioBotAuto({ ...AUTO, ...e }, HOY)
  assert.ok(r.ok, JSON.stringify(r))
  return r.riesgo
}

test('formularioBotAuto: la póliza anterior viaja tecleada (5 cifras), o por defecto desde el nº completo que consta; sin seguro anterior no viaja', () => {
  assert.equal(riesgoAuto({ polizaAnteriorUltimos5: '98765' }).polizaAnteriorUltimos5, '98765')
  assert.equal(riesgoAuto({ polizaAnteriorUltimos5: 'AB-0012345' }).polizaAnteriorUltimos5, '12345', 'si se pega el entero, sus 5 últimas cifras')
  assert.equal(riesgoAuto({ numeroPolizaActual: 'POL-2026-00067890' }).polizaAnteriorUltimos5, '67890', 'vacío → defecto del nº completo')
  assert.equal(riesgoAuto({ polizaAnteriorUltimos5: '11111', numeroPolizaActual: 'POL-2026-00067890' }).polizaAnteriorUltimos5, '11111', 'lo tecleado manda')
  assert.equal('polizaAnteriorUltimos5' in riesgoAuto(), false, 'sin dato no viaja (nunca un valor de cajón)')
  assert.equal('polizaAnteriorUltimos5' in riesgoAuto({ polizaAnteriorUltimos5: '123' }), false, 'menos de 5 cifras: no viaja')
  assert.equal('polizaAnteriorUltimos5' in riesgoAuto({ aniosAsegurado: '0', numeroPolizaActual: 'POL-2026-00067890' }), false, 'años = 0: sin seguro anterior')
})

test('reglaPolizaAnterior: Solo Allianz Turismos pide las 5 cifras si hubo seguro anterior', () => {
  const sin = riesgoAuto()
  assert.equal(reglaPolizaAnterior('allianz', 'auto', sin, HOY)?.clave, 'polizaAnteriorUltimos5')
  assert.equal(reglaPolizaAnterior('allianz', 'auto', sin, HOY)?.bloque, 'poliza')
  assert.equal(reglaPolizaAnterior('mapfre', 'auto', sin, HOY), null, 'Mapfre no lo pide')
  assert.equal(reglaPolizaAnterior('mapfre', 'moto', { aniosAseguradoAnterior: 3 }, HOY), null, 'Mapfre moto tampoco')
  const con = riesgoAuto({ polizaAnteriorUltimos5: '98765' })
  assert.equal(reglaPolizaAnterior('allianz', 'auto', con, HOY), null, 'con póliza')
})

test('reglaPolizaAnterior: no aplica sin seguro anterior, a otras compañías/ramos ni a Allianz Moto (ya lo declara obligatorios.ts)', () => {
  assert.equal(reglaPolizaAnterior('mapfre', 'auto', { aniosAseguradoAnterior: 0 }, HOY), null, 'años 0')
  assert.equal(reglaPolizaAnterior('allianz', 'auto', { aniosAseguradoAnterior: 0 }, HOY), null)
  assert.equal(reglaPolizaAnterior('generali', 'auto', riesgoAuto(), HOY), null)
  assert.equal(reglaPolizaAnterior('allianz', 'moto', { aniosAseguradoAnterior: 3 }, HOY), null)
  assert.equal(reglaPolizaAnterior('mapfre', 'hogar', {}, HOY), null)
})

test('reglaPolizaAnterior: Allianz Turismos con vehículo NUEVO (matriculado hace poco, sin póliza actual) no la pide; el reloj va inyectado', () => {
  const nuevo = { ...riesgoAuto({ fechaVencimiento: null, fechaMatriculacion: '2026-08-01' }) }
  assert.equal(reglaPolizaAnterior('allianz', 'auto', nuevo, HOY), null)
  assert.notEqual(reglaPolizaAnterior('allianz', 'auto', nuevo, new Date('2028-01-10T10:00:00Z')), null, 'con otro «hoy» ya es de hace más de 12 meses')
  })

test('huboSeguroAnterior: sin dato de años (supuesto favorable) cuenta como «hubo»; solo 0 es «no»', () => {
  assert.equal(huboSeguroAnterior({}), true)
  assert.equal(huboSeguroAnterior({ aniosAseguradoAnterior: null }), true)
  assert.equal(huboSeguroAnterior({ aniosAseguradoAnterior: 4 }), true)
  assert.equal(huboSeguroAnterior({ aniosAseguradoAnterior: 0 }), false)
})

// ─── Generali auto: 1.ª matriculación ──────────────────────────────────────

test('reglaMatriculacionGenerali: sin fecha de 1.ª matriculación (o mal formada) falta; con fecha ISO real, no; solo Generali auto', () => {
  assert.equal(reglaMatriculacionGenerali('generali', 'auto', {})?.clave, 'fechaMatriculacion')
  assert.equal(reglaMatriculacionGenerali('generali', 'auto', {})?.bloque, 'riesgo')
  assert.notEqual(reglaMatriculacionGenerali('generali', 'auto', { fechaMatriculacion: '' }), null)
  assert.notEqual(reglaMatriculacionGenerali('generali', 'auto', { fechaMatriculacion: '2019-02-30' }), null)
  assert.equal(reglaMatriculacionGenerali('generali', 'auto', { fechaMatriculacion: '2019-03-01' }), null)
  assert.equal(reglaMatriculacionGenerali('allianz', 'auto', {}), null)
  assert.equal(reglaMatriculacionGenerali('mapfre', 'auto', {}), null)
  assert.equal(reglaMatriculacionGenerali('generali', 'moto', {}), null)
})

// ─── Allianz Turismos: documento y CP del tomador ──────────────────────────

test('tomadorSinEnFicha: dni y cp de la precalificación → documento y código postal; sin lectura (null) no se afirma nada', () => {
  assert.deepEqual(tomadorSinEnFicha(['dni', 'cp', 'sexo']), ['documento', 'codigoPostal'])
  assert.deepEqual(tomadorSinEnFicha(['cp']), ['codigoPostal'])
  assert.equal(tomadorSinEnFicha(['sexo', 'telefono']), undefined)
  assert.equal(tomadorSinEnFicha([]), undefined)
  assert.equal(tomadorSinEnFicha(null), undefined)
  assert.equal(tomadorSinEnFicha(undefined), undefined)
})

test('reglasTomadorAllianzTurismos: solo Allianz auto y solo si la ficha NO lo tiene y el riesgo tampoco', () => {
  const claves = (c: string, r: string, riesgo: object, sin?: readonly string[]) => reglasTomadorAllianzTurismos(c, r, riesgo as Record<string, unknown>, sin).map((x) => x.clave)
  assert.deepEqual(claves('allianz', 'auto', {}, ['documento', 'codigoPostal']), ['documentoTomador', 'tomador.codigoPostal'])
  assert.deepEqual(claves('allianz', 'auto', {}, ['documento']), ['documentoTomador'])
  assert.deepEqual(claves('allianz', 'auto', {}, ['codigoPostal']), ['tomador.codigoPostal'])
  assert.deepEqual(claves('allianz', 'auto', { documentoTomador: '00000000T' }, ['documento']), [], 'el riesgo ya lo trae')
  assert.deepEqual(claves('allianz', 'auto', { fichaTomador: { documento: '00000000T', codigoPostal: '41003' } }, ['documento', 'codigoPostal']), [])
  assert.deepEqual(claves('allianz', 'auto', { tomador: { codigoPostal: '41003' } }, ['codigoPostal']), [])
  assert.deepEqual(claves('allianz', 'auto', {}, undefined), [], 'no se sabe → no se afirma')
  assert.deepEqual(claves('allianz', 'auto', {}, []), [])
  assert.deepEqual(claves('mapfre', 'auto', {}, ['documento', 'codigoPostal']), [])
  assert.deepEqual(claves('allianz', 'moto', {}, ['documento', 'codigoPostal']), [])
})

// ─── Moto con siniestros ───────────────────────────────────────────────────

test('reglaSiniestrosMoto: Allianz y Mapfre moto con siniestros > 0 avisan; 0, null y otros ramos/compañías no', () => {
  assert.equal(reglaSiniestrosMoto('allianz', 'moto', { siniestrosUltimos5Anios: 1 })?.clave, 'siniestrosUltimos5Anios.moto')
  assert.equal(reglaSiniestrosMoto('mapfre', 'moto', { siniestrosUltimos5Anios: 2 })?.bloque, 'poliza')
  assert.equal(reglaSiniestrosMoto('allianz', 'moto', { siniestrosUltimos5Anios: 0 }), null)
  assert.equal(reglaSiniestrosMoto('allianz', 'moto', { siniestrosUltimos5Anios: null }), null, 'null = no se sabe, no «hay siniestros»')
  assert.equal(reglaSiniestrosMoto('allianz', 'moto', {}), null)
  assert.equal(reglaSiniestrosMoto('mapfre', 'auto', { siniestrosUltimos5Anios: 2 }), null, 'el coche sí declara siniestros')
  assert.equal(reglaSiniestrosMoto('generali', 'moto', { siniestrosUltimos5Anios: 2 }), null)
})

// ─── Reunión y cableado en el checklist / pendientes ───────────────────────

test('reglasPrevias: reúne las de la compañía × ramo; sin nada incumplido, vacío; cada clave tiene bloque de pantalla', () => {
  const r = riesgoAuto({ fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-14' })
  const claves = reglasPrevias({ compania: 'mapfre', ramo: 'auto', riesgo: r, hoy: HOY }).map((x) => x.clave).sort()
  assert.deepEqual(claves, ['conductor.fechaCarne.edad'])
  assert.deepEqual(reglasPrevias({ compania: 'allianz', ramo: 'auto', riesgo: riesgoAuto({ polizaAnteriorUltimos5: '98765' }), hoy: HOY }), [])
  for (const x of reglasPrevias({ compania: 'allianz', ramo: 'auto', riesgo: r, formulario: { tomadorSinEnFicha: ['documento', 'codigoPostal'] }, hoy: HOY })) {
    assert.equal(BLOQUE_REGLA_PREVIA[x.clave], x.bloque, x.clave)
  }
})

test('checklistBot (auto): Mapfre NO pide la póliza anterior aunque falte', () => {
  const x = checklistBot(adaptadorDeRamo('auto')!, AUTO, {}, 'mapfre', HOY)
  assert.ok(x.estado === 'evaluado' && !x.bloquea && !x.faltan.some((f) => f.clave === 'polizaAnteriorUltimos5'))
})

test('checklistBot (auto): Allianz con seguro anterior y sin póliza FALTA y bloquea; con póliza o con su defecto, listo', () => {
  const a = adaptadorDeRamo('auto')!
  const base = { ...AUTO }
  for (const c of ['allianz']) {
    const x = checklistBot(a, base, {}, c, HOY)
    assert.ok(x.estado === 'evaluado' && x.bloquea && x.faltan.some((f) => f.clave === 'polizaAnteriorUltimos5'), `${c}: falta la póliza`)
    const tecleada = checklistBot(a, base, { polizaAnteriorUltimos5: '98765' }, c, HOY)
    assert.ok(tecleada.estado === 'evaluado' && !tecleada.bloquea, `${c}: tecleada`)
    const porDefecto = checklistBot(a, { ...base, numeroPolizaActual: 'POL-2026-00012345' }, {}, c, HOY)
    assert.ok(porDefecto.estado === 'evaluado' && !porDefecto.bloquea, `${c}: defecto del nº completo`)
    const corta = checklistBot(a, { ...base, numeroPolizaActual: 'POL-2026-00012345' }, { polizaAnteriorUltimos5: '123' }, c, HOY)
    assert.ok(corta.estado === 'evaluado' && corta.bloquea, `${c}: tecleado con menos de 5 cifras no vale (ni cae al defecto)`)
  }
})

test('checklistBot (auto): sin seguro anterior (0 años) no se pide la póliza', () => {
  const x = checklistBot(adaptadorDeRamo('auto')!, { ...AUTO, aniosAsegurado: '0' }, {}, 'allianz', HOY)
  assert.ok(x.estado === 'evaluado' && !x.faltan.some((f) => f.clave === 'polizaAnteriorUltimos5'))
})

test('checklistBot: carné con 17 años bloquea auto y moto y lo dice SIN fechas; con 18, no', () => {
  const auto = adaptadorDeRamo('auto')!
  const joven = checklistBot(auto, { ...AUTO, numeroPolizaActual: 'POL-2026-00012345', fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-14' }, {}, 'mapfre', HOY)
  assert.ok(joven.estado === 'evaluado' && joven.bloquea && /da 17 años/.test(joven.resumen))
  assert.doesNotMatch(JSON.stringify(joven), /2000-06-15|2018-06-14/)
  const justo = checklistBot(auto, { ...AUTO, numeroPolizaActual: 'POL-2026-00012345', fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-15' }, {}, 'mapfre', HOY)
  assert.ok(justo.estado === 'evaluado' && !justo.bloquea)
  const moto = adaptadorDeRamo('moto')!
  const m = checklistBot(moto, {
    matricula: '1234BCD', marca: 'YAMAHA', modelo: 'MT-07', version: null, codigoPostal: '41003', fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-14',
    sexo: 'hombre', conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false, aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, { cilindrada: '689', fechaAdquisicion: '2022-01-10' }, 'allianz', HOY)
  assert.ok(m.estado === 'evaluado' && m.faltan.some((f) => f.clave === 'conductor.fechaCarne.edad'))
})

test('checklistBot: una fecha «de la ficha» no se evalúa (la lee el servidor): no hay aviso de edad', () => {
  const x = checklistBot(adaptadorDeRamo('auto')!, { ...AUTO, numeroPolizaActual: 'POL-2026-00012345', fechaNacimiento: 'ficha', fechaCarne: '2018-06-14' }, {}, 'mapfre', HOY)
  assert.ok(x.estado === 'evaluado' && !x.faltan.some((f) => f.clave === 'conductor.fechaCarne.edad'))
})

test('checklistBot (Generali auto): sin 1.ª matriculación falta; con ella, no', () => {
  const a = adaptadorDeRamo('auto')!
  const sin = checklistBot(a, AUTO, {}, 'generali', HOY)
  assert.ok(sin.estado === 'evaluado' && sin.faltan.some((f) => f.clave === 'fechaMatriculacion'))
  const con = checklistBot(a, { ...AUTO, fechaMatriculacion: '2019-03-01' }, {}, 'generali', HOY)
  assert.ok(con.estado === 'evaluado' && !con.faltan.some((f) => f.clave === 'fechaMatriculacion'))
})

test('checklistBot (Allianz Turismos): la ficha sin documento ni CP del tomador falta; sin esa señal no se afirma', () => {
  const a = adaptadorDeRamo('auto')!
  const f = { ...AUTO, numeroPolizaActual: 'POL-2026-00012345' }
  const sin = checklistBot(a, { ...f, tomadorSinEnFicha: ['documento', 'codigoPostal'] }, {}, 'allianz', HOY)
  assert.ok(sin.estado === 'evaluado' && sin.bloquea)
  assert.deepEqual(sin.estado === 'evaluado' ? sin.faltan.map((x) => x.clave).sort() : [], ['documentoTomador', 'tomador.codigoPostal'])
  const noSe = checklistBot(a, f, {}, 'allianz', HOY)
  assert.ok(noSe.estado === 'evaluado' && !noSe.bloquea)
  const mapfre = checklistBot(a, { ...f, tomadorSinEnFicha: ['documento', 'codigoPostal'] }, {}, 'mapfre', HOY)
  assert.ok(mapfre.estado === 'evaluado' && !mapfre.faltan.some((x) => x.clave === 'tomador.codigoPostal'))
})

test('checklistBot (moto): siniestros > 0 bloquea Allianz y Mapfre con aviso claro; sin siniestros no', () => {
  const moto = adaptadorDeRamo('moto')!
  const base = {
    matricula: '1234BCD', marca: 'YAMAHA', modelo: 'MT-07', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
    sexo: 'hombre', conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true, aniosAsegurado: '5', aniosSinSiniestros: '', siniestrosUltimos5: '2',
    companiaAnterior: 'Línea Directa', numeroPolizaActual: 'POL-2026-00012345', fotocopiaAnterior: 'proximo_anio',
  }
  const extra = { cilindrada: '689', fechaAdquisicion: '2022-01-10' }
  for (const c of ['allianz', 'mapfre']) {
    const x = checklistBot(moto, base, extra, c, HOY)
    assert.ok(x.estado === 'evaluado' && x.bloquea && /no los cotizan automáticamente/.test(x.resumen), c)
  }
  const cero = checklistBot(moto, { ...base, siniestrosUltimos5: '0' }, extra, 'allianz', HOY)
  assert.ok(cero.estado === 'evaluado' && !cero.faltan.some((f) => f.clave === 'siniestrosUltimos5Anios.moto'))
})

test('pendientesPorBloque: las reglas previas caen en SU bloque (personas / póliza / riesgo) como «falta», con el campo suelto de la póliza', () => {
  const a = adaptadorDeRamo('auto')!
  const r = pendientesPorBloque({
    adaptador: a, extra: {}, companias: ['allianz', 'mapfre', 'generali'],
    formulario: { ...AUTO, fechaNacimiento: '2000-06-15', fechaCarne: '2018-06-14', tomadorSinEnFicha: ['documento'] },
  })
  const todas = [...r.bloques.personas, ...r.bloques.riesgo, ...r.bloques.poliza]
  const de = (clave: string) => todas.find((p) => p.clave === clave)
  assert.equal(de('polizaAnteriorUltimos5')?.bloque, 'poliza')
  assert.equal(de('polizaAnteriorUltimos5')?.estado, 'falta')
  assert.equal(de('polizaAnteriorUltimos5')?.campoExtra, 'polizaAnteriorUltimos5')
  assert.deepEqual(de('polizaAnteriorUltimos5')?.companias, ['allianz'])
  assert.equal(de('conductor.fechaCarne.edad')?.bloque, 'personas')
  assert.equal(de('documentoTomador')?.bloque, 'personas')
  assert.ok(de('documentoTomador')?.companias.includes('allianz'), 'Allianz Turismos lo pide')
  assert.equal(de('fechaMatriculacion')?.bloque, 'riesgo')
  assert.deepEqual(de('fechaMatriculacion')?.companias, ['generali'])
  const generali = r.companias.find((c) => c.compania === 'generali')
  assert.equal(generali?.estado, 'faltan')
  assert.doesNotMatch(JSON.stringify(r), /2000-06-15|2018-06-14/)
})
