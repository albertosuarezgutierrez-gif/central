// Cepos del EXPLORADOR IA (13/10/2026). Fixtures SINTÉTICAS: ningún dato personal real (NIF, correo y teléfono inventados).
import { describe, it, expect } from 'vitest'
import {
  ACCIONES_EXPLORADOR,
  DESCRIPCION_MOTIVOS_PARAR,
  MOTIVOS_FIN_EXPLORACION,
  MOTIVOS_PARAR,
  lineaMotivosPararParaIA,
  normalizarMotivoParar,
  MAX_TITULOS_MARCO,
  catalogoParaIA,
  comprobarTopes,
  construirMapa,
  costeMaximoLlamada,
  detectarBucle,
  detectarParada,
  CATALOGO_EXPLORACION,
  DETALLES_FIN_EXPLORACION,
  RE_CAMPO_CUENTA_BANCARIA,
  senalCuentaBancaria,
  huellaPantalla,
  huellaRelleno,
  MAX_HUELLA_REPETIDA_CON_PROGRESO,
  normalizarRedNoGet,
  planDesdeMapa,
  resolverDato,
  claseMinimaPermiso,
  cvAKw,
  redactarValoresInventario,
  sanearInventarioDom,
  topesExplorador,
  valoresSensiblesExploracion,
  TOPES_EXPLORADOR,
  validarMapa,
  validarRespuestaExplorador,
  bloqueoGuardadoPresupuesto,
  normalizarEnteroPortal,
  relocalizarElemento,
  leerIncidenciasEjecucion,
  erroresDeIncidencias,
  PREFIJO_ERROR_EJECUCION,
  ordenarLote,
  rellenarRepinta,
  incidenciasLoteCortado,
  type Accion,
  type InventarioDom,
  type RespuestaExplorador,
} from './index.ts'

const ENTRADA = 'allianz:particulares:hogar'

/** Inventario de una pantalla «Datos básicos» de Hogar inventada. */
/** Títulos en texto = encabezado `h2` de la pantalla; un objeto `{ texto, tag }` (o un texto sin etiqueta) va tal cual. */
function inventario(extra: { titulos?: unknown[]; elementos?: unknown[]; importes?: unknown[]; url?: string } = {}): InventarioDom {
  return sanearInventarioDom(
    {
      marcos: [
        {
          url: extra.url ?? 'https://portal.example.test/epac/alta?sid=1',
          nombre: 'appArea',
          titulos: (extra.titulos ?? ['Datos básicos']).map((t) => (typeof t === 'string' ? { texto: t, tag: 'h2' } : t)),
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
const ctx = (inv: InventarioDom) => ({ inventario: inv, ramo: 'hogar', entrada: ENTRADA, datosReales: null })

describe('inventario con refs (explorador)', () => {
  it('asigna refs estables y la segunda pasada (asegura) las CONSERVA', () => {
    const inv = inventario()
    expect(ref(inv, 'superficie')).toBe('m0e0')
    const otraVez = sanearInventarioDom(JSON.parse(JSON.stringify(inv)), undefined, { refs: true })!
    expect(otraVez.marcos[0].elementos.map((e) => e.ref)).toEqual(inv.marcos[0].elementos.map((e) => e.ref))
    expect(otraVez.marcos[0].titulosPantalla).toEqual(['Datos básicos'])
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
    // 🚨 CEPO (13/10/2026): con datos reales, una clave del riesgo AUSENTE nunca cae al valor de prueba (NIF real + «PRUEBA 1», CP 41001).
    expect(resolverDato('inmueble.anio_construccion', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    expect(resolverDato('inmueble.codigo_postal', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    expect(resolverDato('inmueble.nombre_via', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    expect(resolverDato('hogar.uso', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    // Sin ruta en el riesgo (fecha de efecto) sigue siendo la de mañana; en sintético, lo de prueba sigue igual.
    expect(resolverDato('efecto.fecha', real)).toEqual({ ok: true, valor: '14/10/2026' })
    expect(resolverDato('inmueble.anio_construccion', { ...real, conDatosReales: false })).toEqual({ ok: true, valor: '1990' })
  })

  it('catálogo con datos reales: sin pistas de prueba, claves ausentes marcadas y solo uso/régimen/tipo con valor visible', () => {
    const riesgo = { tomador: { nif: '00000000T', nombre: 'Ficticio' }, inmueble: { codigoPostal: '00000' }, hogar: { uso: 'MainResidence', regimen: 'Owner' } }
    const c = catalogoParaIA('hogar', { riesgo })
    const de = (k: string) => c.find((d) => d.clave === k)!
    expect(c.some((d) => d.pista !== undefined && d.clave !== 'efecto.fecha')).toBe(false)
    expect(de('inmueble.anio_construccion')).toMatchObject({ sinValor: true })
    expect(de('inmueble.superficie_m2')).toMatchObject({ sinValor: true })
    // El CP real NO se enseña (dato de la dirección); solo se sabe que hay valor.
    expect(de('inmueble.codigo_postal').valor).toBeUndefined()
    expect(de('inmueble.codigo_postal').sinValor).toBeUndefined()
    expect(de('tomador.nif')).toEqual({ clave: 'tomador.nif', descripcion: expect.any(String), tipo: 'texto' })
    // Id de Codeoscopic + su SIGNIFICADO en español (mapa cerrado): la IA casa la opción del portal con el significado.
    expect(de('hogar.uso')).toMatchObject({ valor: 'MainResidence', significado: 'Vivienda habitual' })
    expect(de('hogar.regimen')).toMatchObject({ valor: 'Owner', significado: 'Propietario' })
    // tipo de vivienda sin dato → sinValor; un id fuera del mapa cerrado no se enseña (ni se traduce a ojo).
    expect(de('hogar.tipo_vivienda')).toMatchObject({ sinValor: true })
    const raro = catalogoParaIA('hogar', { riesgo: { ...riesgo, hogar: { uso: 'IdRaro', regimen: 'Owner' } } })
    expect(raro.find((d) => d.clave === 'hogar.uso')!.valor).toBeUndefined()
    expect(JSON.stringify(c)).not.toContain('00000000T')
    expect(JSON.stringify(c)).not.toContain('Ficticio')
  })

  describe('catálogo de AUTO (Mapfre NSEI)', () => {
    const auto = { ramo: 'auto', riesgo: {}, env: {}, hoy: new Date('2026-10-14T10:00:00Z') }
    const claves = () => catalogoParaIA('auto').map((d) => d.clave)

    it('tiene catálogo y las claves del formulario de auto', () => {
      for (const k of ['efecto.fecha', 'tomador.nif', 'tomador.fecha_nacimiento', 'vehiculo.matricula', 'vehiculo.codigo_postal', 'conductor.fecha_nacimiento', 'conductor.fecha_carne', 'historial.siniestros_5_anios', 'historial.anios_asegurado']) {
        expect(claves(), k).toContain(k)
      }
    })
    it('claves únicas', () => {
      expect(new Set(claves()).size).toBe(claves().length)
    })
    it('la IA no ve valores de lo personal (NIF, matrícula, fechas del conductor)', () => {
      const c = catalogoParaIA('auto')
      for (const k of ['tomador.nif', 'vehiculo.matricula', 'conductor.fecha_nacimiento', 'conductor.fecha_carne']) {
        expect(c.find((d) => d.clave === k), k).toEqual({ clave: k, descripcion: expect.any(String), tipo: expect.any(String) })
      }
    })
    it('sin petición real: NIF y matrícula PARAN (sin valor sintético)', () => {
      expect(resolverDato('tomador.nif', { ...auto, conDatosReales: false })).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
      expect(resolverDato('vehiculo.matricula', { ...auto, conDatosReales: false })).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    })
    it('con petición real: sale del FormularioAuto, la fecha ISO pasa a dd/mm/aaaa y lo ausente PARA', () => {
      const riesgo = { matricula: '0000BBB', codigoPostal: '41001', conductor: { fechaNacimiento: '1985-03-07', fechaCarne: '2004-05-09' }, tomador: { documentoIdentidad: '00000000T' }, siniestrosUltimos5Anios: 0 }
      const real = { ...auto, conDatosReales: true, riesgo }
      expect(resolverDato('vehiculo.matricula', real)).toEqual({ ok: true, valor: '0000BBB' })
      expect(resolverDato('tomador.nif', real)).toEqual({ ok: true, valor: '00000000T' })
      expect(resolverDato('conductor.fecha_nacimiento', real)).toEqual({ ok: true, valor: '07/03/1985' })
      expect(resolverDato('conductor.fecha_carne', real)).toEqual({ ok: true, valor: '09/05/2004' })
      expect(resolverDato('historial.siniestros_5_anios', real)).toEqual({ ok: true, valor: '0' })
      expect(resolverDato('historial.anios_asegurado', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
      expect(resolverDato('vehiculo.marca', real)).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    })
    it('los valores del riesgo de auto se quitan del inventario (NIF del tomador y fecha del carné)', () => {
      const v = valoresSensiblesExploracion({ conDatosReales: true, env: {}, riesgo: { tomador: { documentoIdentidad: '00000000T' }, conductor: { fechaCarne: '2004-05-09' } } })!
      expect(v).toContain('00000000T')
      expect(v).toContain('09/05/2004')
    })
    it('no hay uso, ámbito ni compañía anterior inventados', () => {
      expect(claves().filter((k) => /uso|ambito|compania/.test(k))).toEqual([])
    })
    it('cvAKw: 1 CV = 0,73549875 kW; null → null', () => {
      expect(cvAKw(100)).toBeCloseTo(73.549875, 6)
      expect(cvAKw(15)).toBeCloseTo(11.03, 2)
      expect(cvAKw(null)).toBeNull()
    })
    describe('claseMinimaPermiso (DGT)', () => {
      const m = (cilindradaCc: number | null, potenciaKw: number | null, antiguedadBAnios: number | null = null) =>
        claseMinimaPermiso({ esMoto: true, cilindradaCc, potenciaKw, antiguedadBAnios })
      it('turismo → B; esMoto null → null', () => {
        expect(claseMinimaPermiso({ esMoto: false, cilindradaCc: null, potenciaKw: null, antiguedadBAnios: null })).toBe('B')
        expect(claseMinimaPermiso({ esMoto: null, cilindradaCc: 50, potenciaKw: 3, antiguedadBAnios: 9 })).toBeNull()
      })
      it('ciclomotor: 50 cc → B, 51 cc ya no', () => {
        expect(m(50, null)).toBe('B')
        expect(m(51, 4, 5)).toBe('B')
        expect(m(51, 4, 1)).toBe('A1')
        expect(m(51, null)).toBeNull()
      })
      it('≤125 cc y ≤11 kW: B con ≥3 años, A1 con menos, null sin antigüedad; fronteras 125/126 cc y 11/11,01 kW', () => {
        expect(m(125, 11, 3)).toBe('B')
        expect(m(125, 11, 2)).toBe('A1')
        expect(m(125, 11, null)).toBeNull()
        expect(m(126, 11, 3)).toBe('A2')
        expect(m(125, 11.01, 3)).toBe('A2')
      })
      it('A2 hasta 35 kW y A por encima; fronteras 35/35,01 kW; sin cc o sin kW → null', () => {
        expect(m(400, 35)).toBe('A2')
        expect(m(400, 35.01)).toBe('A')
        expect(m(1000, 100)).toBe('A')
        expect(m(null, 20)).toBeNull()
        expect(m(400, null)).toBeNull()
      })
    })
    it('clase del permiso: «B» por defecto sintético (turismo), con y sin datos reales, y la IA ve la pista y la regla', () => {
      expect(resolverDato('conductor.clase_permiso', { ...auto, conDatosReales: false })).toEqual({ ok: true, valor: 'B' })
      expect(resolverDato('conductor.clase_permiso', { ...auto, conDatosReales: true })).toEqual({ ok: true, valor: 'B' })
      expect(catalogoParaIA('auto').find((d) => d.clave === 'conductor.clase_permiso')).toMatchObject({ pista: 'B', descripcion: expect.stringContaining('125 cc') })
    })
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

  describe('con datos REALES: elegir/marcar solo sobre uso/régimen/tipo de vivienda con valor conocido', () => {
    const riesgo = { tomador: { nif: '00000000T', nombre: 'Ficticio' }, inmueble: { provincia: 'PROVINCIA PRUEBA' }, hogar: { uso: 'MainResidence', regimen: 'Owner', tipoVivienda: 'MiddleFloor' } }
    const invP = inventario({
      elementos: [
        { tag: 'select', id: 'provincia', etiqueta: 'Provincia', opciones: [{ valor: '41', texto: 'Sevilla' }, { valor: '28', texto: 'Madrid' }] },
        { tag: 'select', id: 'tipoVivienda', etiqueta: 'Tipo de vivienda', opciones: [{ valor: '1', texto: 'Piso' }, { valor: '2', texto: 'Chalet' }] },
        { tag: 'input', id: 'regimenProp', type: 'radio', etiqueta: 'Propietario' },
        { tag: 'input', id: 'regimenInq', type: 'radio', etiqueta: 'Inquilino' },
      ],
    })
    const real = (r: unknown = riesgo) => ({ ...ctx(invP), datosReales: { riesgo: r } })
    const elegirProvincia = (campo: string | null) =>
      buena([{ accion: 'elegir', ref: ref(invP, 'provincia'), opcion: { valor: '41' } }], { mapeo: campo === undefined ? [] : [{ ref: ref(invP, 'provincia'), campoCanonico: campo, confianza: 'alta' }] })

    it('CEPO: elegir la provincia con datos reales → rechazado (la IA no tiene ese valor); en sintético, igual que antes', () => {
      const r = validarRespuestaExplorador(elegirProvincia('inmueble.provincia'), real())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errores.join(' ')).toMatch(/parar dato_no_disponible/)
      expect(validarRespuestaExplorador(elegirProvincia('inmueble.provincia'), ctx(invP)).ok).toBe(true)
    })

    it('rechaza elegir/marcar sin mapeo, mapeado a null, a dos claves, o a una clave visible SIN valor conocido', () => {
      expect(validarRespuestaExplorador(buena([{ accion: 'elegir', ref: ref(invP, 'tipoVivienda'), opcion: { valor: '1' } }]), real()).ok).toBe(false)
      expect(validarRespuestaExplorador(elegirProvincia(null), real()).ok).toBe(false)
      const dos = buena([{ accion: 'marcar', ref: ref(invP, 'regimenProp') }], {
        mapeo: [{ ref: ref(invP, 'regimenProp'), campoCanonico: 'hogar.regimen', confianza: 'alta' }, { ref: ref(invP, 'regimenProp'), campoCanonico: 'hogar.uso', confianza: 'alta' }],
      })
      expect(validarRespuestaExplorador(dos, real()).ok).toBe(false)
      const marcarReg = buena([{ accion: 'marcar', ref: ref(invP, 'regimenProp') }], { mapeo: [{ ref: ref(invP, 'regimenProp'), campoCanonico: 'hogar.regimen', confianza: 'alta' }] })
      expect(validarRespuestaExplorador(marcarReg, real({ ...riesgo, hogar: { uso: 'MainResidence' } })).ok).toBe(false)
      expect(validarRespuestaExplorador(marcarReg, real({ ...riesgo, hogar: { uso: 'MainResidence', regimen: 'IdRaro' } })).ok).toBe(false)
    })

    it('acepta marcar el régimen y elegir el tipo de vivienda mapeados a su clave con valor; nunca dos veces la misma clave', () => {
      const ok = buena([
        { accion: 'marcar', ref: ref(invP, 'regimenProp') },
        { accion: 'elegir', ref: ref(invP, 'tipoVivienda'), opcion: { valor: '1' } },
      ], { mapeo: [
        { ref: ref(invP, 'regimenProp'), campoCanonico: 'hogar.regimen', confianza: 'alta' },
        { ref: ref(invP, 'tipoVivienda'), campoCanonico: 'hogar.tipo_vivienda', confianza: 'alta' },
      ] })
      expect(validarRespuestaExplorador(ok, real()).ok).toBe(true)
      const ambos = buena([{ accion: 'marcar', ref: ref(invP, 'regimenProp') }, { accion: 'marcar', ref: ref(invP, 'regimenInq') }], { mapeo: [
        { ref: ref(invP, 'regimenProp'), campoCanonico: 'hogar.regimen', confianza: 'alta' },
        { ref: ref(invP, 'regimenInq'), campoCanonico: 'hogar.regimen', confianza: 'alta' },
      ] })
      expect(validarRespuestaExplorador(ambos, real()).ok).toBe(false)
    })

    it('parar dato_no_disponible es un motivo válido', () => {
      const r = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'dato_no_disponible' }]), real())
      expect(r.ok && r.respuesta.acciones[0]).toEqual({ accion: 'parar', motivo: 'dato_no_disponible' })
    })
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

  describe('motivos de parar: una sola lista (13/10/2026: exploración 313a04d1, «motivo de parada fuera de lista»)', () => {
    it('cada motivo de la lista se acepta tal cual', () => {
      for (const m of MOTIVOS_PARAR) {
        const r = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: m }]), ctx(inv))
        expect(r.ok && r.respuesta.acciones[0]).toEqual({ accion: 'parar', motivo: m })
      }
    })

    it('el código con explicación detrás, en mayúsculas o con espacios, se lleva a su código', () => {
      expect(normalizarMotivoParar('dato_sensible_requerido: piden número de documento')).toBe('dato_sensible_requerido')
      expect(normalizarMotivoParar('Dato sensible requerido (NIF)')).toBe('dato_sensible_requerido')
      expect(normalizarMotivoParar('AMBIGUO')).toBe('ambiguo')
      expect(normalizarMotivoParar('sin-salida - no hay botón')).toBe('sin_salida')
      const r = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'dato_sensible_requerido: el formulario exige el documento' }]), ctx(inv))
      expect(r.ok && r.respuesta.acciones[0]).toEqual({ accion: 'parar', motivo: 'dato_sensible_requerido' })
    })

    it('una frase libre sin código delante NO se adivina (sigue rechazada)', () => {
      expect(normalizarMotivoParar('El formulario pide un dato sensible requerido')).toBeNull()
      expect(normalizarMotivoParar('dato_sensible')).toBeNull()
      expect(normalizarMotivoParar(3)).toBeNull()
    })

    it('el error del validador dice QUÉ motivo llegó, solo si es un código corto sin cifras', () => {
      const r1 = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'requiere_nif' }]), ctx(inv))
      expect(!r1.ok && r1.errores.join(' ')).toContain('«requiere_nif»')
      const r2 = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'El tomador 00000000T no está' }]), ctx(inv))
      expect(!r2.ok && r2.errores.join(' ')).toContain('(texto libre de')
      expect(!r2.ok && r2.errores.join(' ')).not.toContain('00000000T')
    })

    it('la línea del prompt sale de la lista (todos, con descripción) y motivo_fin los incluye', () => {
      const linea = lineaMotivosPararParaIA()
      for (const m of MOTIVOS_PARAR) {
        expect(linea).toContain(`${m} (`)
        expect(DESCRIPCION_MOTIVOS_PARAR[m]).toBeTruthy()
        expect(MOTIVOS_FIN_EXPLORACION).toContain(m)
      }
      expect(linea.split(' | ')).toHaveLength(MOTIVOS_PARAR.length)
    })
  })

  describe('paso 1 de Allianz Hogar (forma de 313a04d1: tomador + vivienda, «SIGUIENTE»)', () => {
    const paso1 = (siguienteDeshabilitado: boolean) =>
      inventario({
        titulos: ['¿Quién es el tomador?', 'Datos de la vivienda'],
        elementos: [
          { tag: 'nx-multi-step-item', role: 'tab', texto: 'Vivienda', ariaLabel: 'Vivienda' },
          { tag: 'nx-multi-step-item', role: 'tab', texto: 'Pago', ariaLabel: 'Pago', deshabilitado: true },
          { tag: 'nx-dropdown', role: 'combobox', etiqueta: 'Tipo de documento', formControlName: 'idType' },
          { tag: 'input', id: 'doc', type: 'text', etiqueta: 'Número de documento', requerido: true, formControlName: 'idNumber' },
          { tag: 'input', id: 'nac', etiqueta: 'Fecha de nacimiento', requerido: true, formControlName: 'dateOfBirth' },
          { tag: 'input', id: 'cp', type: 'text', etiqueta: 'Código postal', requerido: true, formControlName: 'postalCode' },
          { tag: 'input', id: 'anio', type: 'number', etiqueta: 'Año de construcción', requerido: true, formControlName: 'yearOfConstruction' },
          { tag: 'input', id: 'sup', etiqueta: 'Superficie de la vivienda', requerido: true, formControlName: 'surfaceAreaLiving' },
          { tag: 'button', id: 'NextPageFromRisk', type: 'button', texto: 'SIGUIENTE', deshabilitado: siguienteDeshabilitado },
        ],
      })
    const r1 = (i: InventarioDom, id: string) => ref(i, id)

    it('«SIGUIENTE» habilitado es un avance admitido (navegación, no emisión)', () => {
      const i = paso1(false)
      const r = validarRespuestaExplorador(buena([
        { accion: 'rellenar', ref: r1(i, 'cp'), dato: 'inmueble.codigo_postal' },
        { accion: 'avanzar', ref: r1(i, 'NextPageFromRisk'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
      ]), ctx(i))
      expect(r.ok).toBe(true)
    })

    it('«SIGUIENTE» deshabilitado no se pulsa; el lote solo de rellenar (sin avanzar) sí vale', () => {
      const i = paso1(true)
      const avz = validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: r1(i, 'NextPageFromRisk'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]), ctx(i))
      expect(!avz.ok && avz.errores.join(' ')).toContain('deshabilitado')
      const lote = validarRespuestaExplorador(buena([
        { accion: 'rellenar', ref: r1(i, 'nac'), dato: 'tomador.fecha_nacimiento' },
        { accion: 'rellenar', ref: r1(i, 'cp'), dato: 'inmueble.codigo_postal' },
        { accion: 'rellenar', ref: r1(i, 'anio'), dato: 'inmueble.anio_construccion' },
        { accion: 'rellenar', ref: r1(i, 'sup'), dato: 'inmueble.superficie_m2' },
      ]), ctx(i))
      expect(lote.ok).toBe(true)
    })

    it('sin datos reales, el documento del tomador PARA en el robot (sin NIF sintético); la parada de la IA queda tipada', () => {
      expect(resolverDato('tomador.nif', { ramo: 'hogar', conDatosReales: false, riesgo: {}, env: {}, hoy: new Date() })).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
      const i = paso1(true)
      const r = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'dato_sensible_requerido' }], { motivo: 'Número de documento obligatorio y tomador.nif sin valor' }), ctx(i))
      expect(r.ok && r.respuesta.acciones[0]).toEqual({ accion: 'parar', motivo: 'dato_sensible_requerido' })
    })
  })

  describe('motivo largo (13/10/2026: paso 1 de Allianz Hogar tirado a parar/ambiguo)', () => {
    const largo = 'La pantalla muestra el menú de productos de ePAC y no aparece todavía ningún campo del formulario de hogar; '.repeat(3)

    it('un motivo de más de 200 caracteres NO invalida el lote: se recorta a 200 con «…»', () => {
      const r = validarRespuestaExplorador(buena([{ accion: 'rellenar', ref: ref(inv, 'superficie'), dato: 'inmueble.superficie_m2' }], { motivo: largo }), ctx(inv))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(largo.length).toBeGreaterThan(200)
      expect(r.respuesta.motivo).toHaveLength(200)
      expect(r.respuesta.motivo!.endsWith('…')).toBe(true)
      expect(r.respuesta.acciones).toHaveLength(1)
    })

    it('un motivo de 200 o menos se deja intacto', () => {
      const corto = 'x'.repeat(200)
      const r = validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'ambiguo' }], { motivo: corto }), ctx(inv))
      expect(r.ok && r.respuesta.motivo).toBe(corto)
    })

    it('el recorte no relaja lo demás: motivo largo + acción inválida sigue rechazado; dato personal en el motivo también', () => {
      expect(validarRespuestaExplorador(buena([{ accion: 'navegar', url: 'https://x.test' }], { motivo: largo }), ctx(inv)).ok).toBe(false)
      expect(validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'ambiguo' }], { motivo: largo + ' 00000000T' }), ctx(inv)).ok).toBe(false)
      expect(validarRespuestaExplorador(buena([{ accion: 'parar', motivo: 'ambiguo' }], { motivo: 42 }), ctx(inv)).ok).toBe(false)
    })
  })

  it('«Aceptar» solo en la pantalla autorizada: en Tarificar (o sin título de Datos básicos) se rechaza', () => {
    const a = (i: InventarioDom) => validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' }]), ctx(i)).ok
    expect(a(inventario())).toBe(true)
    expect(a(inventario({ titulos: ['Datos básicos', 'Tarificar'] }))).toBe(false)
    expect(a(inventario({ titulos: ['Coberturas'] }))).toBe(false)
    // Otra entrada sin avances autorizados.
    const i = inventario()
    expect(validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' }]), { ...ctx(i), entrada: 'otra:cosa' }).ok).toBe(false)
  })

  describe('avanzar: solo sobre lo que se sabe qué es (13/10/2026)', () => {
    const avanzar = (i: InventarioDom, id: string) =>
      validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, id), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }]), ctx(i))
    const largo = 'Continuar al siguiente paso del alta de la vivienda con los datos que ya constan arriba'

    it('botón sin ninguna descripción completa (texto recortado «…», sin aria) → rechazado; con aria entera, vale', () => {
      const i = inventario({ elementos: [
        { tag: 'button', id: 'b1', texto: largo },
        { tag: 'button', id: 'b2', texto: largo, ariaLabel: 'Siguiente' },
        { tag: 'button', id: 'b3' },
        { tag: 'button', id: 'b4', texto: 'Siguiente' },
      ] })
      expect(i.marcos[0].elementos[0].texto?.endsWith('…')).toBe(true)
      const r1 = avanzar(i, 'b1')
      expect(r1.ok).toBe(false)
      if (!r1.ok) expect(r1.errores.join()).toMatch(/sin_descripcion_completa/)
      expect(avanzar(i, 'b2').ok).toBe(true)
      expect(avanzar(i, 'b3').ok).toBe(false)
      expect(avanzar(i, 'b4').ok).toBe(true)
    })

    it('`div#aceptar` (servlet de Allianz): avanzable SOLO como el «Aceptar» autorizado de Datos básicos; ningún otro div', () => {
      const divs = (titulos?: unknown[]) => inventario({ titulos, elementos: [
        { tag: 'div', id: 'aceptar', texto: 'Aceptar', onclick: 'btnAceptar();' },
        { tag: 'div', id: 'siguiente', texto: 'Siguiente', onclick: 'irA(2);' },
        { tag: 'div', id: 'aceptar2', texto: 'Aceptar', onclick: 'btnAceptar();' },
      ] })
      const av = (i: InventarioDom, id: string, efecto = 'calcular') =>
        validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, id), efectoEsperado: efecto, confianza: 'alta' }]), ctx(i)).ok
      expect(av(divs(), 'aceptar')).toBe(true)
      // Mismo div fuera de Datos básicos, en Tarificar, o en otra entrada → no.
      expect(av(divs(['Coberturas']), 'aceptar')).toBe(false)
      expect(av(divs(['Datos básicos', 'Tarificar']), 'aceptar')).toBe(false)
      const i = divs()
      expect(validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'aceptar'), efectoEsperado: 'calcular', confianza: 'alta' }]), { ...ctx(i), entrada: 'otra:cosa' }).ok).toBe(false)
      // Otro div con onclick (aunque sea en Datos básicos) o con otro id → no es un botón.
      expect(av(divs(), 'siguiente', 'siguiente_pantalla')).toBe(false)
      expect(av(divs(), 'aceptar2')).toBe(false)
      // Sin onclick, tampoco.
      const sinOnclick = inventario({ elementos: [{ tag: 'div', id: 'aceptar', texto: 'Aceptar' }] })
      expect(av(sinOnclick, 'aceptar')).toBe(false)
      // Y el div no sirve para nada más (marcar exige radio).
      expect(validarRespuestaExplorador(buena([{ accion: 'marcar', ref: ref(i, 'aceptar') }]), ctx(i)).ok).toBe(false)
    })

    it('onclick recortado = bloqueante aunque el texto sea inocente', () => {
      const i = inventario({ elementos: [{ tag: 'button', id: 'b1', texto: 'Siguiente', onclick: `irA('${'x'.repeat(120)}')` }] })
      const r = avanzar(i, 'b1')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errores.join()).toMatch(/onclick_truncado/)
    })

    const aceptar = (i: InventarioDom) =>
      validarRespuestaExplorador(buena([{ accion: 'avanzar', ref: ref(i, 'btnAceptarBasicos'), efectoEsperado: 'calcular', confianza: 'alta' }]), ctx(i)).ok

    it('lista de títulos en el TOPE (recortada) → ningún «Aceptar»', () => {
      const relleno = Array.from({ length: MAX_TITULOS_MARCO + 5 }, (_, n) => `Bloque ${n + 1}`)
      const i = inventario({ titulos: ['Datos básicos', ...relleno] })
      expect(i.marcos[0].titulos).toHaveLength(MAX_TITULOS_MARCO)
      expect(aceptar(i)).toBe(false)
      expect(aceptar(inventario({ titulos: ['Datos básicos', ...relleno.slice(0, MAX_TITULOS_MARCO - 2)] }))).toBe(true)
    })

    it('un `th` de tabla (o un título sin etiqueta) no autoriza «Aceptar»; sí prohíbe', () => {
      expect(aceptar(inventario({ titulos: [{ texto: 'Datos básicos', tag: 'th' }] }))).toBe(false)
      expect(aceptar(inventario({ titulos: [{ texto: 'Datos básicos' }] }))).toBe(false)
      expect(aceptar(inventario({ titulos: [{ texto: 'Datos básicos', tag: 'legend' }] }))).toBe(true)
      expect(aceptar(inventario({ titulos: ['Datos básicos', { texto: 'Tarificar', tag: 'th' }] }))).toBe(false)
      // Del cable no se cuela un título de pantalla que no esté entre los títulos.
      const i = sanearInventarioDom({ marcos: [{ url: 'x', titulos: ['Otra cosa'], titulosPantalla: ['Datos básicos'], elementos: [] }] })!
      expect(i.marcos[0].titulosPantalla).toBeUndefined()
    })
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

  it('🪤 bucle (14/10/2026): misma huella con MÁS campos rellenos NO es bucle; misma huella y mismo relleno, sí', () => {
    const inv = (conValor: boolean[]) => inventario({ elementos: conValor.map((c, i) => ({ tag: 'input', id: `campo${i}`, conValor: c })) })
    const h = huellaPantalla(inv([false, false, false]))
    // La huella estructural no ve el relleno (es lo que provocó el falso bucle de Allianz Hogar).
    expect(huellaPantalla(inv([true, true, false]))).toBe(h)
    const r0 = huellaRelleno(inv([false, false, false]))
    const r1 = huellaRelleno(inv([true, false, false]))
    const r2 = huellaRelleno(inv([true, true, false]))
    expect(r0).not.toBe(r1)
    expect(r1).not.toBe(r2)
    expect(detectarBucle([h, h], h, 0, { anteriores: [r0, r1], actual: r2 })).toBe(false)
    expect(detectarBucle([h, h], h, 0, { anteriores: [r2, r2], actual: r2 })).toBe(true)
    // El progreso solo cuenta si es RECIENTE: tras él, dos pantallas más sin cambio → bucle.
    expect(detectarBucle([h, h, h], h, 0, { anteriores: [r0, r2, r2], actual: r2 })).toBe(true)
    // Relleno desconocido (worker antiguo) = sin cambio: lo conservador.
    expect(huellaRelleno(inventario({ elementos: [{ tag: 'input', id: 'a' }] }))).toBeNull()
    expect(detectarBucle([h, h], h, 0, { anteriores: [null, r1], actual: r2 })).toBe(false)
    expect(detectarBucle([h, h], h, 0, { anteriores: [r2, null], actual: r2 })).toBe(true)
    expect(detectarBucle([h, h], h, 0, { anteriores: [r0, r1], actual: null })).toBe(true)
    // Techo: un relleno que oscila no sostiene el bucle para siempre.
    const osc = Array.from({ length: MAX_HUELLA_REPETIDA_CON_PROGRESO - 1 }, (_, i) => (i % 2 ? r1 : r2))
    expect(detectarBucle(osc.map(() => h), h, 0, { anteriores: osc, actual: r1 === osc.at(-1) ? r2 : r1 })).toBe(true)
    expect(detectarBucle(osc.slice(1).map(() => h), h, 0, { anteriores: osc.slice(1), actual: r1 === osc.at(-1) ? r2 : r1 })).toBe(false)
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

describe('redacción de los valores del cliente (exploración con datos reales)', () => {
  // Riesgo INVENTADO (sintético): nombre, calle, CP, fecha y matrícula ficticios.
  const riesgo = {
    tomador: { nombre: 'Nombreinventado', apellido1: 'Apellidoficticio', apellido2: 'De', fechaNacimiento: '1980-01-15', nif: '00000000T' },
    inmueble: { tipoVia: 'Calle', nombreVia: 'Rúa  Imaginaria', numero: 7, codigoPostal: '41999', municipio: 'Villaficticia' },
    vehiculo: { matricula: '0000 ZZZ' },
  }
  const env = { TARIFICADOR_EXPLORADOR_EMAIL: 'buzon@example.test', TARIFICADOR_EXPLORADOR_TELEFONO: '+34 699 000 000' }
  const crudo = inventario({
    titulos: ['Datos básicos', 'Póliza de NOMBREINVENTADO apellidoficticio'],
    elementos: [
      { tag: 'label', texto: 'Tomador: Nombreinventado Apellidoficticio' },
      { tag: 'label', texto: 'Domicilio: RUA   IMAGINARIA' },
      { tag: 'label', texto: 'CP 41999 Villaficticia' },
      { tag: 'label', texto: 'Nacido el 15/01/1980' },
      { tag: 'label', texto: 'Vehículo 0000-ZZZ' },
      { tag: 'label', texto: 'Contacto 699 000 000' },
      { tag: 'select', id: 'tipoVia', etiqueta: 'Tipo de vía', opciones: [{ valor: 'CL', texto: 'Calle' }, { valor: 'RI', texto: 'Rúa Imaginaria' }] },
      { tag: 'label', texto: 'Datos de la vivienda' },
      { tag: 'button', id: 'btnAceptarBasicos', texto: 'Aceptar' },
    ],
  })

  it('el inventario que repite nombre y calle del riesgo sale SIN ellos (acentos, mayúsculas y espacios dan igual)', () => {
    const valores = valoresSensiblesExploracion({ conDatosReales: true, riesgo, env })!
    const r = redactarValoresInventario(crudo, valores)
    const s = JSON.stringify(r).toLowerCase()
    for (const d of ['nombreinventado', 'apellidoficticio', 'imaginaria', 'villaficticia', '41999', '1980', '0000', '699']) expect(s).not.toContain(d)
    // Lo que no es del cliente sigue: «Calle» (tipo de vía), «de» (< 3 caracteres no se busca), el botón y el título.
    expect(r.marcos[0].elementos.find((e) => e.id === 'tipoVia')?.opciones).toEqual([{ valor: 'CL', texto: 'Calle' }, { valor: 'RI', texto: null }])
    expect(s).toContain('datos de la vivienda')
    expect(r.marcos[0].titulos).toEqual(['Datos básicos'])
    expect(r.marcos[0].titulosPantalla).toEqual(['Datos básicos'])
    expect(r.textosDescartados).toBeGreaterThan(crudo.textosDescartados)
    // No muta la entrada.
    expect(JSON.stringify(crudo)).toContain('Nombreinventado')
  })

  it('fail-closed: con datos reales y sin riesgo legible → null (la ruta PARA); sin datos reales, solo el contacto de entorno', () => {
    expect(valoresSensiblesExploracion({ conDatosReales: true, riesgo: null, env })).toBeNull()
    expect(valoresSensiblesExploracion({ conDatosReales: true, riesgo: 'x', env })).toBeNull()
    expect(valoresSensiblesExploracion({ conDatosReales: false, riesgo, env })).toEqual(['buzon@example.test', '+34 699 000 000', '699000000'])
  })
})

// FRONTERA DE EMISIÓN (Alberto, 14/10/2026, todas las compañías): un campo de cuenta bancaria en pantalla = fase de emisión.
describe('frontera de emisión: cuenta bancaria', () => {
  const campo = (c: Record<string, unknown>) => inventario({ elementos: [{ tag: 'input', type: 'text', ...c }] })
  for (const [que, c] of [
    ['name iban', { name: 'ibanTomador' }],
    ['id CCC', { id: 'numCCC' }],
    ['formcontrolname cuentaBancaria', { formControlName: 'cuentaBancaria' }],
    ['etiqueta «Número de cuenta»', { etiqueta: 'Número de cuenta' }],
    ['placeholder «ES00 0000…» con etiqueta IBAN', { placeholder: 'IBAN' }],
    ['etiqueta «Domiciliación bancaria»', { etiqueta: 'Domiciliación bancaria' }],
    ['etiqueta «BIC/SWIFT»', { etiqueta: 'BIC/SWIFT' }],
    ['etiqueta «Entidad - Oficina - DC»', { etiqueta: 'Entidad - Oficina - DC' }],
  ] as const) {
    it(`para con detalle frontera_cuenta_bancaria: ${que}`, () => {
      const p = detectarParada(campo(c))
      expect(p?.motivo).toBe('cerca_de_emision')
      expect(p?.detalle).toBe('frontera_cuenta_bancaria')
    })
  }
  it('el motivo es legible e incluye la etiqueta del campo', () => {
    expect(detectarParada(campo({ etiqueta: 'Número de cuenta' }))?.senal).toBe('frontera de emisión: el portal pide cuenta bancaria — Número de cuenta («Número de cuenta»)')
  })
  it('manda sobre un título de emisión (el detalle es el de la cuenta)', () => {
    expect(detectarParada(inventario({ titulos: ['Datos de emisión'], elementos: [{ tag: 'input', etiqueta: 'IBAN' }] }))?.detalle).toBe('frontera_cuenta_bancaria')
  })
  for (const t of ['Domicilio', 'Tener en cuenta', 'Bicicleta', 'Código postal', 'Fecha de efecto']) {
    it(`no casa con «${t}»`, () => {
      expect(senalCuentaBancaria([t])).toBeNull()
    })
  }
  // Falsos positivos que pararían Allianz/Occident (revisión 14/10/2026): uno por test.
  for (const t of ['El inmueble no cuenta con alarma', 'Oficina de la entidad mediadora', 'accc', 'Forma de pago', 'Entidad aseguradora anterior']) {
    it(`regresión: no casa con «${t}»`, () => {
      expect(senalCuentaBancaria([t])).toBeNull()
    })
  }
  for (const t of ['IBAN', 'Número de cuenta', 'Nº de cuenta', 'N.º cuenta', 'no. de cuenta', 'CCC', 'num_ccc', 'numCCC', 'Entidad - Oficina - DC', 'Entidad/Oficina', 'Dígito de control', 'Domiciliación bancaria']) {
    it(`sigue casando con «${t}»`, () => {
      expect(senalCuentaBancaria([t])).not.toBeNull()
    })
  }
  for (const [que, el] of [
    ['[role=combobox] aria-label IBAN', { tag: 'div', role: 'combobox', ariaLabel: 'IBAN' }],
    ['[role=textbox] «Número de cuenta»', { tag: 'div', role: 'textbox', ariaLabel: 'Número de cuenta' }],
    ['mat-select formcontrolname cuentaBancaria', { tag: 'mat-select', formControlName: 'cuentaBancaria' }],
  ] as const) {
    it(`control NO nativo de cuenta para con frontera_cuenta_bancaria: ${que}`, () => {
      expect(detectarParada(inventario({ elementos: [el] }))?.detalle).toBe('frontera_cuenta_bancaria')
    })
  }
  it('un botón ARIA «Domiciliación bancaria» NO es campo: detectarParada no lo mira (lo caza la segunda barrera del bucle)', () => {
    expect(detectarParada(inventario({ elementos: [{ tag: 'div', role: 'button', texto: 'Domiciliación bancaria' }] }))).toBeNull()
  })
  it('frontera_cuenta_bancaria está en la lista cerrada de detalles', () => {
    expect(DETALLES_FIN_EXPLORACION).toContain('frontera_cuenta_bancaria')
  })
  it('el catálogo que el worker inyecta NO tiene ninguna clave de cuenta bancaria', () => {
    for (const [ramo, datos] of Object.entries(CATALOGO_EXPLORACION)) {
      for (const d of datos) {
        expect(RE_CAMPO_CUENTA_BANCARIA.test(`${d.clave} ${d.descripcion}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()), `${ramo}: ${d.clave}`).toBe(false)
        expect(/iban|cuenta|ccc|bic|swift|domicilia|banc/i.test(d.clave), `${ramo}: ${d.clave}`).toBe(false)
      }
    }
  })
})

describe('guardado de presupuesto: botones compuestos (emisión + guardar) nunca pasan', () => {
  // Pantalla de RESULTADO con importes: el único caso en el que «guardar» podría pulsarse.
  const resultado = (texto: string) =>
    inventario({
      titulos: ['Resultado de tarificación'],
      importes: [{ texto: '347,55 €', etiqueta: 'Prima total' }],
      elementos: [{ tag: 'button', id: 'btnCompuesto', texto }],
    })
  const avanzarGuardar = (inv: InventarioDom) => ({
    version: 1,
    pantalla: { nombre: 'Resultado', tipo: 'resultado' },
    acciones: [{ accion: 'avanzar', ref: ref(inv, 'btnCompuesto'), efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }],
    mapeo: [],
    motivo: null,
  })

  it.each(['Guardar y firmar', 'Guardar y pagar', 'Grabar y contratar', 'Archivar y domiciliar'])(
    'avanzar guardar_presupuesto sobre «%s» en resultado con importes → rechazado',
    (texto) => {
      const inv = resultado(texto)
      const v = validarRespuestaExplorador(avanzarGuardar(inv), ctx(inv))
      expect(v.ok).toBe(false)
    },
  )

  it('control: «Guardar presupuesto» en la misma pantalla sí se acepta (el cepo no es un bloqueo general)', () => {
    const inv = resultado('Guardar presupuesto')
    expect(validarRespuestaExplorador(avanzarGuardar(inv), ctx(inv)).ok).toBe(true)
  })

  it('bloqueoGuardadoPresupuesto: el motivo de un compuesto con emisión es de emisión', () => {
    const inv = resultado('Guardar y firmar')
    const el = inv.marcos[0].elementos.find((e) => e.id === 'btnCompuesto')!
    expect(bloqueoGuardadoPresupuesto(el, { tipoPantalla: 'resultado', hayImportes: true, presupuestoEnCurso: false })).toBe('boton_de_emision')
  })
})

// ─── Año y m² que no se quedaban en Allianz Hogar (14/10/2026). Valores FICTICIOS. ───────────────────────────────────

describe('año y m² como entero para un input numérico', () => {
  const base = { ramo: 'hogar', env: {}, hoy: new Date('2026-10-14T10:00:00Z'), conDatosReales: true }
  const con = (inmueble: Record<string, unknown>) => ({ ...base, riesgo: { tomador: { nif: '00000000T' }, inmueble } })

  it('normalizarEnteroPortal: año entero de 4 cifras; m² redondeado; sin unidades ni separadores', () => {
    expect(normalizarEnteroPortal('inmueble.anio_construccion', '1975')).toBe('1975')
    expect(normalizarEnteroPortal('inmueble.anio_construccion', '1975.0')).toBe('1975')
    expect(normalizarEnteroPortal('inmueble.anio_construccion', ' 1.975 ')).toBe('1975')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '85.5')).toBe('86')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '85,50')).toBe('86')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '85,4')).toBe('85')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '90 m2')).toBe('90')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '90m²')).toBe('90')
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '1.234,5')).toBe('1235')
  })

  it('normalizarEnteroPortal: lo que no es un número válido o se sale del rango → null; otra clave → undefined', () => {
    expect(normalizarEnteroPortal('inmueble.anio_construccion', '1975.5')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.anio_construccion', '75')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.anio_construccion', 'mil novecientos')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '0,3')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '-80')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '8,5,1')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.superficie_m2', '')).toBeNull()
    expect(normalizarEnteroPortal('inmueble.numero', '12 bis')).toBeUndefined()
  })

  it('resolverDato: el valor del riesgo sale entero; uno inválido no sale (dato_no_disponible)', () => {
    expect(resolverDato('inmueble.superficie_m2', con({ superficieM2: 85.5, anioConstruccion: 1975 }))).toEqual({ ok: true, valor: '86' })
    expect(resolverDato('inmueble.anio_construccion', con({ superficieM2: 85.5, anioConstruccion: 1975 }))).toEqual({ ok: true, valor: '1975' })
    expect(resolverDato('inmueble.superficie_m2', con({ superficieM2: '85,50 m2' }))).toEqual({ ok: true, valor: '86' })
    expect(resolverDato('inmueble.anio_construccion', con({ anioConstruccion: 'hace mucho' }))).toEqual({ ok: false, motivo: 'dato_no_disponible' })
    // Sintético: el valor de prueba ya es entero y sigue igual.
    expect(resolverDato('inmueble.anio_construccion', { ...base, conDatosReales: false, riesgo: {} })).toEqual({ ok: true, valor: '1990' })
  })
})

describe('re-localización de una ref tras un repintado', () => {
  const URL = 'https://portal.ejemplo/form'
  const anio = { ref: 'm1e39', tag: 'input', type: 'number', id: 'anio', formControlName: 'anioConstruccion', etiqueta: 'Año de construcción' }
  const sup = { ref: 'm1e41', tag: 'input', name: 'superficie', etiqueta: 'Superficie de la vivienda' }
  const inv = (elementos: Record<string, unknown>[], url = URL): InventarioDom =>
    ({ marcos: [{ url, nombre: null, elementos }], totalElementos: elementos.length }) as unknown as InventarioDom
  const h = (x: InventarioDom) => huellaPantalla(x)

  it('mismo control repintado (ref nueva, misma pantalla) → su ref nueva', () => {
    const nuevo = inv([{ ...sup, ref: 'm1e50' }, { ...anio, ref: 'm1e48' }])
    expect(relocalizarElemento(anio, URL, nuevo, h(nuevo))).toBe('m1e48')
    expect(relocalizarElemento(sup, URL, nuevo, h(nuevo))).toBe('m1e50')
  })

  it('otra pantalla (huella distinta de la validada) → null aunque el control case', () => {
    const nuevo = inv([{ ...anio, ref: 'm1e48' }])
    expect(relocalizarElemento(anio, URL, nuevo, h(inv([{ ...anio }, { ...sup }])))).toBeNull()
  })

  it('🪤 FormArray: si solo queda el HERMANO (conductor1 en vez de conductor0) no casa: nunca el dato de otra persona', () => {
    const c0 = { ref: 'm1e5', tag: 'input', id: 'conductor0-fNac', formControlName: 'fNac', etiqueta: 'Fecha de nacimiento' }
    const soloHermano = inv([{ ...c0, ref: 'm1e9', id: 'conductor1-fNac' }])
    expect(relocalizarElemento(c0, URL, soloHermano, h(soloHermano))).toBeNull()
    const ambos = inv([{ ...c0, ref: 'm1e8' }, { ...c0, ref: 'm1e9', id: 'conductor1-fNac' }])
    expect(relocalizarElemento(c0, URL, ambos, h(ambos))).toBe('m1e8')
  })

  it('🪤 id autogenerado (`mat-input-N`) sin name/formControlName ni etiqueta: no basta; y un id que solo casa sin cifras, tampoco', () => {
    const mat = { ref: 'm1e3', tag: 'input', id: 'mat-input-3' }
    const igual = inv([{ ...mat, ref: 'm1e7' }])
    expect(relocalizarElemento(mat, URL, igual, h(igual))).toBeNull()
    const otroN = inv([{ ...anio, ref: 'm1e48', id: 'mat-input-4' }])
    expect(relocalizarElemento({ ...anio, id: 'mat-input-3' }, URL, otroN, h(otroN))).toBeNull()
  })

  it('otra etiqueta, otro type, otro marco, dos candidatos o sin identidad → null (no se adivina)', () => {
    const casos = [
      inv([{ ...anio, ref: 'm1e48', etiqueta: 'Año de reforma' }]),
      inv([{ ...anio, ref: 'm1e48', type: 'text' }]),
      inv([{ ...anio, ref: 'm1e48' }], 'https://portal.ejemplo/otro'),
    ]
    for (const c of casos) expect(relocalizarElemento(anio, URL, c, h(c))).toBeNull()
    const dos = inv([{ ...sup, ref: 'm1e48' }, { ...sup, ref: 'm1e49' }])
    expect(relocalizarElemento(sup, URL, dos, h(dos))).toBeNull()
    const sinId = inv([{ tag: 'input', ref: 'm1e1' }])
    expect(relocalizarElemento({ tag: 'input' }, URL, sinId, h(sinId))).toBeNull()
  })
})

describe('incidencias de ejecución del worker → errores del paso', () => {
  const inventario = {
    marcos: [{ url: 'https://portal.ejemplo/form', nombre: null, elementos: [
      { ref: 'm1e39', tag: 'input', type: 'number', etiqueta: 'Año de construcción' },
      { ref: 'm1e41', tag: 'input', etiqueta: 'Superficie de la vivienda' },
      { ref: 'm1e7', tag: 'input', etiqueta: '00000000T' },
    ] }],
    totalElementos: 3,
  } as unknown as InventarioDom

  it('leerIncidenciasEjecucion: solo la forma cerrada (accion, ref, dato, causa); lo demás se descarta', () => {
    const ok = { accion: 'rellenar', ref: 'm1e39', dato: 'inmueble.anio_construccion', causa: 'valor_no_aplicado' }
    expect(leerIncidenciasEjecucion([ok, { ...ok, causa: 'otra' }, { ...ok, ref: 'x' }, { ...ok, dato: 'Año 1975' }, { ...ok, accion: 'avanzar' }, null, 'texto'])).toEqual([ok])
    expect(leerIncidenciasEjecucion(undefined)).toEqual([])
    expect(leerIncidenciasEjecucion(Array.from({ length: 40 }, () => ok))).toHaveLength(15)
  })

  it('erroresDeIncidencias: ref + etiqueta del inventario guardado + clave + causa; nunca un valor ni una etiqueta con forma de dato personal', () => {
    const e = erroresDeIncidencias([
      { accion: 'rellenar', ref: 'm1e39', dato: 'inmueble.anio_construccion', causa: 'valor_no_aplicado' },
      { accion: 'rellenar', ref: 'm1e41', dato: 'inmueble.superficie_m2', causa: 'nodo_no_relocalizado' },
      { accion: 'rellenar', ref: 'm1e7', dato: 'tomador.nif', causa: 'valor_no_aplicado' },
      { accion: 'rellenar', ref: 'm1e99', dato: 'inmueble.numero', causa: 'valor_no_aplicado' },
    ], inventario)
    expect(e).toEqual([
      'ejecucion: rellenar m1e39 «Año de construcción» (inmueble.anio_construccion): valor_no_aplicado',
      'ejecucion: rellenar m1e41 «Superficie de la vivienda» (inmueble.superficie_m2): nodo_no_relocalizado',
      'ejecucion: rellenar m1e7 (tomador.nif): valor_no_aplicado',
      'ejecucion: rellenar m1e99 (inmueble.numero): valor_no_aplicado',
    ])
    expect(e.every((x) => x.startsWith(PREFIJO_ERROR_EJECUCION))).toBe(true)
    expect(erroresDeIncidencias([{ accion: 'rellenar', ref: 'm1e39', dato: 'inmueble.anio_construccion', causa: 'valor_no_aplicado' }], null)).toEqual(['ejecucion: rellenar m1e39 (inmueble.anio_construccion): valor_no_aplicado'])
  })

  it('el detalle de fin «nodo_no_relocalizado» está en la lista cerrada', () => {
    expect(DETALLES_FIN_EXPLORACION).toContain('nodo_no_relocalizado')
  })
})

describe('orden del lote y lote cortado (14/10/2026, exploración 8d0676f9: año y m² nunca se escribían)', () => {
  // Forma de la pantalla real de Allianz Hogar (solo estructura: etiquetas, roles y formControlName; ningún valor).
  const inv = inventario({
    elementos: [
      { tag: 'input', type: 'text', id: 'nx-input-4', formControlName: 'idNumber', etiqueta: 'Número de documento' },
      { tag: 'input', id: 'nx-input-159', formControlName: 'dateOfBirth', etiqueta: 'Fecha de nacimiento' },
      { tag: 'input', type: 'text', id: 'nx-input-9', formControlName: 'postalCode', etiqueta: 'Código postal' },
      { tag: 'input', type: 'text', id: 'nx-input-18', role: 'combobox', formControlName: 'streetName', etiqueta: 'Nombre de la vía' },
      { tag: 'input', type: 'number', id: 'nx-input-21', role: 'combobox', formControlName: 'streetNumber', etiqueta: 'Número' },
      { tag: 'input', type: 'number', id: 'nx-input-38', formControlName: 'yearOfConstruction', etiqueta: 'Año de construcción' },
      { tag: 'input', id: 'nx-input-45', formControlName: 'surfaceAreaLiving', etiqueta: 'Superficie de la vivienda' },
      { tag: 'input', type: 'text', id: 'pob', etiqueta: 'Población', autocompletar: true },
      { tag: 'select', id: 'uso', etiqueta: 'Uso', opciones: [{ valor: 'H', texto: 'Habitual' }] },
      { tag: 'input', type: 'radio', id: 'prop', name: 'regimen', etiqueta: 'Propietario' },
      { tag: 'button', id: 'siguiente', texto: 'Siguiente' },
    ],
  })
  const r = (id: string) => inv.marcos[0].elementos.find((e) => e.id === id)!.ref!
  const rellenar = (id: string, dato: string): Accion => ({ accion: 'rellenar', ref: r(id), dato })
  const avanzar: Accion = { accion: 'avanzar', ref: r('siguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }

  it('el sanitizador conserva `autocompletar` solo como booleano true y solo en input/textarea', () => {
    expect(inv.marcos[0].elementos.find((e) => e.id === 'pob')!.autocompletar).toBe(true)
    const otro = inventario({ elementos: [{ tag: 'input', id: 'a', autocompletar: 'si' }, { tag: 'button', id: 'b', texto: 'x', autocompletar: true }] })
    expect(otro.marcos[0].elementos.every((e) => e.autocompletar === undefined)).toBe(true)
  })

  it('rellenarRepinta: claves de autocompletado, role=combobox/searchbox y `autocompletar`; un campo simple, no', () => {
    const el = (id: string) => inv.marcos[0].elementos.find((e) => e.id === id)
    expect(rellenarRepinta('inmueble.codigo_postal', el('nx-input-9'))).toBe(true)
    expect(rellenarRepinta('inmueble.nombre_via', el('nx-input-18'))).toBe(true)
    expect(rellenarRepinta('inmueble.numero', el('nx-input-21'))).toBe(true)
    expect(rellenarRepinta('inmueble.nombre_via', el('pob')), 'aria-autocomplete/datalist').toBe(true)
    expect(rellenarRepinta('inmueble.anio_construccion', el('nx-input-38'))).toBe(false)
    expect(rellenarRepinta('inmueble.superficie_m2', el('nx-input-45'))).toBe(false)
    expect(rellenarRepinta('inmueble.superficie_m2', undefined), 'sin elemento: lo conservador').toBe(true)
  })

  it('paso 1 real: documento, fecha, CP, año, m² → año y m² ANTES del CP (que repinta)', () => {
    const lote = [rellenar('nx-input-4', 'tomador.nif'), rellenar('nx-input-159', 'tomador.fecha_nacimiento'), rellenar('nx-input-9', 'inmueble.codigo_postal'), rellenar('nx-input-38', 'inmueble.anio_construccion'), rellenar('nx-input-45', 'inmueble.superficie_m2')]
    expect(ordenarLote(lote, inv).map((a) => (a as { dato: string }).dato)).toEqual(['tomador.nif', 'tomador.fecha_nacimiento', 'inmueble.anio_construccion', 'inmueble.superficie_m2', 'inmueble.codigo_postal'])
  })

  it('paso 2 real: vía y número (combobox) DESPUÉS de año y m², en su orden relativo', () => {
    const lote = [rellenar('nx-input-18', 'inmueble.nombre_via'), rellenar('nx-input-21', 'inmueble.numero'), rellenar('nx-input-38', 'inmueble.anio_construccion'), rellenar('nx-input-45', 'inmueble.superficie_m2')]
    expect(ordenarLote(lote, inv).map((a) => (a as { dato: string }).dato)).toEqual(['inmueble.anio_construccion', 'inmueble.superficie_m2', 'inmueble.nombre_via', 'inmueble.numero'])
  })

  it('elegir y marcar van tras los rellenar simples; avanzar siempre el último; nada se pierde ni se inventa', () => {
    const elegir: Accion = { accion: 'elegir', ref: r('uso'), opcion: { valor: 'H' } }
    const marcar: Accion = { accion: 'marcar', ref: r('prop') }
    const lote = [elegir, rellenar('nx-input-9', 'inmueble.codigo_postal'), marcar, rellenar('nx-input-38', 'inmueble.anio_construccion'), avanzar]
    const o = ordenarLote(lote, inv)
    expect(o).toEqual([lote[3], elegir, lote[1], marcar, avanzar])
    expect(o).toHaveLength(lote.length)
    expect(lote[0]).toBe(elegir) // no muta la entrada
  })

  it('un lote ya ordenado, o con parar/terminar solos, queda igual', () => {
    const lote = [rellenar('nx-input-38', 'inmueble.anio_construccion'), rellenar('nx-input-9', 'inmueble.codigo_postal'), avanzar]
    expect(ordenarLote(lote, inv)).toEqual(lote)
    expect(ordenarLote([{ accion: 'parar', motivo: 'ambiguo' }], inv)).toEqual([{ accion: 'parar', motivo: 'ambiguo' }])
  })

  it('incidenciasLoteCortado: ref + clave (rellenar) o solo ref (elegir/marcar/avanzar); nunca opción ni valor', () => {
    const inc = incidenciasLoteCortado([rellenar('nx-input-38', 'inmueble.anio_construccion'), { accion: 'elegir', ref: r('uso'), opcion: { valor: 'H' } }, avanzar])
    expect(inc).toEqual([
      { accion: 'rellenar', ref: r('nx-input-38'), dato: 'inmueble.anio_construccion', causa: 'lote_cortado' },
      { accion: 'elegir', ref: r('uso'), causa: 'lote_cortado' },
      { accion: 'avanzar', ref: r('siguiente'), causa: 'lote_cortado' },
    ])
    expect(JSON.stringify(inc)).not.toContain('"H"')
    expect(incidenciasLoteCortado([{ accion: 'parar', motivo: 'ambiguo' }])).toEqual([])
  })

  it('leerIncidenciasEjecucion: lote_cortado en elegir/marcar/avanzar sin dato; esas acciones con otra causa, fuera', () => {
    const ok = [
      { accion: 'rellenar', ref: 'm1e39', dato: 'inmueble.anio_construccion', causa: 'lote_cortado' },
      { accion: 'avanzar', ref: 'm1e60', causa: 'lote_cortado' },
    ]
    expect(leerIncidenciasEjecucion([...ok, { accion: 'elegir', ref: 'm1e8', causa: 'valor_no_aplicado' }, { accion: 'parar', ref: 'm1e1', causa: 'lote_cortado' }])).toEqual(ok)
    // Lo que viniera de más (dato u opción en un elegir) no se copia.
    expect(leerIncidenciasEjecucion([{ accion: 'elegir', ref: 'm1e8', causa: 'lote_cortado', dato: 'x.y', opcion: { valor: 'H' } }])).toEqual([{ accion: 'elegir', ref: 'm1e8', causa: 'lote_cortado' }])
  })

  it('erroresDeIncidencias: lote_cortado con etiqueta (o texto del botón) y sin clave en las que no la tienen', () => {
    expect(erroresDeIncidencias([
      { accion: 'rellenar', ref: r('nx-input-38'), dato: 'inmueble.anio_construccion', causa: 'lote_cortado' },
      { accion: 'avanzar', ref: r('siguiente'), causa: 'lote_cortado' },
    ], inv)).toEqual([
      `ejecucion: rellenar ${r('nx-input-38')} «Año de construcción» (inmueble.anio_construccion): lote_cortado`,
      `ejecucion: avanzar ${r('siguiente')} «Siguiente»: lote_cortado`,
    ])
  })
})
