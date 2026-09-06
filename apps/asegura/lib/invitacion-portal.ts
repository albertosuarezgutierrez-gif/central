/**
 * Invitar a un CLIENTE al portal, y —antes— saber si tiene sentido invitarle.
 *
 * ── El hueco que tapa (Alberto, 05/09/2026) ────────────────────────────────
 *
 * «No aparece el enviar invitación a la intranet.» No aparecía porque no
 * existía: el portal lleva funcionando desde el 01/09 y la única forma de entrar
 * era que el cliente supiera por su cuenta que está ahí. Ni un botón en la
 * ficha, ni un correo. Es la regla de `CLAUDE.md` —«un aviso que sale por un
 * canal que esa persona no abre es un aviso que no existe»— en su forma extrema:
 * el canal entero era invisible.
 *
 * ── 🚨 Lo que hace que esto no sea «mandar un correo y ya» ──────────────────
 *
 * El portal vincula a una persona con su ficha **por el índice ciego de su
 * email, y solo si no es ambiguo** (`elegirFicha`, en
 * `@central/module-seguros-portal`). Así que hay un modo de fallo peor que no
 * invitar: invitar a alguien cuyo correo NO va a resolver a su ficha. Recibe el
 * correo, entra, teclea su código… y ve una bóveda VACÍA, sin ningún error, como
 * si no tuviera pólizas. Le hemos dicho «aquí están tus seguros» y dentro no hay
 * nada.
 *
 * Por eso esto **predice antes de escribir**, y predice con la MISMA función que
 * el portal ejecutará después. Predecir con una copia de la regla sería peor que
 * no predecir: las dos darían 200 y divergirían en silencio. Es la razón por la
 * que `elegirFicha` subió al paquete compartido en este mismo cambio.
 *
 * Medido el 06/09/2026 sobre los 80 clientes de cartera viva, aplicando esta
 * misma función: **46 invitables** · **29 sin ningún correo** (los de «Clientes
 * sin canal») · **5 `resuelve_a_otra`** · **0 ambiguos**.
 *
 * ⚠️ Aquí ponía «51 invitables» hasta el 06/09/2026, y era una cifra mal
 * repartida: los 5 que resuelven a OTRA ficha se contaban como invitables. Son
 * el caso peor de toda esta pantalla —el cliente recibe el correo, entra, y ve
 * una bóveda que no es la suya— y no se arreglan pidiéndole el correo sino
 * resolviendo el duplicado. O sea: el freno no es la ambigüedad (hay 0), es
 * que a 29 no hay por dónde escribirles y que 5 tienen la ficha cruzada.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 *
 * **No da acceso a nada.** No escribe `portal_vinculo`, ni `portal_identidad`,
 * ni ninguna autorización: el acceso lo sigue abriendo el cliente probando que
 * es él con un código de un solo uso. Esto solo se lo cuenta. Si algún día
 * alguien quiere que el botón «dé de alta» al cliente, eso es otra cosa y hay
 * que decidirla aparte — saltarse la prueba de identidad desde el panel
 * convertiría un error de tecleo en el correo en un acceso a la cartera de otro.
 */
import { prediccionDeVinculo, type Candidato } from '@central/module-seguros-portal'
import { computeEmailLookupHash } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { estadoEmailDeFicha } from './email-ficha'
import { enlacePortal, enviarInvitacionPortal } from './correo-invitacion-portal'

/**
 * Qué se puede hacer hoy con esta ficha respecto al portal. Son SIETE estados a
 * propósito: cada uno se arregla en un sitio distinto, y colapsarlos en
 * «no se puede invitar» dejaría a Alberto sin saber si tiene que pedirle el
 * correo al cliente, resolver un duplicado o mirar una variable de Vercel.
 */
export type EstadoPortal =
  /** Ya hay alguien entrando con esa ficha. Se puede reenviar el enlace. */
  | 'ya_entra'
  /** Tiene correo y ese correo resuelve a ESTA ficha: se le puede invitar. */
  | 'invitable'
  /**
   * 🚨 Tiene correo, pero el portal no sabría a qué ficha vincularle (dos fichas
   * declaran ese email como suyo). Invitarle sería mandarle a una bóveda vacía.
   * Se arregla fusionando o corrigiendo la ficha duplicada, no reintentando.
   */
  | 'ambiguo'
  /**
   * Tiene correo, pero resuelve a OTRA ficha distinta de esta. Mismo daño que
   * `ambiguo` y misma causa de fondo: un duplicado sin resolver.
   */
  | 'resuelve_a_otra'
  /** No hay ninguna dirección a la que escribir (o se dio de baja de correo). */
  | 'sin_email'
  /**
   * Hay correo guardado y no se puede leer: falta `PII_ENCRYPTION_KEY` o es
   * otra. **No es «no tiene correo»** y se arregla en Vercel.
   */
  | 'ilegible'
  /**
   * No se ha podido comprobar (sin `PII_LOOKUP_KEY` no hay índice que consultar,
   * o la consulta falló). Nunca se colapsa con `invitable`: prometer que la
   * invitación va a funcionar sin haberlo mirado es justo lo que esto evita.
   */
  | 'no_comprobado'

export type FichaPortal = {
  estado: EstadoPortal
  /**
   * Última vez que alguien entró al portal con esta ficha. `null` = no consta
   * (nunca ha entrado, o la identidad no tiene la marca). Solo se rellena en
   * `ya_entra`.
   */
  ultimoAccesoEn: string | null
  /** Cuántas identidades hay vinculadas a esta ficha. `null` = no se pudo contar. */
  identidades: number | null
}

export type FalloInvitacion =
  | 'no_encontrado'
  | 'sin_email'
  | 'ilegible'
  | 'ambiguo'
  | 'resuelve_a_otra'
  | 'sin_portal'
  | 'no_comprobado'
  | 'error_envio'

export type ResultadoInvitacion =
  | { ok: true; yaEntraba: boolean }
  | { ok: false; estado: FalloInvitacion; motivo: string; status: 404 | 409 | 422 | 502 | 503 }

/**
 * Los candidatos que el portal encontraría para ese email: su columna principal
 * (`clientes.email_lookup_hash`) y la lista de contacto (`cliente_emails`).
 *
 * ⚠️ Se busca en TODA la base, no solo en esta correduría, por la misma razón
 * que lo hace el portal: si el mismo email vive en otra ficha, el empate existe
 * igual y no verlo sería predecir mejor de lo que la realidad va a ser.
 * Las lápidas (`merged_into_cliente_id`) se descartan por los dos caminos, como
 * allí: la ficha viva es la que absorbió.
 */
async function candidatosDe(hash: string): Promise<Candidato[]> {
  const db = prismaAsegura()
  const [porColumna, porContacto] = await Promise.all([
    db.cliente.findMany({
      where: { emailLookupHash: hash, mergedIntoClienteId: null },
      select: { id: true, correduriaId: true },
    }),
    db.clienteEmail.findMany({
      where: { emailLookupHash: hash, cliente: { mergedIntoClienteId: null } },
      select: { clienteId: true, correduriaId: true },
    }),
  ])
  return [
    ...porColumna.map((c) => ({ clienteId: c.id, correduriaId: c.correduriaId, principal: true })),
    ...porContacto.map((e) => ({ clienteId: e.clienteId, correduriaId: e.correduriaId, principal: false })),
  ]
}

/** Las identidades que ya entran con esta ficha, y cuándo lo hicieron por última vez. */
async function accesoDe(
  correduriaId: string,
  clienteId: string,
): Promise<{ identidades: number; ultimoAccesoEn: Date | null } | null> {
  try {
    const db = prismaAsegura()
    const vinculos = await db.portalVinculo.findMany({
      where: { correduriaId, clienteId },
      select: { identidadId: true },
    })
    if (vinculos.length === 0) return { identidades: 0, ultimoAccesoEn: null }
    const ids = await db.portalIdentidad.findMany({
      where: { id: { in: vinculos.map((v) => v.identidadId) } },
      select: { ultimoAccesoEn: true },
    })
    const fechas = ids.map((i) => i.ultimoAccesoEn).filter((d): d is Date => d instanceof Date)
    const ultimo = fechas.length > 0 ? fechas.reduce((a, d) => (d > a ? d : a), fechas[0]) : null
    return { identidades: vinculos.length, ultimoAccesoEn: ultimo }
  } catch (e) {
    // `null` = no se pudo contar. Devolver 0 diría «no entra nadie», que es una
    // afirmación, y sobre ella se decide si invitar.
    console.error('[invitacion-portal] no se pudo leer el vínculo del portal:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * ¿Qué se puede hacer hoy con esta ficha? Es lo que la pantalla pinta ANTES de
 * ofrecer el botón, para que Alberto no invite a quien va a acabar mirando una
 * bóveda vacía ni le mande a alguien que entró ayer un «ya puedes entrar».
 */
export async function estadoPortalDeFicha(correduriaId: string, clienteId: string): Promise<FichaPortal | null> {
  const acceso = await accesoDe(correduriaId, clienteId)

  if (acceso && acceso.identidades > 0) {
    return {
      estado: 'ya_entra',
      ultimoAccesoEn: acceso.ultimoAccesoEn ? acceso.ultimoAccesoEn.toISOString() : null,
      identidades: acceso.identidades,
    }
  }
  const identidades = acceso ? acceso.identidades : null

  let correo: Awaited<ReturnType<typeof estadoEmailDeFicha>>
  try {
    correo = await estadoEmailDeFicha(correduriaId, clienteId)
  } catch (e) {
    console.error('[invitacion-portal] no se pudo leer el correo de la ficha:', e instanceof Error ? e.message : e)
    return { estado: 'no_comprobado', ultimoAccesoEn: null, identidades }
  }
  if (correo.estado === 'no_encontrado') return null
  if (correo.estado === 'sin_email' || correo.estado === 'baja_de_correo') {
    return { estado: 'sin_email', ultimoAccesoEn: null, identidades }
  }
  if (correo.estado === 'ilegible') return { estado: 'ilegible', ultimoAccesoEn: null, identidades }

  const prediccion = await prediccionVinculo(correo.email, clienteId)
  return { estado: prediccion, ultimoAccesoEn: null, identidades }
}

/**
 * Lo que el portal decidiría con ese correo, calculado con SU misma función.
 * Cualquier tropiezo devuelve `no_comprobado`, nunca `invitable`.
 */
async function prediccionVinculo(
  email: string,
  clienteId: string,
): Promise<'invitable' | 'ambiguo' | 'resuelve_a_otra' | 'no_comprobado'> {
  // 🚨 `computeEmailLookupHash` NORMALIZA POR DENTRO, así que se le pasa el
  // correo crudo. Normalizarlo aquí antes sería una segunda ruta de
  // normalización, y dos normalizaciones que se separen un día producen hashes
  // distintos para el mismo correo: el portal encontraría la ficha y esta
  // predicción diría que no, o al revés. Es el contrato de sincronía que el
  // propio paquete declara en su cabecera.
  //
  // Devuelve `null` en dos casos que aquí significan lo mismo —no se puede
  // afirmar nada—: sin `PII_LOOKUP_KEY`, y cuando lo guardado no tiene forma de
  // correo. Y LANZA si la clave existe pero está mal formada. Los tres frenan
  // en `no_comprobado`: lo que no se puede comprobar no se promete.
  let hash: string | null
  try {
    hash = computeEmailLookupHash(email)
  } catch (e) {
    console.error('[invitacion-portal] la clave del índice ciego está mal formada:', e instanceof Error ? e.message : e)
    return 'no_comprobado'
  }
  if (hash === null) {
    console.error('[invitacion-portal] sin índice ciego para ese correo (falta clave o no tiene forma de email)')
    return 'no_comprobado'
  }

  let candidatos: Candidato[]
  try {
    candidatos = await candidatosDe(hash)
  } catch (e) {
    console.error('[invitacion-portal] no se pudieron leer los candidatos:', e instanceof Error ? e.message : e)
    return 'no_comprobado'
  }
  // La decisión vive en `@central/module-seguros-portal` y la comparte con la
  // lista de contactabilidad: dos copias de esta regla darían dos respuestas
  // distintas sobre el mismo cliente sin que fallara nada.
  return prediccionDeVinculo(candidatos, clienteId)
}

/** El nombre de la ficha, para el saludo. `null` = no hay uno legible. */
async function nombreDe(correduriaId: string, clienteId: string): Promise<string | null> {
  const c = await prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: { nombre: true, apellidos: true },
  })
  if (!c) return null
  const n = [c.nombre, c.apellidos].filter((s) => typeof s === 'string' && s.trim() !== '').join(' ').trim()
  return n === '' ? null : n
}

/**
 * Manda la invitación. Comprueba lo mismo que `estadoPortalDeFicha` **otra vez**
 * y no se fía de lo que la pantalla creyera: entre que se pintó el botón y se
 * pulsó pueden haber pasado minutos, y el estado lo decide quien escribe.
 */
export async function invitarAlPortal(
  correduriaId: string,
  entrada: { clienteId: string; actor: string },
): Promise<ResultadoInvitacion> {
  const estado = await estadoPortalDeFicha(correduriaId, entrada.clienteId)
  if (estado === null) {
    return { ok: false, estado: 'no_encontrado', motivo: 'Esa ficha no existe en esta correduría.', status: 404 }
  }
  switch (estado.estado) {
    case 'sin_email':
      return {
        ok: false,
        estado: 'sin_email',
        motivo:
          'Esa ficha no tiene ningún correo al que escribir (o está de baja de correo). Añádeselo y vuelve a intentarlo.',
        status: 422,
      }
    case 'ilegible':
      return {
        ok: false,
        estado: 'ilegible',
        motivo:
          'El correo está guardado pero cifrado con una clave que no se puede abrir. Se arregla en las variables de Vercel, no llamando al cliente.',
        status: 422,
      }
    case 'ambiguo':
      return {
        ok: false,
        estado: 'ambiguo',
        motivo:
          'Ese correo está declarado como suyo en más de una ficha: el portal no sabría cuál enseñarle y entraría a una bóveda vacía. Resuelve el duplicado antes de invitarle.',
        status: 409,
      }
    case 'resuelve_a_otra':
      return {
        ok: false,
        estado: 'resuelve_a_otra',
        motivo:
          'Con ese correo el portal no le llevaría a esta ficha, así que entraría y no vería sus pólizas. Revisa si hay una ficha duplicada.',
        status: 409,
      }
    case 'no_comprobado':
      return {
        ok: false,
        estado: 'no_comprobado',
        motivo:
          'No se ha podido comprobar si ese correo le llevaría a su ficha, así que no se manda nada: una invitación a ciegas puede acabar en un portal vacío.',
        status: 503,
      }
  }

  const enlace = enlacePortal()
  if (!enlace) {
    return {
      ok: false,
      estado: 'sin_portal',
      motivo: 'No hay una dirección de portal configurada (ASEGURA_PORTAL_URL): el correo no tendría a dónde llevar.',
      status: 503,
    }
  }

  const correo = await estadoEmailDeFicha(correduriaId, entrada.clienteId)
  if (correo.estado !== 'ok') {
    // No debería llegar aquí (el estado ya lo comprobó), pero el destino no se
    // deduce de un estado calculado antes: se vuelve a leer.
    return { ok: false, estado: 'sin_email', motivo: 'No hay dirección a la que escribir.', status: 422 }
  }

  const yaEntraba = estado.estado === 'ya_entra'
  const enviado = await enviarInvitacionPortal(correo.email, {
    nombre: await nombreDe(correduriaId, entrada.clienteId),
    enlace,
    yaEntraba,
  })
  if (!enviado) {
    return {
      ok: false,
      estado: 'error_envio',
      motivo: 'No se ha podido enviar el correo. El cliente puede entrar igualmente desde el portal con su dirección.',
      status: 502,
    }
  }

  await anotar(
    correduriaId,
    entrada.clienteId,
    yaEntraba
      ? `Se le reenvió por correo el enlace del portal (${entrada.actor}).`
      : `Se le invitó por correo al portal del cliente (${entrada.actor}).`,
  )
  return { ok: true, yaEntraba }
}

/**
 * Deja constancia de que se le contó. Best-effort a propósito: el correo ya ha
 * salido y un historial caído no puede deshacerlo ni presentarlo como fallido.
 *
 * 🚨 Sin la dirección dentro: un historial es donde un dato personal sobrevive
 * más tiempo, y aquí lo que hace falta saber es SI se le avisó y cuándo, no a
 * dónde — eso ya está en su ficha.
 */
async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('contacto' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[invitacion-portal] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
