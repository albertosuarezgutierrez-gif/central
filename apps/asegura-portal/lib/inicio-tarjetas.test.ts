import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  estadoVinculoInicio,
  nombreAccesibleFamilia,
  tarjetasFamilias,
  textoCalendario,
  textoFlota,
  textoPatrimonio,
  textoTarjetaFamilia,
  type PolizaInicio,
} from './inicio-tarjetas.ts'

const HOY = '2026-10-24'
const pol = (x: Partial<PolizaInicio>): PolizaInicio => ({ ramo: 'hogar', empresa: false, enVigor: true, vence: '2026-12-03', ...x })
const base = { cartera: [] as PolizaInicio[] | null, declaradas: [] as PolizaInicio[] | null, vinculo: 'vinculada' as const, hayEmpresa: false, hoy: HOY }

test('familias: personales y patrimoniales siempre; empresa solo si hay empresa; otros solo si tiene algo', () => {
  assert.deepEqual(tarjetasFamilias(base).map((t) => t.familia), ['personales', 'patrimoniales'])
  assert.deepEqual(tarjetasFamilias({ ...base, hayEmpresa: true }).map((t) => t.familia), ['personales', 'patrimoniales', 'empresa'])
  assert.deepEqual(tarjetasFamilias({ ...base, cartera: [pol({ ramo: 'otros' })] }).map((t) => t.familia), ['personales', 'patrimoniales', 'otros'])
})

test('cuenta cartera y aportadas por separado, sublíneas y la próxima renovación; lo no vigente no cuenta', () => {
  const t = tarjetasFamilias({
    ...base,
    cartera: [pol({}), pol({ ramo: 'auto', vence: '2026-11-15' }), pol({ ramo: 'moto', enVigor: false, vence: '2026-10-30' }), pol({ vence: '2026-01-01' })],
    declaradas: [pol({ ramo: 'salud', vence: null })],
  })
  const patr = t.find((x) => x.familia === 'patrimoniales')!
  assert.deepEqual(patr.estado, { tipo: 'con_seguros', conNosotros: 3, aportadas: 0, proxima: '2026-11-15', inmuebles: 2, vehiculos: 1 })
  assert.deepEqual(textoTarjetaFamilia(patr, '900').lineas, ['3 con nosotros', 'Inmuebles 2 · Vehículos 1', 'Renueva el 15/11/2026'])
  const pers = t.find((x) => x.familia === 'personales')!
  assert.deepEqual(textoTarjetaFamilia(pers, '900').lineas, ['1 aportada'])
})

test('🚨 una fuente ilegible no es cero: la tarjeta sin datos sale «sin comprobar»', () => {
  const t = tarjetasFamilias({ ...base, declaradas: null })
  assert.ok(t.every((x) => x.estado.tipo === 'sin_comprobar'))
  const t2 = tarjetasFamilias({ ...base, cartera: null, vinculo: 'sin_comprobar' })
  assert.ok(t2.every((x) => x.estado.tipo === 'sin_comprobar'))
  // Pero lo que SÍ se leyó se enseña.
  const t3 = tarjetasFamilias({ ...base, declaradas: null, cartera: [pol({ ramo: 'vida' })] })
  assert.equal(t3[0].estado.tipo, 'con_seguros')
  assert.equal(t3[1].estado.tipo, 'sin_comprobar')
})

test('🚨 estados vacíos: nunca «no tienes»; ambiguo nunca «no hemos encontrado»', () => {
  for (const vinculo of ['vinculada', 'sin_vinculo', 'ambiguo', 'sin_comprobar'] as const) {
    for (const t of tarjetasFamilias({ ...base, vinculo, hayEmpresa: true })) {
      const txt = textoTarjetaFamilia(t, '954000000')
      const todo = [...txt.lineas, txt.cta ?? ''].join(' ')
      assert.doesNotMatch(todo, /no tienes|0 pólizas|no hemos encontrado/i, `${vinculo}/${t.familia}: ${todo}`)
      assert.ok(txt.lineas.length > 0)
    }
  }
  const amb = textoTarjetaFamilia(tarjetasFamilias({ ...base, vinculo: 'ambiguo' })[0], '954000000')
  assert.deepEqual(amb, { lineas: ['Estamos comprobando qué pólizas son tuyas.'], cta: 'Llamar a tu corredor', href: 'tel:954000000' })
  const vac = textoTarjetaFamilia(tarjetasFamilias(base)[0], '1')
  assert.equal(vac.lineas[0], 'No nos consta ningún seguro personal. ¿Tienes alguno con otra compañía?')
})

test('vínculo: null no es «sin ficha» a la fuerza, sin_clave/error son problema nuestro', () => {
  assert.equal(estadoVinculoInicio(null), 'sin_comprobar')
  assert.equal(estadoVinculoInicio({ fichas: 1, vinculo: null }), 'vinculada')
  assert.equal(estadoVinculoInicio({ fichas: 0, vinculo: 'ambiguo' }), 'ambiguo')
  assert.equal(estadoVinculoInicio({ fichas: 0, vinculo: 'sin_clave' }), 'sin_comprobar')
  assert.equal(estadoVinculoInicio({ fichas: 0, vinculo: 'error' }), 'sin_comprobar')
  assert.equal(estadoVinculoInicio({ fichas: 0, vinculo: 'sin_ficha' }), 'sin_vinculo')
})

test('nombre accesible completo de la tarjeta', () => {
  const t = tarjetasFamilias({ ...base, cartera: [pol({ ramo: 'vida', vence: '2026-12-03' })] })[0]
  assert.equal(nombreAccesibleFamilia(t, textoTarjetaFamilia(t, '1')), 'Seguros personales: 1 con nosotros Renueva el 03/12/2026')
})

test('patrimonio: «sin seguro que nos conste» y «sin revisar» con aviso; sin acceso según sea cliente o no', () => {
  const r = textoPatrimonio({ inmuebles: 3, conSeguro: 1, sinSeguroQueNosConste: 1, sinRevisar: 1, sinComprobar: 0 }, true)
  assert.deepEqual(r.lineas, ['3 inmuebles', '1 sin seguro que nos conste · 1 sin revisar'])
  assert.equal(r.aviso, true)
  assert.equal(textoPatrimonio({ inmuebles: 2, conSeguro: 2, sinSeguroQueNosConste: 0, sinRevisar: 0, sinComprobar: 0 }, true).aviso, false)
  assert.equal(textoPatrimonio({ inmuebles: 0, conSeguro: 0, sinSeguroQueNosConste: 0, sinRevisar: 0, sinComprobar: 0 }, true).cta, 'Añadir inmueble')
  assert.equal(textoPatrimonio('no_disponible', false).lineas[0], 'Disponible para clientes de Grupo ASegura.')
  assert.equal(textoPatrimonio('no_disponible', false).cta, 'Aporta tu primera póliza')
  assert.equal(textoPatrimonio(null, true).lineas[0], 'Ahora no hemos podido comprobar tu patrimonio.')
})

test('calendario y flota: null = sin comprobar; vacío = «no nos consta»; flota sin empresas no sale', () => {
  assert.equal(textoCalendario(null).lineas[0], 'Ahora no hemos podido comprobar tus fechas.')
  assert.equal(textoCalendario([]).lineas[0], 'No nos consta ninguna fecha próxima.')
  assert.deepEqual(textoCalendario([{ titulo: 'Renovación hogar', fecha: '2026-11-03' }]).lineas, ['03/11/2026 · Renovación hogar'])
  assert.equal(textoFlota(0), null)
  assert.equal(textoFlota(null)!.lineas[0], 'Ahora no hemos podido comprobar tu flota.')
})
