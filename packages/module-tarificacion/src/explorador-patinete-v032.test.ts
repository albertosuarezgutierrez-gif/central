// Cepos de los dos fallos reales del 28/10/2026 (imagen main-57b99d0), explorador 0.3.2. Fixtures SINTÉTICAS.
//  1) Mapfre Patinetes: «Acceso a NSE» = `javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');` abre la
//     APLICACIÓN NSE (no emite). Excepción EXACTA; lo demás de emisión sigue bloqueado.
//  2) Allianz Movilidad Personal (ePAC `/drvp00/SEAServlet`): avance de paso `#btnAceptar` + `eventoSiguiente()` autorizado SOLO
//     con esa identidad exacta; los radios ocultos llegan como `input radio` (los resuelve el worker por su label).
import { describe, it, expect } from 'vitest'
import {
  avancePorIdAutorizado,
  bloqueoAvance,
  comprobarBoton,
  esAvanceAutorizado,
  esLanzadorAplicacionNseMapfre,
  pareceEmision,
  rutaDeMarco,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type InventarioDom,
} from './index.ts'

const HREF_NSE = "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISI%C3%93N');"

describe('Mapfre «Acceso a NSE»: excepción exacta del lanzador de la aplicación NSE', () => {
  it('el href real (codificado), decodificado, sin `javascript:` o sin `;` es el lanzador', () => {
    for (const d of [HREF_NSE, "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISIÓN');", "abrirAplicacion('inicio.jsp','NUEVO SISTEMA DE EMISION')", "javascript:abrirAplicacion('inicio.jsp',%20'NUEVO%20SISTEMA%20DE%20EMISI%C3%93N');"]) {
      expect(esLanzadorAplicacionNseMapfre(d), d).toBe(true)
    }
    // Sin la excepción, el guard lo bloquea (es justo el fallo real): el cepo tiene sentido.
    expect(pareceEmision(HREF_NSE)).toBe(true)
    // La puerta del worker quita SOLO esa descripción: texto + href pasan comprobarBoton.
    const desc = ['Acceso a NSE', null, null, null, null, null, HREF_NSE]
    expect(() => comprobarBoton(desc.filter((d) => !esLanzadorAplicacionNseMapfre(d)))).not.toThrow()
    expect(() => comprobarBoton(desc)).toThrow(/guard_emision/)
  })

  it('«Emitir», «Emitir póliza», «Contratar», otra aplicación o un sufijo siguen BLOQUEADOS', () => {
    const peligrosos = [
      'Emitir',
      'Emitir póliza',
      'Contratar',
      "abrirAplicacion('x','EMITIR')",
      "javascript:abrirAplicacion('inicio.jsp', 'EMITIR');",
      "javascript:abrirAplicacion('emitir.jsp', 'NUEVO SISTEMA DE EMISION');",
      "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISION Y CONTRATACION');",
      "javascript:abrirAplicacion('inicio.jsp', 'NUEVO SISTEMA DE EMISION');emitirPoliza();",
      "javascript:abrirAplicacion('inicio.jsp', 'nuevo sistema de emision');",
    ]
    for (const d of peligrosos) {
      expect(esLanzadorAplicacionNseMapfre(d), d).toBe(false)
      expect(() => comprobarBoton(['Acceso a NSE', d].filter((x) => !esLanzadorAplicacionNseMapfre(x))), d).toThrow(/guard_emision/)
    }
  })
})

const URL_DRVP00 = 'https://epac.example.test/drvp00/SEAServlet?action=x&sid=1'
const MP = 'allianz:autos:movilidad_personal'

function inv(elementos: unknown[], extra: { url?: string; titulos?: unknown[] } = {}): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: extra.url ?? URL_DRVP00, nombre: 'appArea', titulos: extra.titulos ?? [{ texto: 'Datos del tomador', tag: 'td' }], elementos }] }, undefined, { refs: true })!
}
const BTN = { tag: 'button', id: 'btnAceptar', type: 'button', texto: 'Aceptar', onclick: 'eventoSiguiente()' }
const el0 = (i: InventarioDom) => i.marcos[0].elementos[0]

describe('Allianz ePAC drvp00: avance de paso #btnAceptar + eventoSiguiente() por identidad exacta', () => {
  it('la identidad exacta (con o sin `;`, espacios) en /drvp00/SEAServlet se autoriza y bloqueoAvance no la para', () => {
    for (const onclick of ['eventoSiguiente()', 'eventoSiguiente();', ' eventoSiguiente( ) ; ']) {
      const i = inv([{ ...BTN, onclick }])
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), onclick).not.toBeNull()
      expect(esAvanceAutorizado(MP, el0(i), i.marcos[0])).toBe(true)
      expect(bloqueoAvance(MP, el0(i), i.marcos[0])).toBeNull()
    }
  })

  it('rutaDeMarco: tolera el host tapado por el saneado y el ;jsessionid; la ruta tiene que ser EXACTA', () => {
    for (const u of ['http://[DATO]:33727/drvp00/SEAServlet', 'https://epac.example.test/drvp00/SEAServlet;jsessionid=AB12?x=1', URL_DRVP00]) {
      expect(rutaDeMarco(u), u).toBe('/drvp00/SEAServlet')
      const i = inv([BTN], { url: u })
      expect(avancePorIdAutorizado(MP, el0(i), i.marcos[0]), u).not.toBeNull()
    }
    for (const u of ['https://epac.example.test/drvp00/SEAServlet2', 'https://epac.example.test/x/drvp00/SEAServlet', 'https://epac.example.test/drvp00/SEAServlet/emitir', 'no es url']) {
      expect(rutaDeMarco(u) === '/drvp00/SEAServlet', u).toBe(false)
    }
  })

  it('un «Aceptar» genérico, otro id, otro onclick, otro marco, otra entrada o un título de tarificar/emisión: aceptar_no_autorizado', () => {
    const casos: [string, InventarioDom, string][] = [
      ['Aceptar genérico', inv([{ tag: 'button', texto: 'Aceptar' }]), MP],
      ['otro id', inv([{ ...BTN, id: 'btnAceptar2' }]), MP],
      ['otro onclick', inv([{ ...BTN, onclick: 'eventoSiguiente();emitir()' }]), MP],
      ['onclick de emisión', inv([{ ...BTN, onclick: 'validar_aceptar()' }]), MP],
      ['otro marco', inv([BTN], { url: 'https://epac.example.test/drvp01/SEAServlet' }), MP],
      ['título Tarificar', inv([BTN], { titulos: [{ texto: 'Tarificar', tag: 'h2' }] }), MP],
      ['título Revisión y emisión', inv([BTN], { titulos: [{ texto: 'Revisión y emisión', tag: 'th' }] }), MP],
      ['otro texto', inv([{ ...BTN, texto: 'Aceptar y emitir' }]), MP],
      ['marco con PRECIO (importes)', sanearInventarioDom({ marcos: [{ url: URL_DRVP00, nombre: 'appArea', titulos: [], importes: [{ texto: '47,55 €', etiqueta: 'Prima total' }], elementos: [BTN] }] }, undefined, { refs: true })!, MP],
      ['otra entrada (Hogar)', inv([BTN]), 'allianz:particulares:hogar'],
      ['Mapfre patinete', inv([BTN]), 'mapfre:automoviles:patinetes'],
    ]
    for (const [nombre, i, entrada] of casos) {
      expect(avancePorIdAutorizado(entrada, el0(i), i.marcos[0]), nombre).toBeNull()
      expect(bloqueoAvance(entrada, el0(i), i.marcos[0]), nombre).not.toBeNull()
    }
    const gen = inv([{ tag: 'button', texto: 'Aceptar' }])
    expect(bloqueoAvance(MP, el0(gen), gen.marcos[0])).toBe('aceptar_no_autorizado')
  })

  it('validador: marcar los radios (inventariados como input radio por su label) + avanzar btnAceptar = OK; checkbox y Aceptar genérico, rechazados', () => {
    const i = inv([
      { tag: 'input', type: 'radio', id: 'IntervinientesBean$esPropietario1', name: 'IntervinientesBean$esPropietario', texto: 'Si', etiqueta: 'Si' },
      { tag: 'input', type: 'radio', id: 'IntervinientesBean$esConductor1', name: 'IntervinientesBean$esConductor', texto: 'Si', etiqueta: 'Si' },
      BTN,
      { tag: 'input', type: 'checkbox', id: 'casilla', etiqueta: 'Casilla' },
      { tag: 'button', id: 'otro', texto: 'Aceptar' },
      { tag: 'label', id: 'IntervinientesBean$esPropietario2_label', texto: 'No' },
    ])
    const r = (acciones: unknown[]) => validarRespuestaExplorador(
      { version: 1, pantalla: { nombre: 'Datos Básicos – Figuras Intervinientes', tipo: 'formulario' }, acciones, mapeo: [], motivo: null },
      { inventario: i, ramo: 'patinete', entrada: MP, datosReales: null },
    )
    const refs = i.marcos[0].elementos.map((e) => e.ref!)
    const ok = r([{ accion: 'marcar', ref: refs[0] }, { accion: 'marcar', ref: refs[1] }, { accion: 'avanzar', ref: refs[2], efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    expect(ok.ok, JSON.stringify(ok)).toBe(true)
    const conCheckbox = r([{ accion: 'marcar', ref: refs[3] }])
    expect(conCheckbox.ok).toBe(false)
    expect(JSON.stringify(conCheckbox)).toMatch(/marcar solo radios/)
    const conLabel = r([{ accion: 'marcar', ref: refs[5] }])
    expect(JSON.stringify(conLabel)).toMatch(/marcar solo radios/)
    const generico = r([{ accion: 'avanzar', ref: refs[4], efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    expect(generico.ok).toBe(false)
    expect(JSON.stringify(generico)).toMatch(/aceptar_no_autorizado/)
  })
})
