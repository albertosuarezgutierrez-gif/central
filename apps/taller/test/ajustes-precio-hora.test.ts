// (c) Criterio F1: el dueño cambia el precio hora en Ajustes → se guarda → calcularPresupuesto lo usa.
// Recorre el camino real de la acción (leerConfig → aplicarAjuste → guardarConfig → leerConfig) sobre la BD falsa.
// Cepo visto fallar el 04/11/2026: quitando `precioHoraCent` del `configuracion.update` de lib/config-repo.ts el
// presupuesto seguía saliendo a 25,00€ (rojo en 'cambiar el precio hora'); restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularPresupuesto, configDeAlta, formatearEur } from '@central/module-taller'
import { crearConTaller } from '../lib/rls.ts'
import { guardarConfig, leerConfig } from '../lib/config-repo.ts'
import { aplicarAjuste, eurosACent, horasAMinutos, porcentajeAPb } from '../lib/ajustes.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'

/** Taller dado de alta como en 0002 (configuración de alta) + un paquete de 30 min sin precio cerrado. */
async function tallerDeAlta() {
  const bd = crearBdFake()
  const a = configDeAlta()
  bd.sembrar('taller', { id: T })
  bd.sembrar('configuracion', {
    tallerId: T, precioHoraCent: BigInt(a.precioHoraCent), validezPresupuestoDias: 1, itvAntelacionDias: 0,
    revisionFechaAntelacionDias: 0, revisionKmAntelacion: 0, seguroAntelacionDias: 0, recordatorioCitaHoras: 0,
    citaDuracionHuecoMinutos: 1, citaPuestos: 1, textoPieResguardo: '', textoPieFactura: '', textoCondicionesPresupuesto: '',
    textoFirmaCorreo: '', textoConsentimientoComercial: 'x', versionConsentimientoComercial: 'x',
    loginMaxFallosTaller: 30, loginVentanaMinutos: 15, loginBloqueoTallerMinutos: 15,
  })
  const conTaller = crearConTaller(bd.cliente)
  await conTaller(T, (tx: any) => guardarConfig(tx, T, a)) // catálogos de alta
  await conTaller(T, async (tx: any) => {
    const r = aplicarAjuste((await leerConfig(tx, T))!, {
      seccion: 'paquetes',
      paquetes: [{ codigo: 'revision', nombre: 'Revisión', baremoMinutos: horasAMinutos('0,5')!, requiereAceite: false, activo: true, precioCerradoPorTipo: {} }],
    })
    assert.ok(r.ok, JSON.stringify(r))
    await guardarConfig(tx, T, r.config)
  })
  return { bd, conTaller }
}

const presupuestoRevision = (conTaller: ReturnType<typeof crearConTaller>) =>
  conTaller(T, async (tx: any) => {
    const r = calcularPresupuesto((await leerConfig(tx, T))!, { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }] })
    assert.ok(r.ok, JSON.stringify(r))
    return r.presupuesto
  })

/** Lo mismo que hace la acción `guardarAjuste` (sin la sesión). */
const cambiarPrecioHora = (conTaller: ReturnType<typeof crearConTaller>, texto: string) =>
  conTaller(T, async (tx: any) => {
    const cent = eurosACent(texto)
    if (cent === null) return { ok: false as const, errores: ['importe'] }
    const r = aplicarAjuste((await leerConfig(tx, T))!, { seccion: 'mano_obra', precioHoraCent: cent })
    if (r.ok) await guardarConfig(tx, T, r.config)
    return r
  })

test('cambiar el precio hora en Ajustes cambia el presupuesto calculado', async () => {
  const { conTaller } = await tallerDeAlta()
  const antes = await presupuestoRevision(conTaller)
  assert.equal(formatearEur(antes.baseCent), '25,00€') // 30 min × precio de alta

  const r = await cambiarPrecioHora(conTaller, '62,40')
  assert.ok(r.ok)
  const despues = await presupuestoRevision(conTaller)
  assert.equal(despues.lineas[0].baseCent, 3120) // 30 min × 62,40 €/h
  assert.equal(formatearEur(despues.totalCent), '37,75€') // + IVA general de alta, redondeo por línea
})

test('un precio hora inválido no se guarda y el presupuesto no cambia', async () => {
  const { conTaller } = await tallerDeAlta()
  assert.equal((await cambiarPrecioHora(conTaller, '0')).ok, false) // validarConfig: > 0
  assert.equal((await cambiarPrecioHora(conTaller, 'cincuenta')).ok, false)
  assert.equal((await presupuestoRevision(conTaller)).baseCent, 2500)
})

test('recargo por tipo de vehículo editado en Ajustes también llega al presupuesto', async () => {
  const { conTaller } = await tallerDeAlta()
  await conTaller(T, async (tx: any) => {
    const c = (await leerConfig(tx, T))!
    const tipos = c.tiposVehiculo.map((t) => (t.codigo === 'turismo' ? { ...t, recargoPuntosBasicos: porcentajeAPb('20')! } : t))
    const r = aplicarAjuste(c, { seccion: 'tipos_vehiculo', tipos })
    assert.ok(r.ok)
    await guardarConfig(tx, T, r.config)
  })
  assert.equal((await presupuestoRevision(conTaller)).baseCent, 3000)
})

test('conversión de lo tecleado: euros, porcentajes y horas en formato español', () => {
  assert.equal(eurosACent('50,00'), 5000)
  assert.equal(eurosACent('1.234,5'), 123450)
  assert.equal(eurosACent('62,4 €'), 6240)
  assert.equal(eurosACent(''), null)
  assert.equal(eurosACent('12.34'), null, 'el punto es de miles, no decimal')
  assert.equal(porcentajeAPb('10,5'), 1050)
  assert.equal(horasAMinutos('1,5'), 90)
  assert.equal(horasAMinutos('abc'), null)
})

test('el dueño edita horario, textos, series e IVA; lo que rompería datos se rechaza', async () => {
  const { conTaller } = await tallerDeAlta()
  const aplicarYGuardar = (cambio: Parameters<typeof aplicarAjuste>[1]) =>
    conTaller(T, async (tx: any) => {
      const r = aplicarAjuste((await leerConfig(tx, T))!, cambio)
      if (r.ok) await guardarConfig(tx, T, r.config)
      return r
    })
  assert.ok((await aplicarYGuardar({ seccion: 'horario', franjas: [{ diaSemana: 1, desde: '08:00', hasta: '14:00' }], duracionHuecoMinutos: 45, puestos: 2 })).ok)
  assert.equal((await aplicarYGuardar({ seccion: 'horario', franjas: [{ diaSemana: 1, desde: '', hasta: '14:00' }], duracionHuecoMinutos: 45, puestos: 2 })).ok, false, 'sin hora inventada')
  assert.equal((await aplicarYGuardar({
    seccion: 'horario', franjas: [{ diaSemana: 2, desde: '08:00', hasta: '12:00' }, { diaSemana: 2, desde: '11:00', hasta: '13:00' }], duracionHuecoMinutos: 45, puestos: 2,
  })).ok, false, 'solapes')
  assert.ok((await aplicarYGuardar({
    seccion: 'textos', textos: { pieResguardo: 'R', pieFactura: 'F', condicionesPresupuesto: 'C', firmaCorreo: 'Firma' }, validezPresupuestoDias: 15,
  })).ok)
  const c = await conTaller(T, (tx: any) => leerConfig(tx, T))
  assert.deepEqual(c!.horarioCitas, { franjas: [{ diaSemana: 1, desde: '08:00', hasta: '14:00' }], duracionHuecoMinutos: 45, puestos: 2 })
  assert.equal(c!.textos.firmaCorreo, 'Firma')
  assert.equal(c!.validezPresupuestoDias, 15)
  assert.equal(c!.textos.versionTextoComercialTaller, configDeAlta().textos.versionTextoComercialTaller, 'el consentimiento no se toca desde Textos')

  const sinR = c!.series.filter((s) => s.codigo !== 'R')
  assert.equal((await aplicarYGuardar({ seccion: 'series', series: sinR })).ok, false, 'una serie no se borra')
  assert.ok((await aplicarYGuardar({ seccion: 'series', series: [...c!.series, { codigo: 'B', prefijo: 'B', descripcion: 'Taller 2', rectificativa: false, porDefecto: false }] })).ok)

  const sinGeneral = c!.ivas.filter((i) => i.codigo !== 'general')
  assert.equal((await aplicarYGuardar({ seccion: 'ivas', ivas: sinGeneral })).ok, false, 'IVA en uso por defecto')
  assert.ok((await aplicarYGuardar({ seccion: 'ivas', ivas: c!.ivas.filter((i) => i.codigo !== 'exento') })).ok)
  const c2 = await conTaller(T, (tx: any) => leerConfig(tx, T))
  assert.deepEqual(c2!.ivas.map((i) => i.codigo).sort(), ['general', 'reducido'])
  assert.equal(c2!.series.length, 3)
})

test('el dueño edita la agenda (cierres incluidos) y vuelve igual al leerla; una agenda imposible se rechaza', async () => {
  const { conTaller } = await tallerDeAlta()
  const ok = await conTaller(T, async (tx: any) => {
    const antes = (await leerConfig(tx, T))!
    const r = aplicarAjuste(antes, {
      seccion: 'agenda',
      agenda: { ...antes.agenda, maxCochesPorFranja: 3, ocupablePuntosBasicos: 9000, confirmacion: 'automatica', cierres: [{ fecha: '2026-12-25', motivo: ' Navidad ' }, { fecha: '2026-12-08', motivo: '' }] },
    })
    assert.ok(r.ok, JSON.stringify(r))
    await guardarConfig(tx, T, r.config)
    return (await leerConfig(tx, T))!.agenda
  })
  assert.equal(ok.maxCochesPorFranja, 3)
  assert.equal(ok.ocupablePuntosBasicos, 9000)
  assert.equal(ok.confirmacion, 'automatica')
  assert.deepEqual(ok.cierres, [{ fecha: '2026-12-08', motivo: '' }, { fecha: '2026-12-25', motivo: 'Navidad' }])
  const mala = await conTaller(T, async (tx: any) => {
    const antes = (await leerConfig(tx, T))!
    return aplicarAjuste(antes, { seccion: 'agenda', agenda: { ...antes.agenda, ocupablePuntosBasicos: 0, cierres: [{ fecha: '2026-13-40', motivo: '' }] } })
  })
  assert.equal(mala.ok, false)
})
