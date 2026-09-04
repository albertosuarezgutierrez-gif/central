// Rellenar la ficha de HOGAR desde el Catastro: con la dirección salen los
// metros construidos, el año del edificio y el código postal sin que el cliente
// tenga que buscar la escritura ni el recibo del IBI.
//
// Es el equivalente para hogar de lo que la matrícula hace para auto en
// `CamposPoliza.tsx` («Por la matrícula, este coche es de… / Usar esta fecha»):
// se OFRECE un dato y la persona decide. Aquí, además, el dato es oficial y
// gratis — los servicios web libres de la Sede Electrónica del Catastro, sin
// registro ni clave, que ya envuelve `@central/core-catastro`.
//
// ─── Lo que este fichero NO hace, y es deliberado ───────────────────────────
//  1. **No escribe en la BD.** Ni una fila. El Catastro puede ir atrasado
//     (una reforma que no se declaró, una segregación reciente) y quien firma
//     la póliza es el cliente: el dato entra en `datos_ramo` solo si él lo
//     acepta en la pantalla, por el camino normal de `PATCH /api/polizas/[id]`.
//     Guardarlo aquí convertiría una sugerencia en una declaración suya.
//  2. **No adivina el piso.** Un portal devuelve 15 inmuebles y el Catastro no
//     dice cuál es el suyo. Se devuelven los 15 con su planta y su puerta y
//     elige una persona — misma regla que el emparejamiento de versiones de
//     vehículo y que `elegirFicha()` en la vinculación con la cartera.
//  3. **No registra la dirección.** Una dirección es dato personal y esto corre
//     en un servidor con logs. Se loguea el MOTIVO del fallo, nunca la entrada.
//     ✅ El hueco que había aquí anotado está CERRADO (04/09/2026):
//     `bajarCatastro()` del paquete escribía la REFERENCIA catastral en un
//     `console.warn` al recibir un `<des>` de error, y atada a una sesión eso
//     era un registro de «qué vivienda miró esta persona». Ahora loguea el
//     motivo del servicio, el tiempo y una etiqueta opaca por llamada, sin la
//     referencia ni entera ni recortada (14 caracteres ya son el edificio) ni
//     la URL, que la lleva como parámetro. El log sigue sirviendo para
//     diagnosticar un corte del Catastro. Lo protege
//     `packages/core-catastro/src/http.test.ts` (cepo de comportamiento + cepo
//     estático sobre el código del paquete).
//
// ─── Por qué los estados son SEIS y no «ok / error» ─────────────────────────
// La regla de la casa: «dato que NO hay ≠ dato que NO se ha mirado». Un
// `{ metrosCuadrados: 0 }` o un `{}` devueltos porque el Catastro no contestó
// son una MENTIRA con forma de respuesta buena, y el cliente decide sobre ella.
// Cada situación tiene su estado y su código HTTP, y ninguno se colapsa:
//
//   ok                 200  el piso resuelto, con lo que el Catastro publique.
//   elegir             300  la dirección da VARIOS inmuebles: elige la persona.
//   via_ambigua        409  el callejero da varias vías y ninguna gana.
//   no_encontrado      404  el Catastro contestó y ahí no hay nada.
//   direccion_ilegible 422  no se pudo sacar sigla/calle/número del texto.
//   catastro_no_responde 502  no contestó (red, corte, 5xx). NO es «no existe».

import {
  camposDeRamo,
  normalizarDatosRamo,
} from '@central/module-seguros-portal'
import {
  paramsDnploc,
  precalificarHogar,
  type DatosHogar,
  type InmuebleCatastro,
  type PrecalificacionHogar,
} from '@central/core-catastro'
import {
  bajarCatastro as bajarCatastroReal,
  inmueblesPorDireccion as inmueblesPorDireccionReal,
} from '@central/core-catastro/http'

// ── Qué se ofrece, y con qué nombre ─────────────────────────────────────────

/**
 * Los tres campos del catálogo de hogar (`campos-ramo.ts`) que el Catastro
 * puede rellenar. Las CLAVES son las del catálogo, no las de `DatosHogar`: lo
 * que sale de aquí lo consume directamente el formulario, y un renombrado
 * silencioso dejaría la sugerencia sin destino sin que nada fallase.
 */
export const CAMPOS_DESDE_CATASTRO = ['metrosCuadrados', 'anioConstruccion', 'codigoPostal'] as const
export type CampoCatastro = (typeof CAMPOS_DESDE_CATASTRO)[number]

/** De dónde sale cada clave del catálogo dentro de la ficha del Catastro. */
const ORIGEN_EN_CATASTRO: Record<CampoCatastro, keyof DatosHogar> = {
  metrosCuadrados: 'metrosCuadrados',
  anioConstruccion: 'anioConstruccion',
  codigoPostal: 'codigoPostal',
}

/**
 * Por qué un campo viene a `null`. Son TRES motivos distintos y no uno:
 *  - `no_publicado`  el Catastro no lo trae para esta referencia.
 *  - `fuera_de_rango` lo trae, pero el catálogo lo rechaza (un edificio entero
 *    de 40.000 m², un año corrupto). Ofrecerlo metería basura en la ficha;
 *    callarlo del todo haría creer que el Catastro no lo publica.
 *  - `campo_desconocido` la clave ya no está en el catálogo de hogar. Es un
 *    fallo de programación, no un dato que falte, y por eso se dice aparte:
 *    si se colapsara con `no_publicado`, quitar el campo del catálogo dejaría
 *    esta ruta contestando «el Catastro no lo publica» para siempre.
 */
export type MotivoSinDato = 'no_publicado' | 'fuera_de_rango' | 'campo_desconocido'

/** Lo que se le OFRECE al formulario. `null` nunca es 0: es «no lo sabemos». */
export type SugerenciaHogar = {
  metrosCuadrados: number | null
  anioConstruccion: number | null
  codigoPostal: string | null
}

export type SinDatoHogar = { campo: CampoCatastro; motivo: MotivoSinDato }

/**
 * Pasa cada dato del Catastro por el MISMO filtro que el tecleado a mano
 * (`normalizarDatosRamo`), y campo a campo. Uno a uno y no todos juntos a
 * propósito: `normalizarDatosRamo` rechaza el objeto ENTERO ante un campo
 * inválido, así que un edificio con 40.000 m² se llevaría por delante un año de
 * construcción perfectamente bueno.
 */
export function sugerenciaHogar(d: DatosHogar): { sugerencia: SugerenciaHogar; sinDato: SinDatoHogar[] } {
  const catalogo = new Set(camposDeRamo('hogar').map((c) => c.id))
  const sugerencia: SugerenciaHogar = { metrosCuadrados: null, anioConstruccion: null, codigoPostal: null }
  const sinDato: SinDatoHogar[] = []

  for (const campo of CAMPOS_DESDE_CATASTRO) {
    if (!catalogo.has(campo)) {
      sinDato.push({ campo, motivo: 'campo_desconocido' })
      continue
    }
    const valor = d[ORIGEN_EN_CATASTRO[campo]]
    if (valor === null || valor === undefined) {
      sinDato.push({ campo, motivo: 'no_publicado' })
      continue
    }
    const r = normalizarDatosRamo('hogar', { [campo]: valor })
    const limpio = r.ok && r.datos ? r.datos[campo] : undefined
    if (limpio === undefined) {
      // `ok:false` (fuera de rango) y `datos:null` (valor de cajón) acaban
      // igual para quien mira la pantalla: no hay nada que ofrecer.
      sinDato.push({ campo, motivo: 'fuera_de_rango' })
      continue
    }
    if (campo === 'codigoPostal') sugerencia.codigoPostal = String(limpio)
    else if (campo === 'metrosCuadrados') sugerencia.metrosCuadrados = Number(limpio)
    else sugerencia.anioConstruccion = Number(limpio)
  }

  return { sugerencia, sinDato }
}

// ── Los pisos de un portal, para que elija una persona ──────────────────────

export type OpcionInmueble = {
  /** La de 20 caracteres: es lo que se manda de vuelta para pedir sus datos. */
  referencia: string
  /** «Planta baja, puerta A» · «Planta 2, puerta 14» · «Planta 3». */
  etiqueta: string
  planta: string | null
  puerta: string | null
  codigoPostal: string | null
}

/**
 * Etiqueta legible de un inmueble. `'00'` es la planta baja en la codificación
 * del Catastro y se dice con palabras: un «Planta 00» en la pantalla obliga a
 * la persona a traducir, y una persona que duda elige mal.
 */
export function etiquetaInmueble(i: InmuebleCatastro): string {
  const planta = i.planta?.trim() ?? ''
  const puerta = i.puerta?.trim() ?? ''
  const partes: string[] = []
  if (planta) {
    const n = Number(planta)
    partes.push(Number.isFinite(n) ? (n === 0 ? 'Planta baja' : `Planta ${n}`) : `Planta ${planta}`)
  }
  if (puerta) partes.push(`puerta ${puerta}`)
  return partes.length > 0 ? partes.join(', ') : 'Sin planta ni puerta informadas'
}

function opcionesDeInmuebles(inmuebles: InmuebleCatastro[]): OpcionInmueble[] {
  return inmuebles.map((i) => ({
    referencia: i.refCompleta,
    etiqueta: etiquetaInmueble(i),
    planta: i.planta,
    puerta: i.puerta,
    codigoPostal: i.codigoPostal,
  }))
}

// ── La consulta ─────────────────────────────────────────────────────────────

export type ConsultaCatastro =
  | { por: 'direccion'; direccion: string; municipio: string; provincia: string }
  | { por: 'referencia'; referencia: string }

export type EstadoCatastro = RespuestaCatastro['estado']

export type RespuestaCatastro =
  | {
      estado: 'ok'
      referencia: string
      sugerencia: SugerenciaHogar
      /** Por qué falta cada campo que viene a `null`. Nunca se calla un hueco. */
      sinDato: SinDatoHogar[]
      /** Contexto para que la persona reconozca el piso ANTES de aceptar nada. */
      contexto: { direccion: string | null; uso: string | null; localidad: string | null; provincia: string | null }
      /** Lo que se ha SUPUESTO (la superficie catastral es construida, no útil). */
      supuestos: PrecalificacionHogar['supuestos']
      /** Avisos que no bloquean pero hay que leer (un local clasificado como comercial). */
      avisos: string[]
    }
  | {
      estado: 'elegir'
      via: string
      inmuebles: OpcionInmueble[]
      /**
       * `true` = la dirección traía piso y puerta pero el Catastro no los casó,
       * y esta lista es la del PORTAL entero. La pantalla tiene que decirlo: si
       * no, la persona cree que el sistema ya sabe cuál es el suyo.
       */
      interiorNoCaso: boolean
    }
  | { estado: 'via_ambigua' }
  | { estado: 'no_encontrado' }
  | { estado: 'direccion_ilegible' }
  | { estado: 'referencia_invalida' }
  | { estado: 'catastro_no_responde' }

/**
 * Código HTTP de cada estado. Vive aquí, junto a los estados, para que añadir
 * uno nuevo sin código sea un error de tipos y no un 200 por descuido.
 *
 * `300 Multiple Choices` para `elegir` no es un adorno: no es un éxito (no hay
 * dato que ofrecer todavía) ni un error (la dirección es buena), y colapsarlo
 * en 200 lo dejaría indistinguible de una respuesta con datos para cualquiera
 * que mire el código y no el cuerpo. `fetch()` no lo sigue como redirección
 * —la especificación solo considera redirect 301/302/303/307/308— así que el
 * cuerpo llega intacto al navegador.
 *
 * Aun así, **la pantalla debe mirar `estado`, no el número**: el código es la
 * honestidad en el protocolo, el `estado` es el contrato con el cliente.
 */
export const HTTP_POR_ESTADO: Record<EstadoCatastro, number> = {
  ok: 200,
  elegir: 300,
  via_ambigua: 409,
  no_encontrado: 404,
  direccion_ilegible: 422,
  referencia_invalida: 422,
  catastro_no_responde: 502,
}

/** La red, inyectable para poder probar los caminos malos sin salir a internet. */
export type PuertoCatastro = {
  inmueblesPorDireccion: typeof inmueblesPorDireccionReal
  bajarCatastro: typeof bajarCatastroReal
}

const PUERTO_REAL: PuertoCatastro = {
  inmueblesPorDireccion: inmueblesPorDireccionReal,
  bajarCatastro: bajarCatastroReal,
}

/** La de 20 caracteres identifica el PISO; la de 14, el edificio (sin m² ni año). */
const RE_REF20 = /^[0-9A-Z]{20}$/

export function normalizarReferencia(v: string): string {
  return v.replace(/[\s-]/g, '').toUpperCase()
}

export async function consultarCatastroHogar(
  c: ConsultaCatastro,
  puerto: PuertoCatastro = PUERTO_REAL,
): Promise<RespuestaCatastro> {
  try {
    return c.por === 'referencia' ? await porReferencia(c.referencia, puerto) : await porDireccion(c, puerto)
  } catch (e) {
    // 🚨 El Catastro corta la conexión cuando se le pide mucho seguido, y
    // responde 503 sin previo aviso (medido el 04/09/2026 encadenando
    // consultas). Eso NO es «esa vivienda no existe»: devolver aquí un
    // `no_encontrado` —o peor, una sugerencia vacía— le diría al cliente que su
    // casa no está en el Catastro. Nunca se loguea la dirección: solo el motivo.
    console.warn('[catastro-portal] el servicio no respondió:', e instanceof Error ? e.message : 'desconocido')
    return { estado: 'catastro_no_responde' }
  }
}

async function porReferencia(referencia: string, puerto: PuertoCatastro): Promise<RespuestaCatastro> {
  const rc = normalizarReferencia(referencia)
  if (!RE_REF20.test(rc)) return { estado: 'referencia_invalida' }
  const datos = await puerto.bajarCatastro(rc)
  // `null` aquí es el Catastro diciendo que no hay nada con esa referencia (un
  // `<des>` de error), no un fallo de red: eso llega por el `catch` de arriba.
  if (datos === null) return { estado: 'no_encontrado' }
  return desdePrecalificacion(rc, precalificarHogar(datos))
}

async function porDireccion(
  c: Extract<ConsultaCatastro, { por: 'direccion' }>,
  puerto: PuertoCatastro,
): Promise<RespuestaCatastro> {
  const p = paramsDnploc(c.direccion)
  if (p === null) return { estado: 'direccion_ilegible' }

  const lugar = { provincia: c.provincia.trim().toUpperCase(), municipio: c.municipio.trim().toUpperCase() }
  const hayInterior = !!(p.bloque || p.escalera || p.planta || p.puerta)

  // 1º con el interior, que es lo que acota al PISO y da la referencia de 20
  // (y con ella los m² y el año del piso, no los del edificio).
  let r = await puerto.inmueblesPorDireccion({ ...p, ...lugar })
  // `null` = el callejero da varias vías y ninguna gana. Seguir con el nombre
  // crudo devolvería los pisos de OTRA calle, que es peor que no devolver nada.
  if (r === null) return { estado: 'via_ambigua' }

  let interiorNoCaso = false
  if (r.inmuebles.length === 0 && hayInterior) {
    // El formato del interior casi nunca casa a la primera («4» vs «04»,
    // «IZ» vs «A», el 2º-14 de CL SAN VICENTE 40 que el Catastro archiva como
    // planta «02» puerta «14»). Rendirse aquí diría «tu casa no existe» cuando
    // lo que no existe es esa forma de escribir el piso.
    interiorNoCaso = true
    r = await puerto.inmueblesPorDireccion({
      ...p,
      bloque: null,
      escalera: null,
      planta: null,
      puerta: null,
      ...lugar,
    })
    if (r === null) return { estado: 'via_ambigua' }
  }

  if (r.inmuebles.length === 0) return { estado: 'no_encontrado' }
  if (r.inmuebles.length > 1) {
    return { estado: 'elegir', via: r.via, inmuebles: opcionesDeInmuebles(r.inmuebles), interiorNoCaso }
  }

  const unico = r.inmuebles[0]
  const datos = await puerto.bajarCatastro(unico.refCompleta)
  if (datos === null) return { estado: 'no_encontrado' }
  return desdePrecalificacion(unico.refCompleta, precalificarHogar(datos))
}

function desdePrecalificacion(referencia: string, pre: PrecalificacionHogar): RespuestaCatastro {
  const { sugerencia, sinDato } = sugerenciaHogar(pre.datos)
  return {
    estado: 'ok',
    referencia,
    sugerencia,
    sinDato,
    contexto: {
      direccion: pre.datos.direccion,
      uso: pre.datos.uso,
      localidad: pre.datos.localidad,
      provincia: pre.datos.provincia,
    },
    supuestos: pre.supuestos,
    avisos: pre.avisos,
  }
}
