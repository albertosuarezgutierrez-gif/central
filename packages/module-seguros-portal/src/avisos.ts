// Los AVISOS de la campana: qué tiene pendiente la persona que ha entrado, en
// una sola lista, con un enlace al sitio donde cada cosa se resuelve.
//
// Esto es PURO a propósito: recibe lo que ya leyeron `lib/autorizaciones.ts` y
// `lib/obligaciones.ts` (cada uno con su frontera de identidad) y no toca la BD.
// Así el test lo rompe a mano sin Prisma, y la ruta `/api/avisos` no decide nada.
//
// 🚨 Un aviso NO se acepta desde aquí ni desde la campana. La autorización se
// acepta en `/autorizaciones`, con su alcance y su texto delante; la obligación
// se mira en el calendario. La campana ENSEÑA y ENLAZA. Duplicar el «aceptar»
// en dos pantallas es cómo se acaba aceptando sin leer.
//
// 🚨 Y tres desenlaces para el número, ninguno es «0» por defecto. Si una de las
// dos fuentes no se ha podido leer, «no tienes avisos» es una mentira sobre la
// que el cliente decide no mirar. Es la regla del `CLAUDE.md` de la raíz (dato
// que NO hay ≠ dato que NO se ha mirado), un piso más abajo.
import { entraEnVentana } from './obligacion.ts'
import type { EstadoAutorizacion } from './autorizacion.ts'

export const TIPOS_AVISO = [
  'peticion_recibida',
  'autorizacion_pendiente',
  'autorizacion_sin_aceptar',
  'acceso_por_revisar',
  'obligacion_en_ventana',
  'datos_por_revisar',
  'carnet_en_ventana',
  'carnet_caducado',
  'anulacion_por_firmar',
  'felicitacion',
] as const
export type TipoAviso = (typeof TIPOS_AVISO)[number]

/**
 * Ventana del carné de conducir: 60 días, no los 7 de `DIAS_VENTANA_AVISO`.
 * Renovar un carné exige cita en la DGT y (a partir de los 65) un
 * reconocimiento médico — un aviso a una semana vista llega tarde para pedir
 * hueco. Primer corte razonable (19/09/2026); ajustable sin tocar el resto del
 * catálogo.
 */
export const DIAS_VENTANA_AVISO_CARNET = 60

/**
 * Hasta cuándo se dice que un carné está CADUCADO (21/09/2026).
 *
 * 🚨 El aviso de arriba solo mira al futuro (`faltan >= 0`), así que
 * desaparecía justo el día que el carné caduca: el sistema se callaba en el
 * único momento en que pasa algo. Conducir con el carné caducado es sanción y
 * una discusión con la compañía el día del siniestro.
 *
 * Pero no se puede avisar hacia atrás sin límite: la ficha viene de un volcado
 * y una fecha de hace veinte años no dice «conduce sin carné», dice «este dato
 * es viejo». Pasados dos años se deja de afirmar, porque ya no se sabe. Es la
 * regla de la casa: un dato que no se ha comprobado no se pinta como un hecho.
 */
export const DIAS_MAX_CARNET_CADUCADO = 730

export type Aviso = {
  tipo: TipoAviso
  /** El id de la fila de origen, para que la pantalla tenga `key` estable. */
  id: string
  titulo: string
  detalle: string
  /** A dónde lleva: SIEMPRE la pantalla donde se resuelve, nunca una acción. */
  href: string
}

export const FUENTES_AVISO = ['autorizaciones', 'obligaciones', 'peticiones', 'datos', 'carnets', 'firmas', 'felicitaciones'] as const
export type FuenteAviso = (typeof FUENTES_AVISO)[number]

/** Lo mínimo que la campana necesita de una autorización; el resto de `AutorizacionVista` no se mira. */
export type AutorizacionParaAviso = {
  id: string
  estado: EstadoAutorizacion
  otorganteNombre: string | null
  autorizadoNombre: string | null
  /**
   * Toca preguntarle al otorgante si mantiene el acceso (`pideRevision`, un año).
   * Opcional: una lectura que no lo trae no pide revisión — nunca se inventa.
   */
  pideRevision?: boolean
}

/** Lo mínimo de una obligación del calendario. */
export type ObligacionParaAviso = {
  id: string
  titulo: string
  fechaAccionable: Date
  /** Cada cuántos meses se repite, o `null`/ausente si es de una sola vez.
   *  Solo se usa para la forma del id del aviso — ver el comentario de abajo. */
  repiteCadaMeses?: number | null
}

/** Lo mínimo de una petición de acceso recibida; el resto de `PeticionRecibida` no se mira. */
export type PeticionParaAviso = {
  id: string
  /** Solo se avisa de las `pendiente`. */
  estado: string
  /** Quién pide. `null` = no se sabe el nombre — NUNCA se inventa uno. */
  solicitanteNombre: string | null
}

/**
 * Un reparo de los datos de contacto guardados, ya traducido a una frase.
 *
 * 🚨 `tipo` es lo que IDENTIFICA al aviso (`datos_por_revisar:cp_invalido`), así
 * que tiene que ser estable: es la clave con la que el emisor de correo sella lo
 * ya enviado. El `texto` es la explicación para la pantalla y puede cambiar sin
 * que eso vuelva a avisar de lo mismo.
 */
export type ReparoParaAviso = {
  tipo: string
  texto: string
}

/**
 * Un carné de conducir con su próxima caducidad ya calculada (fuera de aquí:
 * `caducidadCarnet()` de `@central/module-seguros`, con la fecha de expedición
 * y de nacimiento, que esta capa nunca ve). Este tipo NO lleva ningún dato de
 * origen — solo el resultado — porque es lo único que cruza el puente desde
 * `apps/asegura` (fecha de carné y de nacimiento van cifradas y este paquete no
 * tiene la clave).
 */
export type CarnetParaAviso = {
  /** Id de la fila `cliente_carnets_conducir`: estable, para la `key` y el sello. */
  id: string
  /** 'B', 'C1E'… tal cual lo guarda la DGT. */
  tipo: string
  /** `YYYY-MM-DD`. */
  fechaCaducidad: string
}

export type EntradaAvisos = {
  /** `null` = esa fuente NO se ha podido leer. No es lo mismo que `{ otorgadas: [], recibidas: [] }`. */
  autorizaciones: { otorgadas: AutorizacionParaAviso[]; recibidas: AutorizacionParaAviso[] } | null
  /** `null` = no se ha podido leer. `[]` = leído, no hay. */
  obligaciones: ObligacionParaAviso[] | null
  /** `null` = no se ha podido leer. `[]` = leído, no hay. */
  peticiones: PeticionParaAviso[] | null
  /**
   * Lo que no cuadra en los datos de contacto guardados (`leerSitio()` de
   * `@central/module-seguros`). `null` = no se ha podido mirar — con la ficha
   * ilegible, «tus datos están bien» sería una afirmación que nadie ha comprobado.
   */
  datos: ReparoParaAviso[] | null
  /** `null` = no se ha podido mirar (el puente a `apps/asegura` caído o sin configurar). */
  carnets: CarnetParaAviso[] | null
  /**
   * Anulaciones que esperan SU firma (la de una póliza que ya sustituye otra, o una pedida por el
   * corredor). `null` = no se ha podido mirar. Sin firma no sale el correo a la compañía, así que
   * si nadie se lo dice, la vieja se renueva y se cobra.
   */
  firmas: FirmaParaAviso[] | null
  /**
   * La felicitación de cumpleaños de HOY (la escribe el cron de asegura, que es quien puede leer la
   * fecha de nacimiento). `null` = no se ha podido mirar. Ausente = esta superficie no felicita: el
   * emisor de correo de la intranet no la cuenta como «novedad» porque el cumpleaños ya tiene su
   * propio correo.
   */
  felicitaciones?: { id: string }[] | null
  hoy: Date
}

export type FirmaParaAviso = { id: string; compania: string | null }

export type Avisos = {
  avisos: Aviso[]
  /** Las fuentes que fallaron. Vacío = todo leído; con algo, el número lleva `+`. */
  fuentesIlegibles: FuenteAviso[]
  /** Lo que pinta el globo de la campana. `null` = sin globo (todo leído y nada pendiente). */
  globo: string | null
}

/** A dónde manda cada tipo. Un mapa, no un `switch` en la pantalla: el que añada un tipo lo ve aquí. */
export const HREF_POR_TIPO: Record<TipoAviso, string> = {
  peticion_recibida: '/autorizaciones',
  autorizacion_pendiente: '/autorizaciones',
  autorizacion_sin_aceptar: '/autorizaciones',
  // La revisión anual (25/09/2026): se contesta en «Contactos», en la tarjeta de ese acceso.
  acceso_por_revisar: '/autorizaciones',
  // El calendario de la bóveda se quitó el 09/09/2026 (no aportaba nada que la
  // fila de cada póliza no dijera ya); el aviso sigue existiendo y enlaza a la
  // bóveda a secas, sin ancla.
  obligacion_en_ventana: '/boveda',
  // «Mis datos», que es donde se corrige: el aviso lleva a la pantalla donde se
  // resuelve, no a una explicación de lo que hay que hacer en otro sitio.
  datos_por_revisar: '/boveda?vista=datos',
  // Renovar el carné se hace en la DGT, no en el portal — igual que un
  // vencimiento de póliza, el aviso enlaza a la bóveda a secas.
  carnet_en_ventana: '/boveda',
  // 🚨 El caducado lleva a «Recordatorios», NO a «Mis datos»: el carné no se
  // pinta en esa pantalla (ahí van dirección, contactos, consentimiento y
  // supresión), así que el enlace mandaría a alguien a buscar un dato que no
  // está. En «Recordatorios» sí aparece, porque es de donde sale su precarga.
  carnet_caducado: '/boveda?vista=recordatorios',
  // «Pendiente de tu firma» vive en la bóveda (vista de seguros), que es donde se firma.
  anulacion_por_firmar: '/boveda',
  felicitacion: '/boveda',
}

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** `YYYY-MM-DD` en UTC. Se usa para el id por ciclo de una obligación: tiene que
 *  ser estable (el mismo ciclo, la misma clave) y no depender del huso. */
function diaIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
const MS_DIA = 86_400_000

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** `YYYY-MM-DD` dentro de la ventana del carné, a fecha `hoy`. Mismo criterio que `entraEnVentana()`: solo futuro. */
export function entraEnVentanaCarnet(fechaCaducidad: string, hoy: Date): boolean {
  const faltan = diasHastaCarnet(fechaCaducidad, hoy)
  return faltan !== null && faltan >= 0 && faltan <= DIAS_VENTANA_AVISO_CARNET
}

/**
 * Días que faltan para que caduque (negativos si YA caducó), o `null` si la
 * fecha no es una fecha. Se saca aparte porque lo necesitan las dos ventanas y
 * con dos parseos acabarían discrepando en el borde.
 */
function diasHastaCarnet(fechaCaducidad: string, hoy: Date): number | null {
  const dia = fechaCaducidad.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const caduca = new Date(`${dia}T00:00:00Z`)
  if (Number.isNaN(caduca.getTime())) return null
  return Math.round((diaUtc(caduca).getTime() - diaUtc(hoy).getTime()) / MS_DIA)
}

/**
 * El día del carné en castellano, o `null` si la fecha no es una fecha.
 *
 * 🚨 Devuelve `null` en vez de lanzar, y se llama DESPUÉS de que una de las dos
 * ventanas haya dicho que sí. Formatearlo antes —que es como nació— convierte
 * un `fechaCaducidad` malformado (el puente solo comprueba que sea una cadena)
 * en un `RangeError: Invalid time value` que se lleva por delante `avisosDe()`
 * ENTERA: la campana devuelve 500 en vez de degradar a `n+`, y la pasada del
 * emisor de intranet se aborta para todos los clientes por el carné de uno.
 */
function fechaCarnetLegible(fechaCaducidad: string, hoy: Date): string | null {
  if (diasHastaCarnet(fechaCaducidad, hoy) === null) return null
  return FECHA.format(new Date(`${fechaCaducidad.trim().slice(0, 10)}T00:00:00Z`))
}

/**
 * El carné YA caducó y la fecha es lo bastante reciente como para afirmarlo.
 *
 * 🚨 Es EXCLUYENTE con `entraEnVentanaCarnet` por construcción (aquella exige
 * `faltan >= 0` y esta `faltan < 0`): un mismo carné no puede salir a la vez
 * como «caduca pronto» y «ya caducó».
 */
export function carnetCaducado(fechaCaducidad: string, hoy: Date): boolean {
  const faltan = diasHastaCarnet(fechaCaducidad, hoy)
  return faltan !== null && faltan < 0 && faltan >= -DIAS_MAX_CARNET_CADUCADO
}

/**
 * El texto del globo. Tres desenlaces, y «0» no es uno de ellos:
 *  · todas las fuentes leídas y `n` pendientes → `n` (o sin globo si `n` = 0);
 *  · alguna fuente ilegible → `n+` (hay AL MENOS `n`; puede haber más);
 *  · ninguna legible → `!` (no se sabe nada).
 */
export function textoGlobo(n: number, ilegibles: number, fuentes: number): string | null {
  if (fuentes > 0 && ilegibles >= fuentes) return '!'
  if (ilegibles > 0) return `${n}+`
  return n > 0 ? String(n) : null
}

export function avisosDe(x: EntradaAvisos): Avisos {
  const avisos: Aviso[] = []
  const fuentesIlegibles: FuenteAviso[] = []

  if (x.peticiones === null) {
    fuentesIlegibles.push('peticiones')
  } else {
    for (const p of x.peticiones) {
      if (p.estado !== 'pendiente') continue
      avisos.push({
        tipo: 'peticion_recibida',
        id: p.id,
        titulo: `${p.solicitanteNombre ?? 'Alguien'} te ha pedido acceso a tus seguros`,
        detalle: 'Puedes aceptarlo o rechazarlo.',
        href: HREF_POR_TIPO.peticion_recibida,
      })
    }
  }

  if (x.autorizaciones === null) {
    fuentesIlegibles.push('autorizaciones')
  } else {
    // Las que me han concedido y aún no he aceptado: es lo que la campana
    // existe para enseñar. Hasta el 08/09/2026 solo se veía entrando en la
    // pestaña «Quién me ve», y quien no entraba no se enteraba.
    for (const a of x.autorizaciones.recibidas) {
      if (a.estado !== 'pendiente') continue
      avisos.push({
        tipo: 'autorizacion_pendiente',
        id: a.id,
        titulo: `${a.otorganteNombre ?? 'Alguien'} te ha dado acceso a sus seguros`,
        detalle: 'Falta que lo aceptes para poder verlos.',
        href: HREF_POR_TIPO.autorizacion_pendiente,
      })
    }
    // El espejo: las que YO concedí y la otra persona no ha aceptado. «La
    // persona invitada» cuando no es cliente: de ella no hay ficha ni nombre, y
    // la pantalla no inventa uno.
    for (const a of x.autorizaciones.otorgadas) {
      if (a.estado !== 'pendiente') continue
      avisos.push({
        tipo: 'autorizacion_sin_aceptar',
        id: a.id,
        titulo: `${a.autorizadoNombre ?? 'La persona invitada'} aún no ha aceptado tu acceso`,
        detalle: 'Hasta que acepte no ve nada. Puedes recordárselo o retirarlo.',
        href: HREF_POR_TIPO.autorizacion_sin_aceptar,
      })
    }
    // 🚨 La revisión anual (25/09/2026). Los accesos ya NO caducan; lo que cubre
    // el caso del divorcio es esta pregunta. Si no aparece aquí, solo la ve quien
    // entre en «Contactos» por su cuenta — o sea, nadie.
    for (const a of x.autorizaciones.otorgadas) {
      if (a.estado !== 'vigente' || a.pideRevision !== true) continue
      avisos.push({
        tipo: 'acceso_por_revisar',
        id: a.id,
        titulo: `¿Sigues dejando ver tus seguros a ${a.autorizadoNombre ?? 'la persona invitada'}?`,
        detalle: 'Hace un año que tiene acceso. Confírmalo o revócalo; si no haces nada, lo sigue teniendo.',
        href: HREF_POR_TIPO.acceso_por_revisar,
      })
    }
  }

  if (x.obligaciones === null) {
    fuentesIlegibles.push('obligaciones')
  } else {
    for (const o of x.obligaciones) {
      // La ventana la decide el módulo (7 días antes de la fecha ACCIONABLE, que
      // ya lleva descontado el preaviso del art. 22 LCS). No se reimplementa.
      if (!entraEnVentana({ fechaAccionable: o.fechaAccionable, hoy: x.hoy })) continue
      avisos.push({
        tipo: 'obligacion_en_ventana',
        // 🚨 El id lleva la fecha del ciclo SOLO si la obligación se repite, y
        // esa distinción es la que hace segura la pieza entera.
        //
        // Por qué con fecha en las recurrentes: el emisor de correo de la
        // intranet sella por este id (`portal_aviso_enviado`), así que con el
        // id de la FILA pelado un «ITV cada 12 meses» avisaría una vez y al año
        // siguiente —misma fila, misma clave— se quedaría mudo para siempre.
        //
        // 🚨 Y por qué NO en las demás: `sincronizarObligacionesDeIdentidad()`
        // REESCRIBE `fechaAccionable` en cada carga de la bóveda, así que una
        // corrección del vencimiento que traiga CIMA dentro de la ventana
        // cambiaría la clave y mandaría un SEGUNDO correo de la misma
        // renovación. El id de fila lo impide, y en una obligación derivada no
        // hay ciclo siguiente que desbloquear. De paso, las claves ya selladas
        // siguen valiendo: cambiar la forma para todas habría reenviado de
        // golpe todo lo que estuviera en ventana al desplegar.
        id: o.repiteCadaMeses ? `${o.id}:${diaIso(o.fechaAccionable)}` : o.id,
        titulo: o.titulo,
        detalle: `Puedes actuar hasta el ${FECHA.format(o.fechaAccionable)}.`,
        href: HREF_POR_TIPO.obligacion_en_ventana,
      })
    }
  }

  if (x.datos === null) {
    fuentesIlegibles.push('datos')
  } else {
    for (const r of x.datos) {
      avisos.push({
        tipo: 'datos_por_revisar',
        id: r.tipo,
        titulo: 'Revisa tu dirección de contacto',
        // El texto del reparo dice QUÉ columna no cuadra y con qué valor; la
        // segunda frase dice DÓNDE se arregla. Las dos juntas, porque un aviso
        // que solo dice que algo está mal obliga a escribirnos para saber qué.
        detalle: `${r.texto} Puedes corregirlo tú mismo en «Mis datos».`,
        href: HREF_POR_TIPO.datos_por_revisar,
      })
    }
  }

  if (x.carnets === null) {
    fuentesIlegibles.push('carnets')
  } else {
    for (const c of x.carnets) {
      const cuando = fechaCarnetLegible(c.fechaCaducidad, x.hoy)
      if (cuando !== null && entraEnVentanaCarnet(c.fechaCaducidad, x.hoy)) {
        avisos.push({
          tipo: 'carnet_en_ventana',
          id: c.id,
          titulo: `Tu carné de conducir (${c.tipo}) caduca pronto`,
          detalle: `Caduca el ${cuando}. Pide cita en la DGT con tiempo.`,
          href: HREF_POR_TIPO.carnet_en_ventana,
        })
        continue
      }
      // 🚨 El aviso NO acusa a nadie de conducir sin carné: dice lo que nos
      // CONSTA, que es otra cosa. La fecha sale de la ficha y puede estar
      // vieja, así que la salida que se le ofrece es decirnos que ya lo
      // renovó. Afirmar «tu carné está caducado» sobre un dato que nadie ha
      // comprobado sería exactamente el fallo que persigue la casa.
      if (cuando !== null && carnetCaducado(c.fechaCaducidad, x.hoy)) {
        avisos.push({
          tipo: 'carnet_caducado',
          id: c.id,
          titulo: `Nos consta que tu carné de conducir (${c.tipo}) está caducado`,
          detalle: `Según lo que tenemos, caducó el ${cuando}. Si ya lo has renovado, escríbenos para que lo actualicemos; si no, pide cita en la DGT.`,
          href: HREF_POR_TIPO.carnet_caducado,
        })
      }
    }
  }

  if (x.firmas === null) {
    fuentesIlegibles.push('firmas')
  } else {
    for (const f of x.firmas ?? []) {
      avisos.push({
        tipo: 'anulacion_por_firmar',
        id: f.id,
        titulo: `Falta tu firma para dar de baja tu seguro${f.compania ? ` de ${f.compania}` : ''}`,
        detalle: 'Sin tu firma no podemos pedir la baja a la compañía, y podría renovarlo y cobrártelo. Se firma con un código que te llega al correo.',
        href: HREF_POR_TIPO.anulacion_por_firmar,
      })
    }
  }

  if (x.felicitaciones === null) {
    fuentesIlegibles.push('felicitaciones')
  } else {
    for (const f of x.felicitaciones ?? []) {
      avisos.push({
        tipo: 'felicitacion',
        id: f.id,
        titulo: '¡Feliz cumpleaños! 🎂',
        detalle: 'Todo el equipo de Grupo ASegura te desea un gran día.',
        href: HREF_POR_TIPO.felicitacion,
      })
    }
  }

  return {
    avisos,
    fuentesIlegibles,
    // Las fuentes que ESTA superficie consulta: una ausente (`undefined`) no cuenta para el «!».
    globo: textoGlobo(avisos.length, fuentesIlegibles.length, FUENTES_AVISO.length - (x.felicitaciones === undefined ? 1 : 0)),
  }
}
