// Cepos del EXPLORADOR IA (13/10/2026). Fixtures SINTÉTICAS: ningún dato personal real (NIF, correo y teléfono inventados).
import { describe, it, expect } from 'vitest'
import {
  ACCIONES_EXPLORADOR,
  catalogoParaIA,
  comprobarTopes,
  construirMapa,
  costeMaximoLlamada,
  detectarBucle,
  detectarParada,
  huellaPantalla,
  normalizarRedNoGet,
  planDesdeMapa,
  resolverDato,
  sanearInventarioDom,
  topesExplorador,
  TOPES_EXPLORADOR,
  validarMapa,
  validarRespuestaExplorador,
  type InventarioDom,
  type RespuestaExplorador,
} from './index.ts'

const ENTRADA = 'allianz:particulares:hogar'

/** Inventario de una pantalla «Datos básicos» de Hogar inventada. */
function inventario(extra: { titulos?: string[]; elementos?: unknown[]; importes?: unknown[]; url?: string } = {}): InventarioDom {
  return sanearInventarioDom(
    {
      marcos: [
        {
          url: extra.url ?? 'https://portal.example.test/epac/alta?sid=1',
          nombre: 'appArea',
          titulos: extra.titulos ?? ['Datos básicos'],
          importes: extra.importes,
          elementos: extra.elementos ?? [
            { tag: 'input', id: 'superficie', type: 'text', etiqueta: 'Superficie (m²)', requerido: true, conValor: false },
            { tag: 'select', id: 'tipoVivienda', etiqueta: 'Tipo de vivienda', opciones: [{ valor: '1', texto: 'Piso' }, { valor: '2', texto: 'Chalet' }] },
            { tag: 'input', id: 'regimenProp', type: 'radio', etiqueta: 'Propietario' },
            { tag: 'input', id: 'rgpdSi', type: 'radio', etiqueta: 'Acepto la cesión de datos' },
            { tag: 'input', id: 'publi', type: 'checkbox', etiqueta: 'Publicidad' },
            { tag: 'button', id: 'btnAceptarBasicos', texto: 'Aceptar' },
            { tag: 'button', id: 'btnSiguiente', texto: 'Siguiente' },
            { tag: 'button', id: 'btnEmitir', texto: 'Emitir' },
            { tag: 'input', id: 'nifTomador', type: 'text', etiqueta: 'NIF' },
            { tag: 'input', id: 'garaje', type: 'checkbox', etiqueta: 'Garaje' },
            { tag: 'button', id: 'btnOk', texto: 'Aceptar', onclick: 'validar_aceptar()' },
          ],
        },
      ],
    },
    undefined,
    { refs: true },
  )!
}

const ref = (inv: InventarioDom, id: string) => inv.marcos[0].elementos.find((e) => e.id === id)!.ref!
const ctx = (inv: InventarioDom) => ({ inventario: inv, ramo: 'hogar', entrada: ENTRADA })

describe('inventario con refs (explorador)', () => {
  it('asigna refs estables y la segunda pasada (asegura) las CONSERVA', () => {
    const inv = inventario()
    expect(ref(inv, 'superficie')).toBe('m0e0')
    const otraVez = sanearInventarioDom(JSON.parse(JSON.stringify(inv)), undefined, { refs: true })!
    expect(otraVez.marcos[0].elementos.map((e) => e.ref)).toEqual(inv.marcos[0].elementos.map((e) => e.ref))
    // Una ref repetida en el cable no se puede señalar sin ambigüedad: fuera.
    const dup = sanearInventarioDom({ marcos: [{ url: 'x', elementos: [{ tag: 'input', ref: 'm0e5' }, { tag: 'button', ref: 'm0e5' }, { tag: 'button' }] }] }, undefined, { refs: true })!
    expect(dup.marcos[0].elementos.map((e) => e.ref)).toEqual(['m0e5', 'm0e2'])
  })

  it('importes: solo el número; un texto que no es importe se descarta', () => {
    const inv = inventario({ importes: [{ texto: '1.234,56 €', etiqueta: 'Prima total' }, { texto: 'Llame al 600 000 000' }, { texto: '2019' }] })
    expect(inv.marcos[0].importes).toEqual([{ ref: 'm0p0', eur: 1234.56, etiqueta: 'Prima total' }])
  })

  it('CABECERA de ePAC: código y nombre del mediador y «último acceso» no pasan, ni el nombre donde reaparezca', () => {
    const inv = sanearInventarioDom(
      {
        marcos: [{
          url: 'https://portal.example.test/home',
          titulos: ['Bienvenido'],
          elementos: [
            { tag: 'td', onclick: 'x()', texto: '999-Z/12/0000 - Nombreinventado Apellidoficticio' },
            { tag: 'label', texto: 'Último acceso: 01/01/2026 10:00' },
            { tag: 'button', texto: 'Perfil de Nombreinventado Apellidoficticio' },
            { tag: 'a', role: 'button', id: 'usuarioCabecera', texto: 'Cosme Fulanito' },
            { tag: 'td', onclick: 'y()', texto: '998-Y/34/0001' },
            { tag: 'button', texto: 'Nueva alta', id: 'nuevaAlta' },
          ],
        }],
      },
      undefined,
      { refs: true },
    )!
    const s = JSON.stringify(inv)
    for (const d of ['999-Z', '998-Y', 'Nombreinventado', '01/01/2026', 'Cosme']) expect(s).not.toContain(d)
    expect(inv.marcos[0].elementos.at(-1)).toMatchObject({ texto: 'Nueva alta' })
    expect(inv.textosDescartados).toBe(5)
  })
})

describe('catálogo y resolución de datos', () => {
  const base = { ramo: 'hogar', riesgo: {}, env: {}, hoy: new Date('2026-10-13T10:00:00Z') }

  it('la IA no ve valores de datos personales (solo su clave)', () => {
    const c = catalogoParaIA('hogar')
    const nif = c.find((d) => d.clave === 'tomador.nif')!
    expect(nif).toEqual({ clave: 'tomador.nif', descripcion: expect.any(String), tipo: 'texto' })
    expect(c.find((d) => d.clave === 'tomador.nombre')!.pista).toBeUndefined()
    expect(c.find((d) => d.clave === 'inmueble.superficie_m2')!.pista).toBe('90')
  })

  it('sin petición real: lo personal es sintético y el NIF PARA', () => {
    expect(resolverDato('tomador.nombre_completo', { ...base, conDatosReales: false })).toEqual({ ok: true, valor: 'PRUEBA EXPLORADOR IA' })
    expect(resolverDato('tomador.nif', { ...base, conDatosReales: false, riesgo: { tomador: { nif: '00000000T' } } })).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
  })

  it('con petición real: lo personal sale del riesgo o PARA (nunca un nombre de prueba junto a un NIF real)', () => {
    const real = { ...base, conDatosReales: true, riesgo: { tomador: { nif: '00000000T' }, inmueble: { superficieM2: 120 } } }
    expect(resolverDato('tomador.nif', real)).toEqual({ ok: true, valor: '00000000T' })
    expect(resolverDato('tomador.nombre', real)).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    expect(resolverDato('inmueble.superficie_m2', real)).toEqual({ ok: true, valor: '120' })
    expect(resolverDato('inmueble.anio_construccion', real)).toEqual({ ok: true, valor: '1990' })
  })

  it('contacto solo de entorno; sin entorno o mal formado → para', () => {
    expect(resolverDato('contacto.email', { ...base, conDatosReales: false })).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    expect(resolverDato('contacto.email', { ...base, conDatosReales: false, env: { TARIFICADOR_EXPLORADOR_EMAIL: 'no-es-correo' } }).ok).toBe(false)
    expect(resolverDato('contacto.telefono', { ...base, conDatosReales: false, env: { TARIFICADOR_EXPLORADOR_TELEFONO: '600000000' } })).toEqual({ ok: true, valor: '600000000' })
    expect(resolverDato('efecto.fecha', { ...base, conDatosReales: false })).toEqual({ ok: true, valor: '14/10/2026' })
    expect(resolverDato('inventada', { ...base, conDatosReales: false })).toEqual({ ok: false, motivo: 'clave_desconocida' })
  })
})

describe('validarRespuestaExplorador', () => {
  const inv = inventario()
  const buena = (acciones: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, pantalla: { nombre: 'Datos básicos', tipo: 'formulario' }, acciones, mapeo: [], motivo: null, ...extra })

  it('acepta un lote correcto (rellenar clave, elegir opción del inventario, marcar radio, Aceptar autorizado al final)', () => {
    const r = validarRespuestaExplorador(
      '```json\n' + JSON.stringify(buena([
        { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
        { accion: 'elegir', ref: ref(inv, 'tipoVivienda'), opcion: { valor: '1' } },
        { accion: 'marcar', ref: ref(inv, 'regimenProp') },
        { accion: 'avanzar', ref: ref(inv, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' },
      ], { mapeo: [{ ref: ref(inv, 'tipoVivienda'), campoCanonico: 'hogar.tipo_vivienda', confianza: 'alta' }] })) + '\n```',
      ctx(inv),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.respuesta.acciones).toHaveLength(4)
  })

  const casos: [string, unknown][] = [
    ['clave de respuesta desconocida', { ...buena([{ accion: 'parar', motivo: 'ambiguo' }]), js: 'x' }],
    ['texto libre en rellenar (valor en vez de clave)', buena([{ accion: 'rellenar', ref: 'm0e0', dato: '90' }])],
    ['valor escrito por la IA', buena([{ accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2', valor: '90' }])],
    ['acción fuera de lista', buena([{ accion: 'navegar', url: 'https://x.test' }])],
    ['ref inexistente', buena([{ accion: 'rellenar', ref: 'm9e9', dato: 'inmueble.superficie_m2' }])],
    ['opción que no está en el inventario', buena([{ accion: 'elegir', ref: 'm0e1', opcion: { valor: '99' } }])],
    ['marcar un checkbox', buena([{ accion: 'marcar', ref: 'm0e9' }])],
    ['marcar un radio de consentimiento', buena([{ accion: 'marcar', ref: 'm0e3' }])],
    ['pulsar Emitir', buena([{ accion: 'avanzar', ref: 'm0e7', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])],
    ['«Aceptar» autorizado por texto pero que llama a validar_aceptar() (contrata)', buena([{ accion: 'avanzar', ref: 'm0e10', efectoEsperado: 'calcular', confianza: 'alta' }])],
    ['avanzar con confianza baja', buena([{ accion: 'avanzar', ref: 'm0e6', efectoEsperado: 'siguiente_pantalla', confianza: 'baja' }])],
    ['avanzar que no es el último', buena([{ accion: 'avanzar', ref: 'm0e6', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }, { accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2' }])],
    ['parar acompañado', buena([{ accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2' }, { accion: 'parar', motivo: 'ambiguo' }])],
    ['motivo de parada inventado', buena([{ accion: 'parar', motivo: 'me apetece' }])],
    ['terminar sin importes en pantalla', buena([{ accion: 'terminar', refsPrecio: ['m0p0'] }])],
    ['mapeo a campo fuera del catálogo', buena([{ accion: 'parar', motivo: 'ambiguo' }], { mapeo: [{ ref: 'm0e0', campoCanonico: 'tomador.iban', confianza: 'alta' }] })],
    ['dato personal en el nombre de pantalla', buena([{ accion: 'parar', motivo: 'ambiguo' }], { pantalla: { nombre: 'Cliente 00000000T', tipo: 'formulario' } })],
    ['rellenar un select', buena([{ accion: 'rellenar', ref: 'm0e1', dato: 'hogar.tipo_vivienda' }])],
    ['ref repetida', buena([{ accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2' }, { accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.planta' }])],
    ['no es JSON', 'lo siento, no puedo'],
  ]
  for (const [nombre, entrada] of casos) {
    it(`rechaza: ${nombre}`, () => expect(validarRespuestaExplorador(entrada, ctx(inv)).ok).toBe(false))
  }

  it('«Aceptar» solo en la pantalla autorizada: en Tarificar (o sin título de Datos básicos) se rechaza', () => {
    const a = (i: InventarioDom) => validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' }]), ctx(i)).ok
    expect(a(inventario())).toBe(true)
    expect(a(inventario({ titulos: ['Datos básicos', 'Tarificar'] }))).toBe(false)
    expect(a(inventario({ titulos: ['Coberturas'] }))).toBe(false)
    // Otra entrada sin avances autorizados.
    const i = inventario()
    expect(validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' }]), { ...ctx(i), entrada: 'otra:cosa' }).ok).toBe(false)
  })

  it('la lista blanca de acciones está CONGELADA', () => {
    expect([...ACCIONES_EXPLORADOR]).toEqual(['rellenar', 'elegir', 'marcar', 'avanzar', 'terminar', 'parar'])
  })
})

describe('paradas, bucle y topes', () => {
  it('para ante OTP/SMS, CAPTCHA y pantallas de emisión; no ante «Forma de pago» como desplegable', () => {
    expect(detectarParada(inventario({ elementos: [{ tag: 'label', texto: 'Introduzca el código de verificación enviado por SMS' }] }))?.motivo).toBe('otp')
    expect(detectarParada(inventario({ url: 'https://www.google.com/recaptcha/api2/anchor' }))?.motivo).toBe('captcha')
    expect(detectarParada(inventario({ elementos: [{ tag: 'label', texto: 'No soy un robot' }] }))?.motivo).toBe('captcha')
    for (const t of ['Revisión', 'Forma de pago', 'Firma del contrato', 'Emitir póliza', 'Formalizar', 'Grabar', 'Archivar', 'Contratar']) {
      expect(detectarParada(inventario({ titulos: [t] }))?.motivo, t).toBe('cerca_de_emision')
    }
    expect(detectarParada(inventario({ elementos: [{ tag: 'input', id: 'iban', etiqueta: 'IBAN' }] }))?.motivo).toBe('cerca_de_emision')
    expect(detectarParada(inventario({ elementos: [{ tag: 'select', id: 'fp', etiqueta: 'Forma de pago', opciones: [{ valor: 'A', texto: 'Anual' }] }] }))).toBeNull()
    expect(detectarParada(inventario())).toBeNull()
  })

  it('huella estable ante textos y valores; distinta si cambian los controles', () => {
    const a = huellaPantalla(inventario())
    expect(huellaPantalla(inventario({ titulos: ['Otro título'] }))).toBe(a)
    expect(huellaPantalla(inventario({ elementos: [{ tag: 'input', id: 'otro' }] }))).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('bucle: tercera huella igual seguida o dos avances fallidos', () => {
    expect(detectarBucle(['a', 'b'], 'b', 0)).toBe(false)
    expect(detectarBucle(['a', 'b', 'b'], 'b', 0)).toBe(true)
    expect(detectarBucle(['b', 'a', 'b'], 'b', 0)).toBe(false)
    expect(detectarBucle([], 'x', 2)).toBe(true)
  })

  it('topes: el entorno solo los BAJA; el coste se mira ANTES de la llamada', () => {
    expect(topesExplorador({ TARIFICADOR_EXPLORADOR_MAX_EUR: '50', TARIFICADOR_EXPLORADOR_MAX_LLAMADAS: '5' })).toMatchObject({ maxEur: 2, maxLlamadas: 5 })
    expect(topesExplorador({ TARIFICADOR_EXPLORADOR_MAX_EUR: 'x' }).maxEur).toBe(2)
    const c = { llamadas: 3, acciones: 10, eur: 1.95, ms: 1000, pasos: 3 }
    expect(comprobarTopes(c, TOPES_EXPLORADOR, 0.01)).toBeNull()
    expect(comprobarTopes(c, TOPES_EXPLORADOR, 0.06)).toBe('tope_coste')
    expect(comprobarTopes({ ...c, eur: 0, ms: 16 * 60_000 }, TOPES_EXPLORADOR, 0)).toBe('tope_tiempo')
    expect(comprobarTopes({ ...c, eur: 0, llamadas: 30 }, TOPES_EXPLORADOR, 0)).toBe('tope_llamadas')
    // Modelo desconocido: precio alto (para antes).
    expect(costeMaximoLlamada('x/y', 30_000, 1000)).toBeGreaterThan(costeMaximoLlamada('anthropic/claude-sonnet-4.5', 30_000, 1000))
  })
})

describe('mapa determinista y memoria', () => {
  const inv = inventario()
  const respuesta: RespuestaExplorador = {
    version: 1, pantalla: { nombre: 'Datos básicos', tipo: 'formulario' }, motivo: null,
    acciones: [
      { accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' },
      { accion: 'elegir', ref: ref(inv, 'tipoVivienda'), opcion: { valor: '1' } },
      { accion: 'avanzar', ref: ref(inv, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' },
    ],
    mapeo: [{ ref: ref(inv, 'tipoVivienda'), campoCanonico: 'hogar.tipo_vivienda', confianza: 'alta' }],
  }
  const meta = { entrada: ENTRADA, compania: 'allianz', producto: 'hogar', modelo: 'anthropic/claude-sonnet-4.5', fecha: '2026-10-13', efectosEnPortal: [] as never[], redNoGet: [], coste: { llamadas: 1, eurEstimado: 0.05 }, motivoFin: null }

  it('construye el mapa con selectores estables, avance autorizado y huecos explícitos', () => {
    const mapa = construirMapa(meta, [{ huella: huellaPantalla(inv), inventario: inv, respuesta }])
    expect(mapa.pantallas[0].campos.map((c) => [c.selector, c.campoCanonico])).toEqual([
      [{ por: 'id', valor: 'superficie', tag: 'input' }, 'inmueble.superficie_m2'],
      [{ por: 'id', valor: 'tipoVivienda', tag: 'select' }, 'hogar.tipo_vivienda'],
    ])
    expect(mapa.pantallas[0].avance).toMatchObject({ tipo: 'aceptar_autorizado', efecto: 'calcular' })
    expect(mapa.huecos).toContain('no se llegó a la pantalla de resultado (precio)')
    expect(validarMapa(JSON.parse(JSON.stringify(mapa)))).not.toBeNull()
    expect(validarMapa({ ...mapa, version: 2 })).toBeNull()
  })

  it('memoria: la misma pantalla se rellena desde el mapa sin IA (y valida); si falta un campo, vuelve a la IA', () => {
    const mapa = construirMapa(meta, [{ huella: huellaPantalla(inv), inventario: inv, respuesta }])
    const plan = planDesdeMapa(mapa.pantallas[0], inventario())!
    expect(plan.acciones.map((a) => a.accion)).toEqual(['rellenar', 'elegir', 'avanzar'])
    expect(validarRespuestaExplorador(plan, ctx(inventario())).ok).toBe(true)
    const sinSuperficie = inventario({ elementos: [{ tag: 'select', id: 'tipoVivienda', opciones: [{ valor: '1', texto: 'Piso' }] }, { tag: 'button', id: 'btnAceptarBasicos', texto: 'Aceptar' }] })
    expect(planDesdeMapa(mapa.pantallas[0], sinSuperficie)).toBeNull()
  })

  it('red no-GET: solo origen + ruta, sin query ni datos', () => {
    expect(normalizarRedNoGet('https://Portal.Example.test/drpc/main/control.do?action=rate&nif=1')).toBe('https://portal.example.test/drpc/main/control.do')
    expect(normalizarRedNoGet('https://portal.example.test/cliente/00000000T')).toBeNull()
    expect(normalizarRedNoGet('javascript:alert(1)')).toBeNull()
  })
})
