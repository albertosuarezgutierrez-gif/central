/**
 * Retarificación de una póliza de la cartera — **la lógica que GASTA 0,50€**,
 * en un solo sitio.
 *
 * ─── Por qué existe este fichero ─────────────────────────────────────────────
 * Hasta el 03/09/2026 todo esto vivía dentro de
 * `app/api/cartera/polizas/[polizaId]/retarificar/route.ts`, y era alcanzable
 * solo desde `apps/asegura` con su cookie de sesión. Al unificar la correduría
 * en `apps/plataforma` → `/correduria`, la MISMA operación tiene que poder
 * pedirse por el puerto de operador (`/api/operador/codeoscopic/retarificar`).
 *
 * La tentación era copiar la ruta. No se ha hecho a propósito: **dos copias de
 * la lógica que gasta dinero divergen, y la que diverge es la que nadie mira**
 * — una arreglaría un reparo o un supuesto y la otra seguiría cobrando 0,50€
 * por un cuerpo mal construido. Aquí está la orquestación entera (preparar
 * auto/hogar, revisar gratis, llamar al embudo, redactar la respuesta) y las
 * dos rutas la llaman.
 *
 * Lo único que NO está aquí, y es justo lo que diferencia a las dos rutas:
 *   - **quién autoriza** (cookie de sesión de asegura vs Bearer del operador +
 *     `confirmado === true`),
 *   - **de dónde sale `solicitadoPor`** (el nombre de la sesión vs el que
 *     manda plataforma), y
 *   - **la línea que paga**, `await cotizar(p.peticion)`.
 *
 * Esa tercera se queda fuera a propósito, y no por descuido: el guardián
 * `test/regression-asegura-gasto-codeoscopic.test.ts` identifica las rutas que
 * gastan buscando `cotizar(` **en el fichero de la ruta**, y con eso les
 * prohíbe exponer un `GET`. Escondiendo el embudo aquí dentro ese guardián se
 * quedaría en verde sin vigilar nada — el fallo más caro que hay. Así que la
 * llamada que cuesta 0,50€ vive donde vive la autorización, y las dos rutas
 * quedan reducidas a: autorizar · `prepararRetarificacion()` ·
 * `cotizar()` · `respuestaRetarificacion()`.
 *
 * Esto NO abre un segundo camino al dinero: el interruptor, el libro de consumo
 * y el tope siguen dentro de `cotizar()`, que es el único que habla con el
 * vendor. Este fichero no hace ni una petición facturable.
 *
 * No devuelve `NextResponse`: devuelve `{ status, cuerpo }`. Así es lógica pura
 * (testeable, sin `next/server` de por medio) y cada ruta la serializa.
 */

import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion, type OrigenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarAuto, type Resueltos } from '@/lib/codeoscopic/desde-cartera'
import {
  precalificarHogarCartera,
  type CatalogoResuelto,
  type CatastroHogar,
  type ResueltosHogar,
  type SupuestoHogar,
} from '@/lib/codeoscopic/desde-cartera-hogar'
import {
  construirPeticionAuto,
  revisarDatosAuto,
  type DatosAuto,
} from '@/lib/codeoscopic/peticion-auto'
import {
  construirPeticionHogar,
  revisarDatosHogar,
  CATALOGOS_HOGAR_OBLIGATORIOS,
  type DatosHogar,
} from '@/lib/codeoscopic/peticion-hogar'
import type { Supuesto } from '@/lib/codeoscopic/desde-cartera'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { sanearSupuestos } from '@/lib/codeoscopic/precalificar-publica'
import {
  marcas,
  modelos,
  versiones,
  tiposDeMotor,
  tiposDeGaraje,
  estadosCiviles,
  municipiosPorCp,
  lineasDeSeguro,
  hogarDisponible,
  catalogoHogar,
  esCatalogoHogar,
  CATALOGOS_HOGAR,
  tiposDeVia,
  type DisponibilidadHogar,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import type { PeticionCotizacion, ResultadoCotizacion } from '@/lib/codeoscopic/cotizar'
import { MARCA_SIMULACION } from '@/lib/codeoscopic/simulacion'
import { resumirCotizacion } from '@/lib/codeoscopic/respuesta'
import { registrarErrorCartera, type CausaErrorCartera } from '@/lib/error-cartera'

// ─── Retarificación (la que cuesta dinero) ───────────────────────────────────

export type CuerpoRetarificacion = {
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  catastro?: Record<string, unknown> | null
}

/** Lo que la ruta serializa tal cual. `status` incluido para no repartirlo por ahí. */
export type ResultadoRetarificar = {
  status: number
  cuerpo: Record<string, unknown>
}

/**
 * Prepara la retarificación de `polizaId`: resuelve la correduría, lee la
 * póliza, mapea el ramo y **revisa el cuerpo GRATIS**. Devuelve o la petición
 * lista para `cotizar()`, o el corte que hay que responder tal cual.
 *
 * 🚨 **Esta función NO gasta.** Corta antes de llegar al vendor si falta un
 * dato (422), si el ramo no se retarifica (409), si la póliza no es de esta
 * correduría (404) o si no se puede resolver la correduría (503) — y en todos
 * esos casos la respuesta lleva `gastado: '0,00€'`.
 *
 * ── Por qué la llamada a `cotizar()` se queda FUERA, en la ruta ──────────────
 * Es deliberado y tiene dueño: `test/regression-asegura-gasto-codeoscopic.test.ts`
 * marca las rutas que gastan buscando `cotizar(` **en el fichero de la ruta**, y
 * con eso prohíbe que ninguna exponga un `GET` (un prefetch del navegador
 * dispararía el cargo). Si el embudo se escondiera aquí dentro, ese guardián se
 * quedaría ciego: seguiría en verde sin vigilar nada. Así que la línea que paga
 * vive donde vive la autorización —la ruta— y todo lo demás vive aquí.
 *
 * `solicitadoPor` va al libro de consumo: es quién responde de este cargo.
 */
export async function prepararRetarificacion(entrada: {
  polizaId: string
  solicitadoPor: string
  cuerpo: CuerpoRetarificacion
}): Promise<PreparadoRetarificacion> {
  const { polizaId, solicitadoPor } = entrada
  const cuerpo = entrada.cuerpo ?? {}

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return {
      estado: 'corte',
      respuesta: {
        status: 503,
        cuerpo: {
          error:
            'No se ha podido resolver la correduría, así que ni se consulta la cartera sin filtro ' +
            'ni se cotiza. Esto NO significa que la póliza no exista.',
        },
      },
    }
  }

  // 🛡️ Aislamiento: la póliza se busca SIEMPRE dentro de esta correduría. Con
  // BYPASSRLS un id ajeno no daría error — daría la póliza de otro.
  const origen = await origenRetarificacion(correduria.id, polizaId)
  if (!origen) {
    return { estado: 'corte', respuesta: { status: 404, cuerpo: { error: 'póliza no encontrada' } } }
  }

  // ── El cuerpo que viaja, según el ramo. Todo lo de aquí es GRATIS ─────────
  let preparado: Preparado
  if (origen.tipo === 'auto') {
    preparado = prepararAuto(origen, cuerpo, polizaId)
  } else if (origen.tipo === 'hogar') {
    preparado = await prepararHogar(origen, cuerpo, polizaId)
  } else {
    return {
      estado: 'corte',
      respuesta: sinGasto(
        { error: origen.retarificacion.motivo ?? `hoy no se retarifica el ramo «${origen.tipo}»` },
        409,
      ),
    }
  }
  if ('respuesta' in preparado) return { estado: 'corte', respuesta: preparado.respuesta }

  return {
    estado: 'listo',
    peticion: {
      correduriaId: correduria.id,
      cuerpo: preparado.peticion,
      motivo: preparado.motivo,
      solicitadoPor,
      // Sin esto la cotización se pide, se paga y NO se guarda: el precio moriría
      // en la pestaña del navegador y recargar volvería a costar 0,50€.
      // `clienteId` va a null a propósito: la ficha de origen trae el cliente por
      // sus datos, no por su id, y un id inventado con BYPASSRLS no da error —
      // colgaría la cotización de otra persona.
      contexto: {
        ramo: origen.tipo,
        puerta: 'corredor',
        polizaId,
        clienteId: null,
      },
    },
    supuestos: preparado.supuestos,
    fuenteRiesgo: preparado.fuenteRiesgo,
  }
}

export type PreparadoRetarificacion =
  | {
      estado: 'listo'
      /** Lista para `cotizar()`. La ruta no le añade ni le quita nada. */
      peticion: PeticionCotizacion
      supuestos: Supuesto[] | SupuestoHogar[]
      fuenteRiesgo?: 'poliza' | 'gemela' | 'catastro' | null
    }
  /** Ya hay respuesta y NO se ha llamado al vendor: se devuelve tal cual. */
  | { estado: 'corte'; respuesta: ResultadoRetarificar }

/**
 * Redacta la respuesta a partir de lo que devolvió `cotizar()`. Las dos rutas
 * usan esta, así que la forma del JSON es la misma campo por campo: la pantalla
 * de plataforma y la de asegura leen exactamente lo mismo.
 */
export function respuestaRetarificacion(
  r: ResultadoCotizacion,
  preparado: Extract<PreparadoRetarificacion, { estado: 'listo' }>,
): ResultadoRetarificar {
  if (!r.ok) {
    // 402 cuando el freno es el TOPE: eso no es un fallo, es el tope haciendo
    // su trabajo, y la pantalla lo cuenta distinto de un error del vendor.
    return {
      status: r.razon === 'tope' ? 402 : r.razon === 'vendor' ? 502 : 503,
      cuerpo: { error: r.mensaje, razon: r.razon },
    }
  }

  return {
    status: 200,
    cuerpo: {
      ok: true,
      // 🚨 La marca de simulado viaja SIEMPRE y como booleano, también cuando es
      // `false`: si se enviara solo al simular, una versión vieja de la pantalla
      // no podría distinguir «precio real» de «campo que no me han mandado». Y
      // cuando es `true` va además la frase, para que se pueda pintar sin que la
      // pantalla tenga que redactarla.
      simulado: r.simulado,
      ...(r.simulado ? { avisoSimulacion: MARCA_SIMULACION } : {}),
      coste: r.coste,
      restantesHoy: r.restantesHoy,
      resumen: resumirCotizacion(r.cotizacion),
      projectId: r.cotizacion.projectId,
      precios: r.cotizacion.precios,
      fallos: r.cotizacion.fallos,
      // Qué pasó con la COPIA en `seguros.tarificaciones`. Viaja porque el
      // precio ya está pagado: quien lo pinte tiene que poder decir «no ha
      // quedado copia» en vez de suponer que sí.
      guardado: r.guardado,
      // Los supuestos viajan CON el precio para que la pantalla los enseñe al
      // lado de la prima, no en otra pestaña: son la letra pequeña de esa cifra.
      //
      // 🔒 Pero SANEADOS: uno de ellos es `cpCirculacion`, y su valor es el
      // código postal DEL TOMADOR («se supone que el coche circula y aparca
      // donde vive»). El puerto no publica la dirección a propósito
      // (`apps/asegura/CLAUDE.md`), y un CP es dirección. Se conserva el
      // supuesto entero —campo, motivo y marca de optimista— y solo se retira
      // el valor, con `oculto: true`: esconderlo del todo cambiaría una fuga
      // por un silencio sobre la letra pequeña del precio, que es la otra forma
      // de mentir. Detectado el 03/09/2026 al mover la pantalla a plataforma:
      // la fuga ya existía aquí antes de la mudanza.
      supuestos: sanearSupuestos(preparado.supuestos),
      ...(preparado.fuenteRiesgo !== undefined ? { fuenteRiesgo: preparado.fuenteRiesgo } : {}),
    },
  }
}

type Preparado =
  | {
      peticion: Record<string, unknown>
      motivo: string
      supuestos: Supuesto[] | SupuestoHogar[]
      fuenteRiesgo?: 'poliza' | 'gemela' | 'catastro' | null
    }
  | { respuesta: ResultadoRetarificar }

/** Respuesta que declara, con su cifra, que NO se ha llamado al vendor. */
function sinGasto(cuerpo: Record<string, unknown>, status: number): ResultadoRetarificar {
  return { status, cuerpo: { ...cuerpo, gastado: '0,00€' } }
}

/** La misma, envuelta para cortar la preparación de un ramo. */
function paraPreparado(cuerpo: Record<string, unknown>, status: number): { respuesta: ResultadoRetarificar } {
  return { respuesta: sinGasto(cuerpo, status) }
}

// ─── AUTO ────────────────────────────────────────────────────────────────────

function prepararAuto(
  origen: OrigenRetarificacion,
  cuerpo: CuerpoRetarificacion,
  polizaId: string,
): Preparado {
  const resueltos: Resueltos = {
    municipioId: numero(cuerpo.resueltos?.municipioId),
    estadoCivilId: cadena(cuerpo.resueltos?.estadoCivilId),
    fechaMatriculacion: cadena(cuerpo.resueltos?.fechaMatriculacion),
    codigoVehiculo: cadena(cuerpo.resueltos?.codigoVehiculo),
    garaje: cadena(cuerpo.resueltos?.garaje),
    garajeEsSupuesto: cuerpo.resueltos?.garajeEsSupuesto === true,
  }

  const pre = precalificarAuto(origen.cliente, origen.poliza, resueltos, hoyIso())

  // Las correcciones del corredor mandan sobre lo supuesto: es una persona
  // diciendo el dato de verdad. Se revisa OTRA VEZ con el resultado, porque una
  // corrección puede arreglar un hueco y también puede romper otra regla.
  const datos: Partial<DatosAuto> = {
    ...pre.datos,
    ...limpiarCorrecciones<DatosAuto>(cuerpo.correcciones),
  }
  const faltan = revisarDatosAuto(datos)

  if (faltan.length > 0) {
    // 422 y NI UN CÉNTIMO gastado. Es el caso normal la primera vez.
    return paraPreparado({ error: 'faltan datos para cotizar', faltan }, 422)
  }

  let peticion: Record<string, unknown>
  try {
    peticion = construirPeticionAuto(datos as DatosAuto)
  } catch (e) {
    return paraPreparado({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  // Nuestra referencia, para casar después la cotización con la póliza.
  peticion.externalId = `poliza:${polizaId}`
  return { peticion, motivo: 'defensa-cartera', supuestos: pre.supuestos }
}

// ─── HOGAR ───────────────────────────────────────────────────────────────────

/** Los ids de catálogo que la pantalla puede haber puesto por defecto (y que así lo declara). */
const CLAVES_SUPUESTOS: readonly CatalogoResuelto[] = [...CATALOGOS_HOGAR_OBLIGATORIOS, 'tipoVia']

/** Correcciones que llegan como TEXTO del formulario y viajan como número. */
const CORRECCIONES_NUMERICAS = [
  'metrosCuadrados',
  'anioConstruccion',
  'capitalContinente',
  'capitalContenido',
  'municipioId',
  'habitaciones',
  'anioUltimaReforma',
  'joyasEnCajaFuerte',
  'joyasFueraDeCaja',
  'objetosDeValor',
  'perrosPeligrosos',
] as const

/** Correcciones sí/no. `false` es una respuesta, no un hueco: se conserva. */
const CORRECCIONES_BOOLEANAS = [
  'puertaPrincipalBlindada',
  'ventanasSeguras',
  'vigilante',
  'urbanizacionCerrada',
  'propietarioEsTomador',
] as const

/**
 * ✅ El contrato del `risk` de hogar está verificado contra el portal del
 * fabricante (02/09/2026; ver la cabecera de `peticion-hogar.ts`). Aun así el
 * 502 devuelve el mensaje ENTERO del vendor: si el contrato cambia algún día,
 * ese mensaje es lo que dice qué campo sobra o falta, y un 400 de validación
 * no se cobra.
 */
async function prepararHogar(
  origen: OrigenRetarificacion,
  cuerpo: CuerpoRetarificacion,
  polizaId: string,
): Promise<Preparado> {
  const rs: Record<string, unknown> = esObjetoPlano(cuerpo.resueltos) ? cuerpo.resueltos : {}
  const s = esObjetoPlano(rs.supuestos) ? rs.supuestos : {}
  // Solo `true` cuenta como «es un defecto de la pantalla»; lo demás es «elegido».
  const supuestos: Partial<Record<CatalogoResuelto, boolean>> = {}
  for (const k of CLAVES_SUPUESTOS) if (s[k] === true) supuestos[k] = true

  const resueltos: ResueltosHogar = {
    municipioId: numero(rs.municipioId),
    estadoCivilId: cadena(rs.estadoCivilId),
    tipoViaId: cadena(rs.tipoViaId),
    tipoVivienda: cadena(rs.tipoVivienda),
    uso: cadena(rs.uso),
    ocupacion: cadena(rs.ocupacion),
    ubicacion: cadena(rs.ubicacion),
    material: cadena(rs.material),
    calidad: cadena(rs.calidad),
    alarma: cadena(rs.alarma),
    puertasSecundarias: cadena(rs.puertasSecundarias),
    asentamiento: cadena(rs.asentamiento),
    // `null` = la pantalla no lo ha decidido; el mapeador lo supone y lo declara.
    propietarioEsTomador: booleano(rs.propietarioEsTomador),
    supuestos,
  }
  const catastro: CatastroHogar | null = esObjetoPlano(cuerpo.catastro)
    ? {
        metrosCuadrados: numero(cuerpo.catastro.metrosCuadrados),
        anioConstruccion: numero(cuerpo.catastro.anioConstruccion),
        codigoPostal: cadena(cuerpo.catastro.codigoPostal),
        uso: cadena(cuerpo.catastro.uso),
      }
    : null

  const pre = precalificarHogarCartera(
    origen.cliente,
    {
      numeroPoliza: origen.poliza.numeroPoliza,
      fechaVencimiento: origen.poliza.fechaVencimiento,
      hogar: origen.hogar,
    },
    resueltos,
    hoyIso(),
    catastro,
  )

  // Los números del formulario llegan como TEXTO («76», «61000»); se convierten
  // aquí y lo que no es número se descarta (queda lo precalificado), nunca a 0.
  // Los sí/no aceptan boolean o 'true'/'false'; cualquier otra cosa se descarta.
  // Los textos (tipo de vía, calle, número, planta, puerta, referencia
  // catastral, CP) ya llegan recortados de `limpiarCorrecciones`.
  const correcciones = limpiarCorrecciones<DatosHogar>(cuerpo.correcciones) as Record<
    string,
    unknown
  >
  for (const k of CORRECCIONES_NUMERICAS) {
    if (k in correcciones) {
      const n = numero(correcciones[k])
      if (n === null) delete correcciones[k]
      else correcciones[k] = n
    }
  }
  for (const k of CORRECCIONES_BOOLEANAS) {
    if (k in correcciones) {
      const b = booleano(correcciones[k])
      if (b === null) delete correcciones[k]
      else correcciones[k] = b
    }
  }
  const datos: Partial<DatosHogar> = { ...pre.datos, ...(correcciones as Partial<DatosHogar>) }
  const faltan = revisarDatosHogar(datos)
  if (faltan.length > 0) {
    return paraPreparado({ error: 'faltan datos para cotizar', faltan }, 422)
  }

  // ── El id del ramo: de `/insurance-lines` (gratis), nunca escrito a mano ──
  // Con el interruptor ignorado a propósito: mirar si hogar tarifica es una
  // consulta; el gasto lo decide `cotizar()` con el interruptor de verdad.
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista') {
    return paraPreparado({ error: explicarConfig(cfg) }, 503)
  }
  const lineas = await lineasDeSeguro(cfg.config).catch(() => [])
  const hogar = hogarDisponible(lineas)
  if (hogar.estado !== 'disponible') {
    return paraPreparado(
      { error: 'hogar no tarifica para esta organización (o no se ha podido comprobar)', hogar },
      409,
    )
  }

  let peticion: Record<string, unknown>
  try {
    peticion = construirPeticionHogar(datos as DatosHogar, hogar.id)
  } catch (e) {
    return paraPreparado({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  peticion.externalId = `poliza:${polizaId}`
  return {
    peticion,
    motivo: 'defensa-cartera-hogar',
    supuestos: pre.supuestos,
    fuenteRiesgo: pre.fuenteRiesgo,
  }
}

// ─── Catálogos (GRATIS) ──────────────────────────────────────────────────────
//
// Los desplegables del MISMO flujo de retarificación. Viven aquí por lo mismo
// que la orquestación: los consumen dos rutas —la de sesión y la del puerto— y
// una copia del `switch` que se quedara sin `onlyPopular=false`, o sin exigir
// el combustible en `versiones`, no daría error: daría una lista recortada.
//
// 🚨 Nada de aquí cuesta dinero: son `GET` de consulta, y por eso se resuelven
// con el interruptor de tarificación APAGADO (`ignorarInterruptor`). Elegir
// marca y modelo tiene que poder hacerse antes de encender el gasto.

export type ResultadoCatalogo =
  | { estado: 'ok'; opciones: Opcion[]; hogar?: DisponibilidadHogar }
  /** El parámetro que falta o no existe. La ruta lo devuelve como 400. */
  | { estado: 'invalido'; mensaje: string }
  /** Faltan credenciales/host de Codeoscopic. 503, y NO es «no hay opciones». */
  | { estado: 'sin_configurar'; mensaje: string }
  /**
   * No se ha podido leer. **Nunca se degrada a lista vacía**: eso pintaría
   * «esta marca no tiene modelos» sobre un fallo de red (regla de `CLAUDE.md`).
   */
  | { estado: 'error'; causa: CausaErrorCartera; mensaje: string }

/**
 * Resuelve UN catálogo por su `tipo` y los parámetros que ese tipo pida.
 * Firma neutra (`URLSearchParams`) porque las dos rutas son `GET` con query.
 */
export async function resolverCatalogo(params: URLSearchParams): Promise<ResultadoCatalogo> {
  const tipo = params.get('tipo')

  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') return { estado: 'sin_configurar', mensaje: explicarConfig(r) }
  const config = r.config

  try {
    switch (tipo) {
      case 'marcas':
        return { estado: 'ok', opciones: await marcas(config) }
      case 'modelos': {
        const marcaId = params.get('marcaId')
        if (!marcaId) return { estado: 'invalido', mensaje: 'falta marcaId' }
        return { estado: 'ok', opciones: await modelos(config, marcaId) }
      }
      case 'motores':
        return { estado: 'ok', opciones: await tiposDeMotor(config) }
      case 'versiones': {
        const marcaId = params.get('marcaId')
        const modeloId = params.get('modeloId')
        // 🚨 `motor` es obligatorio: sin él el vendor devuelve 400 y la pantalla
        // se queda sin versiones — que es justo el dato que hay que elegir.
        // Se rechaza aquí, con su nombre, en vez de dejar que el 400 del vendor
        // llegue crudo a la pantalla (fue lo que pasó el 03/09/2026).
        const motor = params.get('motor')
        if (!marcaId || !modeloId || !motor) {
          return { estado: 'invalido', mensaje: 'faltan marcaId, modeloId y motor' }
        }
        return { estado: 'ok', opciones: await versiones(config, marcaId, modeloId, motor) }
      }
      case 'garajes':
        return { estado: 'ok', opciones: await tiposDeGaraje(config) }
      case 'estados-civiles':
        return { estado: 'ok', opciones: await estadosCiviles(config) }
      case 'municipios': {
        const cp = params.get('cp')
        if (!cp) return { estado: 'invalido', mensaje: 'falta cp' }
        return { estado: 'ok', opciones: await municipiosPorCp(config, cp) }
      }
      // ── Hogar ── los diez catálogos `/home/*`, por nombre CERRADO: el path se
      // construye con él y no se aceptan nombres que no estén en la lista.
      case 'hogar': {
        const nombre = params.get('nombre')
        if (!esCatalogoHogar(nombre)) {
          return {
            estado: 'invalido',
            mensaje: `falta o no existe el catálogo de hogar «${nombre ?? ''}»: vale uno de ${CATALOGOS_HOGAR.join(', ')}`,
          }
        }
        return { estado: 'ok', opciones: await catalogoHogar(config, nombre) }
      }
      // Los tipos de vía (`Calle`, `Avenida`…): van en `risk.address.roadType.id` de hogar.
      case 'vias':
        return { estado: 'ok', opciones: await tiposDeVia(config) }
      // Los ramos habilitados para esta organización y, resuelto aquí mismo,
      // si hogar está entre ellos (con su id EXACTO). Tres estados, no dos.
      case 'lineas': {
        const lineas = await lineasDeSeguro(config)
        return { estado: 'ok', opciones: lineas, hogar: hogarDisponible(lineas) }
      }
      default:
        return { estado: 'invalido', mensaje: `catálogo desconocido: ${tipo}` }
    }
  } catch (e) {
    // Un catálogo que no se puede leer NO se devuelve como lista vacía.
    return {
      estado: 'error',
      causa: registrarErrorCartera(`catalogos/${tipo ?? 'sin-tipo'}`, e),
      mensaje: e instanceof Error ? e.message : String(e),
    }
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  if (typeof v === 'string' && v.trim() === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** `true`/`false` (boolean o cadena) → boolean. Cualquier otra cosa → `null` (no es una respuesta). */
function booleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Solo se aceptan correcciones CON valor: un campo vacío no borra lo supuesto. */
function limpiarCorrecciones<T>(c: Record<string, unknown> | undefined): Partial<T> {
  if (!c || typeof c !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = typeof v === 'string' ? v.trim() : v
  }
  return out as Partial<T>
}
