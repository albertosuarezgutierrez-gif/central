// Fase 4 — lo que el portal LEE de la cartera para una identidad.
//
// 🔒 Aislamiento por CÓDIGO (no hay RLS: el rol es NOBYPASSRLS pero las tablas
// de la cartera no tienen políticas para él). Toda lectura parte de
// `portal_vinculo` filtrado por `identidadId`, que sale de la cookie por
// `lib/session`. Ningún `clienteId` entra desde fuera de este fichero.
//
// Tres estados que la UI tiene que poder decir por separado (regla global
// «dato que NO hay ≠ dato que NO se ha mirado»):
//   - `vinculada: false`         → esta identidad no tiene ficha en la cartera.
//   - vinculada y sin pólizas    → la ficha está, pero no tiene pólizas VIVAS.
//   - campo a `null`             → el dato existe pero el NIVEL no lo enseña.
//     (`prima: null` no es «sin prima»: es «no visible en tu nivel».)
//
// Y un CUARTO estado que NO es ninguno de los tres: el dato que sencillamente
// no va en la vista del cliente (tramitador, perito, referencias internas de
// gestión). Ese no se pinta vacío ni «pendiente»: no existe en el tipo ni en el
// `select`. Regla de visibilidad de Alberto (03/09/2026), en el CLAUDE.md de
// esta app; afina —no deroga— la regla del NULL del CLAUDE.md de la raíz.
//
// «Vivas» = las que entran o se MANTIENEN por CIMA, más lo que hemos emitido
// nosotros y CIMA aún no ha traído — el criterio único de `WHERE_CARTERA_VIVA`
// (`@central/module-seguros/cartera-viva`), y sin lápida de fusión.
//
// 🚨 Hasta el 03/09/2026 esto era solo `import_ref IS NULL`, y ese filtro tenía
// un agujero MEDIDO: cuando la ingesta de CIMA trae una póliza que YA existía en
// el volcado histórico no crea fila nueva — actualiza la vieja y le deja su
// `import_ref` de 2017. Esa póliza, que CIMA mantiene al día, desaparecía de la
// bóveda de su dueño: el cliente entraba y veía «no tienes pólizas» de un seguro
// que está pagando. Por eso el criterio es la UNIÓN de dos preguntas:
// `import_ref IS NULL` (nació fuera del volcado) O `eiac_xml_hash IS NOT NULL`
// (la ingesta EIAC la ha escrito alguna vez, venga de donde venga).
//
// Las ~28.700 del volcado histórico (vencimientos 2013-2018, sin hash) siguen SIN
// enseñarse: un cliente vería «tu seguro venció en 2016» de una póliza que no
// existe. `confirmadaCima` = CIMA la ha traído (`id_poliza_entidad`); una
// emitida por nosotros aún sin confirmar se dice como tal.
import {
  ordenarHistorialSiniestros,
  siniestroAbierto,
  autorizacionVigente,
  camposDeAlcances,
  camposVisibles,
  describirBien,
  esAlcance,
  etiquetaNivelAlcances,
  NIVELES,
  type Alcance,
  type BienAsegurado,
  type TipoOtorgante,
  ordenarRecibos,
  estadoRecibos,
  resumirRecibos,
  fechaReciboFiable,
  type ReciboHistorial,
  type ResumenRecibos,
  type CamposVisibles,
  type Nivel,
} from '@central/module-seguros-portal'
import { importeEiac, vigenciaPoliza, WHERE_CARTERA_VIVA, type Vigencia } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

/**
 * Un recibo tal y como lo ve el cliente.
 *
 * 🚫 **`formaPago` NO está, y no es un olvido:** en la BD es un CÓDIGO del EIAC
 * —en la cartera viva vale `CC` (117 recibos), `OF` (6) y `TA` (4), y 56 no lo
 * traen—. `CC` se adivina, `OF` no, y pintar «OF» al lado de un importe es
 * exactamente el mismo fallo que pintar «Tipo 1107» en un siniestro. No se pide
 * al `select`, así que no hay nada que se pueda colar en pantalla por descuido.
 */
export type ReciboPortal = ReciboHistorial

export type RecibosPortal = ResumenRecibos & {
  /**
   * Qué se le puede decir al cliente. **Tres estados, no dos** — lo decide
   * `estadoRecibos()` de `@central/module-seguros-portal`, que es donde está
   * medido por qué: `solo_anulados` son 20 pólizas de las 110 vivas, y con el
   * resumen anterior no pintaban absolutamente nada.
   *
   * 🚨 `sin_informar` significa que **la compañía no ha informado recibos**, y
   * eso NO es «al corriente»: nadie lo ha comprobado. La pantalla lo dice con
   * esas palabras porque el silencio se leería como lo contrario.
   */
  estado: 'sin_informar' | 'solo_anulados' | 'con_recibos'
  /** Los que el cliente ve, del más reciente al más antiguo y sin los anulados. */
  historial: ReciboPortal[]
}

/**
 * Lo que el CLIENTE ve de un siniestro suyo.
 *
 * 🚫 **Aquí NO hay tramitador ni perito, y no es un dato que falte: es gestión
 * del corredor.** Regla de visibilidad del portal (Alberto, 03/09/2026): se
 * oculta lo que al cliente no le cambia nada, y el punto de contacto único es
 * Alberto — el cliente le llama a él, no al tramitador de la compañía. Por eso
 * estos campos no están en el tipo NI en el `select`: no se piden a la BD, así
 * que no hay nada que se pueda pintar «en gris» ni «pendiente» por descuido.
 *
 * ⚠️ Esto NO deroga la regla del `CLAUDE.md` de la raíz («dato que NO hay ≠
 * dato que NO se ha mirado»): la afina. Lo que se calla es lo que NO cambia lo
 * que el cliente haría. Lo que sí cambiaría su decisión —sin vencimiento,
 * `recibos.total === 0`, `coberturas.total === 0`— se sigue diciendo en voz
 * alta, y para eso este fichero tiene que SEGUIR trayendo el dato.
 *
 * Lo protege `test/regression-portal-visibilidad.test.ts`.
 */
export type SiniestroPortal = {
  id: string
  estado: string
  referencia: string | null
  fechaHora: Date | null
}

export type PolizaPortal = {
  id: string
  compania: string
  ramo: string
  numeroPoliza: string | null
  fechaInicio: Date | null
  fechaVencimiento: Date | null
  estado: string
  vigencia: Vigencia
  /** CIMA la ha traído. `false` = emitida por nosotros y la compañía aún no la confirma. */
  confirmadaCima: boolean
  /**
   * De dónde viene la fila, tal cual está en la BD. NO es para pintarlo: es lo
   * que necesitan aguas abajo (`lib/obligaciones.ts`) para volver a preguntar
   * «¿es cartera viva?» con los datos REALES en vez de darlo por hecho.
   */
  procedencia: { importRef: string | null; eiacXmlHash: string | null }
  /** `null` = no visible en este nivel (no «sin prima»). `anual: null` = la compañía no la ha informado. */
  /** `anual` es la prima NETA (`polizas.prima_anual`); `bruta` es lo que el cliente paga de verdad
   *  (`prima_bruta`: neta + impuestos y recargos, y coincide con `prima_total` del recibo). Medido el
   *  03/09/2026 en la 548238086: anual 67,86€, bruta 73,39€, recibo 73,39€. Enseñar solo la neta al
   *  lado de un recibo mayor parece un error de cuentas. */
  prima: { anual: number | null; bruta: number | null; mensual: number | null; fraccionamiento: string | null } | null
  /** `total: 0` = ninguna cobertura informada. `null` = no visible en este nivel. */
  coberturas: { total: number; lista: string[] } | null
  /** `null` = no visible en este nivel. */
  recibos: RecibosPortal | null
  /** `null` = no visible en este nivel. `[]` = no hay ninguno abierto. */
  siniestrosAbiertos: SiniestroPortal[] | null
  /**
   * El HISTORIAL entero (los cuatro estados), del más reciente al más antiguo y
   * con lo que no tiene fecha al final.
   *
   * `null` = no visible en este nivel — el MISMO permiso que los abiertos
   * (`ve.siniestros`), porque un siniestro cerrado sigue siendo un hecho de la
   * vida de su dueño, no un dato del contrato: si acaso es MÁS personal, porque
   * es un historial. `[]` = **no nos consta ninguno**, que no es «no has tenido
   * ninguno»: la compañía los informa por EIAC y puede no haberlo hecho.
   */
  siniestros: SiniestroPortal[] | null
  /**
   * QUÉ está asegurado. `cosa` (marca/modelo/matrícula) es dato del CONTRATO y
   * se ve desde el nivel más bajo; `ubicacion` (la dirección del inmueble) es
   * dato de la PERSONA y un tercero no la ve nunca si quien cede es física.
   * En los dos, `null` = **no informado o no visible**, jamás «no tiene»: la
   * pantalla no pinta nada, que es la regla de visibilidad del portal.
   */
  bien: BienAsegurado
}

export type TitularPortal = {
  clienteId: string
  nombre: string
  /**
   * Etiqueta para pintar («ve la tarjeta» / «ve también lo económico»). Lo que
   * DE VERDAD se ha servido son los campos que trae cada `PolizaPortal`; esto
   * no decide nada. En `autorizadas` sale de `etiquetaNivelAlcances`, que va
   * capada, así que decir `completo` aquí NO significa que se haya enseñado el
   * IBAN — no se enseña nunca.
   */
  nivel: Nivel
  /** Presente SOLO en `autorizadas`: de qué consentimiento viene y hasta cuándo. */
  autorizacion?: { ids: string[]; alcances: Alcance[]; caducaEn: Date }
  polizas: PolizaPortal[]
}

export type CarteraPortal = {
  vinculada: boolean
  /** Nombre de la correduría del vínculo (única columna legible de `corredurias`). */
  correduria: string | null
  /** Fichas de la propia identidad, con el nivel de su vínculo. */
  propias: TitularPortal[]
  /** Fichas de OTROS que han autorizado a ver sus pólizas (`portal_autorizacion`). */
  autorizadas: TitularPortal[]
  /**
   * Las autorizaciones que esta lectura ha USADO de verdad, para que el
   * llamante lo anote en el registro de accesos que ve el otorgante
   * (`registrarUso` de `lib/autorizaciones`). Vacío = no se abrió nada ajeno.
   *
   * Va aquí y no se escribe dentro de esta función a propósito: leer no
   * escribe. Quien pinta la bóveda decide si registra.
   */
  autorizacionesUsadas: string[]
}

const SIN_VINCULO: CarteraPortal = {
  vinculada: false,
  correduria: null,
  propias: [],
  autorizadas: [],
  autorizacionesUsadas: [],
}

/** Coberturas que se listan en la card antes del «y N más». */
const COBERTURAS_EN_CARD = 4

/** `nivel` es `text` en la BD (CHECK). Un valor fuera del vocabulario cae al nivel MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

export async function carteraDeSesion(): Promise<CarteraPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return carteraDeIdentidad(identidad.id)
}

export async function carteraDeIdentidad(identidadId: string): Promise<CarteraPortal> {
  // El filtro por identidadId es la única frontera entre una bóveda y otra.
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true },
    orderBy: { creadoEn: 'asc' },
  })

  const propiosIds = vinculos.map((v) => v.clienteId)
  const nivelPorCliente = new Map(vinculos.map((v) => [v.clienteId, nivelDeVinculo(v.nivel)]))

  // ── Lo AJENO: quién me ha autorizado ──────────────────────────────────────
  //
  // 🚨 Hasta el 03/09/2026 esto salía de `cliente_relaciones.puede_ver_polizas`,
  // un booleano del CRM sin autor, sin fecha y sin revocación. Las 104 filas que
  // lo tenían a `true` se crearon TODAS el día del volcado (21/06/2026): nadie
  // las otorgó. Se apagaron, y al rol de esta app se le quitó el permiso de leer
  // esa columna — así que aunque alguien reescriba esto, no puede volver.
  //
  // Se traen las NO revocadas y la vigencia la decide `autorizacionVigente`, en
  // el módulo puro: una sola fuente para la regla, en vez de repetirla en el
  // WHERE y otra vez en la UI (que es como se desincronizan).
  //
  // 🚨 Y me alcanzan por DOS caminos, no por uno: por una FICHA mía (soy cliente
  // de la correduría) o por mi IDENTIDAD (no lo soy, y me invitaron). El segundo
  // brazo se añadió el 04/09/2026 con `autorizado_identidad_id`: sin él, el
  // hijo que no es cliente de nadie tenía su autorización en la BD y la bóveda
  // ni la miraba — no fallaba, salía vacía.
  const filasAutorizacion = await prisma.portalAutorizacion.findMany({
    where: {
      revocadoEn: null,
      OR: [
        { autorizadoIdentidadId: identidadId },
        ...(propiosIds.length > 0 ? [{ autorizadoClienteId: { in: propiosIds } }] : []),
      ],
    },
    select: {
      id: true,
      correduriaId: true,
      otorganteClienteId: true,
      polizaId: true,
      alcance: true,
      aceptadoEn: true,
      caducaEn: true,
      revocadoEn: true,
    },
  })

  // 🚨 El corte de «aquí no hay nada» se decide con LAS DOS listas. Hasta el
  // 04/09/2026 bastaba con no tener vínculo para devolver `SIN_VINCULO`, y eso
  // dejaba fuera justo a quien el producto quiere dentro: el invitado.
  if (vinculos.length === 0 && filasAutorizacion.length === 0) return SIN_VINCULO

  // La correduría sale del vínculo si lo hay y, si no, de la autorización que
  // me deja entrar: un invitado sin ficha también tiene que ver de quién es la
  // pantalla en la que está.
  const correduriaId = vinculos[0]?.correduriaId ?? filasAutorizacion[0]?.correduriaId ?? null
  const correduria =
    correduriaId === null
      ? null
      : await prisma.correduria.findUnique({ where: { id: correduriaId }, select: { nombre: true } })

  const ahora = new Date()
  /** Lo que abre una autorización: qué filas, con qué alcances y hasta cuándo. */
  type Concesion = { ids: string[]; alcances: Alcance[]; caducaEn: Date }
  const acumular = (m: Map<string, Concesion>, clave: string, id: string, alcance: Alcance, caducaEn: Date) => {
    const g = m.get(clave)
    if (g) {
      g.ids.push(id)
      g.alcances.push(alcance)
      // Se ve hasta que caduque la ÚLTIMA que sigue abriéndolo.
      if (caducaEn.getTime() > g.caducaEn.getTime()) g.caducaEn = caducaEn
    } else {
      m.set(clave, { ids: [id], alcances: [alcance], caducaEn })
    }
  }

  // Dos vocabularios distintos y no intercambiables: `porOtorgante` son las
  // autorizaciones sobre la ficha ENTERA (`poliza_id IS NULL`, que es lo que
  // significaban todas las filas antes de esa columna, futuras incluidas), y
  // `porPoliza` las que abren UNA sola. Los alcances de las dos SE SUMAN sobre
  // esa póliza: quien te deja ver todo y además lo económico de la del coche ve
  // lo económico de esa y solo de esa.
  const porOtorgante = new Map<string, Concesion>()
  const porPoliza = new Map<string, Concesion>()
  /** Qué ficha concedió cada póliza suelta, para no servirla bajo otro titular. */
  const otorganteDePoliza = new Map<string, string>()
  const vigentes: typeof filasAutorizacion = []
  for (const f of filasAutorizacion) {
    // Un alcance que la BD tiene y el módulo no conoce NO abre nada: se ignora.
    // (Al revés que un `?? 'ver'`, que convertiría un valor desconocido en acceso.)
    if (!esAlcance(f.alcance)) continue
    if (!autorizacionVigente(f, ahora)) continue
    if (propiosIds.includes(f.otorganteClienteId)) continue
    vigentes.push(f)
  }

  // 🚨 Una póliza FUSIONADA deja la autorización apuntando a una fila muerta (5
  // fusionadas hoy, no es teórico) y el autorizado perdería el acceso SIN QUE
  // NADIE SE ENTERE: no falla, deja de funcionar. Se sigue un salto de
  // `merged_into_poliza_id`. Si la fusión se llevó la póliza a OTRA ficha, la
  // póliza ya no es del otorgante y no se sirve: quien la cedió cedió la suya.
  const idsConcedidos = [...new Set(vigentes.map((f) => f.polizaId).filter((x): x is string => x !== null))]
  const trasFusion = new Map<string, string>()
  if (idsConcedidos.length > 0) {
    const filas = await prisma.poliza.findMany({
      where: { id: { in: idsConcedidos } },
      select: { id: true, mergedIntoPolizaId: true },
    })
    for (const f of filas) trasFusion.set(f.id, f.mergedIntoPolizaId ?? f.id)
  }

  for (const f of vigentes) {
    if (!esAlcance(f.alcance)) continue
    if (f.polizaId === null) {
      acumular(porOtorgante, f.otorganteClienteId, f.id, f.alcance, f.caducaEn)
    } else {
      // Una concedida que ya no existe en la cartera no abre nada, y tampoco se
      // inventa: sin fila no hay destino y se cae fuera.
      const destino = trasFusion.get(f.polizaId)
      if (destino === undefined) continue
      acumular(porPoliza, destino, f.id, f.alcance, f.caducaEn)
      otorganteDePoliza.set(destino, f.otorganteClienteId)
    }
  }
  const autorizadosIds = [...new Set([...porOtorgante.keys(), ...otorganteDePoliza.values()])]

  const todosIds = [...propiosIds, ...autorizadosIds]
  const [clientes, polizas] = await Promise.all([
    prisma.cliente.findMany({
      where: { id: { in: todosIds }, mergedIntoClienteId: null },
      // `tipoPersona` decide QUÉ se sirve de una ficha ajena: una sociedad no
      // tiene datos personales, así que quien la representa ve su CIF y su
      // cuenta y puede actuar por ella. Sin este campo, la bóveda serviría una
      // autorización de empresa con el tope de una persona: caería del lado
      // seguro, pero un `partes` concedido no se honraría y parecería un bug.
      select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
    }),
    prisma.poliza.findMany({
      // `WHERE_CARTERA_VIVA` va DENTRO del `AND`: es un `OR` de dos brazos y
      // dejarlo suelto al lado del resto mezclaría las ramas (devolvería
      // pólizas de otros clientes con `import_ref IS NULL`).
      where: {
        AND: [{ clienteId: { in: todosIds }, mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA],
      },
      orderBy: [{ fechaVencimiento: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  const polizaIds = polizas.map((p) => p.id)
  const [coberturas, recibos, siniestros] =
    polizaIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.polizaCobertura.findMany({
            where: { polizaId: { in: polizaIds } },
            select: { polizaId: true, descripcion: true, codigo: true, numeroOrden: true },
            orderBy: { numeroOrden: 'asc' },
          }),
          prisma.polizaRecibo.findMany({
            where: { polizaId: { in: polizaIds } },
            select: {
              polizaId: true,
              situacion: true,
              primaTotal: true,
              fechaEmision: true,
              fechaVencimiento: true,
              // 🚨 `formaPago` NO se pide: es un código del EIAC (`CC`/`OF`/`TA`).
              // Ver la cabecera de `ReciboPortal`.
            },
            // El orden REAL se hace en código (`ordenarRecibos`): aquí un `desc`
            // implicaría `NULLS FIRST` y subiría arriba lo que no tiene fecha.
            orderBy: { fechaEmision: 'desc' },
          }),
          prisma.siniestro.findMany({
            // 🚨 Sin filtro de estado, y es el cambio (05/09/2026): antes decía
            // `estado IN ('abierto','en_tramitacion')`, así que de los 67
            // siniestros de la cartera viva el portal enseñaba 7 y los 60
            // CERRADOS no los veía nadie. El historial es lo que un cliente
            // pregunta al renovar.
            where: { polizaId: { in: polizaIds } },
            select: {
              id: true,
              polizaId: true,
              estado: true,
              referencia: true,
              fechaHora: true,
              // 🚨 `tipo` NO se pide, y no es un olvido: en la BD es un CÓDIGO
              // NUMÉRICO de la compañía (`1107`, `1915`, `1312`, `17`…, medido
              // en la cartera viva el 05/09/2026). «Tipo 1107» no le dice nada
              // a un cliente y encima parece un dato que significa algo.
              // Tampoco hay columna con la fecha de CIERRE: `updated_at` es la
              // última vez que se tocó la fila, no el día que se cerró, y
              // pintarlo como tal sería inventarse una fecha.
              // Ni tramitador ni perito, a propósito: son gestión del
              // corredor, no dato del cliente (ver `SiniestroPortal`). El cepo
              // `test/regression-portal-visibilidad.test.ts` falla si vuelven,
              // así que ni siquiera se nombran aquí.
            },
            orderBy: { fechaHora: 'desc' },
          }),
        ])

  const agrupar = <T extends { polizaId: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) {
      const g = m.get(x.polizaId)
      if (g) g.push(x)
      else m.set(x.polizaId, [x])
    }
    return m
  }
  const coberturasPor = agrupar(coberturas)
  const recibosPor = agrupar(recibos)
  const siniestrosPor = agrupar(siniestros)
  const hoy = new Date()

  const aPortal = (p: (typeof polizas)[number], ve: CamposVisibles): PolizaPortal => {
    const cobs = coberturasPor.get(p.id) ?? []
    const recs = recibosPor.get(p.id) ?? []
    // El historial se ordena AQUÍ y no en el `orderBy` de Prisma: en Postgres
    // un `DESC` implica `NULLS FIRST`, así que los siniestros sin fecha se
    // colarían arriba y enterrarían los que sí la tienen. Es la misma trampa
    // que ya mordió en la ficha del corredor (PR #2346).
    const historial: SiniestroPortal[] | null = ve.siniestros
      ? ordenarHistorialSiniestros(
          (siniestrosPor.get(p.id) ?? []).map((x) => ({
            id: x.id,
            estado: x.estado,
            referencia: x.referencia,
            fechaHora: x.fechaHora,
          })),
        )
      : null
    return {
      id: p.id,
      compania: p.aseguradora,
      ramo: p.tipo,
      numeroPoliza: ve.numeroPoliza ? p.numeroPoliza : null,
      fechaInicio: p.fechaInicio,
      fechaVencimiento: p.fechaVencimiento,
      estado: p.estado,
      vigencia: vigenciaPoliza({ estado: p.estado, fechaVencimiento: p.fechaVencimiento }, hoy),
      confirmadaCima: p.idPolizaEntidad !== null,
      procedencia: { importRef: p.importRef, eiacXmlHash: p.eiacXmlHash },
      prima: ve.prima
        ? {
            // `Decimal` de Prisma → número ANTES de formatear; null se queda null.
            anual: p.primaAnual === null ? null : Number(p.primaAnual),
            bruta: p.primaBruta === null ? null : Number(p.primaBruta),
            mensual: p.primaMensual === null ? null : Number(p.primaMensual),
            fraccionamiento: p.fraccionamiento,
          }
        : null,
      coberturas: ve.coberturas
        ? {
            total: cobs.length,
            lista: cobs
              .map((c) => (c.descripcion ?? c.codigo ?? '').trim())
              .filter(Boolean)
              .slice(0, COBERTURAS_EN_CARD),
          }
        : null,
      recibos: ve.recibos ? recibosDePoliza(recs) : null,
      // 🚨 `null` = NO VISIBLE EN TU NIVEL. `[]` = no hay ninguno abierto. Son
      // cosas distintas y la UI dice cada una con sus palabras. Hasta el
      // 04/09/2026 esto no miraba `ve` y un tercero con el alcance más bajo
      // veía los siniestros abiertos de quien le autorizó.
      // 🚨 Los DOS campos se filtran por SU flag, no por uno común: `bien` es
      // la cosa (visible desde `tarjeta`) y `direccionRiesgo` es dónde vive el
      // titular (nunca a un tercero de una persona física). Un solo `if` aquí
      // regalaría la dirección de una casa a quien solo pidió ver la compañía.
      bien: (() => {
        const b = describirBien(p.tipo, p.datosEspecificos)
        return {
          cosa: ve.bien ? b.cosa : null,
          ubicacion: ve.direccionRiesgo ? b.ubicacion : null,
          detalles: ve.bien ? b.detalles : [],
        }
      })(),
      // Una sola lectura y una sola guarda: los abiertos se DERIVAN del
      // historial con `siniestroAbierto()`, que es la fuente única del
      // vocabulario. Dos listas de estados escritas a mano acaban divergiendo
      // el día que la compañía añada uno, y el síntoma sería que un siniestro
      // deja de contar como abierto sin que nada falle.
      siniestros: historial,
      siniestrosAbiertos: historial === null ? null : historial.filter((s) => siniestroAbierto(s.estado)),
    }
  }

  const nombrePor = new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
  // NULL o cualquier otra cosa → `fisica`, el lado restrictivo. La cartera real
  // tiene `tipo_persona` casi vacía (medido 03/09/2026), así que este default
  // NO es teórico: es el caso normal, y tiene que ser el que menos abre.
  const tipoPor = new Map<string, TipoOtorgante>(
    clientes.map((c) => [c.id, c.tipoPersona === 'juridica' ? 'juridica' : 'fisica']),
  )
  // `ve` puede ser los mismos campos para toda la ficha (lo propio) o una
  // función que los decide PÓLIZA A PÓLIZA (lo autorizado, desde que se puede
  // conceder una sola). Devolver `null` para una póliza no la sirve capada: la
  // deja fuera, que es lo que significa «esa no te la han abierto».
  const titular = (
    clienteId: string,
    nivel: Nivel,
    ve: CamposVisibles | ((polizaId: string) => CamposVisibles | null),
    autorizacion?: { ids: string[]; alcances: Alcance[]; caducaEn: Date },
  ): TitularPortal | null => {
    // Una ficha fusionada o que ya no existe no se pinta: sin nombre no hay titular.
    const nombre = nombrePor.get(clienteId)
    if (nombre === undefined) return null
    const suyas = polizas
      .filter((p) => p.clienteId === clienteId)
      .map((p) => {
        const campos = typeof ve === 'function' ? ve(p.id) : ve
        return campos === null ? null : aPortal(p, campos)
      })
      .filter((x): x is PolizaPortal => x !== null)
    return {
      clienteId,
      nombre,
      nivel,
      ...(autorizacion ? { autorizacion } : {}),
      polizas: suyas,
    }
  }

  const propias = propiosIds
    .map((id) => {
      const nivel = nivelPorCliente.get(id) ?? 'tarjeta'
      return titular(id, nivel, camposVisibles(nivel))
    })
    .filter((t): t is TitularPortal => t !== null)

  const caducaPorId = new Map(vigentes.map((f) => [f.id, f.caducaEn]))
  const autorizadas: TitularPortal[] = []
  const autorizacionesUsadas: string[] = []
  for (const clienteId of autorizadosIds) {
    const tipo = tipoPor.get(clienteId) ?? 'fisica'
    // Lo concedido sobre la ficha ENTERA. `null` = solo hay concesiones sueltas.
    const deLaFicha = porOtorgante.get(clienteId) ?? null
    // Lo que de verdad se ha servido, que es lo único que cuenta como USO: una
    // autorización sobre una póliza que ya no está viva no se anota como que
    // alguien miró algo.
    const usadas = new Set<string>()
    const alcancesServidos = new Set<Alcance>()

    const veDe = (polizaId: string): CamposVisibles | null => {
      // La suelta solo cuenta si la concedió ESTA ficha: dos otorgantes pueden
      // aparecer en la misma vuelta y una póliza es de uno solo.
      const suelta = otorganteDePoliza.get(polizaId) === clienteId ? (porPoliza.get(polizaId) ?? null) : null
      if (deLaFicha === null && suelta === null) return null
      const alcances = [...(deLaFicha?.alcances ?? []), ...(suelta?.alcances ?? [])]
      // `camposDeAlcances` va capada: pase lo que pase con los niveles, un
      // tercero no ve el IBAN ni el DNI del otorgante, ni actúa en su nombre.
      const campos = camposDeAlcances(alcances, tipo)
      if (campos === null) return null
      for (const id of deLaFicha?.ids ?? []) usadas.add(id)
      for (const id of suelta?.ids ?? []) usadas.add(id)
      for (const a of alcances) alcancesServidos.add(a)
      return campos
    }

    const t = titular(clienteId, 'tarjeta', veDe)
    if (t === null) continue
    // Sin una sola póliza servida y sin concesión sobre la ficha entera, no hay
    // nada que enseñar: pintar el nombre de quien te autorizó y una lista vacía
    // sería contar que esa persona existe en la cartera sin abrir nada.
    if (t.polizas.length === 0 && deLaFicha === null) continue
    const alcances = [...alcancesServidos]
    const ids = [...usadas]
    // Con la ficha abierta y cero pólizas vivas no se ha llamado a `veDe` ni una
    // vez: la concesión es real y sigue siendo lo que hay que enseñar.
    const idsFinales = ids.length > 0 ? ids : (deLaFicha?.ids ?? [])
    const alcancesFinales = alcances.length > 0 ? alcances : [...new Set(deLaFicha?.alcances ?? [])]
    let caduca = deLaFicha?.caducaEn ?? null
    for (const id of idsFinales) {
      const c = caducaPorId.get(id)
      if (c !== undefined && (caduca === null || c.getTime() > caduca.getTime())) caduca = c
    }
    if (caduca === null) continue
    autorizadas.push({
      ...t,
      nivel: etiquetaNivelAlcances(alcancesFinales),
      autorizacion: { ids: idsFinales, alcances: alcancesFinales, caducaEn: caduca },
    })
    autorizacionesUsadas.push(...idsFinales)
  }

  return {
    vinculada: vinculos.length > 0,
    correduria: correduria?.nombre ?? null,
    propias,
    autorizadas,
    autorizacionesUsadas,
  }
}

type ReciboFila = {
  situacion: string | null
  primaTotal: string | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
}

/**
 * Los recibos de UNA póliza, tal y como los ve el cliente.
 *
 * Todo el vocabulario —qué es un anulado, qué está al cobro, qué fecha es de
 * fiar y en qué orden van— vive en `@central/module-seguros-portal`, que es
 * donde están medidos los 183 recibos de la cartera viva. Aquí solo se traduce
 * la fila de la BD.
 *
 * 🚨 `estado` se calcula sobre la lista CRUDA (con anulados) y el resto sobre la
 * limpia: es la única forma de distinguir «la compañía no informó nada» de
 * «informó y está todo anulado», que eran las 20 pólizas mudas.
 */
function recibosDePoliza(lista: ReciboFila[]): RecibosPortal {
  const crudos = lista.map((r) => ({
    situacion: (r.situacion ?? '').trim() || 'sin_informar',
    importe: importeEiac(r.primaTotal),
    // Las fechas pasan por el filtro de centinelas: hay un recibo con
    // `fecha_emision` 0001-01-01, que es un «no lo sé» con forma de dato.
    fechaEmision: fechaReciboFiable(r.fechaEmision),
    fechaVencimiento: fechaReciboFiable(r.fechaVencimiento),
  }))
  const historial = ordenarRecibos(crudos)
  return {
    ...resumirRecibos(historial, crudos.length - historial.length),
    estado: estadoRecibos(crudos),
    historial,
  }
}
