/**
 * Regularización de RC — FASE 3 (03/11/2026): responder a la COMPAÑÍA con la cifra que dio el cliente, y cerrar.
 *   1. Cuando la solicitud pasa a `completada` (el cliente rellenó el enlace), `prepararRespuestaCompania` deja el BORRADOR
 *      (asunto + texto CIFRADO con la cifra en formato español) y lo propone a Alberto por Telegram: ✅ Enviar a la compañía
 *      (solo si hay buzón elegido) · ✏️ Modificar (texto y/o «Para: correo») · 🏁 Regularización resuelta.
 *   2. 🚨 El destinatario NO se elige solo. Occident escribe desde `occidentinforma.com` (avisos sin buzón de respuesta, a
 *      su vez dirigidos al Gmail de Alberto: responder «en el hilo» no llega a nadie de la compañía) y su canal oficial es
 *      «ingresar el suplemento» en su portal de mediadores. El buzón lo ELIGE Alberto con ✏️ «Para: …» y solo vale uno de
 *      los contactos ACTIVOS de esa compañía en el Directorio (`compania_contactos` por el DGS de la póliza). Sin él, el
 *      borrador queda con destinatario PENDIENTE, Telegram lo dice y no hay ✅.
 *   3. ✅ (`decidirRespuestaCompania`): reclama la fila (borrador → enviando, condicionada por `compania_version`): un ✅ de
 *      un mensaje viejo (tras ✏️) es `obsoleta`; un doble clic no manda dos correos.
 *   4. 🏁 (`resolverRegularizacion`): sella `resuelta_at` y cierra la tarea del agente de correo de esa póliza + periodo.
 *      MANUAL a propósito: no hay ningún correo REAL de Occident que confirme el suplemento emitido para reconocerlo solo.
 *
 * Sin las columnas de `prisma/sql/2026-11-03c_regularizacion_rc_compania.sql` → `sin_migracion` (503 en el puerto); la fase 2
 * no lee estas columnas y sigue igual. El SQL crudo NO prefija `seguros.` y toda sentencia filtra `correduria_id`.
 * La lógica de decisión va en funciones `*ConRepo` (sin BD) para los cepos.
 */
import {
  borradorRespuestaCompania,
  buzonElegido,
  leerEdicionRespuestaCompania,
  normalizarPeriodoRegularizacion,
  textoPeriodo,
  type BuzonCompaniaRegularizacion,
  type PeriodoRegularizacion,
} from '@central/module-seguros/regularizacion-rc'
import { enviarYConfirmar, MINUTOS_ENVIANDO_ATASCADA } from './regularizacion-rc-envio.ts'

export const TIPO_CORREO_REGULARIZACION_COMPANIA = 'regularizacion_rc_compania'

/** Claves de la tarea del agente de correo para esa póliza + periodo: la de hoy y la de antes del subtipo (`suplemento:<póliza>`). */
export function clavesTareaRegularizacion(polizaId: string, p: PeriodoRegularizacion): { nueva: string; vieja: string } {
  return { nueva: `suplemento:regularizacion:${polizaId}:${p.desde}_${p.hasta}`, vieja: `suplemento:${polizaId}` }
}

export type FilaCompania = {
  id: string; clienteId: string; polizaId: string; compania: string; numero: string | null; dgs: string | null
  periodoDesde: string; periodoHasta: string; estado: string; documentoId: string | null
  companiaEstado: string | null; companiaVersion: number; asunto: string | null; textoCifrado: string | null
  para: string | null; resueltaAt: Date | null
  /** En `enviando`: cuándo se RECLAMÓ (sello de la reclamación); en `enviada`: cuándo se confirmó. */
  companiaEnviadaAt: Date | null
}

/**
 * ¿Un `enviando` que ya no avanza? (el correo salió pero no se pudo confirmar —`confirmacion_fallida`, que NO vuelve a
 * borrador para no mandar dos—, o el proceso murió a mitad). Pasado `MINUTOS_ENVIANDO_ATASCADA` desde la reclamación, el
 * 🏁 puede cerrarla (cerrar no envía nada); sin esto se quedaría en 409 `enviando` para siempre. Sin sello = atascada.
 */
export function enviandoAtascada(f: { companiaEstado: string | null; companiaEnviadaAt: Date | null }, ahora: Date): boolean {
  if (f.companiaEstado !== 'enviando') return false
  if (!f.companiaEnviadaAt) return true
  return ahora.getTime() - f.companiaEnviadaAt.getTime() >= MINUTOS_ENVIANDO_ATASCADA * 60_000
}

export type AdjuntoRegularizacion = { nombre: string; contenido: Buffer; tipo: string }

export type RepoCompania = {
  leer(id: string): Promise<FilaCompania | null>
  buzones(dgs: string | null): Promise<BuzonCompaniaRegularizacion[]>
  documento(id: string): Promise<AdjuntoRegularizacion | null>
  /** borrador → enviando, SOLO con esa versión, con buzón y sin resolver. Filas tocadas. */
  reclamar(x: { id: string; version: number }): Promise<number>
  confirmar(id: string): Promise<number>
  volverABorrador(id: string): Promise<unknown>
  enviar(x: { fila: FilaCompania; to: string; asunto: string; texto: string; adjuntos: AdjuntoRegularizacion[]; idempotencia: string }): Promise<string>
  /** Texto y/o buzón nuevos (solo en borrador): sube `compania_version`. Filas tocadas. */
  guardarEdicion(x: { id: string; textoCifrado: string | null; para: string | null; contactoId: string | null }): Promise<number>
  /** Sella `resuelta_at` (completada, sin resolver, no `enviando`). Filas tocadas. */
  resolver(x: { id: string; actor: string }): Promise<number>
  /** Cierra las tareas abiertas del agente de correo de esa póliza + periodo. Ids cerrados. */
  cerrarTareas(x: { polizaId: string; periodo: PeriodoRegularizacion }): Promise<string[]>
  historial(fila: FilaCompania, texto: string): Promise<void>
  log(m: string): void
}

export type ResultadoDecisionCompania =
  | { estado: 'enviada_compania' | 'sin_cambios' | 'obsoleta' | 'no_encontrada' | 'ya_resuelta' | 'sin_destino_compania' | 'ilegible' | 'adjunto_ilegible' }
  | { estado: 'canal_no_disponible' | 'envio_fallido' | 'confirmacion_fallida' }

/** ✅ Enviar a la compañía. Solo lo que Alberto vio (versión), al buzón que eligió (re-validado contra el Directorio). */
export async function decidirRespuestaCompaniaConRepo(
  repo: RepoCompania, descifrar: (v: string) => string | null, d: { id: string; version: number },
): Promise<ResultadoDecisionCompania> {
  const f = await repo.leer(d.id)
  if (!f) return { estado: 'no_encontrada' }
  if (f.resueltaAt) return { estado: 'ya_resuelta' }
  if (f.companiaEstado !== 'borrador') return { estado: 'sin_cambios' }
  if (f.companiaVersion !== d.version) return { estado: 'obsoleta' }
  if (!f.para) return { estado: 'sin_destino_compania' }
  // El contacto pudo darse de baja en el Directorio entre la edición y el ✅: se vuelve a comprobar.
  const buzon = buzonElegido(await repo.buzones(f.dgs), f.para)
  if (!buzon?.email) return { estado: 'sin_destino_compania' }
  const texto = f.textoCifrado ? descifrar(f.textoCifrado) : null
  if (!texto || !f.asunto) return { estado: 'ilegible' }
  const adjuntos: AdjuntoRegularizacion[] = []
  if (f.documentoId) {
    // El texto dice «Adjuntamos…»: sin el fichero no sale (mejor no mandar que mandar algo que miente).
    const doc = await repo.documento(f.documentoId)
    if (!doc) return { estado: 'adjunto_ilegible' }
    adjuntos.push(doc)
  }
  if ((await repo.reclamar({ id: f.id, version: d.version })) !== 1) return { estado: 'sin_cambios' }
  const r = await enviarYConfirmar({
    enviar: () => repo.enviar({ fila: f, to: buzon.email!.trim(), asunto: f.asunto!, texto, adjuntos, idempotencia: `regularizacion-rc-compania:${f.id}:${d.version}` }),
    confirmar: () => repo.confirmar(f.id),
    volverABorrador: () => repo.volverABorrador(f.id),
    log: (m) => repo.log(m),
  })
  if (r === 'enviada') {
    await repo.historial(f, `Regularización de RC (${f.compania}, periodo ${f.periodoDesde} a ${f.periodoHasta}): comunicada a la compañía la cifra declarada por el cliente (correo a ${buzon.nombre}).`)
    return { estado: 'enviada_compania' }
  }
  return { estado: r }
}

export type ResultadoEdicionCompania =
  | { estado: 'editada'; fila: FilaCompania }
  | { estado: 'invalida' | 'buzon_desconocido' | 'sin_cambios' | 'no_encontrada' }

/** ✏️: «Para: correo» (solo un contacto ACTIVO del Directorio de esa compañía) y/o texto nuevo → versión nueva. */
export async function editarRespuestaCompaniaConRepo(
  repo: RepoCompania, cifrar: (v: string) => string, d: { id: string; entrada: unknown },
): Promise<ResultadoEdicionCompania> {
  const e = leerEdicionRespuestaCompania(typeof d.entrada === 'string' ? d.entrada : null)
  if (!e) return { estado: 'invalida' }
  const f = await repo.leer(d.id)
  if (!f) return { estado: 'no_encontrada' }
  if (f.resueltaAt || f.companiaEstado !== 'borrador') return { estado: 'sin_cambios' }
  let para = f.para
  let contactoId: string | null = null
  if (e.para !== undefined) {
    const b = buzonElegido(await repo.buzones(f.dgs), e.para)
    if (!b?.email) return { estado: 'buzon_desconocido' }
    para = b.email.trim()
    contactoId = b.id
  }
  const n = await repo.guardarEdicion({ id: f.id, textoCifrado: e.texto === null ? null : cifrar(e.texto), para: e.para === undefined ? null : para, contactoId })
  if (n !== 1) return { estado: 'sin_cambios' }
  return { estado: 'editada', fila: f }
}

export type ResultadoResolver = { estado: 'resuelta' | 'ya_resuelta'; tareasCerradas: number } | { estado: 'no_encontrada' | 'no_completada' | 'enviando' }

/**
 * 🏁 Regularización resuelta. Idempotente: la segunda vez es `ya_resuelta` y solo vuelve a cerrar alguna tarea que se
 * hubiera quedado abierta (sin nota ni historial nuevos). No envía nada a nadie.
 */
export async function resolverRegularizacionConRepo(repo: RepoCompania, d: { id: string; actor: string }, ahora = new Date()): Promise<ResultadoResolver> {
  const f = await repo.leer(d.id)
  if (!f) return { estado: 'no_encontrada' }
  if (f.estado !== 'completada') return { estado: 'no_completada' }
  // Un correo a medio salir: se espera a que acabe (si no, el sello y el «enviando» se pisarían).
  // Atascada (ver `enviandoAtascada`): se deja cerrar; el ✅ ya no podrá reenviar (exige `resuelta_at is null`).
  const atascada = !f.resueltaAt && enviandoAtascada(f, ahora)
  if (!f.resueltaAt && f.companiaEstado === 'enviando' && !atascada) return { estado: 'enviando' }
  const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta)
  const n = f.resueltaAt ? 0 : await repo.resolver({ id: f.id, actor: d.actor })
  const cerradas = periodo ? await repo.cerrarTareas({ polizaId: f.polizaId, periodo }) : []
  if (n === 1) {
    await repo.historial(f, `Regularización de RC (${f.compania}, periodo ${f.periodoDesde} a ${f.periodoHasta}): marcada como RESUELTA${cerradas.length ? ` y cerrada su tarea` : ''}.${atascada ? ' El envío a la compañía quedó sin confirmar: mira «Enviados» antes de darlo por comunicado.' : ''}`)
    return { estado: 'resuelta', tareasCerradas: cerradas.length }
  }
  if (f.resueltaAt) return { estado: 'ya_resuelta', tareasCerradas: cerradas.length }
  // 0 filas sin estar resuelta al leer: carrera (otro 🏁 a la vez, o un ✅ que la puso en `enviando`). Se relee.
  const x = await repo.leer(d.id)
  if (x?.resueltaAt) return { estado: 'ya_resuelta', tareasCerradas: cerradas.length }
  return { estado: x?.companiaEstado === 'enviando' ? 'enviando' : 'no_completada' }
}

// ─── Implementación con BD ───────────────────────────────────────────────────
// Carga perezosa de Prisma/Telegram/PII: los cepos de arriba corren con `node --test` sin BD ni `@central/*` de red.

async function bd() {
  const [{ Prisma }, { prismaAsegura }] = await Promise.all([import('./generated/asegura-client'), import('./asegura-db')])
  return { Prisma, db: prismaAsegura() }
}

async function esFaltaDeMigracion(e: unknown): Promise<boolean> {
  const { esColumnaAusente, esTablaAusente } = await import('./pg-error')
  return esColumnaAusente(e) || esTablaAusente(e)
}

async function conMigracion<T>(f: () => Promise<T>): Promise<T | { estado: 'sin_migracion' }> {
  try {
    return await f()
  } catch (e) {
    if (await esFaltaDeMigracion(e)) return { estado: 'sin_migracion' }
    throw e
  }
}

export async function repoCompania(correduriaId: string): Promise<RepoCompania> {
  const { Prisma, db } = await bd()
  return {
    async leer(id) {
      const [f] = await db.$queryRaw<FilaCompania[]>(Prisma.sql`
        select s.id::text as id, s.cliente_id::text as "clienteId", s.poliza_id::text as "polizaId", s.compania,
               p.numero_poliza as numero, p.codigo_entidad_dgs as dgs, s.periodo_desde as "periodoDesde", s.periodo_hasta as "periodoHasta",
               s.estado, s.documento_id::text as "documentoId", s.compania_estado as "companiaEstado", s.compania_version as "companiaVersion",
               s.compania_asunto as asunto, s.compania_texto as "textoCifrado", s.compania_para as para, s.resuelta_at as "resueltaAt",
               s.compania_enviada_at as "companiaEnviadaAt"
        from solicitud_regularizacion s join polizas p on p.id = s.poliza_id and p.correduria_id = s.correduria_id
        where s.id = ${id}::uuid and s.correduria_id = ${correduriaId}::uuid`)
      return f ?? null
    },
    async buzones(dgs) {
      if (!dgs) return []
      // Directorio de compañías: tabla GLOBAL (sin correduria_id), contactos de ESA compañía por su código DGS.
      return db.$queryRaw<BuzonCompaniaRegularizacion[]>(Prisma.sql`
        select id::text as id, nombre, email, activo from compania_contactos
        where compania_codigo_dgs = ${dgs} order by orden, nombre`)
    },
    async documento(id) {
      const { leerDocumento } = await import('./cartera-documentos')
      const d = await leerDocumento(correduriaId, id)
      return d ? { nombre: d.nombre, contenido: d.contenido, tipo: d.mime } : null
    },
    reclamar: ({ id, version }) => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set compania_estado = 'enviando', compania_enviada_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'completada' and resuelta_at is null
        and compania_estado = 'borrador' and compania_version = ${version} and compania_para is not null`),
    confirmar: (id) => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set compania_estado = 'enviada', compania_enviada_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and compania_estado = 'enviando'`),
    volverABorrador: (id) => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set compania_estado = 'borrador', compania_enviada_at = null
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and compania_estado = 'enviando'`),
    async enviar({ fila, to, asunto, texto, adjuntos, idempotencia }) {
      const { enviarCorreoCliente } = await import('./correo-envio')
      return enviarCorreoCliente({
        correduriaId, clienteId: fila.clienteId, polizaId: fila.polizaId, tipo: TIPO_CORREO_REGULARIZACION_COMPANIA, to, asunto, texto,
        adjuntos: adjuntos.map((a) => ({ nombre: a.nombre, contenido: a.contenido, tipo: a.tipo })), idempotencia,
      })
    },
    guardarEdicion: ({ id, textoCifrado, para, contactoId }) => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion
      set compania_texto = coalesce(${textoCifrado}, compania_texto),
          compania_para = coalesce(${para}, compania_para),
          compania_contacto_id = coalesce(${contactoId}::uuid, compania_contacto_id),
          compania_version = compania_version + 1
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and compania_estado = 'borrador' and resuelta_at is null`),
    resolver: ({ id, actor }) => db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set resuelta_at = now(), resuelta_por = ${actor.slice(0, 200)}
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'completada' and resuelta_at is null
        and (compania_estado is distinct from 'enviando'
             or coalesce(compania_enviada_at, '-infinity') <= now() - make_interval(mins => ${MINUTOS_ENVIANDO_ATASCADA}::int))`),
    async cerrarTareas({ polizaId, periodo }) {
      const { nueva, vieja } = clavesTareaRegularizacion(polizaId, periodo)
      const nota = `\n[Cerrada: regularización de RC resuelta (${textoPeriodo(periodo)})]`
      // La clave de hoy, exacta. La VIEJA (`suplemento:<póliza>`, tareas creadas antes del subtipo) solo si el evento que la
      // creó es de ESTE periodo, y ninguna fila de esa tarea es de otro periodo/otro suplemento.
      const filas = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        update gestiones g set estado = 'cerrada', updated_at = now(), observaciones = coalesce(g.observaciones, '') || ${nota}
        where g.correduria_id = ${correduriaId}::uuid and g.estado::text <> 'cerrada'
          and g.id in (
            select e.gestion_id from correo_evento_entrante e
            where e.correduria_id = ${correduriaId}::uuid and e.gestion_id is not null
              and (e.clave_tarea = ${nueva}
                   or (e.clave_tarea = ${vieja} and left(e.detalle->>'periodoDesde', 7) = ${periodo.desde} and left(e.detalle->>'periodoHasta', 7) = ${periodo.hasta})))
          and not exists (
            select 1 from correo_evento_entrante x
            where x.correduria_id = ${correduriaId}::uuid and x.gestion_id = g.id
              and x.clave_tarea is distinct from ${nueva}
              and not (x.clave_tarea = ${vieja} and left(x.detalle->>'periodoDesde', 7) = ${periodo.desde} and left(x.detalle->>'periodoHasta', 7) = ${periodo.hasta}))
        returning g.id::text as id`)
      const { anotarCambio } = await import('./auditoria')
      for (const g of filas) anotarCambio({ entidad: 'gestion', id: g.id, campo: 'estado', antes: 'pendiente', despues: 'cerrada' })
      return filas.map((g) => g.id)
    },
    async historial(fila, texto) {
      const { anotarHistorial } = await import('./regularizacion-rc')
      await anotarHistorial(correduriaId, fila.clienteId, fila.polizaId, texto)
    },
    log: (m) => console.error(`[regularizacion-rc-compania] ${m}`),
  }
}

async function pii() {
  const m = await import('@central/module-seguros-pii')
  return { cifrar: m.encryptField, descifrar: (v: string) => { try { return m.decryptField(v) } catch { return null } } }
}

export type ResultadoPreparar =
  | { estado: 'preparada' | 'ya_existe'; telegram: boolean }
  | { estado: 'no_encontrada' | 'no_completada' | 'ya_resuelta' | 'ya_enviada' | 'ilegible' | 'sin_migracion' }

/** Borrador de la respuesta a la compañía (si no lo hay) + propuesta a Alberto. Si ya hay borrador, solo re-propone. */
export async function prepararRespuestaCompania(correduriaId: string, id: string): Promise<ResultadoPreparar> {
  return conMigracion(async (): Promise<ResultadoPreparar> => {
    const repo = await repoCompania(correduriaId)
    const f = await repo.leer(id)
    if (!f) return { estado: 'no_encontrada' }
    if (f.estado !== 'completada') return { estado: 'no_completada' }
    if (f.resueltaAt) return { estado: 'ya_resuelta' }
    if (f.companiaEstado === 'borrador') return { estado: 'ya_existe', telegram: await proponerCompaniaEnTelegram(correduriaId, id) }
    if (f.companiaEstado !== null) return { estado: 'ya_enviada' }
    const { Prisma, db } = await bd()
    // Tomador = la ficha del cliente de la solicitud (la compañía ya lo conoce; sin DNI ni contacto).
    const [extra] = await db.$queryRaw<{ respuesta: string | null; tomador: string | null; clave: string | null }[]>(Prisma.sql`
      select s.respuesta, nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as tomador, cd.clave_mediador as clave
      from solicitud_regularizacion s join clientes c on c.id = s.cliente_id and c.correduria_id = s.correduria_id
        join polizas p on p.id = s.poliza_id and p.correduria_id = s.correduria_id
        left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
      where s.id = ${id}::uuid and s.correduria_id = ${correduriaId}::uuid`)
    const { leerRespuestaCifrada } = await import('./regularizacion-rc-portal')
    const { cifrar, descifrar } = await pii()
    const respuesta = leerRespuestaCifrada(extra?.respuesta ?? null, (v: string) => descifrar(v) ?? '')
    const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta)
    if (!respuesta || !periodo) return { estado: 'ilegible' }
    const { MEDIADOR } = await import('@central/module-seguros')
    const b = borradorRespuestaCompania({
      compania: f.compania, numeroPoliza: f.numero, tomador: extra?.tomador ?? null, periodo, respuesta,
      conDocumento: f.documentoId !== null, claveMediador: extra?.clave ?? null,
      firmante: `${MEDIADOR.identidad.nombre.split(/\s+/).slice(0, 2).join(' ')} — ${MEDIADOR.marca}`,
    })
    const n = await db.$executeRaw(Prisma.sql`
      update solicitud_regularizacion set compania_estado = 'borrador', compania_asunto = ${b.asunto}, compania_texto = ${cifrar(b.texto)}
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'completada' and resuelta_at is null and compania_estado is null`)
    if (n !== 1) return { estado: 'ya_existe', telegram: false }
    return { estado: 'preparada', telegram: await proponerCompaniaEnTelegram(correduriaId, id) }
  })
}

/** Manda (o vuelve a mandar tras ✏️) la propuesta con sus botones. `false` = Telegram no la recibió. */
export async function proponerCompaniaEnTelegram(correduriaId: string, id: string, editado = false): Promise<boolean> {
  const repo = await repoCompania(correduriaId)
  const f = await repo.leer(id)
  if (!f || f.companiaEstado !== 'borrador' || f.resueltaAt || !f.asunto || !f.textoCifrado) return false
  const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta)
  const texto = (await pii()).descifrar(f.textoCifrado)
  if (!periodo || !texto) return false
  const buzones = (await repo.buzones(f.dgs)).filter((b) => b.activo && b.email?.includes('@')).map((b) => ({ nombre: b.nombre, email: (b.email as string).trim() }))
  const { db } = await bd()
  const c = await db.cliente.findFirst({ where: { id: f.clienteId, correduriaId }, select: { nombre: true, apellidos: true, tipoPersona: true } })
  const quien = !c ? 'ficha sin leer' : c.tipoPersona === 'juridica' ? `${c.nombre} ${c.apellidos}`.trim() : (c.nombre.trim().split(/\s+/)[0] || 'Sin nombre')
  const { textoPropuestaCompania, botonesRespuestaCompania } = await import('./regularizacion-rc-telegram.ts')
  const { tgSendButtons } = await import('@central/core-telegram')
  const msg = await tgSendButtons(
    textoPropuestaCompania({ quien, compania: f.compania, numeroPoliza: f.numero, periodo, para: f.para, buzones, asunto: f.asunto, texto, conDocumento: f.documentoId !== null, editado }),
    botonesRespuestaCompania(f.id, f.companiaVersion, f.para !== null),
  ).catch(() => null)
  return msg !== null
}

export async function decidirRespuestaCompania(correduriaId: string, d: { id: string; version: number }) {
  return conMigracion(async () => decidirRespuestaCompaniaConRepo(await repoCompania(correduriaId), (await pii()).descifrar, d))
}

export async function editarRespuestaCompania(correduriaId: string, id: string, entrada: unknown) {
  return conMigracion(async () => {
    const r = await editarRespuestaCompaniaConRepo(await repoCompania(correduriaId), (await pii()).cifrar, { id, entrada })
    if (r.estado !== 'editada') return r
    return { estado: 'editada' as const, telegram: await proponerCompaniaEnTelegram(correduriaId, id, true) }
  })
}

export async function resolverRegularizacion(correduriaId: string, id: string, actor: string) {
  return conMigracion(async () => resolverRegularizacionConRepo(await repoCompania(correduriaId), { id, actor }))
}

/** Tras la respuesta del cliente (fase 2): prepara la propuesta. Nunca lanza (no rompe el «gracias» del portal). */
export async function trasRespuestaCliente(correduriaId: string, id: string): Promise<void> {
  try {
    const r = await prepararRespuestaCompania(correduriaId, id)
    if (r.estado !== 'preparada' && r.estado !== 'ya_existe') console.warn(`[regularizacion-rc-compania] ${id}: respuesta a la compañía no preparada (${r.estado})`)
  } catch (e) {
    console.error('[regularizacion-rc-compania] preparar falló:', e instanceof Error ? e.message.slice(0, 200) : 'error')
  }
}
