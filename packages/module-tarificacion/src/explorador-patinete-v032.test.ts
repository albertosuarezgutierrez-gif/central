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
  neutralizarRutaTolerable,
  cuerpoToleradoConAccionReal,
  rutasAppTolerablesDe,
  ENTRADAS_EXPLORACION,
  pareceEmision,
  rutaDeMarco,
  tipoDocumentoDe,
  opcionTipoDocumento,
  detalleCuerpoToleradoConAccionReal,
  redactarValoresInventario,
  CLAVES_ELEMENTO_TEXTO,
  valoresSensiblesDeRiesgo,
  selectorDeElemento,
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

describe('0.3.3 · selector estable con `$` (ids JSF de ePAC)', () => {
  it('IntervinientesBean$nifTomador_doc tiene selector por id; caracteres de CSS raros siguen sin selector', () => {
    expect(selectorDeElemento({ tag: 'input', id: 'IntervinientesBean$nifTomador_doc' } as never)).toEqual({ por: 'id', valor: 'IntervinientesBean$nifTomador_doc', tag: 'input' })
    expect(selectorDeElemento({ tag: 'input', id: 'a b"c' } as never)).toBeNull()
  })
})

describe('seguridad 2a · precio pegajoso en la validación pura', () => {
  const val = (i: InventarioDom, precioVisto = false) => {
    const btn = i.marcos.flatMap((m) => m.elementos).find((e) => e.id === 'btnAceptar')!
    return validarRespuestaExplorador(
      { version: 1, pantalla: { nombre: 'Figuras', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref: btn.ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
      { inventario: i, ramo: 'patinete', entrada: MP, datosReales: null, precioVisto },
    )
  }
  it('sin precio: pasa; con importe en OTRO marco o ya visto antes: avance_por_id_con_precio', () => {
    expect(val(inv([BTN])).ok).toBe(true)
    expect(JSON.stringify(val(inv([BTN]), true))).toMatch(/avance_por_id_con_precio/)
    const dos = sanearInventarioDom({ marcos: [
      { url: 'https://epac.example.test/ngx/app', nombre: null, titulos: [], importes: [{ texto: '310,20 €', etiqueta: 'Prima' }], elementos: [{ tag: 'button', id: 'x', texto: 'Menú' }] },
      { url: URL_DRVP00, nombre: 'appArea', titulos: [], elementos: [BTN] },
    ] }, undefined, { refs: true })!
    expect(JSON.stringify(val(dos))).toMatch(/avance_por_id_con_precio/)
  })
})

describe('0.3.4 · entradas de menú avanzables (Mapfre NSE)', () => {
  const MPF = 'mapfre:automoviles:patinetes'
  const i = sanearInventarioDom({ marcos: [{ url: 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/inicio.jsp', nombre: null, titulos: [], elementos: [
    { tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/maspatin.jsp', texto: 'MásPatín' },
    { tag: 'a', role: 'menuitem', texto: 'Oferta Multiprecio' },
    { tag: 'a', onclick: 'javascript:verProducto()', texto: 'Patinetes' },
    { tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/inicio.jsp', texto: 'Contratar póliza' },
    { tag: 'a', texto: 'Sin nada' },
    { tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/inicio.jsp', texto: 'Aceptar' },
  ] }] }, undefined, { refs: true })!
  const refs = i.marcos[0].elementos.map((e) => e.ref!)
  const av = (r: string) => validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'NSE', tipo: 'seleccion_producto' }, acciones: [{ accion: 'avanzar', ref: r, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo: 'patinete', entrada: MPF, datosReales: null },
  )
  it('link, menuitem y <a onclick> se pueden pulsar; emisión, «Aceptar» y un <a> sin nada, no', () => {
    expect(av(refs[0]).ok).toBe(true)
    expect(av(refs[1]).ok).toBe(true)
    expect(av(refs[2]).ok).toBe(true)
    expect(JSON.stringify(av(refs[3]))).toMatch(/boton_de_emision/)
    expect(JSON.stringify(av(refs[4]))).toMatch(/no es un botón/)
    expect(JSON.stringify(av(refs[5]))).toMatch(/aceptar_no_autorizado/)
  })
})

describe('0.3.4b · enlaces avanzables SOLO donde la entrada lo declara y dentro de la app', () => {
  const marcoDe = (url: string, elementos: unknown[]) => sanearInventarioDom({ marcos: [{ url, nombre: null, titulos: [], elementos }] }, undefined, { refs: true })!
  const av = (entrada: string, i: InventarioDom, ramo = 'patinete') => validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'X', tipo: 'seleccion_producto' }, acciones: [{ accion: 'avanzar', ref: i.marcos[0].elementos[0].ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo, entrada, datosReales: null },
  )
  const NSE = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/inicio.jsp'
  it('Mapfre dentro de la app: href de la app y onclick pasan', () => {
    expect(av('mapfre:automoviles:patinetes', marcoDe(NSE, [{ tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/oferta.jsp', texto: 'MásPatín' }])).ok).toBe(true)
    expect(av('mapfre:automoviles:patinetes', marcoDe(NSE, [{ tag: 'a', onclick: 'verProducto() ; javascript:abrir()', texto: 'Patinetes' }])).ok).toBe(true)
  })
  it('link en Allianz Movilidad Personal (sin la declaración) → rechazado; en Mapfre, otra ruta / otro origen / ventana fuera de la app → rechazado', () => {
    expect(JSON.stringify(av('allianz:autos:movilidad_personal', marcoDe('https://www.e-pacallianz.com/ngx-azs-epac/private/application', [{ tag: 'a', role: 'menuitem', texto: 'Venta' }])))).toMatch(/no es un botón/)
    expect(JSON.stringify(av('allianz:autos:movilidad_personal', marcoDe(URL_DRVP00, [{ tag: 'a', role: 'link', hrefRuta: '/drvp00/SEAServlet', texto: 'Datos' }])))).toMatch(/no es un botón/)
    expect(JSON.stringify(av('mapfre:automoviles:patinetes', marcoDe(NSE, [{ tag: 'a', role: 'link', hrefRuta: '/PortalMediadores/x.jsp', texto: 'Otra' }])))).toMatch(/no es un botón/)
    expect(JSON.stringify(av('mapfre:automoviles:patinetes', marcoDe(NSE, [{ tag: 'a', role: 'link', hrefRuta: 'https://otro.example.test/EVT21_NSE_FWEB/x.jsp', texto: 'Otra' }])))).toMatch(/no es un botón/)
    expect(JSON.stringify(av('mapfre:automoviles:patinetes', marcoDe('https://wmediadores.mapfre.com/PortalMediadores_fe-web/', [{ tag: 'a', onclick: 'x()', texto: 'Fuera' }])))).toMatch(/no es un botón/)
  })
  it('la ruta del href entra en la capa pura: /contratar.do → boton_de_emision', () => {
    expect(JSON.stringify(av('mapfre:automoviles:patinetes', marcoDe(NSE, [{ tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/contratar.do', texto: 'Seguir' }])))).toMatch(/boton_de_emision/)
  })
})

describe('0.3.5 · ruta de aplicación NSE tolerada SOLO en Mapfre patinete (decisión de Alberto)', () => {
  const R = rutasAppTolerablesDe('mapfre:automoviles:patinetes')
  const CARGA = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf'
  const bloquea = (u: string, reglas = R) => pareceEmision(neutralizarRutaTolerable(u, reglas))
  it('solo la entrada de patinete la declara (Mapfre auto, Allianz… ninguna)', () => {
    const con = Object.entries(ENTRADAS_EXPLORACION).filter(([, e]) => (e.rutasAppTolerables ?? []).length > 0).map(([k]) => k)
    expect(con).toEqual(['mapfre:automoviles:patinetes'])
    expect(R).toEqual([{ origen: 'https://wmediadores.mapfre.com', prefijo: '/EVT21_NSE_FWEB/app/emision/' }])
  })
  it('cargaOperacion.jsf pasa; sin la regla (otra entrada) sigue bloqueada', () => {
    expect(pareceEmision(CARGA)).toBe(true)
    expect(bloquea(CARGA)).toBe(false)
    // Ruta relativa: solo con la ventana EXACTAMENTE en el origen de la regla.
    expect(pareceEmision(neutralizarRutaTolerable('/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', R, 'https://wmediadores.mapfre.com'))).toBe(false)
    expect(pareceEmision(neutralizarRutaTolerable('/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', R))).toBe(true)
    expect(pareceEmision(neutralizarRutaTolerable('/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', R, 'https://otro.example.test'))).toBe(true)
    expect(pareceEmision(neutralizarRutaTolerable('/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', R, 'http://wmediadores.mapfre.com'))).toBe(true)
    expect(bloquea(CARGA, rutasAppTolerablesDe('mapfre:nueva_produccion:auto'))).toBe(true)
    expect(bloquea(CARGA, rutasAppTolerablesDe('allianz:autos:movilidad_personal'))).toBe(true)
  })
  it('acciones reales bajo la ruta, query de emisión, otro origen u otra ruta: siguen bloqueados', () => {
    for (const u of [
      'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/emitir.jsf',
      'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/contratacion/alta.jsf',
      'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/confirmar.jsf',
      'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/firma/x.jsf',
      'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/pago.jsf',
      `${CARGA}?accion=emitir`,
      'https://otro.example.test/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf',
      'https://wmediadores.mapfre.com/OTRA/app/emision/cargaOperacion.jsf',
      '/EVT21_NSE_FWEB/app/emision/emitir.jsf',
    ]) expect(bloquea(u), u).toBe(true)
  })
  it('bloqueoAvance: el enlace a cargaOperacion pasa en patinete; «Emitir póliza» bajo NSE y la misma ruta en Mapfre auto, no', () => {
    const NSE = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/inicio.jsf'
    const i = sanearInventarioDom({ marcos: [{ url: NSE, nombre: null, titulos: [], elementos: [
      { tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', texto: 'Nueva oferta' },
      { tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', texto: 'Emitir póliza' },
    ] }] }, undefined, { refs: true })!
    const [a, b] = i.marcos[0].elementos
    expect(bloqueoAvance('mapfre:automoviles:patinetes', a, i.marcos[0])).toBeNull()
    expect(bloqueoAvance('mapfre:automoviles:patinetes', b, i.marcos[0])).toBe('boton_de_emision')
    expect(bloqueoAvance('mapfre:nueva_produccion:auto', a, i.marcos[0])).toBe('boton_de_emision')
    // Misma ruta relativa en una ventana de OTRO origen: no se tolera.
    const otra = sanearInventarioDom({ marcos: [{ url: 'https://otro.example.test/EVT21_NSE_FWEB/app/emision/inicio.jsf', nombre: null, titulos: [], elementos: [{ tag: 'a', role: 'link', hrefRuta: '/EVT21_NSE_FWEB/app/emision/cargaOperacion/cargaOperacion.jsf', texto: 'Nueva oferta' }] }] }, undefined, { refs: true })!
    expect(bloqueoAvance('mapfre:automoviles:patinetes', otra.marcos[0].elementos[0], otra.marcos[0])).toBe('boton_de_emision')
  })
  it('cuerpo de una ruta tolerada: nombres de parámetro y botón JSF con acción real → sí; navegación normal NSE → no', () => {
    expect(cuerpoToleradoConAccionReal('formEmision:btnEmitir=formEmision:btnEmitir')).toBe(true)
    expect(cuerpoToleradoConAccionReal('javax.faces.source=form:btnContratar&formEmision=formEmision')).toBe(true)
    expect(cuerpoToleradoConAccionReal('javax.faces.partial.execute=form%3AbtnConfirmar')).toBe(true)
    expect(cuerpoToleradoConAccionReal('javax.faces.source=form:btnSiguiente&formEmision:campo=1&javax.faces.partial.render=formEmision')).toBe(false)
  })
})

describe('0.3.7 · guardia de datos personales: los campos nuevos pasan por redactarValoresInventario', () => {
  it('un aviso del portal, un mensajeError y un hrefRuta con el nombre o la calle del riesgo desaparecen', () => {
    const riesgo = { tomador: { nombre: 'Eustaquio', apellido1: 'Villaverdeño' }, direccion: { calle: 'Calle Inventada Larga' } }
    const inv = sanearInventarioDom({ marcos: [{
      url: 'https://www.e-pacallianz.com/drvp00/SEAServlet', nombre: 'appArea', titulos: [],
      avisosPortal: ['El tomador VILLAVERDEÑO, EUSTAQUIO ya existe', 'Revise la dirección Calle Inventada Larga', 'Debe seleccionar el tipo de documento'],
      elementos: [
        { tag: 'input', type: 'text', id: 'nif', invalido: true, mensajeError: 'Eustaquio no coincide con el titular' },
        { tag: 'input', type: 'text', id: 'otro', invalido: true, mensajeError: 'Campo obligatorio' },
        { tag: 'a', role: 'link', texto: 'Ficha', hrefRuta: '/clientes/villaverdeno-eustaquio/ficha' },
      ],
    }] }, undefined, { refs: true })!
    // El saneado deja pasar estos textos (no tienen forma de dato personal): la redacción por VALORES del riesgo es la que los quita.
    expect(inv.marcos[0].avisosPortal).toHaveLength(3)
    const r = redactarValoresInventario(inv, valoresSensiblesDeRiesgo(riesgo))
    const m = r.marcos[0]
    expect(m.avisosPortal).toEqual(['Debe seleccionar el tipo de documento'])
    expect(m.elementos.find((e) => e.id === 'nif')!.mensajeError).toBeUndefined()
    expect(m.elementos.find((e) => e.id === 'otro')!.mensajeError).toBe('Campo obligatorio')
    expect(JSON.stringify(r)).not.toMatch(/eustaquio|villaverde|inventada/i)
    expect(r.textosDescartados).toBeGreaterThanOrEqual(3)
  })
})

describe('0.3.7 · guardia estructural: toda clave de TEXTO que el saneado pone en un elemento se redacta', () => {
  it('cada `pon(\'clave\', …)` de sanearInventarioDom está en CLAVES_ELEMENTO_TEXTO', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./inventario-dom.ts', import.meta.url), 'utf8')
    const claves = [...src.matchAll(/\bpon\('([A-Za-z]+)'/g)].map((m) => m[1])
    expect(claves.length).toBeGreaterThan(10)
    for (const c of claves) expect(CLAVES_ELEMENTO_TEXTO as readonly string[], c).toContain(c)
  })
})

describe('0.3.8 · tipo de documento y detalle del cuerpo tolerado', () => {
  it('tipoDocumentoDe: NIF, NIE, CIF por su forma; lo demás null', () => {
    expect(tipoDocumentoDe('12345678Z')).toBe('NIF')
    expect(tipoDocumentoDe(' 28.823.484-e ')).toBe('NIF')
    expect(tipoDocumentoDe('X1234567L')).toBe('NIE')
    expect(tipoDocumentoDe('B12345678')).toBe('CIF')
    for (const x of ['', '1234', 'PASAPORTE1', null, undefined]) expect(tipoDocumentoDe(x as string)).toBeNull()
  })
  it('opcionTipoDocumento: la ÚNICA opción por texto; ambigua o ausente → null', () => {
    const ops = [{ valor: '', texto: 'Seleccione' }, { valor: 'N', texto: 'N.I.F.' }, { valor: 'E', texto: 'NIE' }, { valor: 'C', texto: 'CIF' }, { valor: 'P', texto: 'Pasaporte' }]
    expect(opcionTipoDocumento('NIF', ops)).toBe('N')
    expect(opcionTipoDocumento('NIE', ops)).toBe('E')
    expect(opcionTipoDocumento('CIF', ops)).toBe('C')
    expect(opcionTipoDocumento('NIF', [...ops, { valor: 'D', texto: 'DNI' }])).toBeNull()
    expect(opcionTipoDocumento('NIF', [{ valor: 'P', texto: 'Pasaporte' }])).toBeNull()
  })
  it('detalleCuerpoToleradoConAccionReal: nombra el parámetro y la palabra; emitir/contratar como javax.faces.source → bloqueado', () => {
    expect(detalleCuerpoToleradoConAccionReal('javax.faces.source=form%3AbtnEmitir&x=1')).toEqual({ parametro: 'javax.faces.source', patron: 'emit' })
    expect(detalleCuerpoToleradoConAccionReal('javax.faces.source=form:btnContratar')).toEqual({ parametro: 'javax.faces.source', patron: 'contrat' })
    expect(detalleCuerpoToleradoConAccionReal('formContratacion:campo=1')).toEqual({ parametro: 'formContratacion:campo', patron: 'contrat' })
    expect(detalleCuerpoToleradoConAccionReal('javax.faces.source=form:btnBuscar&formBusqueda:texto=patin')).toBeNull()
  })
})

describe('0.3.8b · el detalle del cuerpo nunca saca datos (cuerpos JSON/texto sin «=»)', () => {
  it('JSON con un NIF: el parámetro no lleva el valor; un nombre de form con cifras largas se enmascara', () => {
    const d = detalleCuerpoToleradoConAccionReal('{"nif":"12345678Z","pago":1}')
    expect(d).not.toBeNull()
    expect(JSON.stringify(d)).not.toContain('12345678Z')
    expect(d!.parametro).toBe('(cuerpo no form-urlencoded)')
    expect(detalleCuerpoToleradoConAccionReal('form:pago12345678=1')!.parametro).toBe('form:pago#')
    // Rama de VALOR: el parámetro es SOLO la clave javax.faces.* exacta; el valor (que casó) no sale.
    const v = detalleCuerpoToleradoConAccionReal('javax.faces.source=Juan%20Perez%20pago%2012345678Z')
    expect(v).toEqual({ parametro: 'javax.faces.source', patron: 'pago' })
  })
})
