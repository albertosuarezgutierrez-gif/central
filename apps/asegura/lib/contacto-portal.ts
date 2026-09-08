/**
 * Aplicar a la cartera el cambio de dirección de CONTACTO que hace el propio
 * cliente desde `apps/asegura-portal`.
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
 * Y no devuelve NADA de la ficha: ni el nombre, ni lo que había antes, ni si la
 * dirección estaba vacía. Solo si se pudo aplicar. Un puerto que contestara «no
 * había dirección» ya sería una lectura de la cartera desde fuera.
 */
import {
  decidirFichaPropia,
  textoHistorialContactoPropio,
  type FichaPropia,
} from '@central/module-seguros-portal'
import { revisarEdicion, type EdicionCliente } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { editarCliente } from './cartera-edicion'

/** Quién figura como autor en `historial_interno`. No es Alberto: fue el cliente. */
const ACTOR = 'el cliente, desde el portal'

export type ResultadoContactoPropio =
  | { estado: 'ok'; campos: string[] }
  /** El cuerpo no pasa las mismas reglas que la edición del corredor. */
  | { estado: 'invalido'; motivo: string; campo: string | null }
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

/**
 * Aplica la dirección de contacto que ha escrito el cliente.
 *
 * `libre` trae SOLO los campos que la persona cambió (`undefined` = no lo tocó,
 * `null` = lo dejó en blanco a propósito). Esa distinción es la misma que usa la
 * edición del corredor y no se colapsa: con un `?? ''`, no tocar la ciudad y
 * borrarla serían el mismo gesto.
 */
export async function aplicarContactoPropio(
  correduriaId: string,
  identidadId: string,
  libre: NonNullable<EdicionCliente['libre']>,
): Promise<ResultadoContactoPropio> {
  const campos = Object.keys(libre)
  if (campos.length === 0) return { estado: 'sin_cambios' }

  // Las MISMAS reglas que cuando lo corrige Alberto (longitudes, forma del CP).
  // Reimplementarlas aquí sería tener dos vocabularios para el mismo campo, y el
  // día que uno cambie el portal aceptaría lo que la ficha rechaza.
  const r = revisarEdicion({ libre })
  if (!r.ok) return { estado: 'invalido', motivo: r.motivo, campo: r.campo ?? null }

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

  // `editarCliente` cifra la calle, escribe la ficha y deja la fila en
  // `historial_interno`. Lo único que se añade es una segunda anotación que
  // nombra al autor y avisa de que esto no ha salido hacia ninguna compañía.
  const res = await editarCliente(correduriaId, ficha.clienteId, { libre }, ACTOR)
  if (!res.ok) {
    if (res.estado === 'invalido') return { estado: 'invalido', motivo: res.motivo, campo: res.campo ?? null }
    if (res.estado === 'no_encontrado') return { estado: 'sin_ficha' }
    return { estado: 'error', causa: res.estado }
  }

  await anotar(correduriaId, ficha.clienteId, textoHistorialContactoPropio(campos))
  return { estado: 'ok', campos }
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
