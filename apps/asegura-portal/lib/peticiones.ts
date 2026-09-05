// «Papá, ¿me dejas ver tu seguro del coche?» — la petición de acceso, contra la BD.
//
// Las REGLAS no están aquí: están en el módulo puro
// (`@central/module-seguros-portal/peticion-acceso`), que decide qué se le
// puede contestar a quien pregunta (`respuestaPublica`), cuánto dura una
// petición (`caducidadPeticion`), en qué estado está (`estadoPeticion`) y si se
// puede resolver (`peticionResoluble`). Este fichero es solo la BD y la
// costura con `portal_autorizacion`. Lee la cabecera de ese módulo antes de
// tocar nada de esto: lo que sigue es su aplicación, no su fuente.
//
// ── 🚨 EL ORÁCULO, que es lo que de verdad protege este fichero ─────────────
//
// Para pedir acceso hay que decir a QUIÉN, y el destinatario se nombra por su
// CORREO. Si la respuesta distinguiera «esa persona no está con nosotros» de
// «petición registrada», el portal sería una máquina de recorrer correos y
// sacar quién es cliente de la correduría: 32.600 fichas, desde fuera, sin
// límite y sin que nada falle. Por eso:
//
//   1. `creada`, `sin_destinatario`, `ya_pendiente` y `ya_autorizado` salen las
//      cuatro por `respuestaPublica()` como `registrada`, con el MISMO cuerpo y
//      el MISMO código HTTP (lo monta la ruta a partir de la respuesta pública,
//      nunca del resultado interno).
//   2. **El mismo trabajo observable.** No basta con que el texto sea igual: si
//      un camino escribiera fila y el otro no, o si un camino hiciera una
//      consulta menos, el RELOJ cantaría la diferencia. De ahí tres decisiones
//      que parecen rarezas y no lo son:
//        - la fila se escribe SIEMPRE (con `destinatario_cliente_id` a `null`
//          cuando no se resolvió), que además es lo que Alberto quiere para
//          saber a quién le están pidiendo entrar;
//        - las consultas que dependen del destinatario se lanzan IGUAL cuando
//          no hay destinatario, contra `NINGUNA_FICHA` (ver más abajo);
//        - la correduría de la fila sale de QUIEN PIDE, no del destinatario:
//          resolverla desde el destinatario metería una consulta extra
//          exactamente en el caso en que esa persona existe.
//   3. Lo que SÍ se puede decir es lo que depende solo de quien pregunta: que
//      se lo ha pedido a sí mismo y que ha gastado su cupo del día. El cupo es
//      por SOLICITANTE por eso mismo — uno por destinatario volvería a filtrar
//      («a este me deja pedírselo cinco veces, luego existe»).
//
// 📌 Y una consecuencia de producto: la petición se entrega DENTRO del portal.
// Desde aquí no hay ninguna dirección a la que escribir —`portal_canal` guarda
// solo un hash con pimienta y el rol no tiene GRANT sobre el email cifrado de
// la cartera—, así que el destinatario la ve al entrar. Mandar un correo es
// trabajo de `apps/asegura`, igual que el aviso del calendario.
//
// 🔒 Aislamiento por CÓDIGO. No hay RLS que rescate un olvido: el rol
// `prisma_asegura_portal` es NOBYPASSRLS pero estas tablas no tienen políticas
// para él, así que una consulta sin `where` responde 200 con las peticiones de
// todo el mundo. Las dos fronteras, sin excepciones: la identidad SIEMPRE sale
// de la cookie (`lib/session`), y **ningún `clienteId` entra desde la request**
// — toda ficha propia se comprueba antes contra `portal_vinculo` filtrado por
// esa identidad.
import { computeEmailLookupHash } from '@central/module-seguros-pii'
import {
  MAX_PETICIONES_DIA,
  NIVELES,
  alcanceConcedible,
  caducidadPeticion,
  caducidadPorDefecto,
  esAlcance,
  estadoAutorizacion,
  estadoPeticion,
  normalizarMensajePeticion,
  peticionResoluble,
  puedeAutorizar,
  respuestaPublica,
  type Alcance,
  type EstadoPeticion,
  type Nivel,
  type RespuestaPublica,
  type ResultadoPeticion,
} from '@central/module-seguros-portal'

import { TEXTO_AUTORIZACION_V1, TEXTO_REPRESENTACION_V1 } from './autorizaciones'
import { prisma } from './db'
import { getIdentidad } from './session'
import { elegirFicha, type Candidato } from './vinculo-elegir'

/** Cuántas peticiones se traen a la pantalla. Regla de rendimiento UI de la casa. */
const MAX_FILAS = 50

/** La ventana del cupo. Un día natural rodante, no «desde medianoche». */
const VENTANA_CUPO_MS = 24 * 60 * 60 * 1000

/**
 * 🚨 Ficha que no existe, para que las consultas que dependen del destinatario
 * se hagan IGUAL cuando no se ha resuelto ninguna.
 *
 * Saltárselas con un `if` sería lo natural y sería justo el agujero: quien
 * prueba correos mediría dos consultas contra una y tendría su oráculo por la
 * puerta del reloj, con las cuatro respuestas idénticas. Un uuid nulo no casa
 * con ninguna fila y cuesta lo mismo.
 */
const NINGUNA_FICHA = '00000000-0000-0000-0000-000000000000'

/** `nivel` es `text` con CHECK en la BD. Un valor fuera del vocabulario cae al MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

// ── Cabeceras de procedencia ───────────────────────────────────────────────

/**
 * La IP de quien pide, para poder demostrar quién pidió qué. `null` cuando no
 * viene: **no se inventa una IP**.
 *
 * 🚨 `x-forwarded-for` es una LISTA (`cliente, proxy1, proxy2`) y la columna es
 * `inet`: meterla entera revienta el INSERT con un 22P02 y tumba la petición
 * entera. Se coge el primer salto y, si no tiene forma de IP, `null` — un valor
 * de cajón en una columna de auditoría es peor que el hueco. (Misma regla que
 * en `app/api/autorizaciones/route.ts`.)
 */
export function ipDe(req: Request): string | null {
  const cabecera = req.headers.get('x-forwarded-for')
  if (!cabecera) return null
  const primera = cabecera.split(',')[0]?.trim() ?? ''
  if (primera === '') return null
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/
  const ipv6 = /^[0-9a-f:]+$/i
  return ipv4.test(primera) || (primera.includes(':') && ipv6.test(primera)) ? primera : null
}

export function userAgentDe(req: Request): string | null {
  const ua = req.headers.get('user-agent')?.trim()
  return ua ? ua.slice(0, 500) : null
}

// ── Crear una petición ─────────────────────────────────────────────────────

export type ErrorCrear = 'datos_invalidos' | 'no_disponible'

export type ResultadoCrear =
  | {
      ok: true
      /**
       * Lo que pasó DE VERDAD. Vive en el servidor y **no se le enseña entero a
       * nadie**: quien contesta es `respuesta`. Está aquí para el día que
       * Alberto quiera contar cuántas peticiones caen sobre gente que no está
       * en la cartera — eso es una consulta suya, no una respuesta pública.
       */
      resultado: ResultadoPeticion
      respuesta: RespuestaPublica
    }
  | { ok: false; error: ErrorCrear; mensaje: string }

/**
 * Quien pide dice a QUIÉN por su correo; aquí solo entra su índice ciego.
 *
 * **El correo en claro no se guarda, no se loguea y no vuelve en ninguna
 * respuesta.** Lo único que se conserva es el HMAC con `PII_LOOKUP_KEY` — el
 * mismo que escribe `apps/asegura` en `clientes.email_lookup_hash`, que es lo
 * que permite reconocer a la persona sin tener su dirección.
 */
export async function crearPeticion(datos: {
  identidadId: string
  email: string
  alcance: string
  mensaje?: unknown
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoCrear> {
  const { identidadId } = datos

  const alcance = alcanceConcedible(datos.alcance)
  if (alcance === null) {
    return {
      ok: false,
      error: 'datos_invalidos',
      mensaje: 'Ese permiso no se puede pedir. Vuelve a cargar la pantalla y elige uno de los que salen.',
    }
  }

  let hash: string | null
  try {
    hash = computeEmailLookupHash(datos.email)
  } catch (e) {
    // Sin `PII_LOOKUP_KEY` el módulo lanza (fail-fast). Aquí no se puede
    // seguir a ciegas: sin hash no hay a quién dirigir la petición, y guardar
    // el correo en claro «mientras tanto» sería exactamente lo que esta tabla
    // existe para evitar. Se dice que el servicio no está, para TODO el mundo:
    // eso no depende del destinatario y por tanto no es un oráculo.
    //
    // Del error sale el motivo; jamás el correo ni el hash.
    console.error('[portal/peticiones] no se pudo calcular el índice ciego:', e instanceof Error ? e.message : e)
    hash = null
  }
  if (!hash) {
    return {
      ok: false,
      error: 'no_disponible',
      mensaje: 'Ahora mismo no podemos registrar peticiones. Inténtalo más tarde.',
    }
  }

  // ── Cupo, lo PRIMERO y por SOLICITANTE ───────────────────────────────────
  // Antes de tocar nada del destinatario: así el cupo no depende de él ni en el
  // resultado ni en el tiempo. Un cupo por destinatario diría «a este me deja
  // pedírselo cinco veces, luego existe».
  const enviadasHoy = await prisma.portalPeticionAcceso.count({
    where: { solicitanteIdentidadId: identidadId, creadaEn: { gte: new Date(Date.now() - VENTANA_CUPO_MS) } },
  })
  if (enviadasHoy >= MAX_PETICIONES_DIA) {
    return { ok: true, resultado: 'limite_diario', respuesta: respuestaPublica('limite_diario') }
  }

  // ── Quién pide ───────────────────────────────────────────────────────────
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true },
    orderBy: { creadoEn: 'asc' },
  })
  const misFichas = new Set(vinculos.map((v) => v.clienteId))

  // 📌 Con MÁS de un vínculo la ficha del solicitante se queda a `null`: no se
  // elige una a cara o cruz. `null` significa «no lo sabemos», y lo que cuesta
  // es que al conceder haga falta una ficha (ver `resolverPeticion`). Mismo
  // criterio que `ambitoDeIdentidad()` de `lib/adjuntos-parte.ts`.
  const solicitanteClienteId = vinculos.length === 1 ? vinculos[0].clienteId : null

  // 🚨 La correduría sale de QUIEN PIDE, nunca del destinatario: si se
  // resolviera desde su ficha, el caso «esa persona existe» haría una consulta
  // menos que el caso contrario y el reloj lo diría. Sin vínculo se cae a la
  // única correduría, igual que `lib/adjuntos-parte.ts` — y **lanza** si
  // hubiera más de una, porque entonces elegir sería adivinar.
  const correduriaId = vinculos.length > 0 ? vinculos[0].correduriaId : await correduriaUnica()

  // ── A quién se le pide ───────────────────────────────────────────────────
  // Las dos vías donde puede vivir el correo de una ficha, igual que en
  // `lib/vinculo.ts`: la columna principal de `clientes` (el correo de ESA
  // ficha) y `cliente_emails` (correos de contacto, que pueden ser de otro).
  // Las fusionadas (`merged_into_cliente_id`) no son candidatas por ninguna vía.
  const [directas, secundarias] = await Promise.all([
    prisma.cliente.findMany({
      // Defensivo (05/09/2026): las fichas descartadas (`activo = false`) no tienen
      // email hoy, así que por aquí no puede salir ninguna — el filtro está para que
      // siga siendo verdad, no porque hubiera un fallo.
      where: { emailLookupHash: hash, mergedIntoClienteId: null, activo: true },
      select: { id: true, correduriaId: true },
    }),
    prisma.clienteEmail.findMany({ where: { emailLookupHash: hash }, select: { clienteId: true } }),
  ])

  const candidatos: Candidato[] = directas.map((c) => ({
    clienteId: c.id,
    correduriaId: c.correduriaId,
    principal: true,
  }))
  const yaPrincipales = new Set(candidatos.map((c) => c.clienteId))
  const idsSecundarios = [...new Set(secundarias.map((e) => e.clienteId))].filter((id) => !yaPrincipales.has(id))
  // La consulta se lanza SIEMPRE, aunque no haya ids que mirar: es la tercera
  // vez que aparece la misma idea y siempre por lo mismo — el trabajo
  // observable no puede depender de si esa persona está en la cartera.
  const vivas = await prisma.cliente.findMany({
    // Defensivo, igual que arriba: una ficha descartada no tiene email.
    where: {
      id: { in: idsSecundarios.length > 0 ? idsSecundarios : [NINGUNA_FICHA] },
      mergedIntoClienteId: null,
      activo: true,
    },
    select: { id: true, correduriaId: true },
  })
  for (const c of vivas) candidatos.push({ clienteId: c.id, correduriaId: c.correduriaId, principal: false })

  // 🚨 Quién es el destinatario lo decide `elegirFicha()`, la MISMA función que
  // usa el vínculo del canje, y no una cuenta a mano de candidatos. Medido el
  // 03/09/2026 con el correo del propio Alberto: 1 ficha por la columna
  // principal y 3 filas en `cliente_emails` (dos de OTRAS personas que lo
  // llevan de contacto). Contarlas todas da `ambiguo` y dejaría sin resolver a
  // media cartera. El correo principal de una ficha es la identidad de esa
  // ficha; salir como contacto en la de otro no te convierte en esa persona.
  // Lo que sigue sin adivinarse —dos fichas que declaran el mismo correo como
  // suyo— sigue siendo `null`, y `null` aquí se contesta igual que un acierto.
  const elegida = elegirFicha(candidatos)
  const destinatarioClienteId = elegida.estado === 'ok' ? elegida.clienteId : null

  // ── ¿Se lo está pidiendo a sí mismo? ─────────────────────────────────────
  // Esto SÍ se puede decir: depende solo de quien pregunta (el hash casa con
  // una ficha SUYA, de las de `portal_vinculo`) y no revela nada de nadie más.
  // Si no tiene ficha no hay forma de saberlo, y entonces cae en `registrada`
  // como cualquier otra: no se adivina por el correo de la sesión.
  if (destinatarioClienteId !== null && misFichas.has(destinatarioClienteId)) {
    return { ok: true, resultado: 'a_si_mismo', respuesta: respuestaPublica('a_si_mismo') }
  }

  // ── Lo que ya había ──────────────────────────────────────────────────────
  // La consulta se lanza pase lo que pase (de ahí `NINGUNA_FICHA`) y acaba en la
  // MISMA respuesta pública que un acierto o un fallo.
  const hoy = new Date()
  const autorizaciones = await prisma.portalAutorizacion.findMany({
    where: {
      otorganteClienteId: destinatarioClienteId ?? NINGUNA_FICHA,
      autorizadoClienteId: solicitanteClienteId ?? NINGUNA_FICHA,
      alcance,
      revocadoEn: null,
    },
    select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const yaAutorizado = autorizaciones.some((a) => estadoAutorizacion(a, hoy) === 'vigente')

  // ── La fila, SIEMPRE ─────────────────────────────────────────────────────
  // Se intenta escribir en los cuatro casos, también cuando no se resolvió
  // ninguna ficha y cuando esa persona YA te tenía autorizado: saltarse la
  // escritura en alguno metería una diferencia medible con el reloj entre
  // respuestas que dicen lo mismo. Quien la rechaza, cuando ya se lo habías
  // pedido, es la BD (ver el `catch`). El cupo por solicitante (5/día) es lo
  // que impide que esto se convierta en un vertedero.
  //
  // `creadaEn` se pasa explícito para que `caducaEn` salga exactamente 30 días
  // después de ESE instante y no del que ponga la BD.
  const creadaEn = new Date()
  let yaPendiente = false
  try {
    await prisma.portalPeticionAcceso.create({
      data: {
        correduriaId,
        solicitanteIdentidadId: identidadId,
        solicitanteClienteId,
        destinatarioEmailHash: hash,
        // `null` = no había ninguna ficha, o había varias y no se adivina. Quien
        // pidió no ve la diferencia.
        destinatarioClienteId,
        alcance,
        // Texto de un tercero: se recorta y se normaliza en el módulo puro, se
        // escapa al pintarlo, y no entra en ningún asunto de correo ni cabecera.
        mensaje: normalizarMensajePeticion(datos.mensaje),
        creadaEn,
        caducaEn: caducidadPeticion(creadaEn),
        ip: datos.ip,
        userAgent: datos.userAgent,
      },
      select: { id: true },
    })
  } catch (e) {
    // 🚨 `idx_portal_peticion_pendiente` es UNIQUE por (solicitante, hash del
    // destinatario) WHERE la petición sigue sin resolver: **la BD es quien
    // decide** que ya se lo había pedido. Preguntarlo antes con un SELECT sería
    // una carrera —dos clics seguidos crean dos filas y el destinatario recibe
    // la misma pregunta dos veces—, así que se intenta escribir SIEMPRE y se
    // recoge el choque. Que el intento se haga igual es lo que mantiene el
    // trabajo observable: el INSERT sale en los dos casos.
    //
    // El choque NO es un error que contar hacia fuera: `ya_pendiente` es uno de
    // los cuatro que colapsan en `registrada`. Y solo depende de lo que hizo
    // QUIEN PIDE, así que tampoco dice nada del destinatario.
    if (!esChoqueDePendiente(e)) throw e
    yaPendiente = true
  }

  const resultado: ResultadoPeticion = yaPendiente
    ? 'ya_pendiente'
    : yaAutorizado
      ? 'ya_autorizado'
      : destinatarioClienteId !== null
        ? 'creada'
        : 'sin_destinatario'

  // 🚨 La respuesta sale SIEMPRE por aquí. En el momento en que alguien devuelva
  // algo distinto según `resultado`, el portal empieza a contestar quién es
  // cliente de la correduría.
  return { ok: true, resultado, respuesta: respuestaPublica(resultado) }
}

/**
 * El choque contra `idx_portal_peticion_pendiente`, y NADA más.
 *
 * Se mira el código de Prisma (`P2002`, violación de índice único) sin tragarse
 * cualquier otro fallo: un `catch` que se comiera un error de BD dejaría a quien
 * pide creyendo que su petición está registrada cuando no existe en ninguna
 * parte, que es la peor mentira que puede contar el portal.
 */
function esChoqueDePendiente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}


/**
 * La única correduría de la casa, para quien escribe sin tener ficha (los
 * ~32.520 leads). **Lanza** si hubiera 0 o más de 1: elegir sería adivinar, y
 * una fila colgada de la correduría equivocada no se la encuentra nadie. Mismo
 * cepo que `correduriaUnica()` de `apps/asegura`.
 *
 * 📌 Se EXPORTA desde aquí, donde nació, y no desde un `lib/correduria.ts`
 * suelto: consulta `prisma.correduria`, o sea la cartera, y el guardián de
 * aislamiento exige que todo fichero que la toque nombre `portalVinculo` y
 * resuelva la sesión. Un fichero de una función no puede hacer ni lo uno ni lo
 * otro, así que sacarla habría costado un exento nuevo en el cepo —una puerta
 * abierta para siempre— a cambio de nada. Lo que sí importa (una sola copia de
 * la decisión) se consigue igual: `lib/supresion.ts` la importa de aquí.
 */
export async function correduriaUnica(): Promise<string> {
  const corredurias = await prisma.correduria.findMany({ select: { id: true }, take: 2 })
  if (corredurias.length === 0) throw new Error('sin_correduria: no hay ninguna correduría en la base')
  if (corredurias.length > 1) {
    throw new Error('correduria_ambigua: hay más de una correduría y esta fila no está vinculada a ninguna')
  }
  return corredurias[0].id
}

// ── Leer las peticiones de una identidad ───────────────────────────────────

export type PeticionRecibida = {
  id: string
  alcance: Alcance
  estado: EstadoPeticion
  /** La ficha MÍA sobre la que me piden acceso. */
  destinatarioClienteId: string
  /**
   * Quién pide, para que se sepa a quién se le abre. `null` = **no se sabe el
   * nombre** (no tiene ficha en la cartera, o está fusionada), nunca `''` ni
   * «Desconocido»: un valor de cajón se cuela por todas las guardas de NULL.
   */
  solicitanteNombre: string | null
  /** Texto de OTRA persona: se escapa al pintarlo. */
  mensaje: string | null
  creadaEn: Date
  caducaEn: Date
}

/**
 * Lo que ve QUIEN PIDIÓ.
 *
 * 🚨 Fíjate en lo que NO lleva: ni `destinatarioClienteId`, ni el nombre de esa
 * persona, ni nada que diga si la petición encontró ficha. Si esta lista dijera
 * «pendiente de Fulano» frente a «pendiente», el oráculo que la respuesta cierra
 * volvería a abrirse por la pantalla del historial. Una petición a alguien que
 * no está en la cartera se queda `pendiente` hasta que caduca, exactamente
 * igual que una que esa persona no ha mirado todavía.
 */
export type PeticionEnviada = {
  id: string
  alcance: Alcance
  estado: EstadoPeticion
  mensaje: string | null
  creadaEn: Date
  caducaEn: Date
}

export type PeticionesPortal = {
  recibidas: PeticionRecibida[]
  enviadas: PeticionEnviada[]
}

/**
 * `alcance` es `text` en la BD. Una fila con un valor que ya no está en el
 * vocabulario NO se pinta como otra cosa: se cae de la lista, porque enseñarla
 * como «ver» sería afirmar un permiso que nadie concedió.
 */
function alcanceDeFila(v: string): Alcance | null {
  return esAlcance(v) ? v : null
}

export async function peticionesDeIdentidad(identidadId: string): Promise<PeticionesPortal> {
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true },
  })
  const misIds = vinculos.map((v) => v.clienteId)

  const hoy = new Date()
  const [recibidas, enviadas] = await Promise.all([
    // La frontera es el `in misIds`, y esos ids salen de `portal_vinculo`
    // filtrado por esta identidad. Sin él, esto lista las peticiones de la
    // correduría entera. Con `misIds` vacío se pide contra `NINGUNA_FICHA`
    // para no dejar el `where` sin filtro por descuido de un `in []`.
    prisma.portalPeticionAcceso.findMany({
      where: { destinatarioClienteId: { in: misIds.length > 0 ? misIds : [NINGUNA_FICHA] } },
      orderBy: { creadaEn: 'desc' },
      take: MAX_FILAS,
    }),
    prisma.portalPeticionAcceso.findMany({
      where: { solicitanteIdentidadId: identidadId },
      orderBy: { creadaEn: 'desc' },
      take: MAX_FILAS,
    }),
  ])

  const solicitantes = [...new Set(recibidas.map((p) => p.solicitanteClienteId).filter((id): id is string => id !== null))]
  const nombres = await nombresDeFichas(solicitantes)

  return {
    recibidas: recibidas.flatMap((p) => {
      const alcance = alcanceDeFila(p.alcance)
      if (alcance === null || p.destinatarioClienteId === null) return []
      return [
        {
          id: p.id,
          alcance,
          estado: estadoPeticion(p, hoy),
          destinatarioClienteId: p.destinatarioClienteId,
          solicitanteNombre: p.solicitanteClienteId === null ? null : (nombres.get(p.solicitanteClienteId) ?? null),
          mensaje: p.mensaje,
          creadaEn: p.creadaEn,
          caducaEn: p.caducaEn,
        },
      ]
    }),
    enviadas: enviadas.flatMap((p) => {
      const alcance = alcanceDeFila(p.alcance)
      if (alcance === null) return []
      return [
        {
          id: p.id,
          alcance,
          estado: estadoPeticion(p, hoy),
          mensaje: p.mensaje,
          creadaEn: p.creadaEn,
          caducaEn: p.caducaEn,
        },
      ]
    }),
  }
}

/** Nombres de fichas, para pintar. Las fusionadas y las que ya no están NO salen del mapa. */
async function nombresDeFichas(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const clientes = await prisma.cliente.findMany({
    where: { id: { in: ids }, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true },
  })
  return new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
}

/** La puerta: abre la sesión aquí y delega. `null` = no hay sesión. */
export async function peticionesDeSesion(): Promise<PeticionesPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return peticionesDeIdentidad(identidad.id)
}

// ── Conceder, rechazar, retirar ────────────────────────────────────────────

export type ErrorResolverPeticion =
  | 'datos_invalidos'
  | 'no_encontrada'
  | 'no_pendiente'
  | 'nivel_insuficiente'
  | 'ficha_no_activa'
  | 'alcance_no_disponible'

export type ResultadoResolverPeticion =
  | { ok: true; estado: EstadoPeticion; autorizacionId: string | null }
  | { ok: false; error: ErrorResolverPeticion; mensaje: string }

/** Alguien llegó antes: la petición dejó de estar pendiente entre la lectura y la escritura. */
class YaResuelta extends Error {}

export async function resolverPeticion(datos: {
  identidadId: string
  peticionId: string
  accion: 'conceder' | 'rechazar' | 'retirar'
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoResolverPeticion> {
  const { identidadId, peticionId, accion } = datos
  const hoy = new Date()

  // Quién puede tocar esta fila depende de la acción, y el filtro va JUNTO al
  // id — nunca un `findUnique({ id })` y un `if` después: con el uuid de una
  // petición ajena la lectura sería un éxito y el fallo no saldría en ningún
  // log.
  //
  // 🚨 Sin permiso se contesta `no_encontrada` (404), NO 403: un 403 confirma
  // que esa petición existe, que es media filtración. Es la misma decisión que
  // toma `resolver()` en `lib/autorizaciones.ts`.
  const vinculos =
    accion === 'retirar'
      ? []
      : await prisma.portalVinculo.findMany({
          where: { identidadId },
          select: { clienteId: true, correduriaId: true, nivel: true },
          orderBy: { creadoEn: 'asc' },
        })

  const fila = await prisma.portalPeticionAcceso.findFirst({
    where:
      accion === 'retirar'
        ? // La retira QUIEN PIDIÓ, y solo él: no es lo mismo que un rechazo.
          { id: peticionId, solicitanteIdentidadId: identidadId }
        : // Conceden y rechazan las fichas MÍAS a las que se les pide.
          {
            id: peticionId,
            destinatarioClienteId: { in: vinculos.length > 0 ? vinculos.map((v) => v.clienteId) : [NINGUNA_FICHA] },
          },
    select: {
      id: true,
      alcance: true,
      solicitanteIdentidadId: true,
      solicitanteClienteId: true,
      destinatarioClienteId: true,
      creadaEn: true,
      caducaEn: true,
      concedidaEn: true,
      rechazadaEn: true,
      retiradaEn: true,
    },
  })
  if (!fila) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa petición.' }
  }

  // Solo se resuelve una PENDIENTE, y qué es «pendiente» lo decide el módulo
  // puro: lo RESUELTO gana a la caducidad, así que una concedida hace tres
  // meses no vuelve a estar en juego hoy.
  if (!peticionResoluble(fila, hoy)) {
    const estado = estadoPeticion(fila, hoy)
    return {
      ok: false,
      error: 'no_pendiente',
      mensaje:
        estado === 'caducada'
          ? 'Esta petición ha caducado. Pídele a esa persona que vuelva a mandarla.'
          : 'Esta petición ya estaba resuelta.',
    }
  }

  if (accion !== 'conceder') {
    // Las guardas van también en el `where`: entre la lectura y la escritura
    // cabe otra petición, y un doble clic pisaría el sello de la primera.
    const { count } = await prisma.portalPeticionAcceso.updateMany({
      where: { id: fila.id, concedidaEn: null, rechazadaEn: null, retiradaEn: null },
      data:
        accion === 'retirar'
          ? { retiradaEn: hoy, resueltaPorIdentidadId: identidadId }
          : { rechazadaEn: hoy, resueltaPorIdentidadId: identidadId },
    })
    if (count === 0) {
      return { ok: false, error: 'no_pendiente', mensaje: 'Esta petición ya no está pendiente.' }
    }
    return { ok: true, estado: accion === 'retirar' ? 'retirada' : 'rechazada', autorizacionId: null }
  }

  // ── Conceder ─────────────────────────────────────────────────────────────
  const otorganteClienteId = fila.destinatarioClienteId
  const mio = vinculos.find((v) => v.clienteId === otorganteClienteId)
  if (!otorganteClienteId || !mio) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa petición.' }
  }

  // El consentimiento para ceder unos datos es de su dueño: quien solo está
  // autorizado a VER una ficha no puede regalarla a un tercero. Quién puede lo
  // decide el módulo puro (`puedeAutorizar`), no un `if` copiado aquí.
  if (!puedeAutorizar(nivelDeVinculo(mio.nivel))) {
    return {
      ok: false,
      error: 'nivel_insuficiente',
      mensaje: 'Tu acceso a esa ficha es de consulta: no permite autorizar a otras personas.',
    }
  }

  // ── A QUIÉN se autoriza: su ficha si la tiene, y si no su IDENTIDAD ──────
  //
  // 🚨 Hasta el 04/09/2026 esto devolvía `solicitante_sin_ficha` porque
  // `autorizado_cliente_id` era NOT NULL. O sea: **solo se le podía dar acceso a
  // quien YA era cliente**, que deja fuera justo el caso que de verdad pasa —el
  // hijo que pide ver la póliza de su padre y no es cliente de nadie— y
  // contradice el producto: la intranet del cliente es gratis y abierta a todo
  // el mundo, porque ahí está la captación. La columna
  // `autorizado_identidad_id` levantó el techo.
  //
  // Y NO se le fabrica una ficha vacía para tapar el hueco: una ficha es una
  // persona en la cartera de Alberto, y crear una por cada invitado ensucia los
  // 32.520 leads que ya arrastra el volcado con gente que miró una póliza una
  // vez. Quien MIRA es una identidad — es lo que hay detrás de la cookie.
  const autorizadoClienteId = fila.solicitanteClienteId
  const autorizadoIdentidadId = autorizadoClienteId === null ? fila.solicitanteIdentidadId : null

  // ⚠️ El «no a sí mismo» de la rama de identidad NO lo puede comprobar la BD:
  // exige mirar `portal_vinculo`, que es otra tabla, y un CHECK es de fila. Se
  // cierra aquí. El caso no es teórico: entre que se pidió el acceso y se
  // concede, quien pidió puede haberse vinculado a ESA MISMA ficha (entrar con
  // el email que la resuelve), y entonces esto sería José autorizándose a sí
  // mismo — una fila viva que no significa nada y ocupa sitio en el índice.
  if (
    autorizadoIdentidadId !== null &&
    vinculos.some((v) => v.clienteId === otorganteClienteId && autorizadoIdentidadId === identidadId)
  ) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa petición.' }
  }

  // Qué ES la ficha que cede: de ello depende QUÉ TEXTO se guarda como prueba.
  // Sin `try/catch`: si esta lectura falla, que suba como error.
  const fichaOtorgante = await prisma.cliente.findFirst({
    where: { id: otorganteClienteId, correduriaId: mio.correduriaId, mergedIntoClienteId: null },
    select: { tipoPersona: true },
  })
  if (fichaOtorgante === null) {
    return {
      ok: false,
      error: 'ficha_no_activa',
      mensaje: 'Esa ficha ya no está activa en la cartera. Escríbenos y lo revisamos.',
    }
  }
  // `null` = no consta, y se trata como física: el lado restrictivo. Tratar el
  // hueco como sociedad repartiría apoderamientos por una columna vacía.
  const esJuridica = fichaOtorgante.tipoPersona === 'juridica'

  const alcance = alcanceConcedible(fila.alcance, esJuridica ? 'juridica' : 'fisica')
  if (alcance === null) {
    return {
      ok: false,
      error: 'alcance_no_disponible',
      mensaje: 'Ese permiso no se puede conceder desde esta ficha.',
    }
  }

  let autorizacionId: string
  try {
    autorizacionId = await prisma.$transaction(async (tx) => {
      // Solo las que la BD considera vivas (`revocado_en IS NULL`): son
      // exactamente las que el índice único parcial deja coexistir.
      //
      // 🚨 Dos cosas que van en el WHERE y no se pueden caer:
      //  - **la rama correcta** (ficha o identidad): buscar por
      //    `autorizadoClienteId: null` traería las de CUALQUIER invitado de esa
      //    ficha y se enlazaría la petición con la autorización de otro.
      //  - **`polizaId: null`**: una petición pide la ficha entera, y desde el
      //    04/09/2026 la clave del índice único incluye la póliza. Sin esto, una
      //    autorización sobre UNA póliza contaría como «ya la tiene» y se le
      //    daría por concedido un acceso que abre otra cosa.
      const previas = await tx.portalAutorizacion.findMany({
        where: {
          otorganteClienteId,
          autorizadoClienteId,
          autorizadoIdentidadId,
          alcance,
          polizaId: null,
          revocadoEn: null,
        },
        select: { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
      })
      const viva = previas.find((p) => estadoAutorizacion(p, hoy) !== 'caducada') ?? null

      let id: string
      if (viva !== null) {
        // Ya existía una para esa pareja y ese alcance. No se crea otra —el
        // índice único lo impediría— y se enlaza con la petición para que
        // quien pidió vea que sirvió de algo. Si estaba PENDIENTE de aceptar,
        // la petición la acepta: pedirla ES aceptarla.
        id = viva.id
        if (viva.aceptadoEn === null) {
          await tx.portalAutorizacion.updateMany({
            where: { id: viva.id, aceptadoEn: null, revocadoEn: null },
            data: { aceptadoEn: fila.creadaEn, aceptadoPorIdentidadId: fila.solicitanteIdentidadId },
          })
        }
      } else {
        // 🚨 El desfase entre lo que ve el usuario y lo que ve el índice:
        // `idx_portal_autorizacion_viva` es UNIQUE por (otorgante, autorizado,
        // alcance) WHERE `revocado_en IS NULL`, así que una CADUCADA sigue
        // ocupando el sitio aunque no abra nada. Sin cerrarla, conceder de
        // nuevo revienta con un choque de índice.
        //
        // Cerrarla NO es revocarla —nadie la revocó, se le acabó el plazo— y
        // por eso `revocadoPor: 'caducidad'`, con su PROPIA `caducaEn` como
        // fecha: fecharla hoy diría que el acceso siguió abierto meses. Mismo
        // camino que `conceder()` en `lib/autorizaciones.ts`.
        const caducada = previas[0] ?? null
        if (caducada !== null) {
          await tx.portalAutorizacion.update({
            where: { id: caducada.id },
            data: { revocadoEn: caducada.caducaEn, revocadoPor: 'caducidad' },
            select: { id: true },
          })
        }
        const nueva = await tx.portalAutorizacion.create({
          data: {
            correduriaId: mio.correduriaId,
            otorganteClienteId,
            // Exactamente uno de los dos va relleno, y lo obliga la BD (CHECK
            // `portal_autorizacion_destinatario_unico`, comprobado mordiendo).
            autorizadoClienteId,
            autorizadoIdentidadId,
            // Una petición pide la FICHA entera, no una póliza: `null` es el
            // valor con significado, no un hueco.
            polizaId: null,
            alcance,
            origen: 'portal',
            otorgadoPorIdentidadId: identidadId,
            caducaEn: caducidadPorDefecto(hoy),
            // 🚨 **Pedirla ES aceptarla**, y por eso esta autorización nace ya
            // aceptada. La doble aceptación existe para que nadie aparezca en
            // un registro con su nombre sin saberlo (art. 7.1 RGPD, modelo del
            // Registro de Apoderamientos de la AEAT); quien PIDIÓ ya lo sabe:
            // lo pidió él.
            //
            // Y la fecha honesta es la de SU PETICIÓN, no la de hoy: lo que
            // aceptó lo aceptó el día que escribió, y fecharlo hoy pondría en
            // el registro que aceptó en un momento en el que no hizo nada.
            aceptadoEn: fila.creadaEn,
            aceptadoPorIdentidadId: fila.solicitanteIdentidadId,
            // Qué texto se aceptó. La versión depende de quién cede: la de la
            // persona afirma «no verá mi IBAN ni podrá dar partes», que de una
            // sociedad es sencillamente falso.
            versionTexto: esJuridica ? TEXTO_REPRESENTACION_V1 : TEXTO_AUTORIZACION_V1,
            ip: datos.ip,
            userAgent: datos.userAgent,
          },
          select: { id: true },
        })
        id = nueva.id
      }

      const { count } = await tx.portalPeticionAcceso.updateMany({
        where: { id: fila.id, concedidaEn: null, rechazadaEn: null, retiradaEn: null },
        data: { concedidaEn: hoy, resueltaPorIdentidadId: identidadId, autorizacionId: id },
      })
      // Alguien llegó antes. Se lanza para que la transacción DESHAGA la
      // autorización recién creada: dejarla suelta abriría un acceso que
      // ninguna petición respalda.
      if (count === 0) throw new YaResuelta()
      return id
    })
  } catch (e) {
    if (e instanceof YaResuelta) {
      return { ok: false, error: 'no_pendiente', mensaje: 'Esta petición ya no está pendiente.' }
    }
    throw e
  }

  return { ok: true, estado: 'concedida', autorizacionId }
}
