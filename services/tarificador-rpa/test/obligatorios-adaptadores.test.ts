// Cepo (15/10/2026): la declaración de `faltanParaTarificar` (module-tarificacion obligatorios.ts) está ATADA a lo que leen
// los adaptadores. Para cada obligatorio PROPIO de un portal: quitarlo lo señala `faltanParaTarificar` Y hace que el
// planificador puro del adaptador lance `datos` (no está declarado de más). Con el riesgo completo (faltan = []) los
// planificadores no lanzan `datos`. Todo adaptador del worker tiene declaración. Sin navegador; datos SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { faltanParaTarificar, obligatoriosPara, validarFormularioAuto, validarFormularioHogar, type FormularioAuto, type FormularioHogar } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import { prepararTrabajo, type AdaptadorRegistrado } from '../src/ramo.ts'
import { adaptadores } from '../src/adapters/index.ts'
import { allianzComunidades } from '../src/adapters/allianz/comunidades.ts'
import { allianzAuto, allianzMoto, elegirVehiculoMoto, ofertasDesdePrimas, planDatosBasicosMoto, SEL_DATOS_MOTO, supuestosDatosBasicosMoto } from '../src/adapters/allianz/auto.ts'
import { allianzHogar, planPantallaVivienda } from '../src/adapters/allianz/hogar.ts'
import { mapfreAuto, mapfreMoto, planAltaTomador, planObjetoYFiguras } from '../src/adapters/mapfre/auto.ts'
import { exigirDatosHogar, mapfreHogar } from '../src/adapters/mapfre/hogar.ts'
import { occidentHogar, planFormularioHogar } from '../src/adapters/occident/hogar.ts'
import { documentoTomadorDe, PREFIJO_SUPUESTOS, SUPUESTO_FAVORABLE_ANIOS, SUPUESTO_FAVORABLE_SINIESTROS } from '@central/module-tarificacion'

const HOY = new Date('2026-10-15T10:00:00Z')

const coche = () => ({
  ramo: 'auto',
  matricula: '1234BCD',
  codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: false,
  companiaAnterior: 'COMPAÑÍA DE PRUEBA',
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
})
const moto = () => ({ ...coche(), ramo: 'moto', seleccionVehiculo: { marca: 'MARCA', modelo: 'MODELO', clase: 2, cilindradaCc: 250 } })
const hogar = () => ({
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-15' },
  inmueble: { codigoPostal: '41001', municipio: 'SEVILLA', nombreVia: 'PRUEBA', numero: '1', planta: '2', anioConstruccion: 1990, superficieM2: 90, referenciaCatastral: '1234567AB1234C0001DF' },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false },
  datosTomador: { nombre: 'NOMBRE', apellido1: 'APELLIDO' },
})

const auto = (x: unknown): FormularioAuto => {
  const v = validarFormularioAuto(x, HOY)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  return v.formulario
}
const casa = (x: unknown): FormularioHogar => {
  const v = validarFormularioHogar(x, HOY)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  // `datosTomador` no es de la forma de hogar: el adaptador de Mapfre lo lee del riesgo crudo.
  return { ...v.formulario, ...((x as { datosTomador?: unknown }).datosTomador ? { datosTomador: (x as { datosTomador: unknown }).datosTomador } : {}) } as FormularioHogar
}
const lanzaDatos = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof ErrorTarificador && e.tipo === 'datos'
  }
  return false
}
function sin(o: Record<string, unknown>, ruta: string): Record<string, unknown> {
  const c = structuredClone(o)
  const p = ruta.split('.')
  let cur = c
  for (const k of p.slice(0, -1)) cur = cur[k] as Record<string, unknown>
  delete cur[p[p.length - 1]]
  return c
}
const faltan = (c: string, r: string, x: unknown) => faltanParaTarificar(c, r, x)!.map((f) => f.clave)

test('todo adaptador del worker (registrado o tras su flag) tiene declaración de obligatorios', () => {
  const todos: Pick<AdaptadorRegistrado, 'compania' | 'ramo'>[] = [allianzComunidades, allianzAuto, allianzMoto, allianzHogar, mapfreAuto, mapfreMoto, mapfreHogar, occidentHogar]
  for (const a of todos) assert.ok(obligatoriosPara(a.compania, a.ramo), `${a.compania}/${a.ramo} sin declaración en obligatorios.ts`)
  for (const k of adaptadores.claves()) {
    const [c, r] = k.split('::')
    assert.ok(obligatoriosPara(c, r), `${k} registrado sin declaración`)
  }
})

test('Mapfre auto: riesgo completo → faltan [] y los planificadores puros no lanzan `datos`', () => {
  const f = coche()
  assert.deepEqual(faltan('mapfre', 'auto', f), [])
  assert.ok(documentoTomadorDe(auto(f)))
  planObjetoYFiguras(auto(f))
  planAltaTomador(auto(f))
})

test('Mapfre auto: cada obligatorio propio quitado → faltan lo señala Y el adaptador falla `datos`', () => {
  const casos: [string, Record<string, unknown>, (x: FormularioAuto) => unknown][] = [
    ['companiaAnterior', sin(coche(), 'companiaAnterior'), planObjetoYFiguras],
    // Sin años NI compañía: el supuesto favorable (5 años o más) hace falta el nombre: lo dicen los dos, no se inventa.
    ['companiaAnterior', sin(sin(coche(), 'aniosAseguradoAnterior'), 'companiaAnterior'), planObjetoYFiguras],
    ['tomadorEsConductor', { ...coche(), tomadorEsConductor: null, datosTomador: { ...coche().datosTomador, fechaNacimiento: '1970-01-01' } }, planObjetoYFiguras],
    ['documentoTomador', sin(coche(), 'documentoTomador'), (x) => { if (documentoTomadorDe(x) === null) throw new ErrorTarificador('datos', 'mapfre/auto: falta el NIF') }],
    ['datosTomador.nombre', sin(coche(), 'datosTomador.nombre'), planAltaTomador],
    ['datosTomador.apellido1', sin(coche(), 'datosTomador.apellido1'), planAltaTomador],
    ['datosTomador.fechaNacimiento', { ...coche(), tomadorEsConductor: true, datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO' } }, planAltaTomador],
  ]
  for (const [clave, riesgo, plan] of casos) {
    assert.ok(faltan('mapfre', 'auto', riesgo).includes(clave), `faltanParaTarificar no señala ${clave}`)
    // Un `datosTomador` incompleto no pasa el validador de forma del bloque (la ficha lo comprueba al encolar): el plan se
    // prueba con el bloque crudo sobre un formulario válido.
    const form = clave.startsWith('datosTomador.') ? ({ ...auto(sin(coche(), 'datosTomador')), datosTomador: riesgo.datosTomador } as FormularioAuto) : auto(riesgo)
    assert.ok(lanzaDatos(() => plan(form)), `el adaptador de Mapfre no falla \`datos\` sin ${clave}: ¿declarado de más?`)
  }
})

test('Allianz moto: completo → nada falta y el plan pasa; cada obligatorio propio quitado → faltan + `datos`', async () => {
  assert.deepEqual(faltan('allianz', 'moto', moto()), [])
  planDatosBasicosMoto(auto(moto()))
  for (const clave of ['conductor.sexo']) {
    const r = sin(moto(), clave)
    assert.ok(faltan('allianz', 'moto', r).includes(clave), clave)
    assert.ok(lanzaDatos(() => planDatosBasicosMoto(auto(r))), `planDatosBasicosMoto no falla sin ${clave}`)
  }
  const sinClase = sin(moto(), 'seleccionVehiculo.clase')
  assert.ok(faltan('allianz', 'moto', sinClase).includes('seleccionVehiculo.clase'))
  await assert.rejects(elegirVehiculoMoto({} as never, auto(sinClase).seleccionVehiculo!, {} as never), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos')
})

// 18/10/2026, decisión de Alberto «supuesto favorable en todo»: los antecedentes que faltan no paran a ningún bot de vehículo.
test('supuesto favorable: sin años ni siniestros, ni la declaración ni el plan paran; el portal recibe el tramo máximo y el precio lo DECLARA', () => {
  const r = sin(sin(moto(), 'aniosAseguradoAnterior'), 'siniestrosUltimos5Anios')
  assert.deepEqual(faltan('allianz', 'moto', r), [])
  const plan = planDatosBasicosMoto(auto(r))
  const valor = (sel: string) => plan.find((o) => o.sel === sel)?.valor
  assert.equal(valor(SEL_DATOS_MOTO.aseguradoOtraCia), 'S')
  assert.equal(valor(SEL_DATOS_MOTO.aniosCompaniaAnterior), '6', 'más de 5: el tramo más favorable de Allianz Moto')
  assert.equal(valor(SEL_DATOS_MOTO.aniosSinSiniestros), '05')
  assert.equal(supuestosDatosBasicosMoto(auto(r)), `${PREFIJO_SUPUESTOS}${SUPUESTO_FAVORABLE_ANIOS}, ${SUPUESTO_FAVORABLE_SINIESTROS}.`)
  assert.equal(supuestosDatosBasicosMoto(auto(moto())), null, 'con antecedentes del riesgo no se declara nada (son datos)')
  const [oferta] = ofertasDesdePrimas([{ modalidad: 'T', nombre: 'TERCEROS', primerReciboEur: 100, sucesivosEur: 100 }], 'Moto', null, supuestosDatosBasicosMoto(auto(r)))
  assert.ok(oferta!.avisos.includes(`${PREFIJO_SUPUESTOS}${SUPUESTO_FAVORABLE_ANIOS}, ${SUPUESTO_FAVORABLE_SINIESTROS}.`), 'el supuesto viaja con la oferta')
  // Mapfre auto: con compañía anterior en el riesgo, el plan pasa con 5 años o más y 0 siniestros.
  const c = sin(sin(coche(), 'aniosAseguradoAnterior'), 'siniestrosUltimos5Anios')
  assert.deepEqual(faltan('mapfre', 'auto', c), [])
  const p = planObjetoYFiguras(auto(c))
  assert.equal(p.escribibles.find((o) => o.etiqueta === 'siniestros RC 5 años')?.valor, '0')
  assert.ok(p.escribibles.some((o) => o.etiqueta === 'compañía anterior'), 'con años supuestos > 0 se elige la compañía anterior del riesgo')
  // El sexo NUNCA se supone.
  assert.ok(lanzaDatos(() => planDatosBasicosMoto(auto({ ...r, conductor: { ...moto().conductor, sexo: null } }))))
})

test('Hogar: Allianz y Occident no piden más que la forma; Mapfre exige la referencia catastral del bien', () => {
  assert.deepEqual(faltan('allianz', 'hogar', hogar()), [])
  planPantallaVivienda(casa(hogar()))
  assert.deepEqual(faltan('mapfre', 'hogar', hogar()), [])
  exigirDatosHogar(casa(hogar()))
  const parcela = { ...hogar(), inmueble: { ...hogar().inmueble, referenciaCatastral: '1234567AB1234C' } }
  assert.deepEqual(faltan('mapfre', 'hogar', parcela), ['inmueble.referenciaCatastral'])
  assert.ok(lanzaDatos(() => exigirDatosHogar(casa(parcela))))
})

test('Occident hogar (hueco, sin registrar): HOY lee `tomador.nif`, que la forma de hogar no trae → sigue fallando `datos` (deuda conocida)', () => {
  // Si alguien alinea el adaptador con `tomador.documentoIdentidad`, este cepo se pone rojo: entonces se borra esta prueba.
  assert.deepEqual(faltan('occident', 'hogar', hogar()), [])
  assert.ok(lanzaDatos(() => planFormularioHogar(casa(hogar()))), 'occident/hogar ya no lee tomador.nif: actualiza este cepo')
})

test('prepararTrabajo (red final): un riesgo con forma válida pero sin lo que pide el bot NO llega al adaptador', () => {
  const llamadas: unknown[] = []
  const a = { ...mapfreAuto, async tarificar(_p: unknown, f: unknown) { llamadas.push(f); return { ofertas: [] } } } as unknown as AdaptadorRegistrado
  const r = prepararTrabajo(a, sin(coche(), 'companiaAnterior'), HOY)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errores.join(' '), /^Falta: nombre de la compañía anterior\.$/)
  assert.equal(prepararTrabajo(a, sin(coche(), 'siniestrosUltimos5Anios'), HOY).ok, true, 'antecedentes sin dato: supuesto favorable, no paran')
  assert.equal(prepararTrabajo(a, coche(), HOY).ok, true)
  const sinDeclarar = { ...a, compania: 'reale' } as AdaptadorRegistrado
  const s = prepararTrabajo(sinDeclarar, coche(), HOY)
  assert.equal(s.ok, false, 'un bot sin declaración no arranca (fail-closed)')
  assert.equal(llamadas.length, 0)
})
