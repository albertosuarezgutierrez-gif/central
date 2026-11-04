// Pelayo 0.3.41: «Nueva contratación» (solo abre el wizard) y TOPE DURO del wizard de autos (nunca más allá de «Precio final»). PURO.
import { describe, expect, it } from 'vitest'
import {
  bloqueoAvance,
  bloqueoZonaWizardPelayo,
  esNuevaContratacionPelayoInventario,
  neutralizarRutaTolerable,
  pareceEmision,
  rutasAppTolerablesDe,
  type ElementoInventario,
  type MarcoInventario,
} from './index.ts'

const NUEVO = 'https://mediadores.pelayo.com/portalmediador-nuevo-presupuesto'
const WIZ = 'https://apps.pelayo.com/contratacion-autos/'
const marco = (url = NUEVO, titulos: string[] = ['Nueva contratación', 'Datos del Tomador']) => ({ url, nombre: null, elementos: [], titulos, titulosPantalla: [] }) as unknown as MarcoInventario
const boton = (extra: Partial<ElementoInventario> = {}) => ({ ref: 'e1', tag: 'button', type: 'button', texto: 'Nueva contratación', ...extra }) as unknown as ElementoInventario

describe('«Nueva contratación» de Pelayo (inventario)', () => {
  it('el botón exacto en la pantalla exacta es avance SOLO en la entrada de Pelayo Auto', () => {
    expect(esNuevaContratacionPelayoInventario(boton(), marco())).toBe(true)
    expect(bloqueoAvance('pelayo:presupuestos:auto', boton(), marco())).toBeNull()
    expect(bloqueoAvance('pelayo:presupuestos:hogar', boton(), marco())).toBe('boton_de_emision')
    expect(bloqueoAvance('mapfre:patrimoniales:hogar', boton(), marco())).toBe('boton_de_emision')
  })
  it('estrecha: otro texto, enlace, onclick, id con acción, deshabilitado, otra ruta/origen o sin «Datos del Tomador» → no', () => {
    const no: [string, ElementoInventario, MarcoInventario][] = [
      ['texto con más', boton({ texto: 'Nueva contratación y emitir' }), marco()],
      ['contratar', boton({ texto: 'Contratar' }), marco()],
      ['recortado', boton({ texto: 'Nueva contratación…' }), marco()],
      ['aria distinto', boton({ ariaLabel: 'Emitir póliza' }), marco()],
      ['enlace', boton({ tag: 'a', type: undefined }), marco()],
      ['href', boton({ hrefRuta: '/emitir' }), marco()],
      ['onclick', boton({ onclick: 'go()' }), marco()],
      ['id con acción', boton({ id: 'btnEmitir' }), marco()],
      ['deshabilitado', boton({ deshabilitado: true }), marco()],
      ['otra ruta', boton(), marco('https://mediadores.pelayo.com/portalmediador-presupuestos/')],
      ['otro origen', boton(), marco('https://apps.pelayo.com/portalmediador-nuevo-presupuesto')],
      ['http', boton(), marco('http://mediadores.pelayo.com/portalmediador-nuevo-presupuesto')],
      ['sin Datos del Tomador', boton(), marco(NUEVO, ['Nueva contratación'])],
    ]
    for (const [n, el, m] of no) {
      expect(esNuevaContratacionPelayoInventario(el, m), n).toBe(false)
      expect(bloqueoAvance('pelayo:presupuestos:auto', el, m), n).not.toBeNull()
    }
  })
})

describe('TOPE DURO del wizard de autos de Pelayo', () => {
  it('se pulsa solo en el paso 1 (vehicle); «Precio final» y cualquier ruta no listada, nunca', () => {
    expect(bloqueoZonaWizardPelayo(`${WIZ}vehicle`)).toBeNull()
    expect(bloqueoZonaWizardPelayo(`${WIZ}vehicle/`)).toBeNull()
    for (const p of ['', 'final-price', 'price', 'interveners', 'payment', 'contract', 'vehicle/x', 'products']) expect(bloqueoZonaWizardPelayo(`${WIZ}${p}`), p).toBe('pelayo_wizard_fuera_de_zona')
    expect(bloqueoZonaWizardPelayo('https://apps.pelayo.com/otra-app/vehicle')).toBe('pelayo_wizard_fuera_de_zona')
    expect(bloqueoZonaWizardPelayo('http://apps.pelayo.com/contratacion-autos/vehicle')).toBe('pelayo_wizard_url_ilegible')
    // Fuera de apps.pelayo.com no aplica.
    expect(bloqueoZonaWizardPelayo(NUEVO, ['Precio final'])).toBeNull()
  })
  it('un control con rótulo de paso 4-7 (o «Intervinientes») no se pulsa ni en el paso 1', () => {
    for (const r of ['Precio final', '4 Precio final', 'Paso 4: Precio final', 'Intervinientes', '5. Intervinientes', 'Medios de pago', 'Medio de pago', 'Contratar', '7 Contratar'])
      expect(bloqueoZonaWizardPelayo(`${WIZ}vehicle`, [r]), r).toBe('pelayo_wizard_paso_prohibido')
    for (const r of ['Búsqueda manual', 'Siguiente', 'Sin matricular', 'Datos del vehículo']) expect(bloqueoZonaWizardPelayo(`${WIZ}vehicle`, [r]), r).toBeNull()
  })
  it('bloqueoAvance aplica el tope a TODA entrada (marco en el wizard)', () => {
    const sig = boton({ texto: 'Siguiente' })
    expect(bloqueoAvance('pelayo:presupuestos:auto', sig, marco(`${WIZ}vehicle`, []))).toBeNull()
    for (const e of ['pelayo:presupuestos:auto', 'pelayo:presupuestos:hogar']) expect(bloqueoAvance(e, sig, marco(`${WIZ}final-price`, [])), e).toBe('pelayo_wizard_fuera_de_zona')
  })
  it('red: /contratacion-autos/ solo deja de contar como emisión con un resto EXACTO (raíz o vehicle); el resto sigue bloqueado', () => {
    const reglas = rutasAppTolerablesDe('pelayo:presupuestos:auto')
    expect(reglas).toHaveLength(1)
    expect(rutasAppTolerablesDe('pelayo:presupuestos:hogar')).toEqual([])
    for (const u of [`${WIZ}vehicle`, `${WIZ}vehicle?token=abc`, WIZ]) expect(pareceEmision(neutralizarRutaTolerable(u, reglas)), u).toBe(false)
    for (const u of [`${WIZ}payment`, `${WIZ}final-price`, `${WIZ}vehicle/contract`, `${WIZ}vehicle?accion=contratar`, 'https://otro.pelayo.com/contratacion-autos/vehicle'])
      expect(pareceEmision(neutralizarRutaTolerable(u, reglas)), u).toBe(true)
  })
})
