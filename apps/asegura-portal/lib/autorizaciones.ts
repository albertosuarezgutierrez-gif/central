// Fase 5 — el consentimiento de José para que María vea sus seguros.
//
// Las REGLAS no están aquí: están en el módulo puro
// (`@central/module-seguros-portal/autorizacion`), que es quien decide qué
// alcances se pueden conceder hoy, quién puede conceder según su nivel, cuánto
// dura una autorización y en qué estado está a una fecha. Este fichero es solo
// la BD: lee `portal_autorizacion`, escribe en ella y comprueba la PERTENENCIA
// de cada ficha antes de tocar nada. Ni un `if` de negocio duplicado — dos
// cuentas del mismo estado en el mismo repo acaban dando estados distintos de la
// misma autorización sin que ninguna pantalla falle.
//
// 🔒 Aislamiento por CÓDIGO. No hay RLS que rescate un olvido: el rol
// `prisma_asegura_portal` es NOBYPASSRLS pero estas tablas no tienen políticas
// para él, así que una consulta sin `where` responde 200 con las autorizaciones
// de todo el mundo. El modo de fallo no es «no se ve nada» —eso se nota— sino
// «se ve TODO y nada falla». Las dos fronteras, sin excepciones:
//
//   1. La identidad SIEMPRE sale de la cookie (`lib/session`). Las funciones
//      `…DeIdentidad` la reciben ya resuelta de quien pasó por la puerta;
//      `autorizacionesDeSesion()` la abre aquí.
//   2. **Ningún `clienteId` entra desde la request.** Toda ficha que este
//      fichero acepta se comprueba antes contra `portal_vinculo` filtrado por
//      esa identidad — esa lista es la ÚNICA definición de «mis fichas». Un
//      `otorganteClienteId` que llegue en un JSON y no esté ahí no se toca.
//
// 🚨 Y el hueco que esta tabla viene a tapar: hasta el 03/09/2026 «María ve las
// pólizas de José» era un booleano del CRM (`cliente_relaciones.puede_ver_polizas`)
// que no decía quién lo concedió, ni cuándo, ni con qué texto. El art. 7.1 RGPD
// no pide TENER el consentimiento: pide poder DEMOSTRARLO. De ahí que aquí se
// guarde siempre `versionTexto` (qué se aceptó), `otorgadoPorIdentidadId` (quién
// lo hizo), `ip`/`userAgent` (desde dónde) y `caducaEn` (hasta cuándo).
import {
  alcanceConcedible,
  alcancesConcedibles,
  caducidadPorDefecto,
  esAlcance,
  estadoAutorizacion,
  NIVELES,
  puedeAutorizar as nivelPuedeAutorizar,
  tituloRepresentacion,
  type Alcance,
  type EstadoAutorizacion,
  type Nivel,
  type TipoOtorgante,
  type TituloRepresentacion,
} from '@central/module-seguros-portal'
import { permiteAutorizar, SIN_VINCULO, WHERE_CARTERA_VIVA } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

/**
 * Identificador del texto legal que la persona acepta al conceder.
 *
 * Se guarda en `portal_autorizacion.version_texto` en CADA fila y no es
 * burocracia: sin saber QUÉ texto aceptó, el consentimiento no se puede
 * demostrar (art. 7.1 RGPD), y una autorización que no se puede demostrar es
 * exactamente igual de inútil que no tenerla. Cuando el texto cambie se emite
 * `v2-…` y las filas viejas siguen diciendo la verdad sobre lo que se aceptó
 * ENTONCES; **jamás se reescribe el contenido de una versión ya publicada**.
 */
export const TEXTO_AUTORIZACION_V1 = 'v1-2026-09-03'

/** El texto exacto que corresponde a `TEXTO_AUTORIZACION_V1`. La pantalla lo enseña TAL CUAL. */
export const TEXTO_AUTORIZACION = [
  'Autorizo a esta persona a CONSULTAR los seguros que tengo con Grupo ASegura.',
  'Solo puede verlos: no puede contratar, modificar, dar partes ni actuar en mi nombre.',
  'No verá mis datos personales (DNI, cuenta bancaria) ni mis documentos.',
  'La autorización caduca al año y puedo revocarla en cualquier momento desde el portal.',
  'Quedará registrado qué días ha consultado mis seguros, y ese registro lo veo yo.',
].join('\n')

/**
 * El texto de la REPRESENTACIÓN, que es otro consentimiento y por eso es otra
 * versión.
 *
 * 🚨 No es un matiz de redacción: `TEXTO_AUTORIZACION` afirma «no verá mis datos
 * personales (DNI, cuenta bancaria)» y «no puede dar partes», y las dos frases son
 * FALSAS cuando quien cede es una sociedad — su IBAN y su CIF son datos de la
 * empresa, y quien la representa puede obligarla. Guardar esa versión en una fila
 * de apoderamiento sería guardar como prueba un texto que dice lo contrario de lo
 * que se concedió, que es peor que no guardar ninguno.
 */
export const TEXTO_REPRESENTACION_V1 = 'v1-2026-09-03-representacion'

/** El texto exacto de `TEXTO_REPRESENTACION_V1`. La pantalla lo enseña TAL CUAL. */
export const TEXTO_REPRESENTACION = [
  'Autorizo a esta persona a actuar por la sociedad ante Grupo ASegura, con el título que se indica.',
  'Verá los seguros de la sociedad, lo que paga, su CIF y la cuenta bancaria de los recibos: son datos de la empresa, no de una persona.',
  'Si le doy «dar partes», lo que declare obliga a la sociedad frente a la compañía.',
  'No puede autorizar a nadie más: ampliar el círculo lo decide la sociedad.',
  'La autorización caduca al año y puedo revocarla en cualquier momento desde el portal.',
  'Quedará registrado qué días ha consultado los seguros de la sociedad, y ese registro lo veo yo.',
].join('\n')

/** Los dos alcances que son ACTUAR en nombre de otro, no mirar. Solo los delega una sociedad. */
const APODERAMIENTO: readonly Alcance[] = ['partes', 'documentos']

function esApoderamiento(a: Alcance): boolean {
  return APODERAMIENTO.includes(a)
}

/**
 * Qué es quien cede, leído de `clientes.tipo_persona`.
 *
 * 🚨 `null` = **no consta**, y se trata como `'fisica'`. No es colapsar un «no lo
 * sé» en un dato: es elegir el lado RESTRICTIVO, el único que no abre nada de más.
 * Al revés —tratar el hueco como sociedad— repartiría apoderamientos sobre fichas
 * de personas por una columna vacía. Hoy la mayoría de la cartera la tiene a NULL.
 */
function tipoDeFicha(v: string | null | undefined): TipoOtorgante {
  return v === 'juridica' ? 'juridica' : 'fisica'
}

/** Cuántas filas se traen. Regla de rendimiento UI de la casa. */
const MAX_AUTORIZACIONES = 200
/** Días de accesos que se le enseñan al otorgante por autorización. */
const MAX_USOS = 90

/**
 * Estados en los que una autorización OCUPA el sitio de su pareja+alcance: no
 * se puede conceder otra igual mientras haya una así.
 *
 * 📌 Decisión, no descuido: `caducada` y `revocada` **no** ocupan sitio. Una
 * autorización dura un año y «se renueva; no se prorroga sola»
 * (`DIAS_VIGENCIA`); si la caducada bloqueara, la renovación sería imposible y
 * el usuario vería un `ya_concedida` sobre algo que no le deja ver nada.
 *
 * 🚨 Y de aquí sale el desfase que hay que cerrar a mano al conceder: el índice
 * `idx_portal_autorizacion_viva` es `UNIQUE (otorgante, autorizado, alcance)
 * WHERE revocado_en IS NULL`, o sea que para la BD una **caducada sigue
 * ocupando el sitio** (su `revocado_en` es NULL). Renovar chocaría con el
 * índice. Lo resuelve `cerrarCaducada` — ver `conceder`.
 */
function ocupaElSitio(estado: EstadoAutorizacion): boolean {
  return estado === 'pendiente' || estado === 'vigente'
}

/**
 * Quién puede revocar una fila, para que la pantalla no lo adivine ni ofrezca
 * un botón que va a devolver `no_te_toca`.
 *
 * Los dos lados pueden: el otorgante porque los datos son suyos, y el
 * autorizado porque nadie tiene por qué cargar con un acceso que no quiere. Una
 * caducada o una ya revocada no se revocan: no hay nada que cerrar.
 */
function puedeRevocarse(estado: EstadoAutorizacion, esMia: boolean): boolean {
  return esMia && ocupaElSitio(estado)
}

/** Tope de pólizas que se ofrecen para compartir de una en una. */
const MAX_POLIZAS_OTORGABLES = 200

/** Un uuid mal formado revienta dentro de Prisma con un 500 en vez de contestar. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `nivel` es `text` con CHECK en la BD. Un valor fuera del vocabulario cae al nivel MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

/** Medianoche UTC del día de `d`. La columna `dia` es un `date`: sin hora ni zona. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * `null` = **no se sabe el nombre**: la ficha ya no existe o está fusionada.
 * NUNCA `''` ni `'Desconocido'` — un valor de cajón se cuela por todas las
 * guardas basadas en NULL y la pantalla acaba afirmando algo que nadie sabe.
 */
export type AutorizacionVista = {
  id: string
  alcance: Alcance
  estado: EstadoAutorizacion
  otorganteClienteId: string
  otorganteNombre: string | null
  /**
   * A quién se autorizó, cuando es cliente de la correduría. `null` = no lo es
   * y lo que hay es `autorizadoIdentidadId`: exactamente uno de los dos va
   * relleno y lo obliga la BD.
   */
  autorizadoClienteId: string | null
  /**
   * A quién se autorizó cuando NO es cliente: su identidad del portal. De ella
   * **no sabemos el nombre** —no hay ficha— y por eso `autorizadoNombre` es
   * `null`: la pantalla dice «una persona invitada», no un nombre inventado.
   */
  autorizadoIdentidadId: string | null
  autorizadoNombre: string | null
  /**
   * La ÚNICA póliza que abre. `null` = **todas las del otorgante**, incluidas
   * las que contrate mañana — y eso la pantalla lo tiene que decir con esas
   * palabras, porque no es lo mismo prestarle a alguien la del coche que la
   * cartera entera para siempre.
   */
  polizaId: string | null
  /** Cómo se llama esa póliza para pintarla. `null` = todas, o ya no se puede leer. */
  polizaEtiqueta: string | null
  /**
   * Con qué título representa a la sociedad quien recibe un apoderamiento
   * (`administrador` | `apoderado` | `empleado_autorizado`). `null` = no consta,
   * y en una fila de persona física eso es lo normal: ahí no se representa a
   * nadie, se mira. La BD lo exige en cuanto el alcance es `partes` o
   * `documentos` (`portal_autorizacion_apoderamiento_con_titulo`).
   */
  tituloRepresentacion: string | null
  /**
   * Qué es quien cede. `null` = **no lo sabemos** (su ficha ya no se puede leer
   * o está fusionada), y entonces la pantalla no afirma qué ve el autorizado:
   * de una persona nunca ve IBAN ni DNI, pero de una sociedad SÍ, y decir la
   * frase de una sobre la otra es exactamente la mentira que esto evita.
   */
  tipoOtorgante: TipoOtorgante | null
  otorgadoEn: Date
  aceptadoEn: Date | null
  caducaEn: Date
  revocadoEn: Date | null
  /**
   * Días en que el autorizado entró a mirar, y **tres estados, no dos**:
   *
   *   - `null`  = **no lo sabemos**: no se ha pedido (en `recibidas` no le toca
   *               verlo a quien mira) o la consulta del registro falló.
   *   - `[]`    = lo hemos mirado y **no ha entrado nadie**.
   *   - con días = las visitas.
   *
   * 🚨 Colapsar los dos primeros es exactamente la regla dura de la casa: la
   * pantalla diría «no ha entrado nadie a ver tus seguros» porque una consulta
   * de auditoría se cayó, y eso es sobre lo que José decide si revoca.
   */
  usos: Uso[] | null
  /**
   * ¿Puede ESTA identidad revocarla ya? La UI no tiene que deducirlo de las
   * fechas ni comerse un `no_te_toca` para enterarse.
   */
  puedoRevocar: boolean
}

export type Uso = { dia: Date; visitas: number }

/** Alguien a quien PUEDES autorizar: hay relación en la cartera y tu nivel te deja conceder. */
export type Candidato = {
  otorganteClienteId: string
  otorganteNombre: string | null
  autorizadoClienteId: string
  autorizadoNombre: string | null
  tipoRelacion: string
  /** Alcances que ya ocupan sitio para esta pareja (pendientes o vigentes). */
  yaConcedidos: Alcance[]
  /**
   * Qué es la ficha DESDE la que se concede. Va aquí para que la pantalla no lo
   * adivine por el nombre («…S.L.» no es un dato) ni lo pregunte: de una persona
   * solo se delega mirar, de una sociedad se delega su gestión. Cuando la ficha
   * no dice qué es (`tipo_persona` a NULL, que hoy es la mayoría de la cartera)
   * vale `'fisica'`, el lado restrictivo.
   */
  tipoOtorgante: TipoOtorgante
  /**
   * Los alcances que ESTA ficha puede conceder hoy, ya resueltos por el módulo
   * puro. La pantalla pinta esta lista y no una suya: dos listas del mismo
   * vocabulario acaban discrepando, y la que decide es la del backend.
   */
  alcancesPosibles: Alcance[]
  /**
   * Las pólizas VIVAS de la ficha que cede, para poder compartir UNA sola. La
   * lista sale del backend y no del cliente por lo de siempre: el id que se
   * mande de vuelta se vuelve a comprobar contra la ficha en `conceder()`, y
   * además la FK compuesta de la BD no deja colar la de un tercero.
   *
   * Vacía = esa ficha no tiene ninguna póliza viva ahora mismo. La pantalla
   * entonces no ofrece elegir: no hay nada entre lo que elegir, y un desplegable
   * vacío se lee como «se ha roto».
   */
  polizas: { id: string; etiqueta: string }[]
}

export type AutorizacionesPortal = {
  /** ¿Alguna de mis fichas tiene nivel para conceder? Si es `false`, la pantalla no ofrece el alta. */
  puedeAutorizar: boolean
  /** Las que YO he concedido sobre mis fichas (con su registro de accesos). */
  otorgadas: AutorizacionVista[]
  /** Las que otros me han concedido a mí. */
  recibidas: AutorizacionVista[]
  candidatos: Candidato[]
}

const SIN_NADA: AutorizacionesPortal = {
  puedeAutorizar: false,
  otorgadas: [],
  recibidas: [],
  candidatos: [],
}

type ResultadoConceder =
  | { ok: true; id: string; estado: EstadoAutorizacion; caducaEn: Date }
  | { ok: false; error: ErrorConceder; mensaje: string }

export type ErrorConceder =
  | 'datos_invalidos'
  | 'alcance_no_disponible'
  | 'titulo_requerido'
  | 'ficha_no_tuya'
  | 'nivel_insuficiente'
  | 'sin_relacion'
  | 'ya_concedida'
  /** La póliza que se quería compartir no está en la ficha desde la que se cede. */
  | 'poliza_no_es_tuya'

type ResultadoResolver =
  | { ok: true; estado: EstadoAutorizacion }
  | { ok: false; error: ErrorResolver; mensaje: string }

export type ErrorResolver = 'datos_invalidos' | 'no_encontrada' | 'no_te_toca' | 'ya_revocada' | 'no_pendiente'

/** Las fichas de la cartera que son de ESTA identidad. La única frontera de aislamiento. */
async function fichasDeIdentidad(identidadId: string) {
  return prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true },
    orderBy: { creadoEn: 'asc' },
  })
}

type FichaVista = { nombre: string; tipo: TipoOtorgante }

/**
 * Nombre y tipo de persona de cada ficha, para pintar. Las fusionadas
 * (`merged_into_cliente_id`) y las que ya no existen **no salen del mapa**, y por
 * eso su nombre y su tipo acaban en `null`: es «no se sabe», no un hueco que
 * rellenar.
 */
async function fichasPorId(ids: string[]): Promise<Map<string, FichaVista>> {
  if (ids.length === 0) return new Map()
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: ids }, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
  })
  return new Map(
    clientes.map((c) => [
      c.id,
      { nombre: `${c.nombre} ${c.apellidos}`.trim(), tipo: tipoDeFicha(c.tipoPersona) },
    ]),
  )
}

/**
 * Todo lo que la pantalla de autorizaciones necesita de una identidad.
 *
 * Sin `try/catch`: si una consulta falla, que suba como error. Devolver listas
 * vacías haría pasar un fallo de BD por un «no tienes ninguna autorización», que
 * es justo la mentira que este portal no puede contar (regla del `CLAUDE.md` de
 * la raíz: dato que NO hay ≠ dato que NO se ha mirado).
 */
export async function autorizacionesDeIdentidad(identidadId: string): Promise<AutorizacionesPortal> {
  const vinculos = await fichasDeIdentidad(identidadId)
  if (vinculos.length === 0) return SIN_NADA

  const misIds = vinculos.map((v) => v.clienteId)
  const misIdsSet = new Set(misIds)
  // Fichas desde las que SÍ puedo conceder: el nivel lo decide el módulo puro.
  const otorgablesIds = vinculos
    .filter((v) => nivelPuedeAutorizar(nivelDeVinculo(v.nivel)))
    .map((v) => v.clienteId)

  const [filas, relaciones] = await Promise.all([
    // Mías por cualquiera de los dos lados. El `in misIds` es la frontera: sin
    // él esto devuelve las autorizaciones de la correduría entera.
    prisma.portalAutorizacion.findMany({
      where: {
        OR: [
          { otorganteClienteId: { in: misIds } },
          { autorizadoClienteId: { in: misIds } },
          // 🚨 El tercer brazo (04/09/2026): a mí me pueden haber autorizado sin
          // que yo sea cliente de nadie. Sin él, el invitado no ve ni que existe
          // la autorización que le abrieron, y por tanto no puede revocarla.
          { autorizadoIdentidadId: identidadId },
        ],
      },
      orderBy: { otorgadoEn: 'desc' },
      take: MAX_AUTORIZACIONES,
    }),
    // Las relaciones de la cartera son lo que le OFRECE a José a quién puede
    // autorizar. En cualquiera de los dos sentidos: la fila la creó el corredor
    // y su dirección no dice quién autoriza a quién.
    otorgablesIds.length === 0
      ? []
      : prisma.clienteRelacion.findMany({
          where: {
            OR: [{ clienteAId: { in: otorgablesIds } }, { clienteBId: { in: otorgablesIds } }],
          },
          select: { clienteAId: true, clienteBId: true, tipoRelacion: true },
        }),
  ])

  const hoy = new Date()
  const otorgadas = filas.filter((f) => misIdsSet.has(f.otorganteClienteId))
  // Si una autorización tuviera mis dos fichas (yo a mí mismo) cuenta como
  // otorgada y no se duplica: `otorgadas` y `recibidas` son listas disjuntas.
  const meAlcanza = (f: (typeof filas)[number]) =>
    (f.autorizadoClienteId !== null && misIdsSet.has(f.autorizadoClienteId)) ||
    f.autorizadoIdentidadId === identidadId
  const recibidas = filas.filter((f) => !misIdsSet.has(f.otorganteClienteId) && meAlcanza(f))

  // El registro de accesos SOLO de las otorgadas. Los ids salen de `otorgadas`,
  // que ya está filtrada por mis fichas: no se filtra además por `identidadId`
  // a propósito — las visitas las hizo OTRA identidad, y son justo las que el
  // otorgante tiene derecho a ver.
  //
  // 🚨 Y por qué ESTA consulta sí lleva `try/catch` cuando el resto del fichero
  // no: si se cae, la alternativa no es un error de pantalla sino decirle a
  // José «no ha entrado nadie a ver tus seguros», que es falso y es justo sobre
  // lo que él decide si revoca. `usosPor === null` propaga ese «no lo sabemos»
  // hasta la vista en vez de convertirlo en un `[]` tranquilizador.
  const otorgadasIds = otorgadas.map((f) => f.id)
  let usosPor: Map<string, Uso[]> | null = new Map()
  if (otorgadasIds.length > 0) {
    try {
      const usos = await prisma.portalAutorizacionUso.findMany({
        where: { autorizacionId: { in: otorgadasIds } },
        select: { autorizacionId: true, dia: true, visitas: true },
        orderBy: { dia: 'desc' },
        take: MAX_USOS * otorgadasIds.length,
      })
      const m = new Map<string, Uso[]>()
      for (const u of usos) {
        const g = m.get(u.autorizacionId)
        if (g) g.push({ dia: u.dia, visitas: u.visitas })
        else m.set(u.autorizacionId, [{ dia: u.dia, visitas: u.visitas }])
      }
      usosPor = m
    } catch {
      usosPor = null
    }
  }

  // Candidatos: la otra punta de cada relación que permita autorizar y que NO
  // sea otra ficha mía (autorizarme a mí mismo no significa nada).
  type Pareja = { otorgante: string; autorizado: string; tipoRelacion: string }
  const parejas = new Map<string, Pareja>()
  for (const r of relaciones) {
    if (!permiteAutorizar(r.tipoRelacion)) continue
    const mio = otorgablesIds.includes(r.clienteAId)
      ? r.clienteAId
      : otorgablesIds.includes(r.clienteBId)
        ? r.clienteBId
        : null
    if (mio === null) continue
    const otro = mio === r.clienteAId ? r.clienteBId : r.clienteAId
    if (misIdsSet.has(otro)) continue
    const clave = `${mio}|${otro}`
    // La misma pareja puede tener fila en los dos sentidos: se queda la primera
    // y no se pinta dos veces a la misma persona.
    if (!parejas.has(clave)) parejas.set(clave, { otorgante: mio, autorizado: otro, tipoRelacion: r.tipoRelacion })
  }

  // Las pólizas vivas de mis fichas otorgables: lo que se puede compartir de una
  // en una. `merged_into_poliza_id IS NULL` además de `WHERE_CARTERA_VIVA`
  // porque una fusionada ya no es esa póliza, y ofrecerla sería conceder un
  // acceso que la bóveda del otro no puede servir.
  const polizasOtorgables = new Map<string, { id: string; etiqueta: string }[]>()
  if (otorgablesIds.length > 0) {
    const filasPolizas = await prisma.poliza.findMany({
      where: { AND: [{ clienteId: { in: otorgablesIds }, mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA] },
      select: { id: true, clienteId: true, aseguradora: true, numeroPoliza: true, tipo: true },
      orderBy: [{ fechaVencimiento: 'desc' }, { createdAt: 'desc' }],
      take: MAX_POLIZAS_OTORGABLES,
    })
    for (const p of filasPolizas) {
      if (p.clienteId === null) continue
      const partes = [p.aseguradora, p.tipo, p.numeroPoliza].filter((x): x is string => !!x && x.trim() !== '')
      // Sin una sola pieza legible no se ofrece: un desplegable con un uuid o un
      // hueco no es una elección, es una trampa.
      if (partes.length === 0) continue
      const g = polizasOtorgables.get(p.clienteId)
      if (g) g.push({ id: p.id, etiqueta: partes.join(' · ') })
      else polizasOtorgables.set(p.clienteId, [{ id: p.id, etiqueta: partes.join(' · ') }])
    }
  }

  const fichaPor = await fichasPorId([
    ...new Set([
      ...misIds,
      ...filas.map((f) => f.otorganteClienteId),
      // `null` cuando el autorizado es una identidad sin ficha: no hay nombre
      // que pedir, y meter un `null` en el `in` traería filas de más.
      ...filas.map((f) => f.autorizadoClienteId).filter((x): x is string => x !== null),
      ...[...parejas.values()].map((p) => p.autorizado),
    ]),
  ])
  // Cómo se llama cada póliza concedida UNA A UNA, para que la pantalla no
  // enseñe un uuid. Sale de la BD y no del cliente: la fila ya está filtrada por
  // mis fichas o mi identidad, así que aquí no se puede pedir la de un tercero.
  // 🚨 Se traen también las FUSIONADAS (sin `mergedIntoPolizaId: null`): una
  // autorización que apunta a una fusionada sigue existiendo, y borrarla de la
  // pantalla dejaría a José sin poder revocar lo que sí concedió.
  const polizasCitadas = [...new Set(filas.map((f) => f.polizaId).filter((x): x is string => x !== null))]
  const etiquetaPoliza = new Map<string, string>()
  if (polizasCitadas.length > 0) {
    const filasPoliza = await prisma.poliza.findMany({
      where: { id: { in: polizasCitadas } },
      select: { id: true, aseguradora: true, numeroPoliza: true, tipo: true },
    })
    for (const p of filasPoliza) {
      const partes = [p.aseguradora, p.tipo, p.numeroPoliza].filter((x): x is string => !!x && x.trim() !== '')
      // Sin una sola pieza legible no se inventa un nombre: se queda fuera del
      // mapa y la vista lo dice como «una póliza» y no como algo que no es.
      if (partes.length > 0) etiquetaPoliza.set(p.id, partes.join(' · '))
    }
  }

  const nombre = (id: string): string | null => fichaPor.get(id)?.nombre ?? null
  // `null` = la ficha no se pudo leer. NO se cae a `'fisica'` aquí: en el alta sí
  // (no conceder de más), pero al PINTAR una fila ya concedida un tipo inventado
  // haría afirmar qué ve el autorizado sobre una ficha que no hemos mirado.
  const tipoDe = (id: string): TipoOtorgante | null => fichaPor.get(id)?.tipo ?? null

  const aVista = (f: (typeof filas)[number], conUsos: boolean): AutorizacionVista => {
    const estado = estadoAutorizacion(
      { aceptadoEn: f.aceptadoEn, caducaEn: f.caducaEn, revocadoEn: f.revocadoEn },
      hoy,
    )
    return {
      id: f.id,
      // `alcance` es `text` con CHECK en la BD; el vocabulario lo fija el módulo
      // puro. Una fila con un alcance que ya no existe se enseña tal cual: es lo
      // que se consintió, y borrarlo de la vista sería reescribir el
      // consentimiento. Aquí solo se PINTA — lo que abre datos es
      // `camposDeAlcances`, que no acepta nada fuera del vocabulario.
      alcance: f.alcance as Alcance,
      estado,
      tituloRepresentacion: f.tituloRepresentacion,
      tipoOtorgante: tipoDe(f.otorganteClienteId),
      otorganteClienteId: f.otorganteClienteId,
      otorganteNombre: nombre(f.otorganteClienteId),
      autorizadoClienteId: f.autorizadoClienteId,
      autorizadoIdentidadId: f.autorizadoIdentidadId,
      // Sin ficha no hay nombre, y **`null` es la respuesta correcta**: la
      // pantalla dice «una persona invitada». Poner aquí el correo con el que
      // pidió sería enseñárselo a quien concede, y el portal no lo guarda en
      // claro justo para no poder hacer eso.
      autorizadoNombre: f.autorizadoClienteId === null ? null : nombre(f.autorizadoClienteId),
      polizaId: f.polizaId,
      polizaEtiqueta: f.polizaId === null ? null : (etiquetaPoliza.get(f.polizaId) ?? null),
      otorgadoEn: f.otorgadoEn,
      aceptadoEn: f.aceptadoEn,
      caducaEn: f.caducaEn,
      revocadoEn: f.revocadoEn,
      // `null` en los dos casos que son «no lo sabemos»: no se ha pedido
      // (recibidas) o la consulta se cayó (`usosPor === null`). Nunca `[]`.
      usos: conUsos && usosPor !== null ? (usosPor.get(f.id) ?? []).slice(0, MAX_USOS) : null,
      // Las dos listas son de fichas mías, así que `esMia` es true en ambas:
      // lo que decide es el estado.
      puedoRevocar: puedeRevocarse(estado, true),
    }
  }

  const vistasOtorgadas = otorgadas.map((f) => aVista(f, true))

  const candidatos: Candidato[] = [...parejas.values()].map((p) => ({
    otorganteClienteId: p.otorgante,
    otorganteNombre: nombre(p.otorgante),
    autorizadoClienteId: p.autorizado,
    autorizadoNombre: nombre(p.autorizado),
    tipoRelacion: p.tipoRelacion,
    // Aquí sí se cae a `'fisica'` cuando la ficha no se pudo leer: esto alimenta
    // el formulario de ALTA, y el lado restrictivo es el único que no ofrece un
    // apoderamiento sobre una ficha de la que no sabemos qué es.
    tipoOtorgante: tipoDe(p.otorgante) ?? 'fisica',
    alcancesPosibles: [...alcancesConcedibles(tipoDe(p.otorgante) ?? 'fisica')],
    polizas: polizasOtorgables.get(p.otorgante) ?? [],
    yaConcedidos: vistasOtorgadas
      .filter(
        (v) =>
          v.otorganteClienteId === p.otorgante &&
          v.autorizadoClienteId === p.autorizado &&
          ocupaElSitio(v.estado),
      )
      .map((v) => v.alcance),
  }))

  return {
    puedeAutorizar: otorgablesIds.length > 0,
    otorgadas: vistasOtorgadas,
    recibidas: recibidas.map((f) => aVista(f, false)),
    candidatos,
  }
}

/** Igual que `autorizacionesDeIdentidad`, abriendo la puerta aquí. `null` = no hay sesión. */
export async function autorizacionesDeSesion(): Promise<AutorizacionesPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return autorizacionesDeIdentidad(identidad.id)
}

/**
 * José concede: «que María pueda ver los seguros de esta ficha mía».
 *
 * El orden de las comprobaciones no es decorativo — va de lo que no toca la BD
 * a lo que sí, y de lo que no revela nada a lo que podría:
 *   1. Que el alcance exista siquiera (puro, sin BD).
 *   2. La ficha otorgante es MÍA (`portal_vinculo`) — sin esto, cualquiera con
 *      sesión regala los datos de otro mandando su uuid en el JSON.
 *   3. Mi NIVEL sobre esa ficha me deja conceder (módulo puro).
 *   4. **Qué ES la ficha que cede**, y con eso, si el alcance se puede conceder.
 *   5. Un apoderamiento sin TÍTULO no entra (y la BD lo repite con un CHECK).
 *   6. Existe relación en la cartera entre las dos fichas.
 *   7. No hay ya una viva igual.
 *
 * 🚨 El paso 4 es el que cambió el 03/09/2026 y por eso la decisión del alcance
 * dejó de ser lo primero: **ya no depende solo del alcance, sino de quién cede**.
 * El RGPD protege a las personas físicas, así que de una persona solo se delega
 * MIRAR; una sociedad no tiene datos personales y lo que hay ahí no es
 * consentimiento sino REPRESENTACIÓN mercantil, que sí se delega entera. Saber
 * qué es la ficha exige leerla, y leerla exige haber comprobado antes que es mía
 * — de ahí el orden. Lo puro que se podía adelantar (¿es siquiera un alcance?)
 * sigue delante, antes de tocar la BD.
 *
 * Nace **apagada** (`aceptadoEn: null` → estado `pendiente`) y con fecha de fin:
 * art. 25.2 RGPD, y porque `caducaEn` es lo único que resuelve el divorcio —
 * nadie entra al portal a revocar el día que se separa.
 */
export async function conceder(datos: {
  identidadId: string
  otorganteClienteId: string
  autorizadoClienteId: string
  alcance: string
  /**
   * La ÚNICA póliza que se abre. `null`/ausente = todas las del otorgante, que
   * es lo que significaban todas las autorizaciones antes del 04/09/2026 — y
   * eso incluye las que contrate MAÑANA. El caso que lo pidió es el de empresa:
   * el dueño quiere que su empleado vea la póliza de la nave y no la de su
   * coche.
   *
   * 🚨 Que la póliza sea DEL OTORGANTE no se comprueba solo aquí: la FK es
   * compuesta contra `polizas(cliente_id, id)`, así que un id manipulado lo
   * rechaza la BD (23503). La comprobación de abajo existe para poder decirlo
   * con palabras en vez de devolver un error de Postgres.
   */
  polizaId?: unknown
  /** Solo lo lleva la representación de una sociedad; en una física se ignora. */
  tituloRepresentacion?: unknown
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoConceder> {
  const { identidadId, otorganteClienteId, autorizadoClienteId } = datos
  const polizaId = typeof datos.polizaId === 'string' && UUID.test(datos.polizaId) ? datos.polizaId : null
  if (datos.polizaId !== undefined && datos.polizaId !== null && polizaId === null) {
    return {
      ok: false,
      error: 'datos_invalidos',
      mensaje: 'No hemos entendido qué póliza querías compartir. Vuelve a cargar la pantalla.',
    }
  }

  if (otorganteClienteId === autorizadoClienteId) {
    return {
      ok: false,
      error: 'datos_invalidos',
      mensaje: 'No se puede autorizar una ficha a sí misma.',
    }
  }

  // Lo único del alcance que se puede decidir sin la BD: si ni siquiera está en
  // el vocabulario. Lo demás depende de quién cede, y eso hay que leerlo.
  if (!esAlcance(datos.alcance)) {
    return {
      ok: false,
      error: 'alcance_no_disponible',
      mensaje: 'Ese permiso no existe. Vuelve a cargar la pantalla y elige uno de los que salen.',
    }
  }

  const vinculos = await fichasDeIdentidad(identidadId)
  const mio = vinculos.find((v) => v.clienteId === otorganteClienteId)
  if (!mio) {
    return { ok: false, error: 'ficha_no_tuya', mensaje: 'Esa ficha no es tuya.' }
  }

  if (!nivelPuedeAutorizar(nivelDeVinculo(mio.nivel))) {
    return {
      ok: false,
      error: 'nivel_insuficiente',
      // El consentimiento para ceder unos datos es de su dueño: quien solo está
      // autorizado a ver una ficha no puede regalarla a un tercero.
      mensaje: 'Tu acceso a esa ficha es de consulta: no permite autorizar a otras personas.',
    }
  }

  // Qué ES la ficha que cede. Sin `try/catch`: si esta lectura falla, que suba
  // como error. Caer a «física» ante un fallo de BD le diría a quien representa
  // a una sociedad que no puede hacer algo que sí puede, y sonaría a norma.
  const fichaOtorgante = await prisma.cliente.findFirst({
    where: { id: otorganteClienteId, correduriaId: mio.correduriaId, mergedIntoClienteId: null },
    select: { tipoPersona: true },
  })
  if (fichaOtorgante === null) {
    // El vínculo apunta a una ficha que ya no está activa (fusionada o borrada):
    // no se concede sobre ella, y se dice, en vez de conceder sobre una lápida.
    return {
      ok: false,
      error: 'ficha_no_tuya',
      mensaje: 'Esa ficha ya no está activa en la cartera. Escríbenos y lo revisamos.',
    }
  }
  const tipoOtorgante = tipoDeFicha(fichaOtorgante.tipoPersona)

  const alcance = alcanceConcedible(datos.alcance, tipoOtorgante)
  if (alcance === null) {
    return {
      ok: false,
      error: 'alcance_no_disponible',
      // Se explica en vez de callarse, y ahora la razón depende de QUIÉN cede:
      // que una sociedad delegue su gestión es representación mercantil; que la
      // delegue una persona es dar un poder, y un tick en una pantalla no lo es
      // —si María declara mal, la compañía discute la cobertura (art. 16 LCS)
      // sin que nadie pueda decir quién firmó.
      mensaje: esApoderamiento(datos.alcance)
        ? 'Dar partes o manejar documentos en nombre de otra persona es un apoderamiento, no un permiso de consulta: eso solo puede delegarlo una SOCIEDAD, en quien la representa. Desde una ficha de persona solo se puede autorizar a CONSULTAR los seguros.'
        : 'Ese permiso no se puede conceder desde esta ficha. Hoy solo se puede autorizar a CONSULTAR los seguros.',
    }
  }

  // El título solo tiene sentido cuando cede una sociedad: en una ficha de
  // persona no se representa a nadie, así que se descarta en vez de guardarlo.
  const titulo: TituloRepresentacion | null =
    tipoOtorgante === 'juridica' ? tituloRepresentacion(datos.tituloRepresentacion) : null

  // 🚨 Apoderamiento sin título no entra. La BD lo repite con un CHECK
  // (`portal_autorizacion_apoderamiento_con_titulo`), pero llegar hasta allí
  // devolvería un error de Postgres en vez de decir qué falta: si quien
  // representa da un parte, la que queda obligada es la sociedad, y «alguien de
  // la empresa» no es un título que oponerle a la compañía.
  if (esApoderamiento(alcance) && titulo === null) {
    return {
      ok: false,
      error: 'titulo_requerido',
      mensaje:
        'Para actuar en nombre de la sociedad hace falta decir con qué título se hace: administrador, apoderado o empleado autorizado.',
    }
  }

  const [relaciones, autorizado] = await Promise.all([
    prisma.clienteRelacion.findMany({
      where: {
        correduriaId: mio.correduriaId,
        OR: [
          { clienteAId: otorganteClienteId, clienteBId: autorizadoClienteId },
          { clienteAId: autorizadoClienteId, clienteBId: otorganteClienteId },
        ],
      },
      select: { tipoRelacion: true },
    }),
    // Una ficha fusionada ya no es una persona a la que autorizar: sus datos
    // viven en otra. Se comprueba aquí y no aguas abajo porque el resultado
    // sería una autorización viva que no apunta a nadie.
    prisma.cliente.findFirst({
      where: { id: autorizadoClienteId, correduriaId: mio.correduriaId, mergedIntoClienteId: null },
      select: { id: true },
    }),
  ])

  // `SIN_VINCULO` («Sin vínculo») es el tipo de relación que el CRM usa para
  // decir «estas dos fichas se conocen pero no hay parentesco»: no propone nada.
  // El papel PROPONE el acceso, no lo concede — y `permiteAutorizar` es la
  // ÚNICA lectura de ese vocabulario, aquí no se compara con la cadena a mano.
  const hayRelacion = autorizado !== null && relaciones.some((r) => permiteAutorizar(r.tipoRelacion))
  if (!hayRelacion) {
    return {
      ok: false,
      error: 'sin_relacion',
      mensaje: `No consta ninguna relación entre las dos fichas (o consta como «${SIN_VINCULO}»). Habla con tu correduría para que la registre antes de autorizar.`,
    }
  }

  // Solo las que la BD considera vivas (`revocado_en IS NULL`), que son
  // exactamente las que el índice único parcial deja existir a la vez.
  // La póliza tiene que ser DEL OTORGANTE y seguir viva. La BD lo repite con la
  // FK compuesta contra `polizas(cliente_id, id)`, pero llegar hasta allí
  // devolvería un 23503 de Postgres en vez de decir qué pasa. Una FUSIONADA
  // tampoco vale: la lectura no la puede servir, así que conceder sobre ella
  // sería abrir un acceso que no abre nada — el modo de fallo que no se ve.
  if (polizaId !== null) {
    const suya = await prisma.poliza.findFirst({
      where: { id: polizaId, clienteId: otorganteClienteId, mergedIntoPolizaId: null },
      select: { id: true },
    })
    if (suya === null) {
      return {
        ok: false,
        error: 'poliza_no_es_tuya',
        mensaje: 'Esa póliza ya no está en la ficha desde la que quieres compartirla. Vuelve a cargar la pantalla.',
      }
    }
  }

  // 🚨 `polizaId` va en el WHERE, y no es un detalle: desde el 04/09/2026 la
  // clave del índice único es (otorgante, autorizado, COALESCE(póliza), alcance).
  // Sin filtrar por la póliza, conceder la del coche encontraría la de la casa
  // como «ya concedida» y se negaría a crearla — o peor, al revés: se enlazaría
  // con una que no es.
  const previas = await prisma.portalAutorizacion.findMany({
    where: { otorganteClienteId, autorizadoClienteId, alcance, polizaId, revocadoEn: null },
    select: { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const hoy = new Date()
  if (previas.some((p) => ocupaElSitio(estadoAutorizacion(p, hoy)))) {
    return {
      ok: false,
      error: 'ya_concedida',
      mensaje:
        polizaId === null
          ? 'Ya existe una autorización de ese tipo entre esas dos fichas.'
          : 'Ya existe una autorización de ese tipo sobre esa póliza.',
    }
  }

  // 🚨 El desfase entre lo que ve el usuario y lo que ve el índice.
  // `idx_portal_autorizacion_viva` es UNIQUE por (otorgante, autorizado,
  // alcance) WHERE `revocado_en IS NULL`: una **caducada** sigue con
  // `revocado_en` a NULL, así que para la BD sigue ocupando el sitio aunque para
  // el usuario no abra nada. Sin cerrarla, renovar revienta con un choque de
  // índice y la persona ve un error que no entiende.
  //
  // Cerrarla NO es revocarla —nadie la revocó, se le acabó el plazo— y por eso
  // `revocadoPor: 'caducidad'` es un valor propio del CHECK y no `'otorgante'`:
  // meterla en el mismo cajón le atribuiría a José un acto que no hizo, en la
  // tabla que existe precisamente para poder demostrar quién hizo qué. Tampoco
  // lleva `revocadoPorIdentidadId`: no hay nadie detrás.
  //
  // La fecha de cierre es su PROPIA `caducaEn`, no `hoy`: es cuando dejó de
  // valer de verdad. Fecharla hoy diría que el acceso siguió abierto meses.
  //
  // La fila se queda como historial: volver a conceder crea una nueva.
  //
  // Llegados aquí, `previas` solo puede tener CADUCADAS (las vivas ya salieron
  // por `ya_concedida` y las revocadas no entran en el `where`), y como mucho
  // UNA: eso es justo lo que garantiza el índice único parcial.
  const caducada = previas[0] ?? null

  const caducaEn = caducidadPorDefecto(hoy)
  const datosNueva = {
    correduriaId: mio.correduriaId,
    otorganteClienteId,
    autorizadoClienteId,
    alcance,
    // `null` = todas las del otorgante, futuras incluidas.
    polizaId,
    tituloRepresentacion: titulo,
    otorgadoPorIdentidadId: identidadId,
    caducaEn,
    // Qué texto aceptó. Sin esto el consentimiento no se puede demostrar — y por
    // eso la sociedad guarda OTRA versión: la de la persona afirma «no verá mi
    // IBAN ni podrá dar partes», que de una empresa es sencillamente falso.
    versionTexto: tipoOtorgante === 'juridica' ? TEXTO_REPRESENTACION_V1 : TEXTO_AUTORIZACION_V1,
    // `null` cuando la cabecera no vino: no se inventa una IP ni un navegador.
    ip: datos.ip,
    userAgent: datos.userAgent,
  }
  const seleccion = { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true }

  // En una transacción: cerrar la vieja y no crear la nueva dejaría a José sin
  // autorización Y sin el historial de por qué, y crear sin cerrar es el choque
  // de índice de arriba. O las dos, o ninguna.
  let fila
  if (caducada === null) {
    fila = await prisma.portalAutorizacion.create({ data: datosNueva, select: seleccion })
  } else {
    const [, creada] = await prisma.$transaction([
      prisma.portalAutorizacion.update({
        where: { id: caducada.id },
        // Su propia `caducaEn`, no `hoy`, y `'caducidad'` en vez de un lado.
        data: { revocadoEn: caducada.caducaEn, revocadoPor: 'caducidad' },
        select: { id: true },
      }),
      prisma.portalAutorizacion.create({ data: datosNueva, select: seleccion }),
    ])
    fila = creada
  }

  return {
    ok: true,
    id: fila.id,
    // El estado se calcula, no se afirma: si algún día `caducidadPorDefecto`
    // devolviera una fecha pasada, esto diría `caducada` en vez de mentir.
    estado: estadoAutorizacion(fila, hoy),
    caducaEn: fila.caducaEn,
  }
}

/**
 * María acepta lo que José concedió, o cualquiera de los dos lo revoca.
 *
 * 🚨 La **doble aceptación** no es un trámite: sin ella María entraría en los
 * datos de otro sin saber que hay un registro con su nombre — y ese registro es
 * justo lo que la hace responsable de lo que mire. Es el modelo del Registro de
 * Apoderamientos de la AEAT.
 *
 * «No existe» y «no es de ninguna de tus fichas» se responden IGUAL
 * (`no_encontrada`) a propósito: distinguirlas convierte esta función en un
 * oráculo de uuids válidos de la cartera ajena. `no_te_toca` es otra cosa —
 * la autorización SÍ es tuya, pero por el lado que no puede hacer esa acción
 * (el otorgante no acepta por el autorizado).
 */
export async function resolver(datos: {
  identidadId: string
  autorizacionId: string
  accion: 'aceptar' | 'revocar'
}): Promise<ResultadoResolver> {
  const { identidadId, autorizacionId, accion } = datos

  // 🚨 Sin vínculo NO se sale ya: a un invitado sin ficha se le puede autorizar
  // desde el 04/09/2026, y si aquí se cortara no podría ni aceptar ni revocar lo
  // que le abrieron. Su lado es `autorizadoIdentidadId`.
  const vinculos = await fichasDeIdentidad(identidadId)
  const misIds = vinculos.map((v) => v.clienteId)

  // El filtro por mis fichas va JUNTO al id, nunca un `findUnique({ id })` y un
  // `if` después: con el uuid de una autorización ajena la lectura sería un
  // éxito y el fallo no saldría en ningún log.
  const fila = await prisma.portalAutorizacion.findFirst({
    where: {
      id: autorizacionId,
      OR: [
        { otorganteClienteId: { in: misIds } },
        { autorizadoClienteId: { in: misIds } },
        { autorizadoIdentidadId: identidadId },
      ],
    },
    select: {
      id: true,
      otorganteClienteId: true,
      autorizadoClienteId: true,
      autorizadoIdentidadId: true,
      aceptadoEn: true,
      caducaEn: true,
      revocadoEn: true,
    },
  })
  if (!fila) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa autorización.' }
  }

  const hoy = new Date()
  const estado = estadoAutorizacion(fila, hoy)
  const soyOtorgante = misIds.includes(fila.otorganteClienteId)
  const soyAutorizado =
    (fila.autorizadoClienteId !== null && misIds.includes(fila.autorizadoClienteId)) ||
    fila.autorizadoIdentidadId === identidadId

  if (accion === 'aceptar') {
    // Acepta quien recibe el acceso, y solo él. Que el otorgante pudiera
    // aceptar por el otro vaciaría de sentido la segunda firma.
    if (!soyAutorizado) {
      return {
        ok: false,
        error: 'no_te_toca',
        mensaje: 'Esta autorización la tiene que aceptar la persona autorizada.',
      }
    }
    if (estado === 'revocada') {
      return { ok: false, error: 'ya_revocada', mensaje: 'Esta autorización ya está revocada.' }
    }
    if (estado !== 'pendiente') {
      return {
        ok: false,
        error: 'no_pendiente',
        mensaje:
          estado === 'caducada'
            ? 'Esta autorización ha caducado: pídele a esa persona que la conceda de nuevo.'
            : 'Esta autorización ya estaba aceptada.',
      }
    }

    // Las guardas van en el `where` además de en el `if` de arriba: entre la
    // lectura y la escritura cabe otra petición, y un doble «aceptar» pisaría
    // el sello de la primera. `count === 0` = alguien llegó antes.
    const { count } = await prisma.portalAutorizacion.updateMany({
      where: { id: fila.id, aceptadoEn: null, revocadoEn: null },
      data: { aceptadoEn: hoy, aceptadoPorIdentidadId: identidadId },
    })
    if (count === 0) {
      return { ok: false, error: 'no_pendiente', mensaje: 'Esta autorización ya no está pendiente.' }
    }
  } else {
    if (estado === 'revocada') {
      return { ok: false, error: 'ya_revocada', mensaje: 'Esta autorización ya está revocada.' }
    }
    // Revocan los DOS lados. El otorgante porque los datos son suyos; el
    // autorizado porque nadie tiene por qué cargar con un acceso que no quiere.
    if (!soyOtorgante && !soyAutorizado) {
      return { ok: false, error: 'no_te_toca', mensaje: 'No puedes revocar esta autorización.' }
    }
    const { count } = await prisma.portalAutorizacion.updateMany({
      where: { id: fila.id, revocadoEn: null },
      data: {
        revocadoEn: hoy,
        revocadoPor: soyOtorgante ? 'otorgante' : 'autorizado',
        // El LADO no basta: de la aceptación consta quién la firmó y de la
        // revocación tiene que constar lo mismo, o la tabla que existe para
        // poder demostrar es asimétrica justo en el acto que corta el acceso.
        // `revocadoPorActor` se queda a `null` a propósito: ese es para cuando
        // revoca una persona de la correduría desde su app, no una identidad.
        revocadoPorIdentidadId: identidadId,
      },
    })
    if (count === 0) {
      return { ok: false, error: 'ya_revocada', mensaje: 'Esta autorización ya está revocada.' }
    }
  }

  // Se relee y se vuelve a calcular con `estadoAutorizacion`: el estado no se
  // afirma desde la acción que se acaba de hacer («he aceptado, luego está
  // vigente») porque una aceptada de una que caducaba hoy NO está vigente.
  const despues = await prisma.portalAutorizacion.findFirst({
    where: { id: fila.id },
    select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  if (!despues) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa autorización.' }
  }
  return { ok: true, estado: estadoAutorizacion(despues, new Date()) }
}

export type ResultadoUso = { registrado: true; filas: number } | { registrado: false; motivo: string }

/**
 * Deja constancia de que ESTA identidad ha mirado los seguros que le
 * autorizaron. Una fila por (autorización, identidad, DÍA): no interesa cuántos
 * clics dio, interesa que José pueda ver qué días entró María. Eso es lo que
 * convierte la autorización en algo real y no un cheque en blanco.
 *
 * 🚨 **Nunca lanza, y tampoco se lo traga.** Un fallo al registrar el acceso no
 * puede tumbar la lectura de la bóveda —quien mira no tiene la culpa de que
 * falle una tabla de auditoría— pero devolver `{ ok: true }` a secas dejaría el
 * registro roto sin que nadie se enterara nunca. Por eso devuelve
 * `{ registrado: false, motivo }` y decide el llamante: la pantalla puede
 * seguir, y quien vigile puede verlo.
 *
 * Los ids se comprueban contra las fichas de esta identidad antes de escribir:
 * un id que no le corresponde crearía una visita falsa en el registro que ve el
 * otorgante, y ese registro es una prueba, no un contador.
 */
export async function registrarUso(identidadId: string, autorizacionIds: string[]): Promise<ResultadoUso> {
  if (autorizacionIds.length === 0) return { registrado: true, filas: 0 }

  try {
    const vinculos = await fichasDeIdentidad(identidadId)
    const misIds = vinculos.map((v) => v.clienteId)

    // Solo las que de verdad me autorizan a MÍ: a una ficha mía o a mi
    // identidad. El `in` sobre ids repetidos no molesta: `[...new Set()]` los
    // deja en uno. Sin el brazo de la identidad, las visitas del invitado no se
    // anotarían y el otorgante vería «no ha entrado nadie» sobre alguien que sí
    // entró — que es peor que no tener registro.
    const validas = await prisma.portalAutorizacion.findMany({
      where: {
        id: { in: [...new Set(autorizacionIds)] },
        OR: [
          ...(misIds.length > 0 ? [{ autorizadoClienteId: { in: misIds } }] : []),
          { autorizadoIdentidadId: identidadId },
        ],
      },
      select: { id: true },
    })
    if (validas.length === 0) return { registrado: true, filas: 0 }

    const ahora = new Date()
    const dia = diaUtc(ahora)
    for (const v of validas) {
      await prisma.portalAutorizacionUso.upsert({
        where: { autorizacionId_identidadId_dia: { autorizacionId: v.id, identidadId, dia } },
        create: { autorizacionId: v.id, identidadId, dia },
        // `increment`, no `visitas + 1` leído antes: dos pestañas a la vez
        // perderían una visita y el registro contaría menos de lo que pasó.
        update: { visitas: { increment: 1 }, ultimaEn: ahora },
      })
    }

    return { registrado: true, filas: validas.length }
  } catch (e) {
    // El motivo, nunca el dato: aquí no se registra ni el id de la identidad ni
    // el de la autorización.
    return { registrado: false, motivo: e instanceof Error ? e.message : 'error desconocido' }
  }
}
