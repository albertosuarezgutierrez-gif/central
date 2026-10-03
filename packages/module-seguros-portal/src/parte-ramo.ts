// Los campos POR RAMO del parte de siniestro que da el CLIENTE en el portal
// (columna `datos_ramo jsonb` de `portal_parte_siniestro`, 03/10/2026).
//
// ── QUÉ SE PREGUNTA (regla de Alberto, 03/10/2026) ──────────────────────────
// Solo lo que una persona que ACABA de tener un siniestro SABE y puede
// contestar: qué pasó, daños propios, heridos, contrarios/afectados, parte
// amistoso, policía, quién conducía. NUNCA datos de tramitación de CIMA
// (perito, tramitador, reserva, indemnización, pagos, situación, expediente,
// posición/responsabilidad oficial, coberturas, IBAN, códigos). Cada ramo,
// corto: pocas preguntas, las útiles. Nada es obligatorio.
//
// ── DE DÓNDE SALEN LAS CLAVES ───────────────────────────────────────────────
// · Las que ya existen en el catálogo del corredor (`siniestro-ramo.ts` de
//   `@central/module-seguros`, `CAMPOS_POR_RAMO_SINIESTRO`) se TOMAN de ahí por
//   id (`del()`): misma clave, mismo tipo, mismas opciones, para que al abrir el
//   siniestro en el CRM se vuelquen sin traducir. Aquí solo se cambia, si hace
//   falta, la ETIQUETA (el corredor y el cliente no hablan igual).
// · Las que el corredor no tiene (listas repetibles de contrarios, afectados y
//   heridos; estancias; origen; «¿crees que fue culpa tuya?») son PROPIAS del
//   portal y se declaran aquí.
//
// 🚨 `culpaPropiaDeclarada` es la IMPRESIÓN del cliente, guardada como
// declaración en el parte. NO es `culpabilidad` del catálogo del corredor a
// propósito (clave distinta): no puede volcarse encima de lo que decida la
// compañía (`posicion_cima`).
//
// 🚨 Triestado: `true`/`false` = ha contestado; clave AUSENTE = no lo ha
// contestado («No lo sé»). Nunca se escribe `false` por defecto.
//
// La validación de verdad la hace el SERVIDOR con el ramo de la póliza que ha
// leído de la cartera autorizada (no del cuerpo de la petición): ver
// `aplicarRamoAlParte` en `parte-siniestro.ts`.

import {
  CAMPOS_POR_RAMO_SINIESTRO,
  eurEs,
  normalizarValorCampoSiniestro,
  type CampoRamoSiniestro,
  type OpcionCampoRamoSiniestro,
  type RamoSiniestro,
} from '@central/module-seguros'

import { ramoDelParte, type TipoSiniestro } from './tipo-siniestro.ts'

/** Cuándo tiene sentido el campo. La pantalla lo oculta y el servidor lo DESCARTA si no se cumple. */
type Condicion = {
  /** Solo si el cliente contestó «Sí» a esa pregunta común. */
  readonly soloSi?: 'hayHeridos' | 'hayTerceros'
  /** Solo si marcó uno de estos tipos. */
  readonly soloTipos?: readonly TipoSiniestro[]
}

export type CampoParteSimple = CampoRamoSiniestro & Condicion
export type CampoParteMulti = Condicion & {
  readonly id: string
  readonly etiqueta: string
  readonly ayuda?: string
  readonly tipo: 'multiopcion'
  readonly opciones: readonly OpcionCampoRamoSiniestro[]
}
export type SubcampoLista = {
  readonly id: string
  readonly etiqueta: string
  readonly tipo: 'texto' | 'telefono' | 'opcion' | 'triestado'
  readonly opciones?: readonly OpcionCampoRamoSiniestro[]
  /** Longitud máxima de un texto (por defecto `MAX_TEXTO_LISTA`). */
  readonly max?: number
}
export type CampoParteLista = Condicion & {
  readonly id: string
  readonly etiqueta: string
  readonly ayuda?: string
  readonly tipo: 'lista'
  /** Tope de elementos: por encima se descartan (no se rechaza el parte). */
  readonly maxElementos: number
  /** Cómo se llama UNO («Afectado», «Herido»…), para «Añadir otro» y la ficha. */
  readonly elemento: string
  readonly subcampos: readonly SubcampoLista[]
}
export type CampoParte = CampoParteSimple | CampoParteMulti | CampoParteLista

export type ElementoLista = Record<string, string | boolean>
export type ValorParte = string | number | boolean | string[] | ElementoLista[]
/** Lo que se guarda en `datos_ramo`. Clave ausente = no contestado. */
export type DatosRamoParte = Record<string, ValorParte>

export const MAX_TEXTO_LISTA = 120
export const MAX_TELEFONO = 20
const RE_TELEFONO = /^[0-9+()\s.-]{3,20}$/

/**
 * Toma un campo del catálogo del CORREDOR por id. Si el id no existe en ese
 * ramo, falla al cargar el módulo (lo caza su test antes que nadie): un campo
 * del portal que no casa con el CRM no se vuelca y nadie lo vería.
 */
function del(ramo: RamoSiniestro, id: string, cambia: Partial<Pick<CampoRamoSiniestro, 'etiqueta' | 'ayuda'>> & Condicion = {}): CampoParteSimple {
  const base = CAMPOS_POR_RAMO_SINIESTRO[ramo].find((c) => c.id === id)
  if (!base) throw new Error(`parte-ramo: «${id}» no está en el catálogo de siniestros de ${ramo}`)
  // `ayuda` del corredor se quita salvo que se dé otra: habla de tablas internas.
  const { ayuda: _ayuda, ...resto } = base
  return { ...resto, ...cambia }
}

// ── Listas repetibles ────────────────────────────────────────────────────────

const LESIONADOS: CampoParteLista = {
  id: 'lesionados',
  etiqueta: 'Personas heridas',
  ayuda: 'Añade a cada persona herida. Nada de esto es obligatorio: pon lo que sepas.',
  tipo: 'lista',
  soloSi: 'hayHeridos',
  maxElementos: 10,
  elemento: 'Herido',
  subcampos: [
    { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    {
      id: 'papel',
      etiqueta: '¿Quién es?',
      tipo: 'opcion',
      opciones: [
        { valor: 'yo', etiqueta: 'Yo' },
        { valor: 'acompanante', etiqueta: 'Iba conmigo o vive conmigo' },
        { valor: 'tercero', etiqueta: 'Otra persona' },
      ],
    },
    { id: 'telefono', etiqueta: 'Teléfono (si lo sabes)', tipo: 'telefono' },
    { id: 'atendido', etiqueta: '¿Le han atendido los servicios sanitarios?', tipo: 'triestado' },
  ],
}

const CONTRARIOS: CampoParteLista = {
  id: 'contrarios',
  etiqueta: 'Otros vehículos implicados',
  ayuda: 'Uno por vehículo. Copia lo que puedas del parte amistoso o de su documentación.',
  tipo: 'lista',
  soloSi: 'hayTerceros',
  maxElementos: 5,
  elemento: 'Vehículo contrario',
  subcampos: [
    { id: 'conductor', etiqueta: 'Nombre del conductor', tipo: 'texto' },
    { id: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', max: 15 },
    { id: 'aseguradora', etiqueta: 'Su aseguradora', tipo: 'texto' },
    { id: 'poliza', etiqueta: 'Su nº de póliza', tipo: 'texto', max: 40 },
    { id: 'telefono', etiqueta: 'Su teléfono', tipo: 'telefono' },
  ],
}

function afectados(elemento: string, etiqueta: string): CampoParteLista {
  return {
    id: 'afectados',
    etiqueta,
    ayuda: 'Añade a cada uno (el vecino de abajo, la comunidad, otro piso…). Pon lo que sepas.',
    tipo: 'lista',
    soloSi: 'hayTerceros',
    maxElementos: 10,
    elemento,
    subcampos: [
      { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
      { id: 'ubicacion', etiqueta: 'Piso o dirección', tipo: 'texto' },
      { id: 'telefono', etiqueta: 'Teléfono (si lo sabes)', tipo: 'telefono' },
      { id: 'dano', etiqueta: 'Qué daño tiene', tipo: 'texto', max: 200 },
    ],
  }
}

// ── Campos propios del portal ────────────────────────────────────────────────

const CULPA_PROPIA: CampoParteSimple = {
  id: 'culpaPropiaDeclarada',
  etiqueta: '¿Crees que fue culpa tuya?',
  ayuda: 'Solo tu impresión: quien decide la culpa es la compañía.',
  tipo: 'triestado',
}

const ORIGEN_DANO: CampoParteSimple = {
  id: 'origenDano',
  etiqueta: '¿De dónde viene el daño?',
  tipo: 'opcion',
  opciones: [
    { valor: 'propia', etiqueta: 'De mi casa o mi local' },
    { valor: 'otra_vivienda', etiqueta: 'Viene de otra vivienda o local' },
    { valor: 'comunidad', etiqueta: 'De zonas comunes o de la comunidad' },
    { valor: 'exterior', etiqueta: 'De fuera (lluvia, calle, obra)' },
  ],
}

const AVERIA_ACTIVA: CampoParteSimple = {
  id: 'averiaActiva',
  etiqueta: '¿Sigue activo el problema ahora mismo?',
  ayuda: 'Sigue saliendo agua, sigue sin luz, la puerta no cierra…',
  tipo: 'triestado',
}

const DENUNCIA: CampoParteSimple = {
  id: 'denunciaPresentada',
  etiqueta: '¿Has puesto denuncia?',
  ayuda: 'En un robo la compañía casi siempre la pide.',
  tipo: 'triestado',
  soloTipos: ['robo', 'vandalismo'],
}

const ESTANCIAS_HOGAR: CampoParteMulti = {
  id: 'estanciasAfectadas',
  etiqueta: '¿Qué está dañado?',
  ayuda: 'Marca todo lo que esté afectado.',
  tipo: 'multiopcion',
  opciones: [
    { valor: 'cocina', etiqueta: 'Cocina' },
    { valor: 'bano', etiqueta: 'Baño' },
    { valor: 'salon', etiqueta: 'Salón' },
    { valor: 'dormitorio', etiqueta: 'Dormitorio' },
    { valor: 'techo', etiqueta: 'Techo' },
    { valor: 'paredes', etiqueta: 'Paredes' },
    { valor: 'suelo', etiqueta: 'Suelo' },
    { valor: 'ventanas_puertas', etiqueta: 'Ventanas o puertas' },
    { valor: 'muebles', etiqueta: 'Muebles' },
    { valor: 'electrodomesticos', etiqueta: 'Electrodomésticos' },
    { valor: 'exterior', etiqueta: 'Terraza, fachada o tejado' },
    { valor: 'garaje_trastero', etiqueta: 'Garaje o trastero' },
    { valor: 'zonas_comunes', etiqueta: 'Zonas comunes' },
  ],
}

const ZONAS_LOCAL: CampoParteMulti = {
  id: 'zonasAfectadasLocal',
  etiqueta: '¿Qué está dañado?',
  ayuda: 'Marca todo lo que esté afectado.',
  tipo: 'multiopcion',
  opciones: [
    { valor: 'zona_venta', etiqueta: 'Zona de venta o atención' },
    { valor: 'almacen', etiqueta: 'Almacén' },
    { valor: 'oficina', etiqueta: 'Oficina' },
    { valor: 'aseos', etiqueta: 'Aseos' },
    { valor: 'techo_paredes_suelo', etiqueta: 'Techo, paredes o suelo' },
    { valor: 'escaparate', etiqueta: 'Escaparate, cristales o rótulo' },
    { valor: 'mobiliario', etiqueta: 'Mobiliario' },
    { valor: 'maquinaria', etiqueta: 'Maquinaria o equipos' },
    { valor: 'mercancia', etiqueta: 'Mercancía o género' },
    { valor: 'exterior', etiqueta: 'Fachada o exterior' },
  ],
}

const ACTIVIDAD_PARADA: CampoParteSimple = {
  id: 'actividadParalizada',
  etiqueta: '¿Has tenido que cerrar o parar la actividad?',
  tipo: 'triestado',
}

function personaAfectada(etiqueta: string): CampoParteSimple {
  return { id: 'personaAfectada', etiqueta, tipo: 'texto' }
}

const BAJA: CampoParteSimple = { id: 'bajaMedica', etiqueta: '¿Tiene la baja médica?', tipo: 'triestado' }

// ── El catálogo ──────────────────────────────────────────────────────────────

const VEHICULO = (r: 'auto' | 'moto'): readonly CampoParte[] => [
  del(r, 'existeDeclaracionAmistosa', { etiqueta: '¿Habéis rellenado el parte amistoso?' }),
  del(r, 'existeAtestado', { etiqueta: '¿Ha venido la policía o hay atestado?' }),
  del(r, 'cuerpoPolicial', { etiqueta: 'Si vino la policía, ¿cuál?' }),
  del(r, 'vehiculoInmovilizado', {
    etiqueta: '¿Tu vehículo se ha quedado sin poder circular?',
    ayuda: 'Marca «Sí» si hace falta grúa.',
  }),
  del(r, 'conductorDistintoTomador', { etiqueta: '¿Conducía otra persona distinta del titular de la póliza?' }),
  CULPA_PROPIA,
  CONTRARIOS,
  LESIONADOS,
]

const VIVIENDA = (r: 'hogar' | 'comunidades'): readonly CampoParte[] => [
  ORIGEN_DANO,
  AVERIA_ACTIVA,
  ESTANCIAS_HOGAR,
  del(r, 'habitabilidadAfectada', { etiqueta: '¿La vivienda se ha quedado sin poder habitarse?' }),
  DENUNCIA,
  afectados('Afectado', 'Vecinos u otras personas perjudicadas'),
  LESIONADOS,
]

export const CAMPOS_PARTE_POR_RAMO: Readonly<Record<RamoSiniestro, readonly CampoParte[]>> = {
  auto: VEHICULO('auto'),
  moto: VEHICULO('moto'),
  hogar: VIVIENDA('hogar'),
  comunidades: VIVIENDA('comunidades'),
  comercio: [
    ORIGEN_DANO,
    AVERIA_ACTIVA,
    ZONAS_LOCAL,
    ACTIVIDAD_PARADA,
    DENUNCIA,
    afectados('Afectado', 'Vecinos, clientes u otras personas perjudicadas'),
    LESIONADOS,
  ],
  responsabilidad_civil: [
    del('responsabilidad_civil', 'tipoReclamante', { etiqueta: '¿Quién te reclama?' }),
    del('responsabilidad_civil', 'viaReclamacion', { etiqueta: '¿Cómo te lo han reclamado?' }),
    del('responsabilidad_civil', 'cuantiaReclamadaInicial', { etiqueta: '¿Cuánto te reclaman? (si lo sabes)' }),
    del('responsabilidad_civil', 'danosMateriales', { etiqueta: '¿Hay cosas dañadas?' }),
    afectados('Perjudicado', 'Personas perjudicadas o que reclaman'),
    LESIONADOS,
  ],
  vida: [
    personaAfectada('Persona fallecida o afectada'),
    del('vida', 'causaOrigen', { etiqueta: '¿Fue por enfermedad o por un accidente?' }),
  ],
  decesos: [personaAfectada('Persona fallecida')],
  salud: [personaAfectada('Persona asegurada afectada')],
  accidentes: [personaAfectada('Persona accidentada'), BAJA],
  otros: [afectados('Afectado', 'Otras personas perjudicadas'), LESIONADOS],
}

/** Los campos del parte para ESE ramo (`'comunidad'` incluido). `[]` = ramo desconocido. */
export function camposParteDeRamo(ramo: string | null | undefined): readonly CampoParte[] {
  const r = ramoDelParte(ramo)
  return r === null ? [] : CAMPOS_PARTE_POR_RAMO[r]
}

/** Contexto para las condiciones: lo YA normalizado del parte común. */
export type ContextoParte = {
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  tipoSiniestro: string | null
}

/** ¿Se enseña / se acepta este campo con lo que ha contestado? */
export function campoAplica(campo: Condicion, ctx: ContextoParte): boolean {
  if (campo.soloSi !== undefined && ctx[campo.soloSi] !== true) return false
  if (campo.soloTipos !== undefined && !(ctx.tipoSiniestro !== null && (campo.soloTipos as readonly string[]).includes(ctx.tipoSiniestro)))
    return false
  return true
}

function textoAcotado(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (t === '' || t.length > max) return undefined
  return t
}

function triestado(v: unknown): boolean | undefined {
  if (v === true || v === false) return v
  if (typeof v !== 'string') return undefined
  const t = v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (t === 'si' || t === 'true') return true
  if (t === 'no' || t === 'false') return false
  return undefined
}

function normalizarElemento(subcampos: readonly SubcampoLista[], bruto: unknown): ElementoLista | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null
  const e = bruto as Record<string, unknown>
  const fuera: ElementoLista = {}
  for (const s of subcampos) {
    const v = e[s.id]
    let n: string | boolean | undefined
    if (s.tipo === 'triestado') n = triestado(v)
    else if (s.tipo === 'opcion') n = typeof v === 'string' && (s.opciones ?? []).some((o) => o.valor === v) ? v : undefined
    else if (s.tipo === 'telefono') {
      const t = textoAcotado(v, MAX_TELEFONO)
      n = t !== undefined && RE_TELEFONO.test(t) ? t : undefined
    } else n = textoAcotado(v, s.max ?? MAX_TEXTO_LISTA)
    if (n !== undefined) fuera[s.id] = n
  }
  return Object.keys(fuera).length === 0 ? null : fuera
}

/**
 * Lo que llega del formulario → lo que se guarda en `datos_ramo`, o `null` si
 * no queda nada.
 *
 * 🚨 Descarta, no rechaza: una clave que no es del ramo, un valor fuera de la
 * lista, un texto demasiado largo, elementos de más en una lista… se PIERDEN
 * sin tumbar el parte (lo urgente es que el parte entre). Solo se aceptan las
 * claves del `ramo` que se pasa, y ese ramo lo pone el SERVIDOR leyendo la
 * póliza autorizada, nunca el cuerpo de la petición.
 */
export function normalizarDatosRamoParte(ramo: string | null | undefined, entrada: unknown, ctx: ContextoParte): DatosRamoParte | null {
  const campos = camposParteDeRamo(ramo)
  if (campos.length === 0) return null
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return null
  const bruto = entrada as Record<string, unknown>
  const datos: DatosRamoParte = {}

  for (const campo of campos) {
    if (!Object.hasOwn(bruto, campo.id)) continue
    if (!campoAplica(campo, ctx)) continue
    const v = bruto[campo.id]
    if (v === null || v === undefined) continue

    if (campo.tipo === 'lista') {
      if (!Array.isArray(v)) continue
      const elementos = v
        .slice(0, campo.maxElementos)
        .map((x) => normalizarElemento(campo.subcampos, x))
        .filter((x): x is ElementoLista => x !== null)
      if (elementos.length > 0) datos[campo.id] = elementos
      continue
    }
    if (campo.tipo === 'multiopcion') {
      if (!Array.isArray(v)) continue
      const marcados = new Set(v.filter((x): x is string => typeof x === 'string'))
      const enOrden = campo.opciones.map((o) => o.valor).filter((x) => marcados.has(x))
      if (enOrden.length > 0) datos[campo.id] = enOrden
      continue
    }
    if (campo.tipo === 'triestado') {
      const n = triestado(v)
      if (n !== undefined) datos[campo.id] = n
      continue
    }
    const n = normalizarValorCampoSiniestro(campo, v)
    if (n === undefined || n === 'invalido') continue
    datos[campo.id] = n
  }

  return Object.keys(datos).length === 0 ? null : datos
}

// ── Lectura para la ficha del corredor y el aviso ────────────────────────────

/** Todas las definiciones por id (la primera gana: un mismo id es el mismo campo en todos los ramos). */
const DEFINICION_POR_ID: ReadonlyMap<string, CampoParte> = (() => {
  const m = new Map<string, CampoParte>()
  for (const lista of Object.values(CAMPOS_PARTE_POR_RAMO)) for (const c of lista) if (!m.has(c.id)) m.set(c.id, c)
  return m
})()

function etiquetaOpcion(opciones: readonly OpcionCampoRamoSiniestro[] | undefined, v: unknown): string | null {
  if (typeof v !== 'string') return null
  return (opciones ?? []).find((o) => o.valor === v)?.etiqueta ?? null
}

function siNo(v: unknown): string | null {
  return v === true ? 'Sí' : v === false ? 'No' : null
}

function textoElemento(s: readonly SubcampoLista[], e: unknown): string | null {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return null
  const x = e as Record<string, unknown>
  const partes = s
    .map((sc) => {
      const v = x[sc.id]
      const t =
        sc.tipo === 'triestado'
          ? siNo(v)
          : sc.tipo === 'opcion'
            ? etiquetaOpcion(sc.opciones, v)
            : typeof v === 'string' && v.trim() !== ''
              ? v.trim()
              : null
      return t === null ? null : `${sc.etiqueta.replace(/ \(si lo sabes\)$/, '')}: ${t}`
    })
    .filter((t): t is string => t !== null)
  return partes.length === 0 ? null : partes.join(' · ')
}

export type LineaDatoRamo = { etiqueta: string; valor: string; esLista: boolean }

/**
 * `datos_ramo` (tal cual sale de la BD, sin fiarse de su forma) → líneas
 * legibles. Lo que no se reconoce se ignora; nunca lanza. Una lista sale como
 * una línea por elemento («Afectado 1», «Afectado 2»…).
 */
export function lineasDatosRamoParte(datos: unknown): LineaDatoRamo[] {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return []
  const d = datos as Record<string, unknown>
  const lineas: LineaDatoRamo[] = []
  for (const [id, campo] of DEFINICION_POR_ID) {
    if (!Object.hasOwn(d, id)) continue
    const v = d[id]
    if (campo.tipo === 'lista') {
      if (!Array.isArray(v)) continue
      v.forEach((e, i) => {
        const t = textoElemento(campo.subcampos, e)
        if (t !== null) lineas.push({ etiqueta: `${campo.elemento} ${i + 1}`, valor: t, esLista: true })
      })
      continue
    }
    let t: string | null = null
    if (campo.tipo === 'multiopcion') {
      t = Array.isArray(v)
        ? v
            .map((x) => etiquetaOpcion(campo.opciones, x))
            .filter((x): x is string => x !== null)
            .join(', ') || null
        : null
    } else if (campo.tipo === 'triestado') t = siNo(v)
    else if (campo.tipo === 'opcion') t = etiquetaOpcion(campo.opciones, v)
    else if (campo.tipo === 'dinero' && typeof v === 'number') t = eurEs(v)
    else if (typeof v === 'string' || typeof v === 'number') t = String(v)
    if (t !== null) lineas.push({ etiqueta: campo.etiqueta, valor: t, esLista: false })
  }
  return lineas
}

/**
 * Los 2-3 datos CLAVE para el aviso de Telegram: respuestas sueltas, nunca
 * nombres ni teléfonos (las listas solo se CUENTAN: «2 afectados»). Un chat no
 * es donde viven los datos personales de terceros.
 */
export function datosClaveParte(datos: unknown, max = 3): string[] {
  const lineas = lineasDatosRamoParte(datos)
  const sueltas = lineas.filter((l) => !l.esLista).map((l) => `${l.etiqueta} ${l.valor}`)
  const cuentas: string[] = []
  if (typeof datos === 'object' && datos !== null && !Array.isArray(datos)) {
    for (const [id, campo] of DEFINICION_POR_ID) {
      if (campo.tipo !== 'lista') continue
      const v = (datos as Record<string, unknown>)[id]
      const n = lineas.filter((l) => l.esLista && l.etiqueta.startsWith(`${campo.elemento} `)).length
      if (Array.isArray(v) && n > 0) cuentas.push(`${campo.etiqueta}: ${n}`)
    }
  }
  return [...cuentas, ...sueltas].slice(0, max)
}
