/**
 * Aplicar a la cartera los datos de CONTACTO que corrige el propio cliente
 * desde `apps/asegura-portal` (dirección; y desde el 09/09/2026 teléfono y
 * correo), y leérselos de vuelta para que los vea.
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
 * La ESCRITURA no devuelve nada de la ficha: solo si se pudo aplicar. La
 * LECTURA (`leerContactoPropio`, 09/09/2026) devuelve exactamente lo que el
 * cliente puede corregir —su dirección de contacto, su teléfono y su correo
 * principales— y nada más: ni el nombre, ni el DNI, ni las notas del corredor.
 *
 * ─── «Comprueba tus datos de contacto» (08/09/2026, adaptado 09/09/2026) ─────
 * La cartera viene de un volcado de junio/2026: nadie ha vuelto a preguntarle
 * al cliente si su contacto sigue siendo el mismo. Además de poder EDITAR (lo
 * de arriba), la ficha guarda `contacto_confirmado_at` — cuándo dijo por
 * última vez «sigue siendo el mío», a mano (`confirmarContactoPropio`) o de
 * hecho, al corregir algo (`aplicarContactoPropio` sella al salir `ok`). La
 * lectura devuelve también ese estado para que el portal decida si merece la
 * pena preguntar (`estadoConfirmacion` de `@central/module-seguros-portal`:
 * `nunca` ≠ `caducada`, y ninguna de las dos es «confirmado»).
 */
import {
  CAMPOS_CANAL_PROPIO,
  CAMPOS_DIRECCION_PROPIA,
  decidirFichaPropia,
  estadoConfirmacion,
  textoHistorialConfirmacionContacto,
  textoHistorialContactoPropio,
  type CampoCanalPropio,
  type CampoDireccionPropia,
  type EstadoConfirmacionContacto,
  type FichaPropia,
} from '@central/module-seguros-portal'
import { normalizarContacto, revisarEdicion, type EdicionCliente } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import {
  anadirContacto,
  campoIlegible,
  descifrarCampo,
  duplicadoContacto,
  editarCliente,
  listarContactos,
} from './cartera-edicion'

/** Quién figura como autor en `historial_interno`. No es Alberto: fue el cliente. */
const ACTOR = 'el cliente, desde el portal'

/**
 * «El canal que el cliente ve como suyo hoy», usado en LOS DOS sentidos —
 * leerlo (`leerContactoPropio`) y decidir si lo que manda ya es ese mismo
 * valor (`aplicarContactoPropio`). Con dos criterios distintos, un teléfono
 * importado del volcado (filas sin `esPrincipal` marcado, plausible en
 * fichas antiguas) se LEE como el primero de la lista pero se ESCRIBE contra
 * «ninguno es principal» — la persona reenvía el mismo número que ya veía en
 * pantalla y esto lo trata como un cambio, dejando una fila duplicada.
 */
function contactoPrincipal(lista: { principal: boolean; valor: string | null }[]): string | null {
  return (lista.find((x) => x.principal) ?? lista[0])?.valor ?? null
}

export type ResultadoContactoPropio =
  | { estado: 'ok'; campos: string[] }
  /** El cuerpo no pasa las mismas reglas que la edición del corredor. */
  | { estado: 'invalido'; motivo: string; campo: string | null }
  /**
   * El teléfono o el correo que escribió YA está en OTRA ficha de la cartera.
   * No se fuerza desde el portal: dos fichas con el mismo principal es justo lo
   * que la BD prohíbe, y quién se queda con él lo decide el corredor.
   */
  | { estado: 'en_otra_ficha'; campo: CampoCanalPropio }
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

/** Resuelve la ficha de la identidad; el error de vínculos NO se colapsa con `sin_ficha`. */
async function fichaPropiaDe(
  correduriaId: string,
  identidadId: string,
): Promise<{ estado: 'ok'; clienteId: string } | { estado: 'sin_ficha' } | { estado: 'varias_fichas' } | { estado: 'error'; causa: string }> {
  let ficha: FichaPropia
  try {
    ficha = decidirFichaPropia(await fichasDeIdentidad(correduriaId, identidadId))
  } catch (e) {
    console.error('[contacto-portal] no se pudieron leer los vínculos:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'vinculos_ilegibles' }
  }
  if (ficha.estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (ficha.estado === 'varias_fichas') {
    console.warn(
      `[contacto-portal] identidad ${identidadId} vinculada a ${ficha.clienteIds.length} fichas ` +
        `(${ficha.clienteIds.join(', ')}); no se escribe/lee en ninguna.`,
    )
    return { estado: 'varias_fichas' }
  }
  return ficha
}

/** Lo que el cliente puede mandar: su dirección de contacto y sus dos canales. */
export type EntradaContactoPropio = Partial<Record<CampoDireccionPropia, string | null>> &
  Partial<Record<CampoCanalPropio, string>>

/**
 * Aplica los datos de contacto que ha escrito el cliente.
 *
 * `entrada` trae SOLO los campos que la persona cambió (`undefined` = no lo
 * tocó, `null` = lo dejó en blanco a propósito). Esa distinción es la misma que
 * usa la edición del corredor y no se colapsa: con un `?? ''`, no tocar la
 * ciudad y borrarla serían el mismo gesto.
 *
 * Dos caminos, porque en la ficha son dos cosas:
 *  - la DIRECCIÓN son columnas de `clientes` → `editarCliente`, con las mismas
 *    reglas que cuando lo corrige Alberto;
 *  - el TELÉFONO y el CORREO son filas de `cliente_telefonos` / `cliente_emails`
 *    → `anadirContacto` como principal, que es lo que baja el anterior a
 *    secundario (no se pierde: sigue en la ficha) y lo que detecta que ese
 *    número ya está en OTRA ficha. El anterior no se borra a propósito: desde
 *    el portal se cambia el principal, no se destruye un canal.
 *
 * 🚨 Un canal que no cambia no se reescribe: si manda el mismo número que ya es
 * su principal, se cuenta como «sin cambios» y no deja una fila nueva.
 *
 * Y quien corrige acaba de verificar: al salir `ok` se sella
 * `contacto_confirmado_at`, igual que si hubiera dicho «siguen igual».
 */
export async function aplicarContactoPropio(
  correduriaId: string,
  identidadId: string,
  entrada: EntradaContactoPropio,
): Promise<ResultadoContactoPropio> {
  const libre: NonNullable<EdicionCliente['libre']> = {}
  for (const k of CAMPOS_DIRECCION_PROPIA) if (k in entrada && entrada[k] !== undefined) libre[k] = entrada[k] ?? null
  const canales: Partial<Record<CampoCanalPropio, string>> = {}
  for (const k of CAMPOS_CANAL_PROPIO) if (typeof entrada[k] === 'string') canales[k] = entrada[k]

  if (Object.keys(libre).length === 0 && Object.keys(canales).length === 0) return { estado: 'sin_cambios' }

  // Las MISMAS reglas que cuando lo corrige Alberto (longitudes, forma del CP,
  // forma del teléfono y del correo). Reimplementarlas aquí sería tener dos
  // vocabularios para el mismo campo, y el día que uno cambie el portal
  // aceptaría lo que la ficha rechaza. Se revisa TODO antes de escribir NADA:
  // un correo mal escrito no puede dejar la calle a medio guardar.
  if (Object.keys(libre).length > 0) {
    const r = revisarEdicion({ libre })
    if (!r.ok) return { estado: 'invalido', motivo: r.motivo, campo: r.campo ?? null }
  }
  const canalesNorm: Partial<Record<CampoCanalPropio, string>> = {}
  for (const k of CAMPOS_CANAL_PROPIO) {
    const v = canales[k]
    if (v === undefined) continue
    const n = normalizarContacto(k, v)
    if (!n.ok) return { estado: 'invalido', motivo: n.motivo, campo: k }
    canalesNorm[k] = n.valor
  }

  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha

  const aplicados: string[] = []

  // Los canales, ANTES que la dirección: es donde puede saltar «ya está en otra
  // ficha», y si salta no se ha escrito nada todavía.
  const actuales = Object.keys(canalesNorm).length > 0 ? await listarContactos(correduriaId, ficha.clienteId) : null
  // Qué canales cambian de verdad (el que ya es principal y coincide no cuenta).
  const canalesACambiar: { k: CampoCanalPropio; valor: string }[] = []
  for (const k of CAMPOS_CANAL_PROPIO) {
    const valor = canalesNorm[k]
    if (valor === undefined) continue
    const listaActual = k === 'telefono' ? actuales?.telefonos : actuales?.emails
    const principal = listaActual ? contactoPrincipal(listaActual) : null
    if (principal !== null && principal === valor) continue
    canalesACambiar.push({ k, valor })
  }
  // 🚨 Se COMPRUEBAN los dos canales ANTES de escribir el primero. Si esto
  // escribiera uno a uno y el segundo chocara con otra ficha, el teléfono ya
  // habría quedado guardado mientras la persona lee «no se ha cambiado nada»
  // — justo lo que este módulo promete que no pasa con la dirección.
  for (const { k, valor } of canalesACambiar) {
    const choque = await duplicadoContacto(correduriaId, ficha.clienteId, k, valor, true, false)
    if (choque) return { estado: 'en_otra_ficha', campo: k }
  }
  for (const { k, valor } of canalesACambiar) {
    const res = await anadirContacto(correduriaId, ficha.clienteId, { tipo: k, valor, principal: true, actor: ACTOR })
    if (!res.ok) {
      // El choque ya se descartó arriba: llegar aquí es una carrera con otra
      // escritura entre la comprobación y el alta, no el caso normal.
      if (res.estado === 'conflicto') return { estado: 'en_otra_ficha', campo: k }
      if (res.estado === 'invalido') return { estado: 'invalido', motivo: res.motivo, campo: k }
      if (res.estado === 'no_encontrado') return { estado: 'sin_ficha' }
      return { estado: 'error', causa: res.estado }
    }
    aplicados.push(k)
  }

  if (Object.keys(libre).length > 0) {
    // `editarCliente` cifra la calle, escribe la ficha y deja la fila en
    // `historial_interno`.
    const res = await editarCliente(correduriaId, ficha.clienteId, { libre }, ACTOR)
    if (!res.ok) {
      if (res.estado === 'invalido') return { estado: 'invalido', motivo: res.motivo, campo: res.campo ?? null }
      if (res.estado === 'no_encontrado') return { estado: 'sin_ficha' }
      return { estado: 'error', causa: res.estado }
    }
    aplicados.push(...Object.keys(libre))
  }

  if (aplicados.length === 0) return { estado: 'sin_cambios' }
  // Una segunda anotación que nombra al autor y avisa de que esto no ha salido
  // hacia ninguna compañía.
  await anotar(correduriaId, ficha.clienteId, textoHistorialContactoPropio(aplicados))
  // Quien acaba de corregir un dato acaba de VERIFICARLO: cuenta como confirmar.
  await sellarConfirmacion(correduriaId, ficha.clienteId)
  return { estado: 'ok', campos: aplicados }
}

/** Lo que el cliente ve de sí mismo en «Mis datos». `null` = no consta. */
export type ContactoPropio = Record<CampoDireccionPropia | CampoCanalPropio, string | null>

export type LecturaContactoPropio =
  /**
   * `ilegibles`: campos que HAY pero no se han podido descifrar. No son «no
   * consta». `confirmadoEn`/`confirmacion` vienen de `contacto_confirmado_at`
   * (ver cabecera del módulo): `null` = nunca se ha confirmado desde el volcado.
   */
  | {
      estado: 'ok'
      contacto: ContactoPropio
      ilegibles: string[]
      confirmadoEn: string | null
      confirmacion: EstadoConfirmacionContacto
    }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/**
 * Lo que la ficha tiene de contacto de ESA identidad, para que pueda verlo y
 * corregirlo (09/09/2026; Alberto: «ver sus datos de contacto… pudiendo
 * modificarlos»).
 *
 * 🚨 Esto REVISA la decisión del 08/09/2026 («el portal NO lee de vuelta»), y lo
 * que se conserva de ella es lo que importaba: el portal sigue SIN clave de
 * PII. Descifra esta app, y solo para la ficha que esa identidad tiene
 * vinculada por `portal_vinculo` — con varias fichas no se adivina y no se
 * devuelve nada. Una sesión del portal ya enseña las pólizas, las primas y la
 * dirección del riesgo de esa persona; su propio teléfono no es un dato más
 * sensible que eso.
 *
 * Solo el PRINCIPAL de cada canal: es el que usa el cron de avisos y el que
 * corrige el cliente. Los secundarios son cosa de la ficha del corredor.
 */
export async function leerContactoPropio(correduriaId: string, identidadId: string): Promise<LecturaContactoPropio> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha

  try {
    const [c, contactos] = await Promise.all([
      prismaAsegura().cliente.findFirst({
        where: { id: ficha.clienteId, correduriaId, mergedIntoClienteId: null },
        select: { direccion: true, codigoPostal: true, ciudad: true, provincia: true, contactoConfirmadoAt: true },
      }),
      listarContactos(correduriaId, ficha.clienteId),
    ])
    if (!c) return { estado: 'sin_ficha' }
    if (contactos === null) return { estado: 'error', causa: 'contactos_ilegibles' }
    const ilegibles: string[] = []
    if (campoIlegible(c.direccion)) ilegibles.push('direccion')
    // Misma regla que decide «cuál es el canal actual» al escribir
    // (`contactoPrincipal`): las dos tienen que coincidir, o un reenvío del
    // mismo número que aquí se enseña se leería allí como un cambio.
    const marcarSiIlegible = (lista: { principal: boolean; ilegible: boolean }[], campo: string) => {
      const p = lista.find((x) => x.principal) ?? lista[0]
      if (p?.ilegible) ilegibles.push(campo)
    }
    marcarSiIlegible(contactos.telefonos, 'telefono')
    marcarSiIlegible(contactos.emails, 'email')
    return {
      estado: 'ok',
      contacto: {
        direccion: descifrarCampo(c.direccion),
        codigoPostal: c.codigoPostal ?? null,
        ciudad: c.ciudad ?? null,
        provincia: c.provincia ?? null,
        telefono: contactoPrincipal(contactos.telefonos),
        email: contactoPrincipal(contactos.emails),
      },
      ilegibles,
      confirmadoEn: c.contactoConfirmadoAt ? c.contactoConfirmadoAt.toISOString() : null,
      confirmacion: estadoConfirmacion(c.contactoConfirmadoAt, new Date()),
    }
  } catch (e) {
    console.error('[contacto-portal] no se pudo leer la ficha:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'ficha_ilegible' }
  }
}

export type ResultadoConfirmarContacto =
  | { estado: 'ok'; confirmadoEn: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/**
 * «Siguen igual»: el cliente dice que su contacto sigue siendo correcto SIN
 * cambiar nada. Sella `contacto_confirmado_at = now()` y lo deja en el
 * historial — sin valores, como toda anotación de esta puerta.
 */
export async function confirmarContactoPropio(correduriaId: string, identidadId: string): Promise<ResultadoConfirmarContacto> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha
  try {
    const ahora = await sellarConfirmacion(correduriaId, ficha.clienteId)
    await anotar(correduriaId, ficha.clienteId, textoHistorialConfirmacionContacto())
    return { estado: 'ok', confirmadoEn: ahora.toISOString() }
  } catch (e) {
    console.error('[contacto-portal] no se pudo sellar la confirmación:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'sello_fallido' }
  }
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
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha.estado === 'error' ? 'error' : ficha.estado
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
