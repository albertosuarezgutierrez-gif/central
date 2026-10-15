// De EXTREMO A EXTREMO (revisión PR #4710, 14/10/2026): el riesgo REAL que arma plataforma para los bots de coche
// (`formularioBotsAutoDeRiesgo` → `formularioBotAuto` → completar desde la ficha) + lo que asegura guarda al encolar y lo
// que inyecta al ENTREGAR (NIF y datos del tomador de la ficha) → `planAltaTomador` del adaptador de Mapfre YA NO da
// `datos` para un cliente nuevo. Sin red ni BD: las reglas puras de cada lado. Todos los datos son placeholders.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { secretosDelRiesgo, validarFormularioAuto } from '@central/module-tarificacion'
import { planAltaTomador, SEL_TOMADOR } from '../src/adapters/mapfre/auto.ts'
import { ErrorTarificador } from '../src/errores.ts'

// Módulos de OTRAS apps por import dinámico con ruta calculada: tsx los ejecuta, pero el `tsc` del worker no los recorre
// (su tsconfig no es el de plataforma ni el de asegura; cada app se typecheckea en su propio job).
const otra = (ruta: string) => import(new URL(ruta, import.meta.url).href)
const { formularioBotsAutoDeRiesgo } = await otra('../../../apps/plataforma/lib/tarificador-auto-riesgo.ts')
const { formularioBotAuto } = await otra('../../../apps/plataforma/lib/tarificador-auto-formulario.ts')
const { completarRiesgoVehiculoDesdeFicha } = await otra('../../../apps/plataforma/lib/tarificador-moto-formulario.ts')
const { aplicarDatosTomador, aplicarNifTomador, lecturaNifFicha, lecturaTomadorFicha, riesgoParaEncolar, validarEntradaRamo } = await otra('../../../apps/asegura/lib/tarificador-reglas.ts')
const NIF = '00000000T'
/** «Descifrado» de prueba: quita el prefijo `v1:`. */
const desc = (v: string) => v.slice(3)
const FICHA_BD = { dni: `v1:${NIF}`, nombre: 'NOMBRE PRUEBA', apellidos: 'APELLIDOUNO APELLIDODOS', fechaNacimiento: 'v1:1980-01-02', tipoPersona: 'fisica' }

const riesgoOportunidad = {
  oportunidad: { clienteId: 'c1', matricula: null },
  roles: ['tomador'],
  figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }],
  datosVehiculo: { matricula: '0000BBB', marca: 'MARCA PRUEBA', modelo: 'MODELO X', version: null, garaje: null, cpCirculacion: '41003' },
  historial: {
    seguroAnterior: null,
    historialDeclarado: { aniosAsegurado: 5, aniosSinSiniestros: 5, siniestrosUltimos5: 0, tieneSeguroActual: true },
    carnet: { fecha: '2000-06-01', legible: true },
  },
}

/** Lo que llega a asegura desde plataforma (el navegador + la ruta `encolar`, que completa el nacimiento desde la ficha). */
function riesgoDePlataforma(): unknown {
  // El riesgo declara 5 años asegurado con seguro actual: la compañía anterior la escribe el corredor en el formulario de bots
  // (`formularioBotsAutoDeRiesgo` la deja null) y Mapfre la exige al encolar (#4729). Nombre ficticio.
  const f = formularioBotAuto({ ...formularioBotsAutoDeRiesgo(riesgoOportunidad), companiaAnterior: 'ASEGURADORA FICTICIA' }, new Date('2026-10-14T00:00:00Z'))
  assert.ok(f.ok, f.ok ? '' : f.faltan.join('; '))
  const ficha = { identidad: { fechaNacimiento: '1980-01-02' }, contacto: { codigoPostal: '41003' }, carnets: [], dePolizas: null } as unknown
  const c = completarRiesgoVehiculoDesdeFicha('auto', f.riesgo, ficha, f.completarDesdeFicha)
  assert.deepEqual(c.faltan, [])
  const v = validarEntradaRamo('auto', c.riesgo)
  assert.ok(v.ok, v.ok ? '' : (v.errores ?? []).join('; '))
  return v.entrada.riesgo
}

test('E2E: riesgo de plataforma → encolar (sin datos personales guardados) → entrega con NIF + datos de la ficha → planAltaTomador da de alta (no `datos`)', () => {
  const entrada = riesgoDePlataforma()
  // Sin la inyección de asegura, el adaptador de Mapfre no puede dar de alta (el bug de la revisión).
  const sinInyectar = validarFormularioAuto(entrada)
  assert.ok(sinInyectar.ok)
  assert.throws(() => planAltaTomador({ ...sinInyectar.formulario, documentoTomador: NIF }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')

  const guardado = riesgoParaEncolar('mapfre', 'auto', entrada, () => lecturaNifFicha(FICHA_BD.dni, desc), () => lecturaTomadorFicha(FICHA_BD, desc))
  assert.ok(guardado.ok)
  const json = JSON.stringify(guardado.riesgo)
  // (La fecha de nacimiento SÍ va: es la del CONDUCTOR, que aquí es el propio tomador; lo nuevo es no guardar nombre ni NIF.)
  for (const x of [NIF, 'NOMBRE PRUEBA', 'APELLIDOUNO', 'datosTomador']) assert.ok(!json.includes(x), `la cola no guarda ${x === NIF ? 'el NIF' : 'datos del tomador'}`)

  const conNif = aplicarNifTomador('mapfre', 'auto', guardado.riesgo, () => lecturaNifFicha(FICHA_BD.dni, desc))
  assert.ok(conNif.ok)
  const alWorker = aplicarDatosTomador('mapfre', 'auto', conNif.riesgo, () => lecturaTomadorFicha(FICHA_BD, desc))
  assert.ok(alWorker.ok)

  // El worker valida el riesgo (como `prepararTrabajo`) y el adaptador planifica el alta.
  const v = validarFormularioAuto(alWorker.riesgo)
  assert.ok(v.ok, v.ok ? '' : v.errores.join('; '))
  const plan = planAltaTomador(v.formulario)
  assert.deepEqual(plan.escribibles.map((o) => [o.sel, o.valor]), [
    [SEL_TOMADOR.nombre, 'NOMBRE PRUEBA'],
    [SEL_TOMADOR.primerApellido, 'APELLIDOUNO'],
    [SEL_TOMADOR.segundoApellido, 'APELLIDODOS'],
    [SEL_TOMADOR.fechaNacimiento, '02/01/1980'],
  ])
  // Y todo ello es SECRETO del trabajo: el runner lo redacta de mensajes y HTML.
  const s = secretosDelRiesgo(alWorker.riesgo)
  for (const x of [NIF, 'NOMBRE PRUEBA', 'APELLIDOUNO', 'APELLIDODOS', '02/01/1980', '1980-01-02']) assert.ok(s.includes(x), x)
})

test('E2E: ficha sin nombre / nacimiento → asegura rechaza al ENCOLAR (422 `falta_datos_tomador`), sin llegar a la máquina', () => {
  const r = riesgoParaEncolar('mapfre', 'auto', riesgoDePlataforma(), () => lecturaNifFicha(FICHA_BD.dni, desc), () => lecturaTomadorFicha({ ...FICHA_BD, nombre: 'Lead', fechaNacimiento: null }, desc))
  assert.ok(!r.ok && r.status === 422 && /^falta_datos_tomador: falta el nombre y la fecha de nacimiento en la ficha/.test(r.motivo))
})
