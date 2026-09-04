// «Te invito a ver mis seguros» — la invitación por correo, contra la BD.
//
// Las REGLAS no están aquí: están en el módulo puro
// (`@central/module-seguros-portal/invitacion`), que decide cuánto vive una
// invitación (`caducidadInvitacion`), en qué estado está (`estadoInvitacion`),
// si se puede resolver (`invitacionResoluble`), si la fila llegó a escribirse
// (`invitacionEscrita`) y qué NO puede decir el correo
// (`CAMPOS_PROHIBIDOS_EN_INVITACION`). **Lee su cabecera antes de tocar nada de
// esto**: lo que sigue es su aplicación, no su fuente.
//
// Es la TERCERA puerta de la autorización, y cada una tiene su fichero:
//   · `lib/autorizaciones.ts` — José concede a María, que YA está en la cartera.
//   · `lib/peticiones.ts`     — el hijo PIDE lo que su padre no va a ofrecer solo.
//   · esta                    — José invita a alguien que no está en ninguna parte.
//
// ── 🚨 EL TOKEN NO ABRE SESIÓN. Léelo dos veces antes de «simplificarlo» ────
//
// El enlace del correo lleva un token y la tentación es que ese token abra la
// sesión: un clic y dentro. **No.** El reparto es: **el token dice QUÉ
// invitación es; el código de un solo uso al correo dice QUIÉN eres.** Las tres
// razones están en la cabecera del módulo puro (escáneres que consumen el
// enlace, un token en un correo es una llave reenviable, y «aceptado por el que
// tenía el enlace» no es una prueba de consentimiento).
//
// De ahí la regla que este fichero sostiene y que no se puede caer:
// **la aceptación se ata al CORREO, no al token** (`casaElCorreo`). Un enlace
// reenviado no le sirve a nadie más, porque el código llega al buzón invitado.
//
// El token se guarda HASHEADO. En claro solo existe dentro del correo que sale
// y en el valor de retorno que la ruta usa para construir el enlace: **jamás en
// un log, en una respuesta ni en un mensaje de error**.
//
// ── 🚨 LA ÚNICA CONSULTA SIN IDENTIDAD DE TODO EL FICHERO ───────────────────
//
// `invitacionPorToken()` busca por `tokenHash` y **no filtra por nadie**: la
// página del enlace es pública, y quien la abre todavía no tiene sesión. Está
// dicho en voz alta aquí y en la propia función para que nadie lo lea como un
// olvido del aislamiento. El filtro ahí es el TOKEN, que son 256 bits de
// `randomBytes`; y lo que devuelve es `{ existe, viva }` y nada más — ni quién
// invita, ni a qué, ni sobre qué póliza. El correo ya nombró a José: con eso
// basta hasta que la persona pruebe que es ella.
//
// 🔒 Todo lo demás va por identidad. No hay RLS que rescate un olvido: el rol
// `prisma_asegura_portal` es NOBYPASSRLS pero estas tablas no tienen políticas
// para él, así que una consulta sin `where` responde 200 con las invitaciones de
// todo el mundo. Las dos fronteras: la identidad SIEMPRE sale de la cookie
// (`lib/session`), y **ningún `clienteId` entra desde la request** — toda ficha
// propia se comprueba antes contra `portal_vinculo` filtrado por esa identidad.
import { randomBytes } from 'node:crypto'

import { computeEmailLookupHash } from '@central/module-seguros-pii'
import {
  MAX_INVITACIONES_DIA,
  NIVELES,
  alcanceConcedible,
  BYTES_TOKEN_INVITACION,
  caducidadInvitacion,
  caducidadPorDefecto,
  esAlcance,
  estadoAutorizacion,
  estadoInvitacion,
  invitacionEscrita,
  invitacionResoluble,
  normalizarMensajeInvitacion,
  normalizarTokenInvitacion,
  puedeAutorizar,
  type Alcance,
  type EstadoInvitacion,
  type Nivel,
  type ResultadoInvitacion,
  type TipoOtorgante,
} from '@central/module-seguros-portal'

import { hashCanal } from './auth'
import {
  TEXTO_AUTORIZACION,
  TEXTO_AUTORIZACION_V1,
  TEXTO_REPRESENTACION,
  TEXTO_REPRESENTACION_V1,
} from './autorizaciones'
import { enlaceDeInvitacion, enviarInvitacion } from './correo-invitacion'
import { prisma } from './db'
import { getIdentidad } from './session'
import { elegirFicha, type Candidato } from './vinculo-elegir'

/** Cuántas filas se traen a la pantalla. Regla de rendimiento UI de la casa. */
const MAX_FILAS = 50

/** La ventana del cupo. Un día natural rodante, no «desde medianoche». */
const VENTANA_CUPO_MS = 24 * 60 * 60 * 1000

/** Un uuid mal formado revienta dentro de Prisma con un 500 en vez de contestar. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ficha y hash que no existen, para que un `in []` no deje nunca un `where` sin
 * filtro. Un `in` vacío en Prisma no devuelve todo, pero el día que alguien
 * mueva el `where` a un `OR` sí lo haría, y el modo de fallo del portal no es
 * «no se ve nada»: es «se ve todo y nada falla».
 */
const NINGUNA_FICHA = '00000000-0000-0000-0000-000000000000'
const NINGUN_HASH = 'ningun-canal-de-esta-identidad'

/** `nivel` es `text` con CHECK en la BD. Un valor fuera del vocabulario cae al MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

/**
 * Qué es la ficha que cede. `null` = **no consta**, y se trata como física: el
 * lado restrictivo, el único que no abre nada de más. Misma regla que
 * `tipoDeFicha()` de `lib/autorizaciones.ts` — no se duplica el criterio, se
 * duplica la lectura porque son dos columnas distintas de la misma consulta.
 */
function tipoDeFicha(v: string | null | undefined): TipoOtorgante {
  return v === 'juridica' ? 'juridica' : 'fisica'
}

/**
 * `alcance` es `text` en la BD. Una fila con un valor que ya no está en el
 * vocabulario NO se pinta como otra cosa: se cae de la lista, porque enseñarla
 * como «ver» sería afirmar un permiso que nadie concedió.
 */
function alcanceDeFila(v: string): Alcance | null {
  return esAlcance(v) ? v : null
}

/**
 * El hash del TOKEN, con la MISMA pimienta que el hash del canal.
 *
 * Delega en `hashCanal()` a propósito y no inventa una env nueva: una pimienta
 * más es una env más que se puede olvidar en Vercel, y el modo de fallo de una
 * pimienta ausente es silencioso (se sigue guardando un SHA-256 pelado y nadie
 * se entera — medido el 03/09/2026 con `ASEGURA_PORTAL_CANAL_PEPPER`).
 *
 * `hashCanal` recorta y baja a minúsculas antes de hashear; un token es 64
 * caracteres hex ya en minúsculas (`normalizarTokenInvitacion`), así que las dos
 * cosas son un no-op y el hash del correo y el de la URL coinciden siempre.
 */
function hashToken(token: string): string {
  return hashCanal(token)
}

// ── Crear una invitación ───────────────────────────────────────────────────

/**
 * Por qué NO salió el correo. Los seis primeros son el vocabulario del módulo
 * puro (menos `enviada`, que es el `ok`); los cuatro últimos son de esta capa
 * porque hablan de la ficha, no de la invitación.
 *
 * 🚨 `envio_fallido` **no es un fallo de la invitación**: la fila está escrita.
 * Por eso el resultado lleva `registrada`, calculada con `invitacionEscrita()`
 * del módulo puro y nunca con un `if` copiado aquí.
 */
export type MotivoNoEnviada =
  | Exclude<ResultadoInvitacion, 'enviada'>
  | 'datos_invalidos'
  | 'ficha_no_tuya'
  | 'nivel_insuficiente'
  | 'poliza_no_es_tuya'

export type ResultadoCrearInvitacion =
  | { ok: true; invitacionId: string }
  | {
      ok: false
      error: MotivoNoEnviada
      mensaje: string
      /**
       * ¿Existe ya la fila? `true` solo en `envio_fallido`. La pantalla tiene
       * que poder decir «la invitación está hecha, lo que ha fallado es el
       * aviso» en vez de invitar a reintentar algo que chocaría con el índice
       * único.
       */
      registrada: boolean
    }

/**
 * José invita: «que esta persona pueda ver mis seguros», con su correo escrito
 * a mano.
 *
 * El orden de las comprobaciones no es decorativo — va de lo que no toca la BD
 * a lo que sí, y de lo barato a lo caro:
 *   1. Que el alcance y la póliza tengan siquiera forma (puro, sin BD).
 *   2. **Que haya enlace** (`sin_enlace`), antes de tocar la BD para nada.
 *   3. El cupo del día, por la IDENTIDAD que invita.
 *   4. La ficha es MÍA (`portal_vinculo`) y mi nivel me deja autorizar.
 *   5. La ficha está viva y la póliza es suya.
 *   6. No me estoy invitando a mí mismo, y esa persona no está ya autorizada.
 *   7. La fila. Y solo después, el correo.
 *
 * 🚨 El paso 2 va donde va por lo que dice el módulo puro: sin `PORTAL_PUBLIC_URL`
 * **la fila no se escribe**. Aquí el enlace ES el mecanismo, y una invitación
 * cuyo correo no puede salir ocupa el sitio del índice único —una sola viva por
 * (ficha, destinatario, póliza, alcance)— y nadie podrá aceptarla jamás.
 *
 * 📌 A diferencia de `lib/peticiones.ts`, aquí **no hay oráculo que cerrar**:
 * José invita a quien quiere, sea cliente o no, y el sistema le da acceso igual
 * — esa es justo la idea del producto. `ya_invitado` y `ya_autorizado` hablan de
 * las relaciones DE JOSÉ, que él ya ve en su propia pantalla. Lo que sigue sin
 * contestarse es si ese correo pertenece a alguien de la cartera, y por eso no
 * hay ningún resultado que lo nombre: no es que se colapse, es que no se calcula.
 */
export async function crearInvitacion(datos: {
  identidadId: string
  otorganteClienteId: string
  alcance: string
  /** La ÚNICA póliza que se abrirá. Ausente o `null` = todas las del otorgante. */
  polizaId?: unknown
  /** El correo invitado, en claro. **Entra aquí y no sale**: se guarda su hash. */
  email: string
  mensaje?: unknown
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoCrearInvitacion> {
  const { identidadId, otorganteClienteId } = datos

  const no = (error: MotivoNoEnviada, mensaje: string): ResultadoCrearInvitacion => ({
    ok: false,
    error,
    mensaje,
    // 🚨 Quién sabe si la fila existe es el módulo puro, no un `if` de aquí:
    // dos cuentas del mismo hecho en el mismo repo acaban discrepando, y esta
    // en concreto decide si la pantalla dice «no se ha invitado» sobre una
    // invitación que está escrita.
    registrada: esResultadoInvitacion(error) && invitacionEscrita(error),
  })

  // ── 1. Lo que se puede decidir sin la BD ─────────────────────────────────
  const polizaId = typeof datos.polizaId === 'string' && UUID.test(datos.polizaId) ? datos.polizaId : null
  if (datos.polizaId !== undefined && datos.polizaId !== null && polizaId === null) {
    return no('datos_invalidos', 'No hemos entendido qué póliza querías compartir. Vuelve a cargar la pantalla.')
  }
  if (!UUID.test(otorganteClienteId)) {
    return no('datos_invalidos', 'No hemos entendido desde qué ficha invitas. Vuelve a cargar la pantalla.')
  }

  // 🚨 `alcanceConcedible` se llama SIN tipo, o sea con el vocabulario de una
  // persona física (`ver` | `ver_economico`), aunque la ficha sea una sociedad.
  // No es un olvido: el CHECK `portal_invitacion_alcance` solo admite esos dos,
  // y con razón — un apoderamiento (`partes`, `documentos`) es actuar en nombre
  // de otro, y eso no se reparte por un enlace de correo a alguien que todavía
  // no ha probado ni quién es. Representar a una sociedad se concede desde
  // `conceder()`, a una ficha que ya está en la cartera.
  const alcance = alcanceConcedible(datos.alcance)
  if (alcance === null) {
    return no('datos_invalidos', 'Ese permiso no se puede ofrecer por invitación. Vuelve a cargar la pantalla.')
  }

  // ── 2. El enlace, ANTES de tocar la BD ───────────────────────────────────
  // El token se genera aquí porque el enlace lo lleva dentro. `randomBytes` de
  // `node:crypto`, nunca `Math.random`: adivinar un token es entrar en la
  // invitación de otro. 32 bytes = 256 bits, en hex = 64 caracteres.
  const token = randomBytes(BYTES_TOKEN_INVITACION).toString('hex')
  const enlace = enlaceDeInvitacion(token)
  if (enlace === null) {
    return no(
      'sin_enlace',
      'Ahora mismo no podemos mandar invitaciones. Escríbenos y lo revisamos: no hemos guardado nada.',
    )
  }

  // ── 3. El cupo, por la IDENTIDAD que invita ──────────────────────────────
  // Nunca por destinatario: un límite por destinatario contestaría «a este
  // puedo invitarle diez veces, luego…», que es el oráculo que
  // `lib/peticiones.ts` cierra con tanto trabajo. Es un freno de abuso —cinco
  // clics seguidos son cinco correos idénticos a un desconocido, que desde su
  // buzón se ve igual que un ataque—, no una cuota comercial.
  const enviadasHoy = await prisma.portalInvitacion.count({
    where: { otorgadaPorIdentidadId: identidadId, creadaEn: { gte: new Date(Date.now() - VENTANA_CUPO_MS) } },
  })
  if (enviadasHoy >= MAX_INVITACIONES_DIA) {
    return no('limite_diario', 'Has mandado ya varias invitaciones hoy. Prueba de nuevo mañana.')
  }

  // ── 4. La ficha es MÍA, y mi nivel me deja regalarla ─────────────────────
  // Sin esto, cualquiera con sesión abre los seguros de otro mandando su uuid
  // en el JSON. `portal_vinculo` filtrado por esta identidad es la ÚNICA
  // definición de «mis fichas».
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true },
    orderBy: { creadoEn: 'asc' },
  })
  const mio = vinculos.find((v) => v.clienteId === otorganteClienteId)
  if (!mio) {
    return no('ficha_no_tuya', 'Esa ficha no es tuya.')
  }
  // El consentimiento para ceder unos datos es de su dueño: quien solo está
  // autorizado a VER una ficha no puede regalarla a un tercero. Quién puede lo
  // decide el módulo puro, no un `if` copiado aquí.
  if (!puedeAutorizar(nivelDeVinculo(mio.nivel))) {
    return no(
      'nivel_insuficiente',
      'Tu acceso a esa ficha es de consulta: no permite invitar a otras personas a verla.',
    )
  }

  // ── 5. La ficha vive, y la póliza es suya ────────────────────────────────
  // Sin `try/catch`: si esta lectura falla, que suba como error. Caer a un
  // valor por defecto convertiría un fallo de BD en una invitación mandada con
  // el texto legal equivocado.
  const ficha = await prisma.cliente.findFirst({
    where: { id: otorganteClienteId, correduriaId: mio.correduriaId, mergedIntoClienteId: null },
    select: { nombre: true, apellidos: true, tipoPersona: true },
  })
  if (ficha === null) {
    return no('ficha_no_tuya', 'Esa ficha ya no está activa en la cartera. Escríbenos y lo revisamos.')
  }

  if (polizaId !== null) {
    // La BD lo repite con la FK COMPUESTA contra `polizas(cliente_id, id)`
    // (`portal_invitacion_poliza_del_otorgante`, comprobada mordiendo: 23503),
    // pero llegar hasta allí devolvería un error de Postgres en vez de decir
    // qué pasa. Una FUSIONADA tampoco vale: la lectura no la puede servir, así
    // que invitar sobre ella abriría un acceso que no abre nada — el modo de
    // fallo que no se ve.
    const suya = await prisma.poliza.findFirst({
      where: { id: polizaId, clienteId: otorganteClienteId, mergedIntoPolizaId: null },
      select: { id: true },
    })
    if (suya === null) {
      return no(
        'poliza_no_es_tuya',
        'Esa póliza ya no está en la ficha desde la que quieres compartirla. Vuelve a cargar la pantalla.',
      )
    }
  }

  // ── 6. A quién se invita ─────────────────────────────────────────────────
  // El correo se convierte AQUÍ en su hash y no sale de esta función más que
  // hacia el transporte de correo: la columna es `destinatario_canal_hash`, el
  // MISMO `hashCanal()` que `portal_canal`, que es lo que permite atar la
  // aceptación al correo y no al token.
  const destinatarioCanalHash = hashCanal(datos.email)
  // Se normaliza UNA vez: el mismo texto que se guarda es el que se manda, y no
  // dos recortes que puedan divergir el día que cambie el tope.
  const mensaje = normalizarMensajeInvitacion(datos.mensaje)

  // ¿Me estoy invitando a mí mismo? Esto SÍ se puede decir: depende solo de
  // quien pregunta (¿es uno de MIS canales?) y no revela nada de nadie más.
  const esMio = await prisma.portalCanal.findFirst({
    where: { identidadId, valorHash: destinatarioCanalHash },
    select: { id: true },
  })
  if (esMio !== null) {
    return no('a_si_mismo', 'Ese correo es el tuyo: tus seguros ya los tienes en tu bóveda.')
  }

  // ── T6: ¿ya está autorizada, por CUALQUIERA de las dos ramas? ────────────
  // Desde el 04/09/2026 una `portal_autorizacion` apunta o a una FICHA de la
  // cartera (`autorizadoClienteId`) o a una IDENTIDAD del portal
  // (`autorizadoIdentidadId`). Mirar solo una dejaría a José con dos
  // autorizaciones vivas equivalentes para la misma persona: una concedida y
  // otra nacida de esta invitación.
  const yaAutorizado = await tieneAutorizacionViva({
    otorganteClienteId,
    alcance,
    polizaId,
    email: datos.email,
    canalHash: destinatarioCanalHash,
  })
  if (yaAutorizado) {
    return no(
      'ya_autorizado',
      polizaId === null
        ? 'Esa persona ya puede ver los seguros de esta ficha.'
        : 'Esa persona ya puede ver esa póliza.',
    )
  }

  // ── 7. La fila ───────────────────────────────────────────────────────────
  // `creadaEn` se pasa explícito para que `caducaEn` salga exactamente 30 días
  // después de ESE instante y no del que ponga la BD (y para que el CHECK
  // `portal_invitacion_caduca_despues` compare lo mismo que nosotros).
  const creadaEn = new Date()
  let invitacionId: string
  try {
    const fila = await prisma.portalInvitacion.create({
      data: {
        correduriaId: mio.correduriaId,
        otorganteClienteId,
        // Una ficha puede tener varias personas detrás: el registro tiene que
        // decir CUÁL de ellas invitó (art. 7.1 RGPD).
        otorgadaPorIdentidadId: identidadId,
        destinatarioCanalHash,
        // 🚨 El token, HASHEADO. En claro solo viaja dentro del correo.
        tokenHash: hashToken(token),
        alcance,
        polizaId,
        // Texto de quien invita: se recorta y se normaliza en el módulo puro,
        // se escapa al pintarlo y no entra en ninguna cabecera del correo.
        mensaje,
        creadaEn,
        caducaEn: caducidadInvitacion(creadaEn),
        ip: datos.ip,
        userAgent: datos.userAgent,
      },
      select: { id: true },
    })
    invitacionId = fila.id
  } catch (e) {
    // `idx_portal_invitacion_viva` es UNIQUE por (otorgante, destinatario,
    // COALESCE(póliza), alcance) WHERE sigue sin resolverse: **la BD es quien
    // decide** que ya se le había invitado. Preguntarlo antes con un SELECT
    // sería una carrera —dos clics seguidos mandan dos correos idénticos— así
    // que se intenta escribir y se recoge el choque.
    if (!esChoqueDeUnico(e)) throw e
    return no('ya_invitado', 'Ya le has mandado esta invitación a esa persona y sigue sin contestar.')
  }

  // ── 8. Y solo ahora, el correo ───────────────────────────────────────────
  // 🚨 El correo va DESPUÉS de la fila a propósito: si fuera antes y el INSERT
  // chocara, habríamos mandado un correo con un enlace que no lleva a ninguna
  // parte. Al revés el peor caso es `envio_fallido`, que es una invitación que
  // existe y que José puede volver a intentar (o contar por su cuenta).
  const nombre = `${ficha.nombre} ${ficha.apellidos}`.trim()
  const enviado = await enviarInvitacion(datos.email, {
    // `null` = no hay nombre que enseñar, nunca `''`: el correo lo dice como lo
    // que es en vez de dejar un hueco en blanco delante de un desconocido.
    invitante: nombre === '' ? null : nombre,
    mensaje,
    enlace,
  })
  if (!enviado) {
    return no(
      'envio_fallido',
      'La invitación está registrada, pero no hemos podido enviarle el correo. ' +
        'Avísale tú o escríbenos y lo reintentamos.',
    )
  }

  return { ok: true, invitacionId }
}

/** ¿El motivo pertenece al vocabulario del módulo puro? Lo demás es de esta capa. */
function esResultadoInvitacion(m: MotivoNoEnviada): m is Exclude<ResultadoInvitacion, 'enviada'> {
  return m !== 'datos_invalidos' && m !== 'ficha_no_tuya' && m !== 'nivel_insuficiente' && m !== 'poliza_no_es_tuya'
}

/**
 * El choque contra un índice único, y NADA más.
 *
 * Se mira el código de Prisma (`P2002`) sin tragarse cualquier otro fallo: un
 * `catch` que se comiera un error de BD dejaría a José creyendo que ha invitado
 * a alguien que no existe en ninguna parte.
 */
function esChoqueDeUnico(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

/**
 * ¿Esa persona YA tiene una autorización viva sobre esto? **Mira las DOS ramas**
 * (T6), porque desde el 04/09/2026 el autorizado puede ser una ficha de la
 * cartera o una identidad del portal:
 *
 *   · **ficha** — el correo se resuelve por el índice ciego
 *     (`computeEmailLookupHash`, el mismo HMAC que escribe `apps/asegura`), con
 *     el MISMO desempate que el vínculo del canje (`elegirFicha`).
 *   · **identidad** — el correo se resuelve por `portal_canal`, que es donde
 *     vive el hash con la pimienta del portal.
 *
 * La clave es (otorgante, autorizado, póliza, alcance): la misma del índice
 * único `idx_portal_autorizacion_viva`. Invitar al MISMO correo a un alcance
 * DISTINTO sí se puede — son dos permisos que se suman, y así lo trata también
 * `conceder()`.
 *
 * ⚠️ Sin `PII_LOOKUP_KEY` la rama de la ficha no se puede mirar. No se bloquea
 * la invitación por eso: se degrada a mirar solo la identidad y se deja
 * constancia del motivo (nunca del correo ni del hash). El respaldo real sigue
 * puesto — al ACEPTAR, `responderInvitacion` reutiliza la autorización viva en
 * vez de crear una segunda.
 */
async function tieneAutorizacionViva(d: {
  otorganteClienteId: string
  alcance: Alcance
  polizaId: string | null
  email: string
  canalHash: string
}): Promise<boolean> {
  const identidadDestino = await prisma.portalCanal.findFirst({
    where: { valorHash: d.canalHash },
    select: { identidadId: true },
  })

  let fichaDestino: string | null = null
  try {
    const hashCiego = computeEmailLookupHash(d.email)
    const [directas, secundarias] = await Promise.all([
      prisma.cliente.findMany({
        where: { emailLookupHash: hashCiego, mergedIntoClienteId: null },
        select: { id: true, correduriaId: true },
      }),
      prisma.clienteEmail.findMany({ where: { emailLookupHash: hashCiego }, select: { clienteId: true } }),
    ])
    const candidatos: Candidato[] = directas.map((c) => ({
      clienteId: c.id,
      correduriaId: c.correduriaId,
      principal: true,
    }))
    const yaPrincipales = new Set(candidatos.map((c) => c.clienteId))
    const idsSecundarios = [...new Set(secundarias.map((e) => e.clienteId))].filter((id) => !yaPrincipales.has(id))
    if (idsSecundarios.length > 0) {
      const vivas = await prisma.cliente.findMany({
        where: { id: { in: idsSecundarios }, mergedIntoClienteId: null },
        select: { id: true, correduriaId: true },
      })
      for (const c of vivas) candidatos.push({ clienteId: c.id, correduriaId: c.correduriaId, principal: false })
    }
    const elegida = elegirFicha(candidatos)
    fichaDestino = elegida.estado === 'ok' ? elegida.clienteId : null
  } catch (e) {
    // Del error sale el motivo; jamás el correo ni el hash.
    console.error(
      '[portal/invitaciones] no se pudo calcular el índice ciego:',
      e instanceof Error ? e.message : e,
    )
  }

  if (identidadDestino === null && fichaDestino === null) return false

  const previas = await prisma.portalAutorizacion.findMany({
    where: {
      otorganteClienteId: d.otorganteClienteId,
      alcance: d.alcance,
      // 🚨 `polizaId` va en el WHERE: la clave del índice único incluye la
      // póliza, así que sin esto una autorización sobre UNA póliza contaría
      // como «ya la tiene» y se le negaría a José invitar a la ficha entera.
      polizaId: d.polizaId,
      revocadoEn: null,
      OR: [
        { autorizadoIdentidadId: identidadDestino?.identidadId ?? NINGUNA_FICHA },
        { autorizadoClienteId: fichaDestino ?? NINGUNA_FICHA },
      ],
    },
    select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const hoy = new Date()
  // Una CADUCADA no cuenta: sigue con `revocado_en` a NULL —y por eso ocupa el
  // sitio del índice, cosa que resuelve `responderInvitacion` cerrándola— pero
  // no abre nada, así que negarle a José renovar el acceso sería mentirle.
  return previas.some((p) => {
    const estado = estadoAutorizacion(p, hoy)
    return estado === 'pendiente' || estado === 'vigente'
  })
}

// ── Leer invitaciones ──────────────────────────────────────────────────────

/**
 * Una invitación que YO mandé.
 *
 * 🚨 Fíjate en lo que NO lleva: **a quién**. La tabla guarda solo
 * `destinatario_canal_hash` (SHA-256 con pimienta) y un hash no se revierte, así
 * que desde aquí no hay ninguna dirección que enseñar. No es un olvido ni un
 * campo por rellenar: es lo que cuesta no tener una agenda de correos de
 * terceros que no han consentido nada. La pantalla lo dice con esas palabras en
 * vez de pintar un hueco.
 */
export type InvitacionEnviada = {
  id: string
  alcance: Alcance
  estado: EstadoInvitacion
  /** `true` = se invitó a UNA póliza; `false` = a todas las de la ficha. */
  soloUnaPoliza: boolean
  /** La ficha desde la que se invitó, para que José sepa cuál de las suyas abrió. */
  otorganteClienteId: string
  otorganteNombre: string | null
  mensaje: string | null
  creadaEn: Date
  caducaEn: Date
}

/** Una invitación que me han mandado A MÍ (casa el hash de alguno de mis canales). */
export type InvitacionRecibida = {
  id: string
  alcance: Alcance
  estado: EstadoInvitacion
  soloUnaPoliza: boolean
  /**
   * Quién me invita. `null` = **no se sabe el nombre** (la ficha ya no existe o
   * está fusionada), nunca `''` ni «Desconocido»: un valor de cajón se cuela por
   * todas las guardas basadas en NULL.
   */
  otorganteNombre: string | null
  mensaje: string | null
  creadaEn: Date
  caducaEn: Date
}

export type InvitacionesPortal = {
  enviadas: InvitacionEnviada[]
  recibidas: InvitacionRecibida[]
}

/**
 * Las invitaciones de una identidad, por los dos lados.
 *
 * Las ENVIADAS se buscan por `otorgadaPorIdentidadId` —quien pulsó el botón— y
 * no por las fichas: si una ficha tiene dos personas detrás, cada una ve lo que
 * ella ofreció, que es lo que el registro del art. 7.1 RGPD tiene que poder
 * decir.
 *
 * Las RECIBIDAS, por el hash de MIS canales. Es la misma costura que ata la
 * aceptación al correo: si el hash no casa, la invitación no es para esta
 * cuenta y aquí no aparece.
 *
 * Sin `try/catch`: si una consulta falla, que suba como error. Devolver listas
 * vacías haría pasar un fallo de BD por un «no tienes ninguna invitación», que
 * es justo la mentira que el portal no puede contar.
 */
export async function invitacionesDeIdentidad(identidadId: string): Promise<InvitacionesPortal> {
  const canales = await prisma.portalCanal.findMany({
    where: { identidadId },
    select: { valorHash: true },
  })
  const misHashes = canales.map((c) => c.valorHash)

  const hoy = new Date()
  const [enviadas, recibidas] = await Promise.all([
    prisma.portalInvitacion.findMany({
      where: { otorgadaPorIdentidadId: identidadId },
      orderBy: { creadaEn: 'desc' },
      take: MAX_FILAS,
    }),
    prisma.portalInvitacion.findMany({
      // `NINGUN_HASH` cuando no hay canales: un `in []` no puede acabar nunca en
      // un `where` sin filtro por un refactor descuidado.
      where: { destinatarioCanalHash: { in: misHashes.length > 0 ? misHashes : [NINGUN_HASH] } },
      orderBy: { creadaEn: 'desc' },
      take: MAX_FILAS,
    }),
  ])

  const fichas = [...new Set([...enviadas, ...recibidas].map((i) => i.otorganteClienteId))]
  const nombres = await nombresDeFichas(fichas)

  return {
    enviadas: enviadas.flatMap((i) => {
      const alcance = alcanceDeFila(i.alcance)
      if (alcance === null) return []
      return [
        {
          id: i.id,
          alcance,
          estado: estadoInvitacion(i, hoy),
          soloUnaPoliza: i.polizaId !== null,
          otorganteClienteId: i.otorganteClienteId,
          otorganteNombre: nombres.get(i.otorganteClienteId) ?? null,
          mensaje: i.mensaje,
          creadaEn: i.creadaEn,
          caducaEn: i.caducaEn,
        },
      ]
    }),
    recibidas: recibidas.flatMap((i) => {
      const alcance = alcanceDeFila(i.alcance)
      if (alcance === null) return []
      return [
        {
          id: i.id,
          alcance,
          estado: estadoInvitacion(i, hoy),
          soloUnaPoliza: i.polizaId !== null,
          otorganteNombre: nombres.get(i.otorganteClienteId) ?? null,
          mensaje: i.mensaje,
          creadaEn: i.creadaEn,
          caducaEn: i.caducaEn,
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
export async function invitacionesDeSesion(): Promise<InvitacionesPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return invitacionesDeIdentidad(identidad.id)
}

/**
 * 🚨 LA ÚNICA CONSULTA SIN IDENTIDAD DE TODO EL FICHERO, y es deliberada.
 *
 * La página `/invitacion/<token>` es PÚBLICA: quien llega desde el correo
 * todavía no tiene sesión, así que no hay identidad por la que filtrar. El
 * filtro aquí es el TOKEN, que son 256 bits de `randomBytes` y se compara
 * hasheado contra un índice único.
 *
 * Y por eso lo que devuelve es `{ existe, viva }` **y nada más**: ni quién
 * invita, ni a qué ficha, ni sobre qué póliza, ni el mensaje. Quien tiene el
 * enlace no ha probado ser nadie —pudo reenviárselo cualquiera— y el correo ya
 * nombró a José, que es lo único que esa persona necesita para decidir si
 * entra. El resto se enseña con `invitacionParaIdentidad()`, ya con sesión y
 * con el correo comprobado.
 *
 * `existe: false` cubre a la vez «ese token no es de nadie» y «el token ni
 * siquiera tiene forma de token»: distinguirlos no le sirve a quien llega y sí
 * a quien prueba.
 */
export async function invitacionPorToken(token: unknown): Promise<{ existe: boolean; viva: boolean }> {
  const t = normalizarTokenInvitacion(token)
  // Se valida ANTES de tocar la BD: un valor cualquiera metido en la URL no
  // tiene por qué llegar a una consulta.
  if (t === null) return { existe: false, viva: false }

  const fila = await prisma.portalInvitacion.findUnique({
    where: { tokenHash: hashToken(t) },
    select: { caducaEn: true, aceptadaEn: true, rechazadaEn: true, retiradaEn: true },
  })
  if (fila === null) return { existe: false, viva: false }

  return { existe: true, viva: invitacionResoluble(fila, new Date()) }
}

/**
 * Lo que se le ofrece a quien acaba de entrar, para pintar el «aceptar /
 * rechazar». Ya con sesión, y **solo si el correo casa** (T1).
 */
export type InvitacionParaMi = {
  id: string
  alcance: Alcance
  soloUnaPoliza: boolean
  otorganteNombre: string | null
  mensaje: string | null
  caducaEn: Date
  /**
   * El texto EXACTO que se acepta, el mismo que sella `versionTexto`. La
   * pantalla lo enseña tal cual: sin saber QUÉ se aceptó, el consentimiento no
   * se puede demostrar (art. 7.1 RGPD).
   */
  texto: string
}

export type ResultadoInvitacionParaMi =
  | { estado: 'ok'; invitacion: InvitacionParaMi }
  | { estado: 'no_encontrada' }
  | { estado: 'no_es_tu_correo' }

/**
 * 🚨 `no_es_tu_correo` es la regla T1 hecha pantalla: la invitación se ata al
 * CORREO, no al token. Un enlace reenviado —o leído en un buzón compartido— no
 * abre los seguros de un tercero, porque quien acepta tiene que tener ese mismo
 * correo entre sus canales verificados.
 *
 * Se distingue de `no_encontrada` a propósito y no filtra nada: quien pregunta
 * ya tiene el token en la mano, así que sabe que la invitación existe. Lo que
 * necesita saber es que **ha entrado con la cuenta equivocada**, no que el
 * enlace esté roto; si se lo dijéramos igual, se quedaría reintentando con la
 * misma cuenta para siempre.
 */
export async function invitacionParaIdentidad(
  token: unknown,
  identidadId: string,
): Promise<ResultadoInvitacionParaMi> {
  const fila = await filaPorToken(token)
  if (fila === null) return { estado: 'no_encontrada' }
  if (!invitacionResoluble(fila, new Date())) return { estado: 'no_encontrada' }
  if (!(await casaElCorreo(fila.destinatarioCanalHash, identidadId))) return { estado: 'no_es_tu_correo' }

  const alcance = alcanceDeFila(fila.alcance)
  if (alcance === null) return { estado: 'no_encontrada' }

  const ficha = await prisma.cliente.findFirst({
    where: { id: fila.otorganteClienteId, mergedIntoClienteId: null },
    select: { nombre: true, apellidos: true, tipoPersona: true },
  })
  const nombre = ficha === null ? '' : `${ficha.nombre} ${ficha.apellidos}`.trim()

  return {
    estado: 'ok',
    invitacion: {
      id: fila.id,
      alcance,
      soloUnaPoliza: fila.polizaId !== null,
      otorganteNombre: nombre === '' ? null : nombre,
      mensaje: fila.mensaje,
      caducaEn: fila.caducaEn,
      // Qué texto se acepta depende de QUIÉN cede: el de la persona afirma «no
      // verá mi IBAN ni podrá dar partes», que de una sociedad es sencillamente
      // falso. Ficha ilegible → se trata como física, el lado restrictivo.
      texto: tipoDeFicha(ficha?.tipoPersona) === 'juridica' ? TEXTO_REPRESENTACION : TEXTO_AUTORIZACION,
    },
  }
}

/** La fila por su token, con todo lo que hace falta para decidir. `null` = no hay. */
async function filaPorToken(token: unknown) {
  const t = normalizarTokenInvitacion(token)
  if (t === null) return null
  // 🚨 La segunda —y última— consulta sin identidad, por lo mismo que
  // `invitacionPorToken`: la busca quien viene del correo. Todo lo que se hace
  // con el resultado pasa después por `casaElCorreo()`.
  return prisma.portalInvitacion.findUnique({
    where: { tokenHash: hashToken(t) },
    select: {
      id: true,
      correduriaId: true,
      otorganteClienteId: true,
      otorgadaPorIdentidadId: true,
      destinatarioCanalHash: true,
      alcance: true,
      polizaId: true,
      mensaje: true,
      caducaEn: true,
      aceptadaEn: true,
      rechazadaEn: true,
      retiradaEn: true,
    },
  })
}

/**
 * 🚨 T1: ¿el correo invitado es de ESTA cuenta?
 *
 * Es lo único que impide que un enlace reenviado abra los seguros de un
 * tercero. Se compara el hash guardado en la invitación contra los de
 * `portal_canal` de la identidad que está mirando — el MISMO `hashCanal()`, que
 * es justo por lo que la invitación guarda ese hash y no el índice ciego.
 *
 * Sin esto no falla nada: se acepta, se crea la autorización y el portal enseña
 * las pólizas de otro a quien reenvió el correo.
 */
async function casaElCorreo(destinatarioCanalHash: string, identidadId: string): Promise<boolean> {
  const canal = await prisma.portalCanal.findFirst({
    where: { identidadId, valorHash: destinatarioCanalHash },
    select: { id: true },
  })
  return canal !== null
}

// ── Aceptar, rechazar, retirar ─────────────────────────────────────────────

export type ErrorResponder = 'datos_invalidos' | 'no_encontrada' | 'no_es_tu_correo'

export type ResultadoResponder =
  | { ok: true; estado: EstadoInvitacion; autorizacionId: string | null }
  | { ok: false; error: ErrorResponder; mensaje: string }

/** Alguien llegó antes: la invitación dejó de estar viva entre la lectura y la escritura. */
class YaResuelta extends Error {}

/**
 * El invitado acepta o rechaza, **ya dentro del portal y con su propia sesión**.
 *
 * Aceptar crea la `portal_autorizacion` y sella la invitación **en una sola
 * transacción**: una invitación «aceptada» sin autorización es un recibo de algo
 * que no pasó, y una autorización suelta es un acceso que nada respalda. El
 * CHECK `portal_invitacion_acepta_con_sello` lo repite en la BD (comprobado
 * mordiendo: 23514).
 */
export async function responderInvitacion(datos: {
  identidadId: string
  token: unknown
  accion: 'aceptar' | 'rechazar'
  ip: string | null
  userAgent: string | null
}): Promise<ResultadoResponder> {
  const { identidadId, accion } = datos
  const hoy = new Date()

  const fila = await filaPorToken(datos.token)
  // Token que no existe, caducada o ya resuelta se contestan IGUAL: para quien
  // llega desde el correo las tres son «este enlace ya no sirve», y separarlas
  // solo le diría a quien prueba tokens cuáles ha acertado.
  if (fila === null || !invitacionResoluble(fila, hoy)) {
    return {
      ok: false,
      error: 'no_encontrada',
      mensaje: 'Este enlace ya no sirve: la invitación ha caducado o ya está contestada.',
    }
  }

  // 🚨 T1, y es lo que sostiene todo el diseño del token.
  if (!(await casaElCorreo(fila.destinatarioCanalHash, identidadId))) {
    return {
      ok: false,
      error: 'no_es_tu_correo',
      mensaje:
        'Esta invitación es para otra dirección de correo. Sal y vuelve a entrar con el correo al que te llegó.',
    }
  }

  if (accion === 'rechazar') {
    // Las guardas van también en el WHERE: entre la lectura y la escritura cabe
    // otra petición, y un doble clic pisaría el sello de la primera.
    const { count } = await prisma.portalInvitacion.updateMany({
      where: { id: fila.id, aceptadaEn: null, rechazadaEn: null, retiradaEn: null },
      // El CHECK `portal_invitacion_rechaza_con_quien` exige los dos juntos: un
      // rechazo sin nombre no dice quién dijo que no.
      data: { rechazadaEn: hoy, rechazadaPorIdentidadId: identidadId },
    })
    if (count === 0) {
      return { ok: false, error: 'no_encontrada', mensaje: 'Esta invitación ya estaba contestada.' }
    }
    return { ok: true, estado: 'rechazada', autorizacionId: null }
  }

  const alcance = alcanceDeFila(fila.alcance)
  if (alcance === null) {
    // La fila guarda un alcance que ya no está en el vocabulario. No se acepta
    // como si fuera «ver»: sería conceder un permiso que nadie ofreció.
    return { ok: false, error: 'no_encontrada', mensaje: 'Esta invitación ya no se puede aceptar.' }
  }

  // Qué ES la ficha que cede: de ello depende QUÉ TEXTO se guarda como prueba.
  // Sin `try/catch`: si esta lectura falla, que suba como error.
  const ficha = await prisma.cliente.findFirst({
    where: { id: fila.otorganteClienteId, correduriaId: fila.correduriaId, mergedIntoClienteId: null },
    select: { tipoPersona: true },
  })
  if (ficha === null) {
    return {
      ok: false,
      error: 'no_encontrada',
      mensaje: 'La ficha desde la que te invitaron ya no está activa. Escríbenos y lo revisamos.',
    }
  }
  const esJuridica = tipoDeFicha(ficha.tipoPersona) === 'juridica'

  let autorizacionId: string
  try {
    autorizacionId = await prisma.$transaction(async (tx) => {
      // 🚨 T7: la autorización se crea SIEMPRE por `autorizadoIdentidadId`,
      // aunque esa persona resulte ser cliente de la correduría. Quien MIRA es
      // la identidad —es lo que hay detrás de la cookie—, y una sola rama es
      // una sola cosa que puede fallar. Repartirlo según si tiene ficha
      // significaría que la misma invitación produce filas distintas según un
      // dato que ni el invitado ni José controlan.
      //
      // El WHERE lleva las dos ramas y la póliza: buscar solo por
      // `autorizadoClienteId: null` traería las de CUALQUIER invitado de esa
      // ficha, y sin `polizaId` una autorización sobre UNA póliza contaría como
      // «ya la tiene».
      const previas = await tx.portalAutorizacion.findMany({
        where: {
          otorganteClienteId: fila.otorganteClienteId,
          autorizadoClienteId: null,
          autorizadoIdentidadId: identidadId,
          alcance,
          polizaId: fila.polizaId,
          revocadoEn: null,
        },
        select: { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
      })
      const viva = previas.find((p) => estadoAutorizacion(p, hoy) !== 'caducada') ?? null

      let id: string
      if (viva !== null) {
        // Ya existía una para esa pareja, ese alcance y esa póliza (José pudo
        // concedérsela por otro camino mientras el correo estaba en el buzón).
        // No se crea otra —el índice único lo impediría— y se enlaza con la
        // invitación para que quede constancia de que aceptar sirvió de algo.
        id = viva.id
        if (viva.aceptadoEn === null) {
          await tx.portalAutorizacion.updateMany({
            where: { id: viva.id, aceptadoEn: null, revocadoEn: null },
            data: { aceptadoEn: hoy, aceptadoPorIdentidadId: identidadId },
          })
        }
      } else {
        // 🚨 El desfase entre lo que ve el usuario y lo que ve el índice:
        // `idx_portal_autorizacion_viva` es UNIQUE WHERE `revocado_en IS NULL`,
        // así que una CADUCADA sigue ocupando el sitio aunque no abra nada. Sin
        // cerrarla, aceptar revienta con un choque de índice.
        //
        // Cerrarla NO es revocarla —nadie la revocó, se le acabó el plazo— y por
        // eso `revocadoPor: 'caducidad'`, con su PROPIA `caducaEn` como fecha:
        // fecharla hoy diría que el acceso siguió abierto meses. Mismo camino
        // que `conceder()` y que `resolverPeticion()`.
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
            correduriaId: fila.correduriaId,
            otorganteClienteId: fila.otorganteClienteId,
            // T7: la rama de la ficha se queda vacía A PROPÓSITO. El CHECK
            // `portal_autorizacion_destinatario_unico` exige exactamente una.
            autorizadoClienteId: null,
            autorizadoIdentidadId: identidadId,
            // `null` = todas las del otorgante, futuras incluidas.
            polizaId: fila.polizaId,
            alcance,
            origen: 'portal',
            otorgadoPorIdentidadId: fila.otorgadaPorIdentidadId,
            caducaEn: caducidadPorDefecto(hoy),
            // 🚨 Nace YA ACEPTADA, y no es un atajo: la doble aceptación existe
            // para que nadie aparezca en un registro con su nombre sin saberlo
            // (art. 7.1 RGPD, modelo del Registro de Apoderamientos de la
            // AEAT). Aquí el acto de aceptar la invitación ES esa segunda
            // firma: la persona ha entrado con su correo, ha leído el texto y
            // ha pulsado. Dejarla pendiente le pediría firmar dos veces lo
            // mismo, y la segunda pantalla no diría nada nuevo.
            aceptadoEn: hoy,
            aceptadoPorIdentidadId: identidadId,
            // Qué texto se aceptó. La versión depende de quién cede.
            versionTexto: esJuridica ? TEXTO_REPRESENTACION_V1 : TEXTO_AUTORIZACION_V1,
            // `null` cuando la cabecera no vino: no se inventa una IP.
            ip: datos.ip,
            userAgent: datos.userAgent,
          },
          select: { id: true },
        })
        id = nueva.id
      }

      const { count } = await tx.portalInvitacion.updateMany({
        where: { id: fila.id, aceptadaEn: null, rechazadaEn: null, retiradaEn: null },
        // Los tres van juntos porque el CHECK `portal_invitacion_acepta_con_sello`
        // los exige juntos: «aceptado por el que tenía el enlace» no es una
        // prueba de consentimiento, es una firma en blanco.
        data: { aceptadaEn: hoy, aceptadaPorIdentidadId: identidadId, autorizacionId: id },
      })
      // Alguien llegó antes. Se lanza para que la transacción DESHAGA la
      // autorización recién creada: dejarla suelta abriría un acceso que
      // ninguna invitación respalda.
      if (count === 0) throw new YaResuelta()
      return id
    })
  } catch (e) {
    if (e instanceof YaResuelta) {
      return { ok: false, error: 'no_encontrada', mensaje: 'Esta invitación ya estaba contestada.' }
    }
    throw e
  }

  return { ok: true, estado: 'aceptada', autorizacionId }
}

export type ErrorRetirar = 'datos_invalidos' | 'no_encontrada' | 'no_pendiente'

export type ResultadoRetirar =
  | { ok: true; estado: EstadoInvitacion }
  | { ok: false; error: ErrorRetirar; mensaje: string }

/**
 * José se arrepiente: retira una invitación que todavía no han contestado.
 *
 * 🚨 Sin permiso se contesta `no_encontrada` (404), **nunca 403**: un 403
 * confirma que esa invitación existe. Misma decisión que `resolver()` de
 * `lib/autorizaciones.ts` y que `resolverPeticion()`.
 *
 * Retirar NO es rechazar y no se colapsan: uno dice «me he arrepentido de
 * ofrecértelo» y el otro «no lo quiero». Por eso la fila tiene dos columnas y
 * `retirada_en` no lleva identidad — solo puede haberla retirado quien invitó, y
 * eso ya consta en `otorgada_por_identidad_id`.
 */
export async function retirarInvitacion(datos: {
  identidadId: string
  invitacionId: string
}): Promise<ResultadoRetirar> {
  const { identidadId, invitacionId } = datos
  if (!UUID.test(invitacionId)) {
    return { ok: false, error: 'datos_invalidos', mensaje: 'No hemos entendido qué invitación querías retirar.' }
  }

  // El filtro va JUNTO al id, nunca un `findUnique({ id })` y un `if` después:
  // con el uuid de una invitación ajena la lectura sería un éxito y el fallo no
  // saldría en ningún log.
  const fila = await prisma.portalInvitacion.findFirst({
    where: { id: invitacionId, otorgadaPorIdentidadId: identidadId },
    select: { id: true, caducaEn: true, aceptadaEn: true, rechazadaEn: true, retiradaEn: true },
  })
  if (fila === null) {
    return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa invitación.' }
  }

  const hoy = new Date()
  if (!invitacionResoluble(fila, hoy)) {
    const estado = estadoInvitacion(fila, hoy)
    return {
      ok: false,
      error: 'no_pendiente',
      mensaje:
        estado === 'caducada'
          ? 'Esta invitación ya había caducado: no hay nada que retirar.'
          : 'Esta invitación ya estaba contestada.',
    }
  }

  const { count } = await prisma.portalInvitacion.updateMany({
    where: { id: fila.id, aceptadaEn: null, rechazadaEn: null, retiradaEn: null },
    data: { retiradaEn: hoy },
  })
  // `count === 0` = alguien llegó antes (la aceptaron entre la lectura y la
  // escritura). No se vuelve a intentar: lo hecho, hecho está.
  if (count === 0) {
    return { ok: false, error: 'no_pendiente', mensaje: 'Esta invitación ya no está pendiente.' }
  }

  return { ok: true, estado: 'retirada' }
}
