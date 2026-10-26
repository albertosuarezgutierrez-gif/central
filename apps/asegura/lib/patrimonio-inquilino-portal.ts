// Patrimonio del portal (22/10/2026, paso 9) — el lado de ASEGURA del puente del inquilino
// (`app/api/portal/patrimonio/inquilino`): alta con la PII CIFRADA y lectura descifrada para el propietario.
//
// 🚨 El portal es la app pública. Lo que llega por el puente es `identidadId` + `contratoId` (o `inquilinoId`): NUNCA un
// titular ni una ficha. Aquí se resuelve el titular DESDE el contrato/inquilino (y su correduría, que tiene que ser la
// única de la base) y se RECALCULA el nivel de patrimonio de esa identidad sobre esa ficha con la MISMA regla pura que el
// portal (`nivelesPatrimonio` de `@central/module-patrimonio`, alimentada como `lib/patrimonio/accesos.ts` del portal):
//  - solo vínculos de ESA identidad que OPERAN (`puedeAutorizar`) y sin `origen='corredor'` (la vista de Alberto),
//  - el Dueño desde esos mismos vínculos (`empresasDelDueno`),
//  - autorizaciones `patrimonio_*` aceptadas y vigentes a ESA identidad o a una ficha suya que opera,
//  - y solo fichas vivas (activas, sin fusionar).
// Alta y lectura de PII exigen nivel `total` (tabla §4: `alta_baja` / `ver_pii_inquilino`). Lo que no cumple es
// `no_encontrado` (como «no existe»): ni con el secreto del puente en la mano se llega a otro titular.
//
// Las tablas `portal_patrimonio_*` no están en `prisma/asegura.prisma` a propósito (las modela el portal): SQL crudo
// parametrizado, sin prefijo de schema (el `search_path` lo da la URL, como `contacto-portal.ts`).
import {
  ALCANCE_PATRIMONIO_GESTION,
  ALCANCE_PATRIMONIO_TOTAL,
  nivelesPatrimonio,
  puede,
  type AccionPatrimonio,
} from '@central/module-patrimonio'
import { NIVELES, RELACION_DUENO, empresasDelDueno, puedeAutorizar, type FichaDueno, type Nivel } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { campoIlegible, descifrarCampo } from './cartera-edicion'
import { buscarDuplicadoPorNif, cifrarAltaInquilino, type AltaInquilinoPortal } from './patrimonio-inquilino-reglas'

const nivelDe = (v: string): Nivel => ((NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta')

/** ¿Puede ESTA identidad hacer `accion` sobre el patrimonio de la ficha `clienteId`? Fail-closed. */
export async function puedePatrimonio(
  correduriaId: string,
  identidadId: string,
  clienteId: string,
  accion: AccionPatrimonio,
): Promise<boolean> {
  const db = prismaAsegura()
  const vinculos = await db.portalVinculo.findMany({
    where: { identidadId, correduriaId },
    select: { clienteId: true, nivel: true, origen: true },
  })
  const queOperan = vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel)))
  const propias = [...new Set(queOperan.map((v) => v.clienteId))]

  let dueno: string[] = []
  if (propias.length > 0) {
    const relaciones = await db.clienteRelacion.findMany({
      where: { tipoRelacion: RELACION_DUENO, OR: [{ clienteAId: { in: propias } }, { clienteBId: { in: propias } }] },
      select: { clienteAId: true, clienteBId: true, tipoRelacion: true },
    })
    if (relaciones.length > 0) {
      const ids = [...new Set(relaciones.flatMap((r) => [r.clienteAId, r.clienteBId]))]
      const filas = await db.cliente.findMany({
        where: { id: { in: ids }, mergedIntoClienteId: null, activo: true },
        select: { id: true, tipoPersona: true, correduriaId: true },
      })
      const fichaPor = new Map<string, FichaDueno>(
        filas.map((f) => [
          f.id,
          { tipo: f.tipoPersona === 'juridica' ? 'juridica' : f.tipoPersona === 'fisica' ? 'fisica' : null, correduriaId: f.correduriaId },
        ]),
      )
      dueno = empresasDelDueno(propias, relaciones, fichaPor)
    }
  }

  // SQL crudo: el modelo `PortalAutorizacion` de este schema no declara `poliza_id`, y una autorización de patrimonio
  // con póliza concreta NO abre nada (la regla pura lo mira: hay que traerla).
  const filasAut = await db.$queryRaw<
    { otorgante_cliente_id: string; alcance: string; poliza_id: string | null; aceptado_en: Date | null; caduca_en: Date | null; revocado_en: Date | null }[]
  >`
    select otorgante_cliente_id::text as otorgante_cliente_id, alcance, poliza_id::text as poliza_id,
           aceptado_en, caduca_en, revocado_en
    from portal_autorizacion
    where correduria_id = ${correduriaId}::uuid
      and otorgante_cliente_id = ${clienteId}::uuid
      and alcance in (${ALCANCE_PATRIMONIO_GESTION}, ${ALCANCE_PATRIMONIO_TOTAL})
      and revocado_en is null
      and (autorizado_identidad_id = ${identidadId}::uuid or autorizado_cliente_id = any(${propias}::uuid[]))`
  const autorizaciones = filasAut.map((a) => ({
    otorganteClienteId: a.otorgante_cliente_id,
    alcance: a.alcance,
    polizaId: a.poliza_id,
    aceptadoEn: a.aceptado_en,
    caducaEn: a.caduca_en,
    revocadoEn: a.revocado_en,
  }))

  const viva = await db.cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null, activo: true },
    select: { id: true },
  })
  const niveles = nivelesPatrimonio({
    vinculadas: propias,
    dueno,
    autorizaciones,
    fichasVivas: new Set(viva ? [viva.id] : []),
    hoy: new Date(),
  })
  return puede(niveles.get(clienteId), accion)
}

export type ResultadoAltaPuente =
  | { estado: 'ok'; id: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_clave' }
  /** Ya hay un inquilino del mismo titular con ese documento: se PROPONE reutilizarlo (no se escribe nada). */
  | { estado: 'duplicado'; id: string; nombre: string }
  /** El inquilino reutilizado ya figura en este contrato. */
  | { estado: 'ya_en_contrato'; id: string }

/** Alta del inquilino en el contrato. El titular sale del CONTRATO, nunca del cuerpo. */
export async function altaInquilinoDesdePortal(correduriaId: string, d: AltaInquilinoPortal): Promise<ResultadoAltaPuente> {
  const db = prismaAsegura()
  const [c] = await db.$queryRaw<{ titular_id: string; cliente_id: string }[]>`
    select c.titular_id::text as titular_id, t.cliente_id::text as cliente_id
    from portal_patrimonio_contrato c
    join portal_patrimonio_titular t on t.id = c.titular_id
    where c.id = ${d.contratoId}::uuid and c.archivado_en is null
      and t.archivado_en is null and t.correduria_id = ${correduriaId}::uuid`
  if (!c) return { estado: 'no_encontrado' }
  if (!(await puedePatrimonio(correduriaId, d.identidadId, c.cliente_id, 'alta_baja'))) return { estado: 'no_encontrado' }

  // Cifrar ANTES de abrir la transacción: sin clave no se escribe nada (ni el nombre suelto).
  const pii = cifrarAltaInquilino(d)
  if (pii === null) return { estado: 'sin_clave' }

  // Duplicado por DOCUMENTO normalizado (nunca por nombre), dentro del MISMO titular. El NIF va cifrado con IV aleatorio y
  // no hay índice ciego del documento: se descifran los del titular aquí (hay pocos) y se comparan. lo que la persona acepta reutilizar (`reutilizarId`) se vuelve a derivar; un id del cuerpo no vale por sí solo.
  if (d.nif !== null) {
    const filas = await db.$queryRaw<{ id: string; nombre: string; tipo: string; nif_cifrado: string }[]>`
      select id::text as id, nombre, tipo, nif_cifrado from portal_patrimonio_inquilino
      where titular_id = ${c.titular_id}::uuid and archivado_en is null and nif_cifrado is not null
      limit 500`
    const dup = buscarDuplicadoPorNif(d.nif, filas.map((f) => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, nif: descifrarCampo(f.nif_cifrado) })))
    if (dup) {
      if (d.reutilizarId !== dup.id) return { estado: 'duplicado', id: dup.id, nombre: dup.nombre }
      return enlazarExistente(db, c.titular_id, d, dup.id)
    }
  }

  const id = await db.$transaction(async (tx) => {
    const [q] = await tx.$queryRaw<{ id: string }[]>`
      insert into portal_patrimonio_inquilino
        (titular_id, tipo, nombre, nif_cifrado, email_hash, email_cifrado, telefono_cifrado, creado_por_identidad_id)
      values (${c.titular_id}::uuid, ${d.tipo}, ${d.nombre}, ${pii.nifCifrado}, ${pii.emailHash}, ${pii.emailCifrado},
              ${pii.telefonoCifrado}, ${d.identidadId}::uuid)
      returning id::text as id`
    // FK compuesta (contrato, titular) e (inquilino, titular): la BD repite que son del MISMO titular.
    await tx.$executeRaw`
      insert into portal_patrimonio_contrato_inquilino (titular_id, contrato_id, inquilino_id, papel, creado_por_identidad_id)
      values (${c.titular_id}::uuid, ${d.contratoId}::uuid, ${q.id}::uuid, ${d.papel}, ${d.identidadId}::uuid)`
    return q.id
  })
  return { estado: 'ok', id }
}

/** Reutiliza al inquilino existente en este contrato (mismo titular: lo garantiza la FK compuesta de la BD). */
async function enlazarExistente(
  db: ReturnType<typeof prismaAsegura>,
  titularId: string,
  d: AltaInquilinoPortal,
  inquilinoId: string,
): Promise<ResultadoAltaPuente> {
  const [previo] = await db.$queryRaw<{ archivado_en: Date | null }[]>`
    select archivado_en from portal_patrimonio_contrato_inquilino
    where contrato_id = ${d.contratoId}::uuid and inquilino_id = ${inquilinoId}::uuid`
  if (previo && previo.archivado_en === null) return { estado: 'ya_en_contrato', id: inquilinoId }
  if (previo) {
    await db.$executeRaw`
      update portal_patrimonio_contrato_inquilino set archivado_en = null, papel = ${d.papel}, actualizado_en = now()
      where contrato_id = ${d.contratoId}::uuid and inquilino_id = ${inquilinoId}::uuid`
  } else {
    await db.$executeRaw`
      insert into portal_patrimonio_contrato_inquilino (titular_id, contrato_id, inquilino_id, papel, creado_por_identidad_id)
      values (${titularId}::uuid, ${d.contratoId}::uuid, ${inquilinoId}::uuid, ${d.papel}, ${d.identidadId}::uuid)`
  }
  return { estado: 'ok', id: inquilinoId }
}

export type ResultadoPiiPuente =
  | { estado: 'ok'; nif: string | null; email: string | null; telefono: string | null; ilegibles: string[] }
  | { estado: 'no_encontrado' }

/** PII descifrada para el propietario (nivel Total). `null` = no la dio; `ilegibles` = la hay pero no abre. */
export async function piiInquilinoParaPortal(correduriaId: string, identidadId: string, inquilinoId: string): Promise<ResultadoPiiPuente> {
  const db = prismaAsegura()
  const [q] = await db.$queryRaw<
    { cliente_id: string; nif_cifrado: string | null; email_cifrado: string | null; telefono_cifrado: string | null }[]
  >`
    select t.cliente_id::text as cliente_id, q.nif_cifrado, q.email_cifrado, q.telefono_cifrado
    from portal_patrimonio_inquilino q
    join portal_patrimonio_titular t on t.id = q.titular_id
    where q.id = ${inquilinoId}::uuid and q.archivado_en is null
      and t.archivado_en is null and t.correduria_id = ${correduriaId}::uuid`
  if (!q) return { estado: 'no_encontrado' }
  if (!(await puedePatrimonio(correduriaId, identidadId, q.cliente_id, 'ver_pii_inquilino'))) return { estado: 'no_encontrado' }
  // Traza de LECTURA (26/10/2026): quién (la identidad) y qué ficha (el inquilino), cuándo (`created_at`). Sin PII: solo ids.
  // FAIL-CLOSED: si no queda constancia, no se entrega el dato (un fallo aquí sube a la ruta como 503).
  await db.$executeRaw`
    insert into auditoria (actor_tipo, actor_id, metodo, ruta, estado_http, ids)
    values ('sistema', ${`portal:${identidadId}`}, 'GET', '/api/portal/patrimonio/inquilino', 200,
            ${JSON.stringify({ identidadId, inquilinoId })}::jsonb)`
  const ilegibles: string[] = []
  const leer = (campo: string, v: string | null) => {
    if (campoIlegible(v)) ilegibles.push(campo)
    return descifrarCampo(v)
  }
  return {
    estado: 'ok',
    nif: leer('nif', q.nif_cifrado),
    email: leer('email', q.email_cifrado),
    telefono: leer('telefono', q.telefono_cifrado),
    ilegibles,
  }
}
