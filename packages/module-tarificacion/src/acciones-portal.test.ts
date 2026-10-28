// Cepos de la LISTA ÚNICA de acciones de portal y del GUARDADO DE PRESUPUESTO del explorador (14/10/2026). Fixtures
// SINTÉTICAS (sin datos personales). Decisión de Alberto: guardar el presupuesto SÍ (solo en resultado); emitir NUNCA.
import { describe, it, expect } from 'vitest'
import {
  ACCIONES_PORTAL,
  avisoGuardadoPortalDeAvisos,
  referenciaPortalValida,
  CAMPOS_BANCARIOS,
  detectarParada,
  bloqueoGuardadoPresupuesto,
  descripcionesSinExcepcionProyecto,
  EXCEPCION_PROYECTO_AMPLIADO,
  fronteraEmisionPorCampos,
  RE_CAMPO_CUENTA_BANCARIA,
  senalCuentaBancaria,
  PATRONES_GUARDADO_GUARD,
  TEXTOS_BLOQUEADOS_ALTA,
  clasificarAccionPortal,
  comprobarBoton,
  construirMapa,
  extraerReferenciaPresupuesto,
  leerPresupuestoMapa,
  lineaAccionesPortalParaIA,
  nombresAccionesPortal,
  parametrosParecenEmision,
  pareceEmision,
  planDesdeMapa,
  presupuestoEnCursoDe,
  sanearInventarioDom,
  validarMapa,
  validarRespuestaExplorador,
  type InventarioDom,
  type RespuestaExplorador,
} from './index.ts'

const ENTRADA = 'allianz:particulares:hogar'

/** Pantalla con botones de guardado y de emisión; `conPrecio` añade importes (pantalla de resultado). */
function pantalla(conPrecio: boolean, titulo = 'Tarificación'): InventarioDom {
  return sanearInventarioDom(
    {
      marcos: [
        {
          url: 'https://portal.example.test/epac/tarifa',
          titulos: [{ texto: titulo, tag: 'h2' }],
          importes: conPrecio ? [{ texto: '347,55 €', etiqueta: 'Prima total' }] : [],
          elementos: [
            { tag: 'input', id: 'superficie', type: 'text', etiqueta: 'Superficie (m²)' },
            { tag: 'button', id: 'btnGuardar', texto: 'Guardar presupuesto' },
            { tag: 'button', id: 'btnGrabar', texto: 'Grabar' },
            // td#store del ePAC: «Archivar», onclick sendActionEvent('store').
            { tag: 'td', id: 'store', texto: 'Archivar', onclick: "sendActionEvent('store')" },
            { tag: 'button', id: 'btnPdf', texto: 'Descargar PDF' },
            { tag: 'button', id: 'btnEmitir', texto: 'Emitir' },
            { tag: 'button', id: 'btnContratar', texto: 'Contratar' },
            { tag: 'td', id: 'contract', texto: 'Emitir', onclick: 'validar_aceptar()' },
            { tag: 'button', id: 'btnGuardarEmitir', texto: 'Guardar y emitir' },
            { tag: 'button', id: 'btnFirmar', texto: 'Firmar' },
            { tag: 'button', id: 'btnPagar', texto: 'Pagar' },
            { tag: 'button', id: 'btnDomiciliar', texto: 'Domiciliar recibo' },
            { tag: 'button', id: 'btnTramitar', texto: 'Tramitar póliza' },
            { tag: 'button', id: 'btnConfirmar', texto: 'Confirmar contratación' },
            { tag: 'button', id: 'btnFracciona', texto: 'Pago fraccionado' },
            { tag: 'button', id: 'btnAmpliado', texto: 'Proyecto ampliado' },
            { tag: 'button', id: 'btnAmpliadoEmitir', texto: 'Proyecto ampliado y emitir' },
            { tag: 'button', id: 'guardarOk', texto: 'Guardar', onclick: 'btnAceptar()' },
            { tag: 'button', id: 'btnSiguiente', texto: 'Siguiente' },
          ],
        },
      ],
    },
    undefined,
    { refs: true },
  )!
}

const ref = (inv: InventarioDom, id: string) => inv.marcos[0].elementos.find((e) => e.id === id)!.ref!
const resp = (inv: InventarioDom, id: string, tipo: string, efecto = 'guardar_presupuesto') => ({
  version: 1,
  pantalla: { nombre: 'P', tipo },
  acciones: [{ accion: 'avanzar', ref: ref(inv, id), efectoEsperado: efecto, confianza: 'alta' }],
  mapeo: [],
  motivo: null,
})
const ctx = (inv: InventarioDom, presupuestoEnCurso = false) => ({ inventario: inv, ramo: 'hogar', entrada: ENTRADA, datosReales: null, presupuestoEnCurso })

describe('lista única de acciones de portal', () => {
  it('tres categorías; emisión y guardar con lo que pidió Alberto', () => {
    expect(nombresAccionesPortal('emision')).toEqual(expect.arrayContaining(['Emitir', 'Contratar', 'Formalizar', 'Firmar', 'Pagar / Pago', 'Tramitar póliza', 'Confirmar contratación', 'Domiciliar', 'Pago fraccionado']))
    expect(nombresAccionesPortal('guardar_presupuesto')).toEqual(['Grabar', 'Guardar (presupuesto / proyecto)', 'Archivar', 'Proyecto ampliado', 'Descargar', 'Imprimir', 'Generar PDF'])
    // «Proyecto ampliado» (Alberto, 14/10/2026): es el proyecto que hay que descargarse → GUARDAR, no prohibida.
    expect(nombresAccionesPortal('prohibida')).not.toContain('Proyecto ampliado')
    expect(clasificarAccionPortal(['Proyecto ampliado']).guardar).toBe('Proyecto ampliado')
    expect(clasificarAccionPortal(['Proyecto ampliado']).prohibida).toBeNull()
    // Compuesto con emisión: MANDA emisión.
    expect(clasificarAccionPortal(['Proyecto ampliado y emitir']).emision).not.toBeNull()
    expect(ACCIONES_PORTAL.every((a) => Object.isFrozen(a))).toBe(true)
  })

  it.each(['Emitir', 'Emisión', 'Contratar', 'Formalizar', 'Firmar', 'Pagar', 'Pago', 'Tramitar póliza', 'Confirmar contratación', 'Domiciliar', 'Pago fraccionado', 'validar_aceptar()', 'contract'])(
    '«%s» es EMISIÓN',
    (t) => expect(clasificarAccionPortal([t]).emision).not.toBeNull(),
  )

  it.each(['Grabar', 'Guardar', 'Guardar presupuesto', 'Guardar proyecto', 'Archivar', 'Descargar', 'Imprimir', 'Generar PDF', 'Proyecto ampliado', 'store', "sendActionEvent('store')"])(
    '«%s» es GUARDAR PRESUPUESTO y no emisión',
    (t) => {
      const c = clasificarAccionPortal([t])
      expect(c.guardar).not.toBeNull()
      expect(c.emision).toBeNull()
    },
  )

  it('el prompt sale de la lista', () => {
    const l = lineaAccionesPortalParaIA()
    expect(l.emision).toContain('Tramitar póliza')
    expect(l.guardar).toContain('Archivar')
    expect(l.guardar).toContain('Proyecto ampliado')
    expect(l.prohibidas).not.toContain('Proyecto ampliado')
  })
})

describe('guard: permitirGuardarPresupuesto abre SOLO Archivar', () => {
  it('sin la opción, Archivar / store siguen bloqueados (como siempre)', () => {
    for (const t of ['Archivar', 'store', "sendActionEvent('store')", 'Proyecto ampliado', 'menu4']) expect(pareceEmision(t)).toBe(true)
    expect(parametrosParecenEmision('action=store')).toBe(true)
    expect(() => comprobarBoton(['Archivar'], { permitirAceptar: true })).toThrow()
  })
  it('con la opción, Archivar pasa; emitir, contract, validar_aceptar, aceptar, ampliado y fraccionado NO', () => {
    const op = { permitirGuardarPresupuesto: true }
    for (const t of ['Archivar', 'store', "sendActionEvent('store')", 'Proyecto ampliado', 'menu4']) expect(pareceEmision(t, op), t).toBe(false)
    expect(parametrosParecenEmision('action=store', op)).toBe(false)
    for (const t of ['Emitir', 'contract', 'validar_aceptar()', 'Aceptar', 'Proyecto ampliado y emitir', 'Emitir proyecto ampliado', 'Pago fraccionado', 'menu3', 'menu5', 'btnAccept', 'Datos emisión'])
      expect(pareceEmision(t, op), t).toBe(true)
    expect(parametrosParecenEmision('action=contract', op)).toBe(true)
    expect(parametrosParecenEmision("x=sendActionEvent('contract')", op)).toBe(true)
  })
  it('los patrones de Archivar SIGUEN en la lista del guard (no se quitaron)', () => {
    for (const r of PATRONES_GUARDADO_GUARD) expect(TEXTOS_BLOQUEADOS_ALTA).toContain(r)
  })
})

describe('validador: GUARDAR presupuesto solo en resultado; EMITIR nunca', () => {
  // CEPO (a): Guardar en pantalla FORMULARIO sin precio → rechazado.
  it('(a) Guardar/Grabar/Archivar en formulario SIN precio → rechazado', () => {
    const inv = pantalla(false, 'Datos del riesgo')
    for (const id of ['btnGuardar', 'btnGrabar', 'store', 'btnAmpliado']) {
      const v = validarRespuestaExplorador(resp(inv, id, 'formulario'), ctx(inv))
      expect(v.ok, id).toBe(false)
    }
    // Ni declarándola «resultado» sin importes ni guardado previo.
    expect(validarRespuestaExplorador(resp(inv, 'btnGuardar', 'resultado'), ctx(inv)).ok).toBe(false)
  })

  it('(a) con importes pero pantalla «formulario» → rechazado (guardar_fuera_de_resultado)', () => {
    const inv = pantalla(true)
    const v = validarRespuestaExplorador(resp(inv, 'btnGuardar', 'formulario'), ctx(inv))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errores.join(' ')).toMatch(/guardar_fuera_de_resultado/)
  })

  // CEPO (b): Guardar en pantalla RESULTADO (con importes) → aceptado.
  it('(b) Guardar / Grabar / Archivar / Descargar PDF / Proyecto ampliado en RESULTADO con precio → aceptado', () => {
    const inv = pantalla(true)
    for (const id of ['btnGuardar', 'btnGrabar', 'store', 'btnPdf', 'btnAmpliado']) {
      const v = validarRespuestaExplorador(resp(inv, id, 'resultado'), ctx(inv))
      expect(v.ok, `${id}: ${v.ok ? '' : v.errores.join(' | ')}`).toBe(true)
    }
  })

  it('guardar SIN efecto guardar_presupuesto (como navegación) → rechazado, también en resultado', () => {
    const inv = pantalla(true)
    for (const efecto of ['siguiente_pantalla', 'ver_resultado', 'calcular']) for (const id of ['btnGuardar', 'btnAmpliado']) {
      const v = validarRespuestaExplorador(resp(inv, id, 'resultado', efecto), ctx(inv))
      expect(v.ok, `${id} / ${efecto}`).toBe(false)
    }
  })

  it('efecto guardar_presupuesto sobre un botón que NO es de guardar → rechazado', () => {
    const inv = pantalla(true)
    expect(validarRespuestaExplorador(resp(inv, 'btnSiguiente', 'resultado'), ctx(inv)).ok).toBe(false)
  })

  // CEPO (c): Emitir/Contratar en resultado → rechazado SIEMPRE (con cualquier efecto, y aunque ya se guardara).
  it('(c) Emitir / Contratar / firmar / pagar… en RESULTADO → rechazado con cualquier efecto', () => {
    const inv = pantalla(true)
    const ids = ['btnEmitir', 'btnContratar', 'contract', 'btnGuardarEmitir', 'btnFirmar', 'btnPagar', 'btnDomiciliar', 'btnTramitar', 'btnConfirmar', 'btnFracciona', 'btnAmpliadoEmitir', 'guardarOk']
    for (const id of ids) for (const efecto of ['guardar_presupuesto', 'siguiente_pantalla', 'ver_resultado']) for (const previo of [false, true]) {
      const v = validarRespuestaExplorador(resp(inv, id, 'resultado', efecto), ctx(inv, previo))
      expect(v.ok, `${id} / ${efecto} / previo=${previo}`).toBe(false)
    }
  })

  it('tras guardar (presupuestoEnCurso): Descargar en la pantalla siguiente sin importes → aceptado; terminar sin refs → aceptado', () => {
    const inv = pantalla(false, 'Proyecto archivado')
    expect(validarRespuestaExplorador(resp(inv, 'btnPdf', 'resultado'), ctx(inv, true)).ok).toBe(true)
    const term = { version: 1, pantalla: { nombre: 'P', tipo: 'resultado' }, acciones: [{ accion: 'terminar', refsPrecio: [] }], mapeo: [], motivo: null }
    expect(validarRespuestaExplorador(term, ctx(inv, true)).ok).toBe(true)
    // Sin guardado previo, terminar sin importes sigue rechazado.
    expect(validarRespuestaExplorador(term, ctx(inv, false)).ok).toBe(false)
  })

  it('presupuestoEnCursoDe: solo cuenta un avanzar guardar_presupuesto validado', () => {
    const inv = pantalla(true)
    const v = validarRespuestaExplorador(resp(inv, 'btnGuardar', 'resultado'), ctx(inv))
    expect(v.ok).toBe(true)
    expect(presupuestoEnCursoDe([null, v.ok ? v.respuesta : null])).toBe(true)
    expect(presupuestoEnCursoDe([null])).toBe(false)
  })
})

describe('mapa: pantalla de guardado y presupuesto', () => {
  it('el avance de guardado entra en el mapa como tipo guardar_presupuesto, marca el resultado y se reutiliza', () => {
    const inv = pantalla(true)
    const v = validarRespuestaExplorador(resp(inv, 'store', 'resultado'), ctx(inv))
    expect(v.ok).toBe(true)
    const r = (v as { ok: true; respuesta: RespuestaExplorador }).respuesta
    const mapa = construirMapa(
      { entrada: ENTRADA, compania: 'allianz', producto: 'hogar', modelo: null, fecha: '2026-10-14', efectosEnPortal: ['presupuesto_guardado'], redNoGet: [], coste: { llamadas: 1, eurEstimado: 0.01 }, motivoFin: 'resultado', presupuesto: { guardado: true, referencia: 'P2026-000123', pdf: true } },
      [{ huella: 'aaaaaaaaaaaaaaaa', inventario: inv, respuesta: r }],
    )
    expect(mapa.pantallas[0].avance).toMatchObject({ efecto: 'guardar_presupuesto', tipo: 'guardar_presupuesto' })
    expect(mapa.resultado.alcanzado).toBe(true)
    expect(mapa.presupuesto).toEqual({ guardado: true, referencia: 'P2026-000123', pdf: true })
    expect(validarMapa(JSON.parse(JSON.stringify(mapa)))).not.toBeNull()
    const plan = planDesdeMapa(mapa.pantallas[0], inv)!
    expect(validarRespuestaExplorador(plan, ctx(inv)).ok).toBe(true)
    // Un mapa con tipo y efecto descasados no vale.
    const roto = JSON.parse(JSON.stringify(mapa))
    roto.pantallas[0].avance.tipo = 'navegacion'
    expect(validarMapa(roto)).toBeNull()
  })

  it('leerPresupuestoMapa: forma estricta, tres estados y sin datos personales', () => {
    expect(leerPresupuestoMapa({ guardado: false, referencia: null, pdf: null })).toEqual({ guardado: false, referencia: null, pdf: null })
    expect(leerPresupuestoMapa({ guardado: true, referencia: null, pdf: false })).not.toBeNull()
    expect(leerPresupuestoMapa({ guardado: false, referencia: 'P1234', pdf: null })).toBeNull()
    for (const pii of ['12345678Z', 'X1234567L', '612345678', 'ES9121000418450200051332', '4111111111111111'])
      expect(leerPresupuestoMapa({ guardado: true, referencia: pii, pdf: true }), pii).toBeNull()
    expect(leerPresupuestoMapa({ guardado: true, referencia: 'x y', pdf: true })).toBeNull()
    expect(leerPresupuestoMapa({ guardado: true, referencia: null, pdf: true, otra: 1 })).toBeNull()
  })
})

describe('referencia del presupuesto', () => {
  it.each([
    ['Referencia: P2026-000123', 'P2026-000123'],
    ['Nº de presupuesto: 123456789', '123456789'],
    ['Número de proyecto 2026/000777.', '2026/000777'],
    ['El proyecto nº 55667788 se ha archivado', '55667788'],
    ['Referencia del presupuesto #AB12CD', 'AB12CD'],
  ])('«%s» → %s', (t, esperado) => expect(extraerReferenciaPresupuesto(t)).toBe(esperado))

  it.each(['Prima total 347,55 €', 'Referencia: pendiente', 'Presupuesto guardado correctamente', '', 'Referencia: 12345678Z', 'Nº de presupuesto: 612345678'])('«%s» → null (no se vio)', (t) => {
    expect(extraerReferenciaPresupuesto(t)).toBeNull()
  })
})

describe('frontera de emisión por campos: IBAN / cuenta bancaria (14/10/2026)', () => {
  const pantallaCampos = (elementos: object[]) => sanearInventarioDom({ marcos: [{ url: 'https://portal.example.test/epac/datos', titulos: [{ texto: 'Datos', tag: 'h2' }], importes: [], elementos }] }, undefined, { refs: true })!

  it.each([
    [{ tag: 'input', type: 'text', etiqueta: 'IBAN', placeholder: 'ES00 0000 0000 0000 0000 0000' }, 'IBAN'],
    [{ tag: 'input', type: 'text', id: 'txtIBAN' }, 'IBAN'],
    [{ tag: 'input', type: 'text', name: 'cuenta_bancaria' }, 'Cuenta bancaria'],
    [{ tag: 'input', type: 'text', etiqueta: 'Número de cuenta' }, 'Número de cuenta'],
    [{ tag: 'input', type: 'text', etiqueta: 'Nº cuenta' }, 'Número de cuenta'],
    [{ tag: 'select', etiqueta: 'Domiciliación del recibo' }, 'Domiciliación'],
    [{ tag: 'input', type: 'text', etiqueta: 'Titular de la cuenta' }, 'Titular de la cuenta'],
    [{ tag: 'input', type: 'text', etiqueta: 'Entidad bancaria' }, 'Entidad bancaria'],
    [{ tag: 'input', type: 'text', name: 'swift_bic' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', placeholder: 'BIC' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', etiqueta: 'Código SWIFT' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', id: 'swiftCode' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', etiqueta: 'Swift' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', name: 'SWIFT' }, 'SWIFT / BIC'],
    [{ tag: 'input', type: 'text', id: 'codigo_iban' }, 'IBAN'],
    [{ tag: 'input', type: 'text', id: 'ibanCuenta' }, 'IBAN'],
    [{ tag: 'input', type: 'text', etiqueta: 'iban' }, 'IBAN'],
    [{ tag: 'input', type: 'text', id: 'txtNumCuenta' }, 'Número de cuenta'],
    [{ tag: 'input', type: 'text', etiqueta: 'Nro. de cuenta' }, 'Número de cuenta'],
    [{ tag: 'input', type: 'text', etiqueta: 'N.º de cuenta' }, 'Número de cuenta'],
    [{ tag: 'input', type: 'text', etiqueta: 'Domiciliar recibos' }, 'Domiciliación'],
    [{ tag: 'input', type: 'text', etiqueta: 'Datos bancarios' }, 'Datos bancarios'],
    [{ tag: 'input', type: 'text', id: 'datos_bancarios' }, 'Datos bancarios'],
  ])('campo %j → para con cerca_de_emision', (el, nombre) => {
    const p = detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: 'Superficie (m²)' }, el]))
    expect(p?.motivo).toBe('cerca_de_emision')
    expect(p?.senal).toContain(nombre)
  })

  it('con acentos y mayúsculas: «DOMICILIACIÓN», «Número DE Cuenta»', () => {
    for (const t of ['DOMICILIACIÓN', 'Número DE Cuenta', 'Titular de la CUENTA']) {
      expect(detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: t }]))?.motivo, t).toBe('cerca_de_emision')
    }
  })

  it('NEGATIVO: la fecha de efecto SOLA no para (también sale al tarificar); tampoco un campo normal', () => {
    expect(detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: 'Fecha de efecto' }]))).toBeNull()
    expect(detectarParada(pantallaCampos([{ tag: 'input', type: 'text', id: 'fechaEfecto' }, { tag: 'input', type: 'text', etiqueta: 'Superficie' }]))).toBeNull()
    expect(detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: 'Cuenta atrás' }, { tag: 'input', type: 'text', etiqueta: 'Bicicletas' }]))).toBeNull()
  })

  it.each([
    'Asistencia domiciliaria', 'Tenga en cuenta', 'Con cuenta propia', 'Ibáñez', 'Ibanez', 'Apellido: IBÁÑEZ',
    'Entidad financiera', 'Vehículo financiado por entidad financiera', 'Suzuki Swift', 'No tiene cuenta',
  ])('NEGATIVO falso positivo «%s» no para', (t) => {
    expect(detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: t }]))).toBeNull()
    expect(fronteraEmisionPorCampos([t]).frontera).toBe(false)
  })

  it('fecha de efecto JUNTO a un campo bancario: para y lo dice', () => {
    const p = detectarParada(pantallaCampos([{ tag: 'input', type: 'text', etiqueta: 'Fecha de efecto' }, { tag: 'input', type: 'text', etiqueta: 'IBAN' }]))
    expect(p?.motivo).toBe('cerca_de_emision')
    expect(p?.senal).toContain('fecha de efecto')
  })

  it('fronteraEmisionPorCampos es pura: fecha sola = sin frontera; banco = frontera; lista congelada', () => {
    expect(fronteraEmisionPorCampos(['Fecha de efecto'])).toEqual({ frontera: false, campoBancario: null, etiqueta: null, fechaEfecto: true })
    expect(fronteraEmisionPorCampos(['fecha efecto', 'iban'])).toEqual({ frontera: true, campoBancario: 'IBAN', etiqueta: 'iban', fechaEfecto: true })
    expect(fronteraEmisionPorCampos([null, undefined, ''])).toEqual({ frontera: false, campoBancario: null, etiqueta: null, fechaEfecto: false })
    expect(CAMPOS_BANCARIOS.every((c) => Object.isFrozen(c))).toBe(true)
  })

  // Fusión con #4617 (Mapfre): UNA fuente. La cobertura de su frontera vive en CAMPOS_BANCARIOS (un brazo por caso).
  it.each([
    ['CCC', 'Cuenta bancaria'], ['num_ccc', 'Cuenta bancaria'], ['numCCC', 'Cuenta bancaria'], ['Cuenta', 'Cuenta bancaria'],
    ['cuentaCliente', 'Cuenta bancaria'], ['no. de cuenta', 'Número de cuenta'], ['Nº de cuenta', 'Número de cuenta'],
    ['N.º cuenta', 'Número de cuenta'], ['Entidad - Oficina - DC', 'Entidad / oficina / DC'], ['Entidad/Oficina', 'Entidad / oficina / DC'],
    ['Dígito de control', 'Entidad / oficina / DC'], ['domiciliacionBancaria', 'Domiciliación'], ['domiciliarRecibos', 'Domiciliación'],
    ['cuentaBancaria', 'Cuenta bancaria'], ['ibanTomador', 'IBAN'],
  ])('cobertura Mapfre: «%s» → %s', (t, nombre) => {
    expect(fronteraEmisionPorCampos([t]).campoBancario).toBe(nombre)
    expect(senalCuentaBancaria([t])).toBe(t)
  })

  it.each(['Asistencia domiciliaria', 'Servicio domiciliario', 'Ibáñez', 'Suzuki Swift', 'El inmueble no cuenta con alarma', 'Oficina de la entidad mediadora', 'accc'])(
    'NEGATIVO también en la API del worker (senalCuentaBancaria): «%s»', (t) => {
      expect(senalCuentaBancaria([t])).toBeNull()
    })

  it('RE_CAMPO_CUENTA_BANCARIA es DERIVADO de CAMPOS_BANCARIOS (no una segunda lista)', () => {
    for (const c of CAMPOS_BANCARIOS) expect(RE_CAMPO_CUENTA_BANCARIA.source).toContain(c.patron.source)
  })

  it('título «Datos bancarios» (sin campos) también para', () => {
    const inv = sanearInventarioDom({ marcos: [{ url: 'https://portal.example.test/x', titulos: [{ texto: 'Datos bancarios', tag: 'h2' }], importes: [], elementos: [] }] }, undefined, { refs: true })!
    expect(detectarParada(inv)?.motivo).toBe('cerca_de_emision')
  })

  it('la IA no recibe el campo: el valor ficticio de un IBAN no llega a ningún sitio porque se para antes (paso de asegura/worker)', () => {
    // El inventario con IBAN ficticio dispara la parada ANTES del prompt: detectarParada es lo primero que mira el paso.
    const inv = pantallaCampos([{ tag: 'input', type: 'text', etiqueta: 'IBAN', valor: 'ES00 0000 0000 0000 0000 0000' }])
    expect(detectarParada(inv)?.motivo).toBe('cerca_de_emision')
  })
})

describe('excepción estrecha Allianz: td#EMISION_PROJ «Proyecto ampliado» (14/10/2026)', () => {
  const RES = { tipoPantalla: 'resultado' as const, hayImportes: true, presupuestoEnCurso: false }
  const el = (id: string, texto: string) => ({ tag: 'td', id, texto })

  it('id EMISION_PROJ + texto «Proyecto ampliado» en resultado con importes → permitido', () => {
    expect(bloqueoGuardadoPresupuesto(el('EMISION_PROJ', 'Proyecto ampliado'), RES)).toBeNull()
    expect(bloqueoGuardadoPresupuesto(el('EMISION_PROJ', '  PROYECTO   Ampliado '), RES)).toBeNull()
  })
  it('el mismo botón fuera de resultado, sin importes o en formulario → bloqueado', () => {
    expect(bloqueoGuardadoPresupuesto(el('EMISION_PROJ', 'Proyecto ampliado'), { ...RES, tipoPantalla: 'formulario' })).toBe('guardar_fuera_de_resultado')
    expect(bloqueoGuardadoPresupuesto(el('EMISION_PROJ', 'Proyecto ampliado'), { ...RES, hayImportes: false })).toBe('guardar_sin_precio')
  })
  it('otro id con «emisi» (EMISION_PROJ2, EMISION_POLIZA, emision_proj, prefijo) → bloqueado', () => {
    for (const id of ['EMISION_PROJ2', 'EMISION_POLIZA', 'emision_proj', 'XEMISION_PROJ', 'EMISION_PROJ ']) {
      expect(bloqueoGuardadoPresupuesto(el(id, 'Proyecto ampliado'), RES), id).toBe('boton_de_emision')
    }
  })
  it('EMISION_PROJ con texto «Emitir» u otra palabra de emisión → bloqueado', () => {
    for (const t of ['Emitir', 'Proyecto ampliado y emitir', 'Proyecto ampliado emisión', 'Proyecto', 'Proyecto ampliado PDF']) {
      expect(bloqueoGuardadoPresupuesto(el('EMISION_PROJ', t), RES), t).not.toBeNull()
    }
  })
  it('un onclick de emisión en el mismo control sigue bloqueando', () => {
    expect(bloqueoGuardadoPresupuesto({ tag: 'td', id: 'EMISION_PROJ', texto: 'Proyecto ampliado', onclick: 'validar_aceptar()' }, RES)).toBe('boton_de_emision')
  })
  it('sin la excepción (navegación o validador de avance) el id sigue siendo emisión', () => {
    expect(pareceEmision('EMISION_PROJ', { permitirGuardarPresupuesto: true })).toBe(true)
    expect(descripcionesSinExcepcionProyecto(['Proyecto ampliado', 'EMISION_PROJ'], 'EMISION_PROJ2', 'Proyecto ampliado')).toContain('EMISION_PROJ')
    expect(Object.isFrozen(EXCEPCION_PROYECTO_AMPLIADO)).toBe(true)
  })
})

describe('avisoGuardadoPortalDeAvisos (22/10/2026): solo el aviso FIJO del guardado en el portal cruza a plataforma', () => {
  it('devuelve el aviso de guardado (o de NO guardado) y nada más', () => {
    expect(avisoGuardadoPortalDeAvisos(['Prima anual…', 'Presupuesto NO guardado en Allianz: motivo de prueba.'])).toBe('Presupuesto NO guardado en Allianz: motivo de prueba.')
    expect(avisoGuardadoPortalDeAvisos(['Proyecto guardado en Mapfre: nº 1234567 (no es póliza).'])).toBe('Proyecto guardado en Mapfre: nº 1234567 (no es póliza).')
    expect(avisoGuardadoPortalDeAvisos(['Se pulsó «Generar Proyecto» en Mapfre pero no se leyó el nº.'])).toMatch(/^Se pulsó/)
    expect(avisoGuardadoPortalDeAvisos(['Precio con supuestos: uso diario.', 'Texto del portal: Presupuesto guardado en X'])).toBeNull()
    expect(avisoGuardadoPortalDeAvisos(null)).toBeNull()
    expect(avisoGuardadoPortalDeAvisos([`Proyecto NO guardado en Mapfre: ${'x'.repeat(500)}`])!.length).toBe(300)
  })
  it('referenciaPortalValida: el identificador del bot (que parece un IBAN) y las referencias del portal, sí; NIF/teléfono/IBAN, no', () => {
    for (const ok of ['GA-20261022-ABCDEF12', 'GA-20261022-D6', '9876543210', '2026/000123']) expect(referenciaPortalValida(ok)).toBe(true)
    for (const mal of ['GA-2026102-ABCDEF12', 'GA-20261022-abcdef12', '00000000T', '612345678', 'ES9121000418450200051332', 42, null]) expect(referenciaPortalValida(mal)).toBe(false)
  })
})

describe('«Generar Proyecto» NO es un permiso general de guardado (revisión 22/10/2026)', () => {
  const RES = { tipoPantalla: 'resultado' as const, hayImportes: true, presupuestoEnCurso: false }
  it('el explorador IA (bloqueoGuardadoPresupuesto) sigue viendo «Generar proyecto» como botón de emisión, aun en resultado con importes', () => {
    for (const texto of ['Generar proyecto', 'GENERAR PROYECTO', 'generarProyecto()']) {
      expect(bloqueoGuardadoPresupuesto({ tag: 'button', texto }, RES), texto).toBe('boton_de_emision')
    }
  })
  it('permitirGuardarPresupuesto NO abre «Generar proyecto»; solo la opción estrecha permitirGenerarProyectoMapfre, y solo eso', () => {
    expect(pareceEmision('Generar Proyecto', { permitirGuardarPresupuesto: true })).toBe(true)
    expect(pareceEmision('Generar Proyecto', { permitirGenerarProyectoMapfre: true })).toBe(false)
    for (const t of ['Archivar', 'store', 'Proyecto ampliado', 'Ir a generar', 'Ir a generar proyecto', 'Generar proyecto y emitir', 'Aceptar'])
      expect(pareceEmision(t, { permitirGenerarProyectoMapfre: true }), t).toBe(true)
    expect(nombresAccionesPortal('guardar_presupuesto')).not.toContain('Generar proyecto')
    expect(PATRONES_GUARDADO_GUARD.some((r) => r.test('Generar proyecto'))).toBe(false)
  })
})

describe('guard genérico: «Grabar» y «Guardar Cálculo» (grabarCalcRap) bloqueados; solo pasan con permitirGuardarPresupuesto', () => {
  it('pulsar genérico sobre «Grabar» y onclick link(\'grabarCalcRap\') / «Guardar Cálculo» lanza; «Recalcular» con link(\'calcular\') pasa', () => {
    for (const d of [['Grabar'], ['  GRABAR '], [null, "link('grabarCalcRap')"], ['Guardar Cálculo'], ['Guardar calculo']])
      expect(() => comprobarBoton(d), d.join('|')).toThrow()
    expect(() => comprobarBoton(['Recalcular', "link('calcular')"])).not.toThrow()
  })
  it('con permitirGuardarPresupuesto (guardado dedicado) sí pasan, y no abren lo de emisión', () => {
    const op = { permitirGuardarPresupuesto: true }
    expect(() => comprobarBoton(['Grabar'], op)).not.toThrow()
    expect(() => comprobarBoton(['Guardar Cálculo', "link('grabarCalcRap')"], op)).not.toThrow()
    expect(() => comprobarBoton(['Grabar y emitir'], op)).toThrow()
  })
})

describe('referenciaPresupuestoValida: una FECHA no es referencia (revisión 22/10/2026)', () => {
  it('fechas fuera; referencias con barra que no son fecha, dentro', () => {
    for (const f of ['22/10/2026', '1-2-26', '22.10.2026', '01/01/20']) expect(referenciaPortalValida(f), f).toBe(false)
    for (const ok of ['2026/000123', '9876543210', 'PRY-2026-0042']) expect(referenciaPortalValida(ok), ok).toBe(true)
  })
})
