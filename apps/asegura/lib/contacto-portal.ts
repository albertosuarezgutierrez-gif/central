/**
 * Aplicar a la cartera el cambio de dirección de CONTACTO (y de teléfono) que
 * hace el propio cliente desde `apps/asegura-portal`, y servirle lo justo para
 * que compruebe si sus datos «siguen igual» (08/09/2026).
 *
 * ─── Por qué esto vive aquí y no en el portal ────────────────────────────────
 * `clientes.direccion` va CIFRADA con `PII_ENCRYPTION_KEY`, y el rol del portal
 * (`prisma_asegura_portal`, sin BYPASSRLS) ni siquiera declara esa columna en su
 * schema. Darle la clave de PII a la app pública para que el cliente pueda
 * teclear su calle sería pagar el riesgo entero de la cartera por una comodidad.
 * Así que el portal manda lo que la persona escribió y lo escribe ESTA app, que
 * ya tiene la clave y ya sabe anotar en `historial_interno`.
 *
 * ─── Lo que hace que esta puerta sea estrecha ────────────────────────────────
 * 🚨 No recibe `clienteId`. Lo resuelve ella por `portal_vinculo` a partir de la
 * identidad, así que ni siquiera con el secreto en la mano se puede escribir en
 * una ficha cualquiera: solo en la que esa identidad tiene vinculada. Es la
 * diferencia con `ASEGURA_OPERADOR_SECRET`, que sí abre la cartera entera y por
 * eso NO se le da al portal.
 *
 * Y la ESCRITURA no devuelve NADA de la ficha: ni el nombre, ni lo que había
 * antes. Solo si se pudo aplicar. La única lectura que sale por aquí es
 * `estadoContactoPropio`, y sale ENMASCARADA (`··· ··· 512`, `m···@gmail.com`,
 * `Calle ···, 41003 Sevilla`): lo justo para reconocer el dato, calculado aquí
 * con la clave PII que el portal no tiene.
 */
import {
  decidirFichaPropia,
  enmascararDireccion,
  enmascararEmail,
  enmascararTelefono,
  estadoConfirmacion,
  textoHistorialConfirmacionContacto,
  textoHistorialContactoPropio,
  type EstadoConfirmacionContacto,
  type FichaPropia,
} from '@central/module-seguros-portal'
import { normalizarTelefono, revisarEdicion, type EdicionCliente } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import {
  anadirContacto,
  cambiarContacto,
  campoIlegible,
  descifrarCampo,
  editarCliente,
  listarContactos,
} from './cartera-edicion'

/** Quién figura como autor en `historial_interno`. No es Alberto: fue el cliente. */
const ACTOR = 'el cliente, desde el portal'

export type ResultadoContactoPropio =
  | { estado: 'ok'; campos: string[] }
  /** El cuerpo no pasa las mismas reglas que la edición del corredor. */
  | { estado: 'invalido'; motivo: string; campo: string | null }
  /**
   * El teléfono ya es el PRINCIPAL de otra ficha (índice único por hash en
   * `clientes.telefono`): no se puede escribir y lo resuelve el corredor. Sin
   * decir de quién: eso ya sería leer la cartera desde fuera.
   */
  | { estado: 'conflicto'; campo: 'telefono' }
  /** No hay nada que escribir: manda los mismos campos que ya tenía. */
  | { estado: 'sin_cambios' }
  /** Su identidad no está casada con ninguna ficha de la cartera. */
  | { estado: 'sin_ficha' }
  /** Está casada con varias: lo resuelve el corredor, no se adivina aquí. */
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/** Los `cliente_id` que esa identidad tiene vinculados en esta correduría. */
async function fichasDeIdentidad(correduriaId: string, identidadId: string): Promise<string[]> {
  const filas = await prismaAsegura().$queryRaw<{ cliente_id: string }[]>`
    select cliente_id
    from portal_vinculo
    where correduria_id = ${correduriaId}::uuid and identidad_id = ${identidadId}::uuid`
  return filas.map((f) => f.cliente_id)
}

/** Lo que el cliente puede corregir desde el portal: la dirección de contacto y su teléfono. */
export type CambiosContactoPropio = {
  libre?: NonNullable<EdicionCliente['libre']>
  /** Va aparte de `libre` a propósito: no es un campo de `EdicionCliente`, es un contacto de `cliente_telefonos`. */
  telefono?: string
}

/**
 * Aplica la dirección de contacto y/o el teléfono que ha escrito el cliente.
 *
 * `libre` trae SOLO los campos que la persona cambió (`undefined` = no lo tocó,
 * `null` = lo dejó en blanco a propósito). Esa distinción es la misma que usa la
 * edición del corredor y no se colapsa: con un `?? ''`, no tocar la ciudad y
 * borrarla serían el mismo gesto.
 *
 * El teléfono va por las MISMAS puertas que cuando lo toca Alberto
 * (`cambiarContacto` / `anadirContacto`): si la ficha tiene principal se
 * corrige ese —conservando id, fecha y orden, y re-espejando la columna única
 * de `clientes`—; si no lo tiene, se añade como principal. Se escribe ANTES que
 * la dirección porque es lo único que puede chocar con otra ficha (409): así un
 * conflicto no deja la calle cambiada a medias.
 *
 * Y quien corrige acaba de verificar: al salir `ok` se sella
 * `contacto_confirmado_at`, igual que si hubiera dicho «siguen igual».
 */
export async function aplicarContactoPropio(
  correduriaId: string,
  identidadId: string,
  cambios: CambiosContactoPropio,
): Promise<ResultadoContactoPropio> {
  const libre = cambios.libre ?? {}
  const camposLibre = Object.keys(libre)
  const tocaTelefono = cambios.telefono !== undefined
  if (camposLibre.length === 0 && !tocaTelefono) return { estado: 'sin_cambios' }

  // Las MISMAS reglas que cuando lo corrige Alberto (longitudes, forma del CP,
  // forma del teléfono). Reimplementarlas aquí sería tener dos vocabularios para
  // el mismo campo, y el día que uno cambie el portal aceptaría lo que la ficha
  // rechaza. Todo se valida ANTES de escribir nada: un teléfono mal escrito no
  // puede dejar la dirección ya cambiada.
  if (camposLibre.length > 0) {
    const r = revisarEdicion({ libre })
    if (!r.ok) return { estado: 'invalido', motivo: r.motivo, campo: r.campo ?? null }
  }
  let telefono: string | null = null
  if (tocaTelefono) {
    const t = normalizarTelefono(cambios.telefono)
    if (!t.ok) return { estado: 'invalido', motivo: t.motivo, campo: 'telefono' }
    telefono = t.valor
  }

  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha

  const campos: string[] = []

  if (telefono !== null) {
    const r = await escribirTelefonoPropio(correduriaId, ficha.clienteId, telefono)
    if (r) return r
    campos.push('telefono')
  }

  if (camposLibre.length > 0) {
    // `editarCliente` cifra la calle, escribe la ficha y deja la fila en
    // `historial_interno`. Lo único que se añade es una segunda anotación que
    // nombra al autor y avisa de que esto no ha salido hacia ninguna compañía.
    const res = await editarCliente(correduriaId, ficha.clienteId, { libre }, ACTOR)
    if (!res.ok) {
      if (res.estado === 'invalido') return { estado: 'invalido', motivo: res.motivo, campo: res.campo ?? null }
      if (res.estado === 'no_encontrado') return { estado: 'sin_ficha' }
      return { estado: 'error', causa: res.estado }
    }
    campos.push(...camposLibre)
  }

  await sellarConfirmacion(correduriaId, ficha.clienteId)
  await anotar(correduriaId, ficha.clienteId, textoHistorialContactoPropio(campos))
  return { estado: 'ok', campos }
}

/**
 * El teléfono del cliente por las puertas de `cartera-edicion`. `null` = escrito;
 * si no, el resultado con el que hay que contestar. El historial que dejan esas
 * funciones NO lleva el número (es su regla, no la nuestra).
 */
async function escribirTelefonoPropio(
  correduriaId: string,
  clienteId: string,
  telefono: string,
): Promise<ResultadoContactoPropio | null> {
  const actuales = await listarContactos(correduriaId, clienteId)
  if (actuales === null) return { estado: 'error', causa: 'contactos_ilegibles' }
  const principal = actuales.telefonos.find((t) => t.principal) ?? actuales.telefonos[0] ?? null
  const r = principal
    ? await cambiarContacto(correduriaId, clienteId, { id: principal.id, valor: telefono, principal: true, actor: ACTOR })
    : await anadirContacto(correduriaId, clienteId, { tipo: 'telefono', valor: telefono, principal: true, actor: ACTOR })
  if (r.ok) return null
  if (r.estado === 'invalido') return { estado: 'invalido', motivo: r.motivo, campo: 'telefono' }
  if (r.estado === 'conflicto') return { estado: 'conflicto', campo: 'telefono' }
  if (r.estado === 'no_encontrado') return { estado: 'sin_ficha' }
  return { estado: 'error', causa: r.estado }
}

/** Resuelve la ficha de la identidad; los tres desenlaces malos ya vienen con forma de resultado. */
async function fichaPropiaDe(
  correduriaId: string,
  identidadId: string,
): Promise<{ estado: 'ok'; clienteId: string } | { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }> {
  let ficha: FichaPropia
  try {
    ficha = decidirFichaPropia(await fichasDeIdentidad(correduriaId, identidadId))
  } catch (e) {
    // 🚨 No se colapsa con `sin_ficha`: «no he podido mirar sus vínculos» y «no
    // tiene ninguno» se arreglan en sitios distintos, y el segundo le diría al
    // cliente que no le consta ninguna póliza, que es una afirmación falsa.
    console.error('[contacto-portal] no se pudieron leer los vínculos:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'vinculos_ilegibles' }
  }
  if (ficha.estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (ficha.estado === 'varias_fichas') {
    console.warn(
      `[contacto-portal] identidad ${identidadId} vinculada a ${ficha.clienteIds.length} fichas ` +
        `(${ficha.clienteIds.join(', ')}); no se escribe en ninguna.`,
    )
    return { estado: 'varias_fichas' }
  }
  return ficha
}

/** `contacto_confirmado_at = now()`: el cliente acaba de mirar (o corregir) sus datos. */
async function sellarConfirmacion(correduriaId: string, clienteId: string): Promise<Date> {
  const ahora = new Date()
  await prismaAsegura().cliente.updateMany({
    where: { id: clienteId, correduriaId },
    data: { contactoConfirmadoAt: ahora },
  })
  return ahora
}

// ─── «Comprueba tus datos de contacto» ───────────────────────────────────────

type Mascara = { tiene: boolean; mascara: string | null }

export type EstadoContactoPropio =
  | {
      estado: 'ok'
      confirmadoEn: string | null
      confirmacion: EstadoConfirmacionContacto
      contacto: {
        direccion: Mascara
        telefono: Mascara
        /** `confirmadoPorAcceso`: el vínculo con esta ficha nació de casar ESTE correo (`portal_vinculo.origen = 'email_hash'`). */
        email: Mascara & { confirmadoPorAcceso: boolean }
      }
    }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/**
 * Lo que el portal enseña para preguntar «¿siguen igual?». Todo ENMASCARADO
 * aquí, con la clave PII que el portal no tiene: hacia fuera solo salen las
 * máscaras. Y con tres estados por dato: `tiene:false` = no consta ·
 * `tiene:true, mascara:null` = consta pero la clave no lo abre (ilegible) ·
 * `tiene:true, mascara` = reconocible. Un ilegible NO se pinta como «no tienes
 * teléfono»: le haría añadir uno que ya está.
 */
export async function estadoContactoPropio(correduriaId: string, identidadId: string): Promise<EstadoContactoPropio> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  try {
    const db = prismaAsegura()
    const [c, vinculo] = await Promise.all([
      db.cliente.findFirst({
        where: { id: ficha.clienteId, correduriaId, mergedIntoClienteId: null },
        select: {
          direccion: true,
          codigoPostal: true,
          ciudad: true,
          telefono: true,
          email: true,
          contactoConfirmadoAt: true,
          telefonos: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }], take: 1, select: { telefono: true } },
          emails: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }], take: 1, select: { email: true } },
        },
      }),
      db.portalVinculo.findFirst({
        where: { identidadId, clienteId: ficha.clienteId, correduriaId },
        select: { origen: true },
      }),
    ])
    if (!c) return { estado: 'sin_ficha' }

    // Principal de la tabla hija y, si no hay filas, el suelto de `clientes`
    // (3.000+ fichas del volcado están así). Mismo orden que `listarContactos`.
    const telefonoCrudo = c.telefonos[0]?.telefono ?? c.telefono ?? null
    const emailCrudo = c.emails[0]?.email ?? c.email ?? null

    const mascaraDe = (crudo: string | null, enmascarar: (v: string) => string): Mascara => {
      if (typeof crudo !== 'string' || crudo.trim() === '') return { tiene: false, mascara: null }
      if (campoIlegible(crudo)) return { tiene: true, mascara: null }
      const claro = descifrarCampo(crudo)
      return { tiene: true, mascara: claro && claro.trim() !== '' ? enmascarar(claro.trim()) : null }
    }

    const hayDireccion = [c.direccion, c.codigoPostal, c.ciudad].some((v) => typeof v === 'string' && v.trim() !== '')
    let direccion: Mascara = { tiene: false, mascara: null }
    if (hayDireccion) {
      direccion = campoIlegible(c.direccion)
        ? { tiene: true, mascara: null }
        : { tiene: true, mascara: enmascararDireccion(descifrarCampo(c.direccion), c.codigoPostal, c.ciudad) }
    }

    return {
      estado: 'ok',
      confirmadoEn: c.contactoConfirmadoAt?.toISOString() ?? null,
      confirmacion: estadoConfirmacion(c.contactoConfirmadoAt, new Date()),
      contacto: {
        direccion,
        telefono: mascaraDe(telefonoCrudo, enmascararTelefono),
        email: { ...mascaraDe(emailCrudo, enmascararEmail), confirmadoPorAcceso: vinculo?.origen === 'email_hash' },
      },
    }
  } catch (e) {
    console.error('[contacto-portal] no se pudo leer el contacto:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'contacto_ilegible' }
  }
}

export type ResultadoConfirmacionPropia =
  | { estado: 'ok'; confirmadoEn: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/**
 * El cliente dice «siguen igual»: se sella `contacto_confirmado_at` y queda en
 * el historial, sin valores. No se escribe ningún dato de contacto.
 */
export async function confirmarContactoPropio(correduriaId: string, identidadId: string): Promise<ResultadoConfirmacionPropia> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  let confirmadoEn: Date
  try {
    confirmadoEn = await sellarConfirmacion(correduriaId, ficha.clienteId)
  } catch (e) {
    console.error('[contacto-portal] no se pudo sellar la confirmación:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'sello_no_escrito' }
  }
  await anotar(correduriaId, ficha.clienteId, textoHistorialConfirmacionContacto())
  return { estado: 'ok', confirmadoEn: confirmadoEn.toISOString() }
}

/**
 * Anota en el historial de la ficha de esa identidad algo que ha HECHO el
 * cliente en el portal (hoy: una sugerencia). Es lo que hace que «todo lo que
 * haga el cliente» acabe en la pantalla donde Alberto lo mira.
 *
 * 🚨 Devuelve `sin_ficha` cuando su acceso no está casado con ninguna ficha, y
 * eso NO se colapsa con «anotado»: un lead no tiene historial donde dejar
 * rastro, así que quien llame tiene que saber que ahí no ha quedado constancia
 * de nada y buscarla en otro sitio (en la sugerencia, Telegram).
 */
export async function anotarActividadPortal(
  correduriaId: string,
  identidadId: string,
  texto: string,
): Promise<'ok' | 'sin_ficha' | 'varias_fichas' | 'error'> {
  let ficha: FichaPropia
  try {
    ficha = decidirFichaPropia(await fichasDeIdentidad(correduriaId, identidadId))
  } catch {
    return 'error'
  }
  if (ficha.estado !== 'ok') return ficha.estado === 'sin_ficha' ? 'sin_ficha' : 'varias_fichas'
  await anotar(correduriaId, ficha.clienteId, texto)
  return 'ok'
}

/**
 * La línea de bitácora. Best-effort a propósito, como el resto de anotaciones
 * del repo: el dato YA está guardado, y tumbar la respuesta porque no se pudo
 * escribir el renglón le diría al cliente que no se guardó algo que sí se
 * guardó. Lo que no se hace es callarlo: va al log del servidor.
 */
async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('contacto' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[contacto-portal] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
