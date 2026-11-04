// 0.3.45 · Permisos de navegación en BD: validación (fail-closed) y fusión código ∪ BD. Los bloqueos DUROS ganan siempre.
import { describe, expect, it } from 'vitest'
import {
  avanceTextoBdAutorizado,
  bloqueoAvance,
  entradasDeCompaniaRamo,
  esAvanceAutorizado,
  filasDePermisos,
  neutralizarRutaTolerable,
  pareceEmision,
  permisosNavegacionDe,
  rutaBdComoTolerable,
  rutasHrefBd,
  rutasRedGetBd,
  textoAvanceProhibido,
  topeUsosAvanceBd,
  validarPermisosNavegacion,
  validarRespuestaExplorador,
  type ElementoInventario,
  type MarcoInventario,
  type PermisosNavegacion,
} from './index.ts'

const E_PELAYO = 'pelayo:presupuestos:auto'
const E_MAPFRE = 'mapfre:automoviles:patinetes'
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ruta = (n: number, datos: unknown, extra: Record<string, unknown> = {}) => ({ id: ID(n), entrada: E_PELAYO, tipo: 'ruta_tolerada', datos, ...extra })
const avance = (n: number, datos: Record<string, unknown>, entrada = E_PELAYO) => ({
  id: ID(n), entrada, tipo: 'avance_texto',
  datos: { texto: 'Aceptar', origen: 'https://mediadores.pelayo.com', rutaMarco: '/portalmediador-datos', tag: 'button', maxUsos: 2, ...datos },
})
const motivos = (filas: unknown[], entrada = E_PELAYO) => permisosNavegacionDe(entrada, filas).ignorados.map((i) => i.motivo)

describe('validación de filas (fail-closed)', () => {
  it('una ruta exacta y un avance válidos SUMAN (y las filas canónicas se revalidan igual)', () => {
    const r = permisosNavegacionDe(E_PELAYO, [
      ruta(1, { origen: 'https://acceso12.pelayo.com', ruta: '/oauth2/rest/authorize', pulsable: false }),
      ruta(2, { origen: 'https://apps.pelayo.com', ruta: '/contratacion-autos/drivers/', pulsable: true }),
      avance(3, {}),
    ])
    expect(r.ignorados).toEqual([])
    expect(r.permisos.rutas.map((x) => x.ruta)).toEqual(['/oauth2/rest/authorize', '/contratacion-autos/drivers'])
    expect(r.permisos.avances).toHaveLength(1)
    expect(r.permisos.avances[0]).toMatchObject({ texto: 'aceptar', tag: 'button', contenedor: null, maxUsos: 2 })
    const otra = permisosNavegacionDe(E_PELAYO, filasDePermisos(r.permisos))
    expect(otra.permisos).toEqual(r.permisos)
    expect(otra.ignorados).toEqual([])
  })

  it('texto con verbo de acción final → ignorado (texto_accion_final)', () => {
    for (const texto of ['Emitir', 'Contratar', 'Confirmar', 'Pagar', 'Firmar', 'Tarificar', 'Aceptar y emitir', 'Acepto y contrato', 'Finalizar', 'Guardar', 'Enviar', 'Precio final', 'Ir al pago', 'Domiciliar'])
      expect(motivos([avance(1, { texto })]), texto).toEqual(['texto_accion_final'])
  })

  it('ruta con comodín, query, codificada o relativa → ignorada', () => {
    for (const r of ['/contratacion-autos/*', '/a/b?x=1', '/a/%2A', '/a/b#f', '/a/{id}', '/a/[x]'])
      expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: r, pulsable: false })]), r).toEqual(['ruta_con_comodin'])
    for (const r of ['a/b', '//apps.pelayo.com/x', '/a/../b', '/a/./b', '', 'x'.repeat(5)])
      expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: r, pulsable: false })]), r).toEqual(['ruta_invalida'])
  })

  it('host http, con puerto, credenciales, ruta en el origen u otro dominio → ignorado', () => {
    for (const o of ['http://apps.pelayo.com', 'https://apps.pelayo.com:8443', 'https://u:p@apps.pelayo.com', 'https://apps.pelayo.com/', 'https://APPS.pelayo.com'])
      expect(motivos([ruta(1, { origen: o, ruta: '/x', pulsable: false })]), o).toEqual(['origen_invalido'])
    for (const o of ['https://pelayo.com.evil.es', 'https://evilpelayo.com', 'https://wmediadores.mapfre.com'])
      expect(motivos([ruta(1, { origen: o, ruta: '/x', pulsable: false })]), o).toEqual(['origen_fuera_de_compania'])
  })

  it('ruta de emisión/pago/firma (no la exacta tolerable) → ignorada (ruta_de_accion_final)', () => {
    for (const r of ['/emitir', '/app/pago/datos', '/contratar', '/contratacion-autos/contratacion', '/poliza/emision', '/x/firma', '/checkout', '/x/iban', '/x/tarjeta-credito', '/emision'])
      expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: r, pulsable: false })]), r).toEqual(['ruta_de_accion_final'])
    // Los sustantivos «emision»/«contratacion» se toleran SOLO en carpetas padre (apps de TARIFICAR: NSE, wizard de Pelayo).
    expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/contratacion-autos/vehicle', pulsable: false })])).toEqual([])
  })

  it('tipo desconocido, jsonb malformado, claves de más/de menos → ignorados', () => {
    expect(motivos([{ id: ID(1), entrada: E_PELAYO, tipo: 'url_libre', datos: {} }])).toEqual(['tipo_desconocido'])
    expect(motivos([{ id: ID(1), entrada: E_PELAYO, tipo: 'ruta_tolerada', datos: '{"origen":"https://apps.pelayo.com"}' }])).toEqual(['datos_malformados'])
    expect(motivos([{ id: ID(1), entrada: E_PELAYO, tipo: 'ruta_tolerada', datos: [] }])).toEqual(['datos_malformados'])
    expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/x', pulsable: false, prefijo: '/' })])).toEqual(['clave_desconocida'])
    expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/x' })])).toEqual(['clave_desconocida'])
    expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/x', pulsable: 'si' })])).toEqual(['pulsable_invalido'])
    expect(motivos([ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/x', pulsable: true }, { creado_por: 'x' })])).toEqual(['clave_desconocida'])
    expect(motivos(['no', null, 3])).toEqual(['no_objeto', 'no_objeto', 'no_objeto'])
    expect(permisosNavegacionDe(E_PELAYO, { filas: [] }).ignorados).toEqual([{ id: null, motivo: 'no_es_lista' }])
    expect(permisosNavegacionDe(E_PELAYO, undefined).ignorados).toEqual([])
  })

  it('id no uuid, duplicado, inactivo, de otra entrada o entrada desconocida → ignorados', () => {
    const ok = { origen: 'https://apps.pelayo.com', ruta: '/x', pulsable: false }
    expect(motivos([{ ...ruta(1, ok), id: '1' }])).toEqual(['id_invalido'])
    expect(motivos([ruta(1, ok), ruta(1, ok)])).toEqual(['id_duplicado'])
    expect(motivos([ruta(1, ok, { activo: false })])).toEqual(['inactivo'])
    expect(motivos([ruta(1, ok, { entrada: E_MAPFRE })])).toEqual(['entrada_distinta'])
    expect(permisosNavegacionDe('x:y:z', [ruta(1, ok, { entrada: 'x:y:z' })]).ignorados.map((i) => i.motivo)).toEqual(['entrada_desconocida'])
    // La compañía la pone el CÓDIGO: un llamante sin compañía no abre nada.
    expect(validarPermisosNavegacion(E_PELAYO, '', [ruta(1, ok)]).permisos.rutas).toEqual([])
  })

  it('avance: tag, contenedor y maxUsos cerrados', () => {
    expect(motivos([avance(1, { tag: 'div' })])).toEqual(['tag_invalido'])
    expect(motivos([avance(1, { contenedor: 'div > button' })])).toEqual(['contenedor_invalido'])
    expect(motivos([avance(1, { contenedor: 'pelayo-modal.btn-emitir' })])).toEqual(['contenedor_invalido'])
    expect(motivos([avance(1, { contenedor: 'pelayo-modal' })])).toEqual([])
    for (const maxUsos of [0, 4, 1.5, '2']) expect(motivos([avance(1, { maxUsos })]), String(maxUsos)).toEqual(['max_usos_invalido'])
    expect(topeUsosAvanceBd({ maxUsos: 99 })).toBe(3)
  })

  it('tope de filas', () => {
    const muchas = Array.from({ length: 45 }, (_, i) => ruta(i + 1, { origen: 'https://apps.pelayo.com', ruta: `/p${i}`, pulsable: false }))
    const r = permisosNavegacionDe(E_PELAYO, muchas)
    expect(r.permisos.rutas).toHaveLength(20)
    expect(r.ignorados.filter((x) => x.motivo === 'tope_tipo')).toHaveLength(20)
    expect(r.ignorados.filter((x) => x.motivo === 'tope_filas')).toHaveLength(1)
  })

  it('«Aceptar», «Siguiente», «Continuar» sí son textos autorizables', () => {
    for (const t of ['aceptar', 'siguiente', 'continuar']) expect(textoAvanceProhibido(t), t).toBe(false)
  })
})

// ─── Fusión ────────────────────────────────────────────────────────────────────

const marco = (url: string, elementos: ElementoInventario[], extra: Partial<MarcoInventario> = {}): MarcoInventario => ({ url, nombre: null, elementos, ...extra })
const boton = (texto: string, extra: Partial<ElementoInventario> = {}): ElementoInventario => ({ tag: 'button', texto, ...extra })
const permisosAvance = (): PermisosNavegacion => permisosNavegacionDe(E_PELAYO, [avance(1, {})]).permisos
const URL_DATOS = 'https://mediadores.pelayo.com/portalmediador-datos'

describe('fusión: avance de BD', () => {
  it('sin permiso, «Aceptar» sigue bloqueado; con el de BD de esta entrada, pasa', () => {
    const el = boton('Aceptar')
    const m = marco(URL_DATOS, [el])
    expect(bloqueoAvance(E_PELAYO, el, m)).toBe('aceptar_no_autorizado')
    expect(bloqueoAvance(E_PELAYO, el, m, permisosAvance())).toBeNull()
    expect(esAvanceAutorizado(E_PELAYO, el, m, permisosAvance())).toBe(true)
    // Permisos de OTRA entrada no cuentan.
    expect(bloqueoAvance('pelayo:presupuestos:hogar', el, m, permisosAvance())).toBe('aceptar_no_autorizado')
  })

  it('el contexto es EXACTO: otra ruta, otro origen, otro tag, dos «Aceptar», importes o título de emisión → no', () => {
    const p = permisosAvance()
    const el = boton('Aceptar')
    expect(avanceTextoBdAutorizado(p, el, marco('https://mediadores.pelayo.com/portalmediador-datos/otra', [el]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco('https://otro.pelayo.com/portalmediador-datos', [el]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, { ...el, tag: 'a' }, marco(URL_DATOS, [{ ...el, tag: 'a' }]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco(URL_DATOS, [el, boton('Aceptar')]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco(URL_DATOS, [el], { importes: [{ texto: '100,00 €' } as never] }))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco(URL_DATOS, [el], { titulos: ['Tarificación'] }))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco(URL_DATOS, [el], { titulos: Array.from({ length: 20 }, (_, i) => `t${i}`) }))).toBeNull()
    expect(avanceTextoBdAutorizado(p, { ...el, deshabilitado: true }, marco(URL_DATOS, [el]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, { ...el, ariaLabel: 'Aceptar y emitir' }, marco(URL_DATOS, [el]))).toBeNull()
    expect(avanceTextoBdAutorizado(p, el, marco(URL_DATOS, [el]))).not.toBeNull()
  })

  it('los bloqueos DUROS ganan aunque haya permiso (incluso uno FORJADO sin pasar la validación)', () => {
    const forjado: PermisosNavegacion = { entrada: E_PELAYO, rutas: [], avances: [{ id: ID(9), texto: 'aceptar y emitir', origen: 'https://mediadores.pelayo.com', rutaMarco: '/portalmediador-datos', tag: 'button', contenedor: null, maxUsos: 3 }] }
    const emitir = boton('Aceptar y emitir')
    expect(bloqueoAvance(E_PELAYO, emitir, marco(URL_DATOS, [emitir]), forjado)).toBe('boton_de_emision')
    expect(avanceTextoBdAutorizado(forjado, emitir, marco(URL_DATOS, [emitir]))).toBeNull()
    // Un «Aceptar» autorizado por BD con onclick/id de emisión: emisión dura.
    const p = permisosAvance()
    for (const extra of [{ onclick: 'emitirPoliza()' }, { id: 'btnContratar' }, { name: 'formEmision:btnEmitir' }]) {
      const el = boton('Aceptar', extra)
      expect(bloqueoAvance(E_PELAYO, el, marco(URL_DATOS, [el]), p), JSON.stringify(extra)).toBe('boton_de_emision')
    }
    // TOPE DURO del wizard de Pelayo: un permiso en apps.pelayo.com no añade pasos pulsables.
    const wiz = permisosNavegacionDe(E_PELAYO, [avance(2, { origen: 'https://apps.pelayo.com', rutaMarco: '/contratacion-autos/price' })]).permisos
    expect(wiz.avances).toHaveLength(1)
    const elw = boton('Aceptar')
    const mw = marco('https://apps.pelayo.com/contratacion-autos/price', [elw])
    expect(avanceTextoBdAutorizado(wiz, elw, mw)).not.toBeNull()
    expect(bloqueoAvance(E_PELAYO, elw, mw, wiz)).toBe('pelayo_wizard_fuera_de_zona')
  })

  it('el validador del explorador: el avance de BD pasa sin precio y se rechaza con precio visto', () => {
    const el = { ...boton('Aceptar'), ref: 'm0e0' }
    const inventario = { marcos: [marco(URL_DATOS, [el])] } as never
    const resp = { version: 1, pantalla: { nombre: 'Datos', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref: 'm0e0', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }] }
    const ctx = { inventario, ramo: 'auto', entrada: E_PELAYO, datosReales: null }
    const sin = validarRespuestaExplorador(resp, ctx)
    expect(sin.ok).toBe(false)
    const con = validarRespuestaExplorador(resp, { ...ctx, permisos: permisosAvance() })
    expect(con.ok, JSON.stringify(con)).toBe(true)
    const conPrecio = validarRespuestaExplorador(resp, { ...ctx, permisos: permisosAvance(), precioVisto: true })
    expect(conPrecio.ok).toBe(false)
  })
})

describe('fusión: ruta tolerada de BD', () => {
  it('la ruta exacta se neutraliza (también con query o «/» final); otra ruta u otro origen no', () => {
    const p = permisosNavegacionDe(E_PELAYO, [ruta(1, { origen: 'https://apps.pelayo.com', ruta: '/contratacion-autos/drivers', pulsable: false })]).permisos
    const reglas = rutasRedGetBd(p)
    expect(rutaBdComoTolerable(p.rutas[0])).toEqual({ origen: 'https://apps.pelayo.com', prefijo: '/contratacion-autos/', rutasExactas: ['drivers'] })
    for (const u of ['https://apps.pelayo.com/contratacion-autos/drivers', 'https://apps.pelayo.com/contratacion-autos/drivers/', 'https://apps.pelayo.com/contratacion-autos/drivers?q=abc']) {
      expect(pareceEmision(u), u).toBe(true)
      expect(pareceEmision(neutralizarRutaTolerable(u, reglas)), u).toBe(false)
    }
    for (const u of ['https://apps.pelayo.com/contratacion-autos/drivers/emitir', 'https://apps.pelayo.com/contratacion-autos/payment', 'https://otro.pelayo.com/contratacion-autos/drivers', 'http://apps.pelayo.com/contratacion-autos/drivers'])
      expect(pareceEmision(neutralizarRutaTolerable(u, reglas)), u).toBe(true)
    // Ruta de un solo segmento y raíz.
    expect(rutaBdComoTolerable({ origen: 'https://a.pelayo.com', ruta: '/authorize' })).toEqual({ origen: 'https://a.pelayo.com', prefijo: '/', rutasExactas: ['authorize'] })
    expect(rutaBdComoTolerable({ origen: 'https://a.pelayo.com', ruta: '/' })).toEqual({ origen: 'https://a.pelayo.com', prefijo: '/', rutasExactas: [''] })
  })

  it('en el HREF de un control solo con `pulsable: true`', () => {
    const fila = (pulsable: boolean) => ({ id: ID(1), entrada: E_MAPFRE, tipo: 'ruta_tolerada', datos: { origen: 'https://wmediadores.mapfre.com', ruta: '/EVT/app/contratacion/tarifas', pulsable } })
    const el: ElementoInventario = { tag: 'a', texto: 'Tarifas', hrefRuta: '/EVT/app/contratacion/tarifas' }
    const m = marco('https://wmediadores.mapfre.com/EVT/inicio', [el])
    expect(bloqueoAvance(E_MAPFRE, el, m)).toBe('boton_de_emision')
    const no = permisosNavegacionDe(E_MAPFRE, [fila(false)]).permisos
    expect(rutasHrefBd(no)).toEqual([])
    expect(bloqueoAvance(E_MAPFRE, el, m, no)).toBe('boton_de_emision')
    const si = permisosNavegacionDe(E_MAPFRE, [fila(true)]).permisos
    expect(bloqueoAvance(E_MAPFRE, el, m, si)).toBeNull()
    // …pero un TEXTO de acción final en el enlace sigue siendo emisión dura.
    const elc = { ...el, texto: 'Contratar' }
    expect(bloqueoAvance(E_MAPFRE, elc, marco('https://wmediadores.mapfre.com/EVT/inicio', [elc]), si)).toBe('boton_de_emision')
  })

  it('tarificación real: entradas de la compañía y ramo', () => {
    expect(entradasDeCompaniaRamo('pelayo', 'auto')).toEqual([E_PELAYO])
    expect(entradasDeCompaniaRamo('nadie', 'auto')).toEqual([])
  })
})
