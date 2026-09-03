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
  autorizacionVigente,
  camposDeAlcances,
  camposVisibles,
  esAlcance,
  etiquetaNivelAlcances,
  NIVELES,
  type Alcance,
  type TipoOtorgante,
  type CamposVisibles,
  type Nivel,
} from '@central/module-seguros-portal'
import { importeEiac, vigenciaPoliza, WHERE_CARTERA_VIVA, type Vigencia } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

export type ReciboPortal = {
  situacion: string
  /** `null` = el texto del EIAC no tenía forma de importe. No es 0€. */
  importe: number | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
  formaPago: string | null
}

export type RecibosPortal = {
  /** `0` = la compañía no ha informado recibos. NO es «al corriente». */
  total: number
  /** El siguiente al cobro (emitido/pendiente), el de vencimiento más próximo. */
  proximoAlCobro: ReciboPortal | null
  /** Devueltos: el cobro se intentó y falló. */
  devueltos: number
  ultimoCobrado: ReciboPortal | null
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
  siniestrosAbiertos: SiniestroPortal[]
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

const SITUACIONES_AL_COBRO = new Set(['pendiente', 'emitido'])

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
  if (vinculos.length === 0) return SIN_VINCULO

  const correduria = await prisma.correduria.findUnique({
    where: { id: vinculos[0].correduriaId },
    select: { nombre: true },
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
  const filasAutorizacion = await prisma.portalAutorizacion.findMany({
    where: { autorizadoClienteId: { in: propiosIds }, revocadoEn: null },
    select: {
      id: true,
      otorganteClienteId: true,
      alcance: true,
      aceptadoEn: true,
      caducaEn: true,
      revocadoEn: true,
    },
  })
  const ahora = new Date()
  const porOtorgante = new Map<string, { ids: string[]; alcances: Alcance[]; caducaEn: Date }>()
  for (const f of filasAutorizacion) {
    // Un alcance que la BD tiene y el módulo no conoce NO abre nada: se ignora.
    // (Al revés que un `?? 'ver'`, que convertiría un valor desconocido en acceso.)
    if (!esAlcance(f.alcance)) continue
    if (!autorizacionVigente(f, ahora)) continue
    if (propiosIds.includes(f.otorganteClienteId)) continue
    const g = porOtorgante.get(f.otorganteClienteId)
    if (g) {
      g.ids.push(f.id)
      g.alcances.push(f.alcance)
      // La ficha se ve hasta que caduque la ÚLTIMA que sigue abriéndola.
      if (f.caducaEn.getTime() > g.caducaEn.getTime()) g.caducaEn = f.caducaEn
    } else {
      porOtorgante.set(f.otorganteClienteId, {
        ids: [f.id],
        alcances: [f.alcance],
        caducaEn: f.caducaEn,
      })
    }
  }
  const autorizadosIds = [...porOtorgante.keys()]

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
              formaPago: true,
            },
            orderBy: { fechaEmision: 'desc' },
          }),
          prisma.siniestro.findMany({
            where: { polizaId: { in: polizaIds }, estado: { in: ['abierto', 'en_tramitacion'] } },
            select: {
              id: true,
              polizaId: true,
              estado: true,
              referencia: true,
              fechaHora: true,
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
      recibos: ve.recibos ? resumirRecibosPortal(recs) : null,
      siniestrosAbiertos: (siniestrosPor.get(p.id) ?? []).map((s) => ({
        id: s.id,
        estado: s.estado,
        referencia: s.referencia,
        fechaHora: s.fechaHora,
      })),
    }
  }

  const nombrePor = new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
  // NULL o cualquier otra cosa → `fisica`, el lado restrictivo. La cartera real
  // tiene `tipo_persona` casi vacía (medido 03/09/2026), así que este default
  // NO es teórico: es el caso normal, y tiene que ser el que menos abre.
  const tipoPor = new Map<string, TipoOtorgante>(
    clientes.map((c) => [c.id, c.tipoPersona === 'juridica' ? 'juridica' : 'fisica']),
  )
  const titular = (
    clienteId: string,
    nivel: Nivel,
    ve: CamposVisibles,
    autorizacion?: { ids: string[]; alcances: Alcance[]; caducaEn: Date },
  ): TitularPortal | null => {
    // Una ficha fusionada o que ya no existe no se pinta: sin nombre no hay titular.
    const nombre = nombrePor.get(clienteId)
    if (nombre === undefined) return null
    return {
      clienteId,
      nombre,
      nivel,
      ...(autorizacion ? { autorizacion } : {}),
      polizas: polizas.filter((p) => p.clienteId === clienteId).map((p) => aPortal(p, ve)),
    }
  }

  const propias = propiosIds
    .map((id) => {
      const nivel = nivelPorCliente.get(id) ?? 'tarjeta'
      return titular(id, nivel, camposVisibles(nivel))
    })
    .filter((t): t is TitularPortal => t !== null)

  const autorizadas: TitularPortal[] = []
  const autorizacionesUsadas: string[] = []
  for (const [clienteId, a] of porOtorgante) {
    // `camposDeAlcances` va capada: pase lo que pase con los niveles, un tercero
    // no ve el IBAN ni el DNI del otorgante, ni puede actuar en su nombre.
    const ve = camposDeAlcances(a.alcances, tipoPor.get(clienteId) ?? 'fisica')
    if (ve === null) continue
    const t = titular(clienteId, etiquetaNivelAlcances(a.alcances), ve, a)
    if (t === null) continue
    autorizadas.push(t)
    // Solo cuenta como USO lo que de verdad se ha servido: una autorización de
    // una ficha que ya no existe no se anota como que alguien miró algo.
    autorizacionesUsadas.push(...a.ids)
  }

  return {
    vinculada: true,
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
  formaPago: string | null
}

/** Recibe la lista ordenada por emisión descendente. `anulado` no cuenta en ningún cubo. */
function resumirRecibosPortal(lista: ReciboFila[]): RecibosPortal {
  const aPortal = (r: ReciboFila): ReciboPortal => ({
    situacion: (r.situacion ?? '').trim() || 'sin_informar',
    importe: importeEiac(r.primaTotal),
    fechaEmision: r.fechaEmision,
    fechaVencimiento: r.fechaVencimiento,
    formaPago: r.formaPago,
  })
  const alCobro = lista
    .filter((r) => SITUACIONES_AL_COBRO.has(r.situacion ?? ''))
    .sort((a, b) => (a.fechaVencimiento?.getTime() ?? Infinity) - (b.fechaVencimiento?.getTime() ?? Infinity))
  const cobrado = lista.find((r) => r.situacion === 'cobrado')
  return {
    total: lista.length,
    proximoAlCobro: alCobro[0] ? aPortal(alCobro[0]) : null,
    devueltos: lista.filter((r) => r.situacion === 'devuelto').length,
    ultimoCobrado: cobrado ? aPortal(cobrado) : null,
  }
}
