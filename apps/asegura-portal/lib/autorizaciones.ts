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
  caducidadPorDefecto,
  estadoAutorizacion,
  NIVELES,
  puedeAutorizar as nivelPuedeAutorizar,
  type Alcance,
  type EstadoAutorizacion,
  type Nivel,
} from '@central/module-seguros-portal'
import { permiteAutorizar, SIN_VINCULO } from '@central/module-seguros'

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
  'Autorizo a esta persona a CONSULTAR los seguros que tengo con Grupo Asegura.',
  'Solo puede verlos: no puede contratar, modificar, dar partes ni actuar en mi nombre.',
  'No verá mis datos personales (DNI, cuenta bancaria) ni mis documentos.',
  'La autorización caduca al año y puedo revocarla en cualquier momento desde el portal.',
  'Quedará registrado qué días ha consultado mis seguros, y ese registro lo veo yo.',
].join('\n')

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
  autorizadoClienteId: string
  autorizadoNombre: string | null
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
  | 'ficha_no_tuya'
  | 'nivel_insuficiente'
  | 'sin_relacion'
  | 'ya_concedida'

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

/**
 * Nombre para pintar de cada ficha. Las fusionadas (`merged_into_cliente_id`) y
 * las que ya no existen **no salen del mapa**, y por eso su nombre acaba en
 * `null`: es «no se sabe», no un hueco que rellenar.
 */
async function nombresDeFichas(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: ids }, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true },
  })
  return new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
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
        OR: [{ otorganteClienteId: { in: misIds } }, { autorizadoClienteId: { in: misIds } }],
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
  const recibidas = filas.filter((f) => !misIdsSet.has(f.otorganteClienteId) && misIdsSet.has(f.autorizadoClienteId))

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

  const nombrePor = await nombresDeFichas([
    ...new Set([
      ...misIds,
      ...filas.map((f) => f.otorganteClienteId),
      ...filas.map((f) => f.autorizadoClienteId),
      ...[...parejas.values()].map((p) => p.autorizado),
    ]),
  ])
  const nombre = (id: string): string | null => nombrePor.get(id) ?? null

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
      otorganteClienteId: f.otorganteClienteId,
      otorganteNombre: nombre(f.otorganteClienteId),
      autorizadoClienteId: f.autorizadoClienteId,
      autorizadoNombre: nombre(f.autorizadoClienteId),
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
 *   1. El alcance (puro): `partes`/`documentos` son APODERAMIENTO y hoy no se
 *      conceden. Se dice con una razón, nunca en silencio.
 *   2. La ficha otorgante es MÍA (`portal_vinculo`) — sin esto, cualquiera con
 *      sesión regala los datos de otro mandando su uuid en el JSON.
 *   3. Mi NIVEL sobre esa ficha me deja conceder (módulo puro).
 *   4. Existe relación en la cartera entre las dos fichas.
 *   5. No hay ya una viva igual.
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
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoConceder> {
  const { identidadId, otorganteClienteId, autorizadoClienteId } = datos

  if (otorganteClienteId === autorizadoClienteId) {
    return {
      ok: false,
      error: 'datos_invalidos',
      mensaje: 'No se puede autorizar una ficha a sí misma.',
    }
  }

  const alcance = alcanceConcedible(datos.alcance)
  if (alcance === null) {
    return {
      ok: false,
      error: 'alcance_no_disponible',
      // Se explica en vez de callarse: «ver los partes» y «ver los documentos»
      // no son grados de mirar, son actuar en nombre de otro. Un tick en una
      // pantalla no es un poder, y si María declara mal la compañía discute la
      // cobertura (art. 16 LCS) sin que nadie pueda decir quién firmó.
      mensaje:
        'Dar partes o descargar documentos en nombre de otra persona es un apoderamiento, no un permiso de consulta, y todavía no está disponible en el portal. Hoy solo se puede autorizar a CONSULTAR los seguros.',
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
  const previas = await prisma.portalAutorizacion.findMany({
    where: { otorganteClienteId, autorizadoClienteId, alcance, revocadoEn: null },
    select: { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const hoy = new Date()
  if (previas.some((p) => ocupaElSitio(estadoAutorizacion(p, hoy)))) {
    return {
      ok: false,
      error: 'ya_concedida',
      mensaje: 'Ya existe una autorización de ese tipo entre esas dos fichas.',
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
    otorgadoPorIdentidadId: identidadId,
    caducaEn,
    // Qué texto aceptó. Sin esto el consentimiento no se puede demostrar.
    versionTexto: TEXTO_AUTORIZACION_V1,
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

  const vinculos = await fichasDeIdentidad(identidadId)
  if (vinculos.length === 0) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa autorización.' }
  }
  const misIds = vinculos.map((v) => v.clienteId)

  // El filtro por mis fichas va JUNTO al id, nunca un `findUnique({ id })` y un
  // `if` después: con el uuid de una autorización ajena la lectura sería un
  // éxito y el fallo no saldría en ningún log.
  const fila = await prisma.portalAutorizacion.findFirst({
    where: {
      id: autorizacionId,
      OR: [{ otorganteClienteId: { in: misIds } }, { autorizadoClienteId: { in: misIds } }],
    },
    select: {
      id: true,
      otorganteClienteId: true,
      autorizadoClienteId: true,
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
  const soyAutorizado = misIds.includes(fila.autorizadoClienteId)

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
    if (vinculos.length === 0) return { registrado: true, filas: 0 }
    const misIds = vinculos.map((v) => v.clienteId)

    // Solo las que de verdad autorizan a una ficha MÍA. El `in` sobre ids
    // repetidos no molesta: `[...new Set()]` los deja en uno.
    const validas = await prisma.portalAutorizacion.findMany({
      where: {
        id: { in: [...new Set(autorizacionIds)] },
        autorizadoClienteId: { in: misIds },
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
