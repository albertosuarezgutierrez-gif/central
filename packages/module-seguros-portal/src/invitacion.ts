// «Te invito a ver mis seguros» — la invitación por correo.
//
// Es la TERCERA puerta de la autorización, y las tres existen porque las tres
// pasan en la vida real:
//
//   · `autorizacion.ts`  — José concede a María, que YA está en la cartera.
//   · `peticion-acceso.ts` — el hijo PIDE lo que su padre no va a ofrecer solo.
//   · esta               — José escribe un correo de alguien que **no está en
//                          ninguna parte** y le abre la puerta.
//
// La tercera es la que trae gente nueva, y por eso Alberto la quiere (04/09/2026):
// «la persona puede no estar… pero da igual, dale acceso y así podemos también
// captarlo de cliente. Mi idea de la intranet cliente es que sea para todo el
// mundo y gratis». Quien entra por aquí no es un cliente: es un futuro cliente
// mirando cómo trabaja la correduría con los seguros de alguien que se fía de él.
//
// ── 🚨 POR QUÉ ES UNA TABLA APARTE Y NO UNA AUTORIZACIÓN «PENDIENTE» ────────
//
// Porque a quien se invita **todavía no existe**. Una `portal_autorizacion`
// necesita apuntar a una ficha o a una identidad, y el invitado no tiene
// ninguna de las dos hasta que entra por primera vez. Guardar la invitación
// como una autorización obligaría a inventarle una de las dos cosas —una ficha
// fantasma en la cartera, o una identidad sin nadie detrás— y las dos ensucian
// justo lo que este portal cuida: la cartera de Alberto y el registro que
// demuestra quién consintió qué (art. 7.1 RGPD).
//
// La invitación se convierte en autorización **en el momento en que alguien
// prueba ser ese correo**, y no antes.
//
// ── 🚨 EL TOKEN NO ABRE NADA. Léelo dos veces antes de «simplificarlo» ──────
//
// El enlace del correo lleva un token, y la tentación es que ese token abra la
// sesión: un clic y dentro. **No.** Tres razones, y las tres están medidas o
// documentadas en este repo:
//
//   1. **Se lo comen los escáneres.** Un enlace que consume estado con un GET lo
//      gastan el antivirus del correo y el prefetch del cliente antes de que la
//      persona lo toque. Es la misma lección que `lib/enlace-acceso.ts`: el
//      enlace PRE-RELLENA, el POST que dispara la persona es el que canjea.
//   2. **Un token en un correo es una llave reenviable.** Quien reenvía el
//      correo —o quien lee el buzón compartido de una empresa— entraría en los
//      seguros de un tercero sin que nada falle.
//   3. **La aceptación tiene que constar a nombre de ALGUIEN.** «Aceptado por el
//      que tenía el enlace» no es una prueba de consentimiento: es un recibo sin
//      firma.
//
// Por eso el reparto es: **el token dice QUÉ invitación es; el código de un solo
// uso al correo invitado dice QUIÉN eres.** Y la aceptación se ata al CORREO, no
// al token — un enlace reenviado a otra persona no le sirve de nada, porque el
// código llega al buzón del invitado.
//
// El token se guarda **hasheado**. En claro solo existe dentro del correo que
// sale. Una tabla de invitaciones con sus tokens legibles es una tabla de llaves.
//
// ── 🚨 LO QUE EL CORREO NO PUEDE DECIR ─────────────────────────────────────
//
// Antes de aceptar, el invitado es un desconocido: puede que José se haya
// equivocado de dirección, o que el correo llegue a un buzón compartido. Así que
// el correo dice QUIÉN le invita y poco más. **Nunca**: qué compañía, qué
// pólizas, qué matrícula, qué importe. Eso se enseña después de que la persona
// pruebe que es ella. `CAMPOS_PROHIBIDOS_EN_INVITACION` está aquí para que ese
// «poco más» no crezca solo con el tiempo.

import { TIPOS_RELACION, type TipoRelacion } from '@central/module-seguros'

/** Lo que pasó de verdad al invitar. Vive en el servidor. */
export const RESULTADOS_INVITACION = [
  'enviada',
  'ya_invitado',
  'ya_autorizado',
  'a_si_mismo',
  'limite_diario',
  'envio_fallido',
  'sin_enlace',
] as const
export type ResultadoInvitacion = (typeof RESULTADOS_INVITACION)[number]

/**
 * 🚨 La asimetría con `peticion-acceso.ts` es DELIBERADA, no una inconsistencia.
 *
 * Allí los resultados se colapsan porque quien pregunta aprendería si el
 * destinatario es cliente de la correduría — y con 32.600 fichas eso convierte
 * la pantalla en un bucle de enumeración. **Aquí no hay nada que aprender:**
 * José invita a quien él quiere, sea cliente o no, y el sistema le da acceso
 * igual (esa es justo la idea del producto). `ya_invitado` y `ya_autorizado`
 * hablan de las relaciones DE JOSÉ, que él ya ve en su propia pantalla.
 *
 * Lo que sigue estando prohibido es decirle a José si el correo que escribió
 * pertenece a alguien de la cartera. Eso no se contesta **ni aquí ni en ningún
 * sitio**, y por eso no hay ningún resultado que lo nombre: no es que se
 * colapse, es que no se calcula.
 */
export function invitacionRevelaSiEsCliente(_r: ResultadoInvitacion): false {
  return false
}

/**
 * Un correo puede tardar. `envio_fallido` NO es «no se ha invitado»: la fila ya
 * está escrita y la invitación existe. Se distingue para poder decir «no hemos
 * podido avisarle, inténtalo otra vez» en vez de dar por hecho que llegó —
 * exactamente la misma línea que separa `502 envio_fallido` de `503
 * canal_no_disponible` en el acceso.
 *
 * 🚨 `sin_enlace` es lo contrario y por eso está fuera: sin `PORTAL_PUBLIC_URL`
 * (o si no es **https**) la invitación NO se escribe. Aquí el enlace no es un
 * adorno como en el correo del código —donde el código abre igual la puerta y
 * el enlace solo pre-rellena—: aquí **el enlace ES el mecanismo**, y una fila
 * cuyo correo no puede salir es una invitación que ocupa el sitio del índice
 * único y que nadie va a poder aceptar nunca. No se inventa un dominio.
 */
export function invitacionEscrita(r: ResultadoInvitacion): boolean {
  return r === 'enviada' || r === 'envio_fallido'
}

/** Estados de una invitación. `caducada` se CALCULA, no se guarda. */
export const ESTADOS_INVITACION = ['enviada', 'aceptada', 'rechazada', 'retirada', 'caducada'] as const
export type EstadoInvitacion = (typeof ESTADOS_INVITACION)[number]

/**
 * Cuánto vive una invitación sin contestar. Treinta días, como la petición: un
 * enlace de hace tres años que sigue abriendo la puerta de los seguros de
 * alguien es una llave perdida, no una invitación.
 */
export const DIAS_VIGENCIA_INVITACION = 30

/** Cuántas puede mandar una misma ficha al día. Es un freno de abuso, no una cuota comercial. */
export const MAX_INVITACIONES_DIA = 10

/** Máximo del texto que José le escribe al invitado. Va delante de otra persona: se escapa al pintarlo. */
export const MAX_MENSAJE_INVITACION = 300

/**
 * Se suma en DÍAS, nunca con `setUTCMonth`: restar o sumar un mes sobre un 31 de
 * marzo da un 31 de febrero que JavaScript normaliza al 3 de marzo sin avisar.
 * Es el mismo error que ya se cazó en el calendario de vencimientos.
 */
export function caducidadInvitacion(desde: Date): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_INVITACION * 24 * 60 * 60 * 1000)
}

export type InvitacionFechas = {
  caducaEn: Date
  aceptadaEn: Date | null
  rechazadaEn: Date | null
  retiradaEn: Date | null
}

/**
 * 🚨 Lo RESUELTO gana a la caducidad, igual que en la petición: una invitación
 * aceptada no se convierte en «caducada» al pasar el mes — lo que caduca es la
 * autorización que salió de ella, que tiene su propia fecha y su propio año.
 * Preguntar por la caducidad primero haría desaparecer del historial de José
 * justo las que sirvieron para algo.
 */
export function estadoInvitacion(i: InvitacionFechas, hoy: Date): EstadoInvitacion {
  if (i.aceptadaEn !== null) return 'aceptada'
  if (i.rechazadaEn !== null) return 'rechazada'
  if (i.retiradaEn !== null) return 'retirada'
  if (i.caducaEn.getTime() <= hoy.getTime()) return 'caducada'
  return 'enviada'
}

/** Solo una invitación viva se puede aceptar, rechazar o retirar. */
export function invitacionResoluble(i: InvitacionFechas, hoy: Date): boolean {
  return estadoInvitacion(i, hoy) === 'enviada'
}

/**
 * Longitud en BYTES del token del enlace. 32 bytes = 256 bits, generados con
 * `randomBytes` de `node:crypto` — **nunca** `Math.random`, que es predecible y
 * aquí la consecuencia de adivinarlo es entrar en la invitación de otro.
 *
 * Se guarda hasheado; en claro solo viaja dentro del correo.
 */
export const BYTES_TOKEN_INVITACION = 32

/** Un token válido tal y como viaja en la URL: 64 caracteres hex, nada más. */
const TOKEN = /^[0-9a-f]{64}$/

/**
 * `null` = eso no es un token. Se valida ANTES de tocar la BD: un valor
 * cualquiera metido en la URL no tiene por qué llegar a una consulta, y una
 * comparación de longitud variable contra la tabla es ruido que no hace falta.
 */
export function normalizarTokenInvitacion(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return TOKEN.test(t) ? t : null
}

/**
 * 🚨 Lo que el correo de invitación NO puede llevar, porque quien lo recibe
 * todavía es un desconocido —José pudo equivocarse de dirección, o el buzón
 * puede ser compartido— y estos datos son de un tercero que aún no ha
 * consentido nada.
 *
 * Está aquí, en el módulo puro y con su test, para que la plantilla del correo
 * no vaya creciendo «un dato más» cada vez que alguien quiera que se entienda
 * mejor. Lo único que se dice es QUIÉN invita y a qué se le invita a entrar.
 */
export const CAMPOS_PROHIBIDOS_EN_INVITACION = [
  'compania',
  'aseguradora',
  'numeroPoliza',
  'matricula',
  'prima',
  'iban',
  'dni',
  'referenciaCatastral',
  // 08/09/2026: qué es el invitado de José («su hija», «su empleado») es un dato
  // de la relación entre dos personas, y quien abre el buzón puede no ser
  // ninguna de las dos. Se guarda para la LISTA de José, no para el correo.
  'relacion',
  'parentesco',
] as const

/**
 * El texto libre que José le escribe al invitado. `null` si venía vacío: una
 * cadena vacía guardada es un valor de cajón que se cuela por las guardas de
 * NULL y luego se pinta como un mensaje que nadie escribió.
 */
export function normalizarMensajeInvitacion(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '') return null
  return t.slice(0, MAX_MENSAJE_INVITACION)
}

// ── 👥 «Contactos» (08/09/2026): a quién invitas, qué es de ti, y si le abres algo ──
//
// Alberto: *«poner nombre, tipo relación y mail y se le manda un mail de
// presentación a esa persona»*. Hasta ese día la invitación solo pedía el
// correo, y en la lista de José cada una se reconocía por su FECHA —el correo
// del invitado se guarda hasheado a propósito y no se puede pintar—. Con el
// nombre y la relación la lista pasa a ser lo que él quería: sus contactos.
//
// 🚨 Y una invitación puede NO abrir nada (`SIN_COMPARTIR`): «recomiéndanos».
// José presenta el portal a alguien sin compartir un solo seguro. Es la forma
// legalmente defendible de captar: un acto ENTRE PERSONAS —el correo lo firma
// José, dice quién invita y a qué— y no una comunicación comercial de la
// correduría a alguien que no la ha pedido (art. 21 LSSI). Por eso el correo de
// esta variante tampoco lleva argumento de venta, y por eso NO hay regalo por
// traer gente: un premio por quien acabe contratando convierte al cliente en
// colaborador externo del mediador (RDL 3/2020), con registro y contrato. Está
// aparcado a propósito en `docs/CORREDURIA-INTRANET-IDEAS.md`.

/** Tope del nombre que José escribe del invitado. Va delante de esa persona: se escapa al pintarlo. */
export const MAX_NOMBRE_INVITADO = 120

/**
 * El nombre del invitado tal y como lo escribió José. `null` si venía vacío,
 * nunca `''` (un valor de cajón que se cuela por las guardas de NULL). Se
 * quitan saltos de línea: acaba en el saludo del correo, y una cabecera es una
 * cabecera.
 */
export function normalizarNombreInvitado(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '') return null
  return t.slice(0, MAX_NOMBRE_INVITADO)
}

/**
 * Qué es el invitado de José. Se guarda con el MISMO vocabulario que
 * `cliente_relaciones.tipo_relacion` (`TIPOS_RELACION` de `@central/module-seguros`)
 * para que el día que el invitado tenga ficha la relación se copie tal cual, sin
 * traducir. `null` = no es un valor del vocabulario: no se adivina el más
 * parecido.
 */
export function relacionInvitacion(v: unknown): TipoRelacion | null {
  return typeof v === 'string' && (TIPOS_RELACION as readonly string[]).includes(v) ? (v as TipoRelacion) : null
}

/**
 * Las que se OFRECEN en el portal, en el orden del desplegable. Es un subconjunto
 * de `TIPOS_RELACION` a propósito: «Accionista» o «Administración» son vocabulario
 * del corredor, no de José invitando a su hija. Todas validan con
 * `relacionInvitacion()`; un valor del vocabulario completo también se acepta.
 */
export const RELACIONES_INVITACION: readonly TipoRelacion[] = [
  'Cónyuge/Pareja de Hecho',
  'Hijo/a',
  'Padre/Madre',
  'Hermano/a',
  'Amigo/a',
  'Empleado/a',
  'Socio/a',
  'Otra',
]

/**
 * El alcance «no comparto nada»: la invitación solo presenta el portal. Al
 * aceptarla NO se crea ninguna `portal_autorizacion` —no hay nada que autorizar—
 * y el invitado se queda con su propio espacio, vacío hasta que aporte algo.
 */
export const SIN_COMPARTIR = 'ninguno' as const

/** Lo que una invitación puede ofrecer: mirar (`ver`, `ver_economico`) o nada. */
export const ALCANCES_INVITACION = ['ver', 'ver_economico', SIN_COMPARTIR] as const
export type AlcanceInvitacion = (typeof ALCANCES_INVITACION)[number]

export function alcanceInvitacion(v: unknown): AlcanceInvitacion | null {
  return typeof v === 'string' && (ALCANCES_INVITACION as readonly string[]).includes(v)
    ? (v as AlcanceInvitacion)
    : null
}

/**
 * ¿Aceptar esta invitación abre los seguros de José? `false` = `SIN_COMPARTIR`:
 * aceptar sella la invitación y nada más. Quien decide si hay que crear una
 * autorización es esta función, no un `=== 'ninguno'` copiado en la capa de BD.
 */
export function invitacionAbreAcceso(a: AlcanceInvitacion): a is Exclude<AlcanceInvitacion, typeof SIN_COMPARTIR> {
  return a !== SIN_COMPARTIR
}

/**
 * Lo que acepta quien recibe una invitación SIN acceso. Se enseña tal cual y se
 * guarda como versión, igual que `TEXTO_AUTORIZACION`: aunque aquí no se ceda
 * ningún dato, tiene que poder decirse qué se aceptó.
 */
export const TEXTO_INVITACION_SIN_ACCESO_V1 = 'invitacion_sin_acceso_v1' as const
export const TEXTO_INVITACION_SIN_ACCESO = [
  'No se comparte contigo ningún seguro ni ningún dato de quien te invita.',
  'Solo queda registrado que te invitó y que aceptaste, con la fecha.',
  'Tendrás tu propio espacio en el portal, vacío hasta que tú añadas algo.',
  'Puedes borrar tu cuenta cuando quieras desde «Mis datos».',
].join('\n')
