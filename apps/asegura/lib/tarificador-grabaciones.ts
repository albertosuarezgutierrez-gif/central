// GRABADOR del tarificador RPA — la parte con BD (07/10/2026). Ver tarificador-grabaciones-reglas.ts y
// apps/asegura/prisma/sql/2026-10-07b_tarificador_grabaciones.sql.
//
// 🛡️ Todo filtrado por `correduria_id` (lo resuelve la ruta con `correduriaUnica()`).
// 🔒 El HTML se RE-REDACTA aquí (`redactarHtmlGrabacion`) aunque el bookmarklet ya lo haya hecho.
// 💶 Tope de llamadas a la IA por grabación: se RESERVA la llamada en BD (update condicional) ANTES de hacerla.
// 🚨 TARIFICAR ≠ EMITIR: nada de aquí pulsa nada en ningún portal.

import { createHash } from 'node:crypto'
import {
  extraerJsonIA,
  fusionarPantalla,
  leerMapaGuardado,
  recortarHtmlParaIA,
  redactarDatosPersonales,
  validarPantallaMapa,
  type PantallaMapa,
  type MapaGrabacion,
} from '@central/module-tarificacion'
import { prisma } from './tenant'
import { CONCURRENCIA_TROZOS, MAX_CHARS_ENTRADA_TROCEO, PRESUPUESTO_LOTE_MS, errorPantallaExcedeTope, esperarOla, fusionarTrozos, inyectarMarco, trocearHtmlIA } from './tarificador-grabaciones-trozos'
import { iaTexto } from './ia'
import {
  LOTE_ANALISIS,
  MAX_CHARS_IA,
  MAX_TOKENS_ANALISIS,
  TIMEOUT_ANALISIS_MS,
  respuestaIACortada,
  planificarSubida,
  costeEstimadoGrabador,
  maxLlamadasGrabador,
  promptAnalisis,
  sistemaAnalisis,
  type AltaGrabacion,
} from './tarificador-grabaciones-reglas'

export type ResumenGrabacion = {
  id: string
  compania: string
  ramo: string
  producto: string | null
  nota: string | null
  pantallas: number
  analizadas: number
  conError: number
  mapaValidado: boolean
  validadoPor: string | null
  validadoEn: string | null
  llamadasIA: number
  costeEstimado: number
  creadoPor: string
  creadoEn: string
}

type FilaResumen = {
  id: string; compania: string; ramo: string; producto: string | null; nota: string | null; pantallas: number; analizadas: number
  con_error: number; mapa_validado: boolean; validado_por: string | null; validado_at: Date | null; llamadas_ia: number
  coste_estimado: unknown; creado_por: string; created_at: Date
}

const aResumen = (r: FilaResumen): ResumenGrabacion => ({
  id: r.id, compania: r.compania, ramo: r.ramo, producto: r.producto, nota: r.nota, pantallas: Number(r.pantallas),
  analizadas: Number(r.analizadas), conError: Number(r.con_error), mapaValidado: r.mapa_validado, validadoPor: r.validado_por,
  validadoEn: r.validado_at?.toISOString() ?? null, llamadasIA: r.llamadas_ia, costeEstimado: Number(r.coste_estimado),
  creadoPor: r.creado_por, creadoEn: r.created_at.toISOString(),
})

export async function listarGrabaciones(correduriaId: string): Promise<ResumenGrabacion[]> {
  const filas = await prisma.$queryRaw<FilaResumen[]>`
    select g.id::text as id, g.compania, g.ramo, g.producto, g.nota, g.mapa_validado, g.validado_por, g.validado_at,
           g.llamadas_ia, g.coste_estimado, g.creado_por, g.created_at,
           count(p.id)::int as pantallas,
           count(p.id) filter (where p.analisis_estado = 'ok')::int as analizadas,
           count(p.id) filter (where p.analisis_estado = 'error')::int as con_error
    from seguros.tarificador_grabaciones g
    left join seguros.tarificador_grabacion_pantallas p on p.grabacion_id = g.id
    where g.correduria_id = ${correduriaId}::uuid
    group by g.id
    order by g.created_at desc
    limit 100`
  return filas.map(aResumen)
}

export async function crearGrabacion(correduriaId: string, alta: AltaGrabacion, creadoPor: string): Promise<string> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    insert into seguros.tarificador_grabaciones (correduria_id, compania, ramo, producto, nota, creado_por)
    values (${correduriaId}::uuid, ${alta.compania}, ${alta.ramo}, ${alta.producto}, ${alta.nota}, ${creadoPor.slice(0, 200)})
    returning id::text as id`
  return filas[0].id
}

export type PantallaGrabada = { orden: number; nombre: string; bytes: number; estado: 'pendiente' | 'ok' | 'error'; error: string | null; analizadaEn: string | null; documentoId: string }
export type DetalleGrabacion = ResumenGrabacion & { pantallasLista: PantallaGrabada[]; mapa: MapaGrabacion | null; maxLlamadas: number }

export async function leerGrabacion(correduriaId: string, id: string): Promise<DetalleGrabacion | null> {
  const g = await prisma.$queryRaw<(FilaResumen & { mapa: unknown })[]>`
    select g.id::text as id, g.compania, g.ramo, g.producto, g.nota, g.mapa, g.mapa_validado, g.validado_por, g.validado_at,
           g.llamadas_ia, g.coste_estimado, g.creado_por, g.created_at,
           (select count(*) from seguros.tarificador_grabacion_pantallas p where p.grabacion_id = g.id)::int as pantallas,
           (select count(*) from seguros.tarificador_grabacion_pantallas p where p.grabacion_id = g.id and p.analisis_estado = 'ok')::int as analizadas,
           (select count(*) from seguros.tarificador_grabacion_pantallas p where p.grabacion_id = g.id and p.analisis_estado = 'error')::int as con_error
    from seguros.tarificador_grabaciones g
    where g.id = ${id}::uuid and g.correduria_id = ${correduriaId}::uuid`
  if (!g[0]) return null
  const ps = await prisma.$queryRaw<{ orden: number; nombre_fichero: string; size_bytes: number; analisis_estado: 'pendiente' | 'ok' | 'error'; analisis_error: string | null; analizada_at: Date | null; documento_id: string }[]>`
    select orden, nombre_fichero, size_bytes, analisis_estado, analisis_error, analizada_at, documento_id::text as documento_id
    from seguros.tarificador_grabacion_pantallas
    where grabacion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
    order by orden`
  return {
    ...aResumen(g[0]),
    pantallasLista: ps.map((p) => ({ orden: p.orden, nombre: p.nombre_fichero, bytes: p.size_bytes, estado: p.analisis_estado, error: p.analisis_error, analizadaEn: p.analizada_at?.toISOString() ?? null, documentoId: p.documento_id })),
    mapa: leerMapaGuardado(g[0].mapa),
    maxLlamadas: maxLlamadasGrabador(process.env),
  }
}

export type ResultadoSubida =
  | { estado: 'ok'; orden: number; documentoId: string; bytes: number; pantallas: number; ordenes: number[] }
  | { estado: 'no_encontrada' }
  | { estado: 'rechazada'; mensaje: string }

/**
 * Guarda una pantalla —o las de un fichero multipantalla, en orden— (re-redactadas) al final de la grabación, en UNA
 * transacción (o entran todas o ninguna). La numeración la pone el servidor. `orden`/`documentoId` = los de la primera.
 */
export async function subirPantalla(correduriaId: string, id: string, nombre: string, htmlSubido: string): Promise<ResultadoSubida> {
  return prisma.$transaction(async (tx) => {
    const g = await tx.$queryRaw<{ compania: string; ramo: string }[]>`
      select compania, ramo from seguros.tarificador_grabaciones
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      for update`
    if (!g[0]) return { estado: 'no_encontrada' as const }
    const n = await tx.$queryRaw<{ n: number; max: number | null }[]>`
      select count(*)::int as n, max(orden)::int as max from seguros.tarificador_grabacion_pantallas where grabacion_id = ${id}::uuid`
    const plan = planificarSubida(nombre, htmlSubido, n[0]?.n ?? 0)
    if (!plan.ok) return { estado: 'rechazada' as const, mensaje: plan.mensaje }
    let orden = n[0]?.max ?? 0
    const ordenes: number[] = []
    let primero: { documentoId: string; bytes: number } | null = null
    for (const p of plan.pantallas) {
      orden++
      const sha = createHash('sha256').update(p.contenido).digest('hex')
      const doc = await tx.$queryRaw<{ id: string }[]>`
        insert into seguros.documentos
          (correduria_id, tarificador_grabacion_id, tipo, estado, nombre_fichero, mime_type, size_bytes, sha256, contenido, notas, subido_por, visible_por_cliente)
        values (${correduriaId}::uuid, ${id}::uuid, 'otro', 'recibido', ${p.nombre}, 'text/html', ${p.contenido.length}::int, ${sha}, ${p.contenido},
                ${`Grabador del tarificador: pantalla ${orden} (${g[0].compania} · ${g[0].ramo}), HTML redactado`}, 'corredor', false)
        returning id::text as id`
      await tx.$executeRaw`
        insert into seguros.tarificador_grabacion_pantallas (correduria_id, grabacion_id, orden, documento_id, nombre_fichero, size_bytes)
        values (${correduriaId}::uuid, ${id}::uuid, ${orden}::int, ${doc[0].id}::uuid, ${p.nombre}, ${p.contenido.length}::int)`
      ordenes.push(orden)
      primero ??= { documentoId: doc[0].id, bytes: p.contenido.length }
    }
    // Pantallas nuevas dejan el mapa validado a medias: se quita la validación.
    await tx.$executeRaw`
      update seguros.tarificador_grabaciones set mapa_validado = false, validado_por = null, validado_at = null, updated_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
    return { estado: 'ok' as const, orden: ordenes[0], documentoId: primero!.documentoId, bytes: primero!.bytes, pantallas: ordenes.length, ordenes }
  })
}

export type ResultadoValidar = { estado: 'ok'; validado: boolean } | { estado: 'no_encontrada' } | { estado: 'sin_mapa' }

/** Validación HUMANA del mapa (o quitarla). Solo con mapa y todas las pantallas analizadas. */
export async function marcarValidado(correduriaId: string, id: string, validado: boolean, quien: string): Promise<ResultadoValidar> {
  const d = await leerGrabacion(correduriaId, id)
  if (!d) return { estado: 'no_encontrada' }
  if (validado && (!d.mapa || d.mapa.pantallas.length === 0 || d.analizadas < d.pantallas)) return { estado: 'sin_mapa' }
  await prisma.$executeRaw`
    update seguros.tarificador_grabaciones
    set mapa_validado = ${validado}, validado_por = ${validado ? quien.slice(0, 200) : null},
        validado_at = ${validado ? new Date() : null}, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  return { estado: 'ok', validado }
}

export type ModoAnalisis = 'pendientes' | 'reintentar' | 'todas'
export type ResultadoAnalisis =
  | { estado: 'no_encontrada' }
  | { estado: 'sin_pantallas' }
  | { estado: 'ok'; procesadas: number; bien: number; mal: number; pendientes: number; tope: boolean; llamadasUsadas: number; maxLlamadas: number; botonesForzados: number }

const limpiarError = (m: string) => redactarDatosPersonales(m.replace(/\s+/g, ' ')).slice(0, 300)

/**
 * Analiza con la IA un LOTE de pantallas pendientes (`LOTE_ANALISIS`); la UI repite mientras queden. Cada
 * llamada se reserva antes en BD contra el tope de la grabación. `todas` borra el mapa y empieza de cero;
 * `reintentar` vuelve a poner en cola las que fallaron.
 */
export async function analizarGrabacion(correduriaId: string, id: string, modo: ModoAnalisis): Promise<ResultadoAnalisis> {
  const g = await prisma.$queryRaw<{ compania: string; ramo: string; producto: string | null }[]>`
    select compania, ramo, producto from seguros.tarificador_grabaciones where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!g[0]) return { estado: 'no_encontrada' }
  const max = maxLlamadasGrabador(process.env)

  if (modo === 'todas') {
    await prisma.$transaction([
      prisma.$executeRaw`update seguros.tarificador_grabacion_pantallas set analisis_estado = 'pendiente', analisis_error = null, analizada_at = null
        where grabacion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`,
      prisma.$executeRaw`update seguros.tarificador_grabaciones set mapa = null, mapa_validado = false, validado_por = null, validado_at = null, updated_at = now()
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`,
    ])
  } else if (modo === 'reintentar') {
    await prisma.$executeRaw`update seguros.tarificador_grabacion_pantallas set analisis_estado = 'pendiente', analisis_error = null
      where grabacion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and analisis_estado = 'error'`
  }

  const total = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from seguros.tarificador_grabacion_pantallas where grabacion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!total[0]?.n) return { estado: 'sin_pantallas' }

  const lote = await prisma.$queryRaw<{ pid: string; orden: number; documento_id: string }[]>`
    select id::text as pid, orden, documento_id::text as documento_id from seguros.tarificador_grabacion_pantallas
    where grabacion_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and analisis_estado = 'pendiente'
    order by orden limit ${LOTE_ANALISIS}`

  let procesadas = 0, bien = 0, mal = 0, forzados = 0, tope = false
  const marcarError = (pid: string, m: string) => prisma.$executeRaw`
    update seguros.tarificador_grabacion_pantallas set analisis_estado = 'error', analisis_error = ${limpiarError(m)}, analizada_at = now()
    where id = ${pid}::uuid and correduria_id = ${correduriaId}::uuid`

  const inicioLote = Date.now()
  for (const p of lote) {
    // Un lote no EMPIEZA pantallas pasado su presupuesto de tiempo: la UI repite con las pendientes.
    if (procesadas > 0 && Date.now() - inicioLote > PRESUPUESTO_LOTE_MS) break
    const doc = await prisma.$queryRaw<{ contenido: Uint8Array | null }[]>`
      select contenido from seguros.documentos where id = ${p.documento_id}::uuid and correduria_id = ${correduriaId}::uuid`
    // Pantalla grande → varios trozos (cada uno, una llamada de salida corta). Las llamadas se reservan JUNTAS.
    const trozos = doc[0]?.contenido ? trocearHtmlIA(recortarHtmlParaIA(Buffer.from(doc[0].contenido).toString('utf8'), MAX_CHARS_ENTRADA_TROCEO)).map((t) => ({ ...t, html: t.html.slice(0, MAX_CHARS_IA) })) : []
    const llamadas = Math.max(1, trozos.length)
    const excede = errorPantallaExcedeTope(llamadas, max)
    if (excede) { procesadas++; mal++; await marcarError(p.pid, excede); continue }
    const reserva = await prisma.$queryRaw<{ n: number }[]>`
      update seguros.tarificador_grabaciones set llamadas_ia = llamadas_ia + ${llamadas}::int, updated_at = now()
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and llamadas_ia + ${llamadas}::int <= ${max}::int
      returning llamadas_ia as n`
    if (!reserva[0]) { tope = true; break }
    procesadas++
    if (!trozos.length) { mal++; await marcarError(p.pid, 'el fichero de la pantalla no está o no tiene contenido útil'); continue }
    const system = sistemaAnalisis()
    const partes: PantallaMapa[] = []
    let fallo: string | null = null
    let forzadosTrozos = 0
    for (let i = 0; i < trozos.length && !fallo; i += CONCURRENCIA_TROZOS) {
      const ola = trozos.slice(i, i + CONCURRENCIA_TROZOS)
      const rs = await esperarOla(ola.map(async (t, k) => {
        const prompt = promptAnalisis({ compania: g[0].compania, ramo: g[0].ramo, producto: g[0].producto, pantalla: p.orden, total: total[0].n, html: t.html, trozo: { n: i + k + 1, de: trozos.length } })
        let respuesta: string
        try {
          respuesta = await iaTexto(prompt, { system, maxTokens: MAX_TOKENS_ANALISIS, timeoutMs: TIMEOUT_ANALISIS_MS, privado: true, categoria: 'contexto' })
        } catch (e) {
          return { error: `la IA no ha respondido: ${e instanceof Error ? e.message : String(e)}` }
        }
        const coste = costeEstimadoGrabador(system.length + prompt.length, respuesta.length)
        await prisma.$executeRaw`update seguros.tarificador_grabaciones set coste_estimado = coste_estimado + ${coste}::numeric
          where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
        const json = extraerJsonIA(respuesta)
        if (json === null && respuestaIACortada(respuesta)) return { error: `la respuesta de la IA se cortó (trozo ${i + k + 1} de ${trozos.length}): ${respuesta.length} caracteres sin cerrar el JSON` }
        const v = validarPantallaMapa(inyectarMarco(json, t.marco), p.orden)
        if (!v.ok) return { error: `la respuesta de la IA no cumple el esquema: ${v.errores.slice(0, 3).join('; ')}` }
        return { v }
      }))
      for (const r of rs) {
        if ('error' in r && r.error) { fallo ??= r.error; continue }
        if ('v' in r && r.v) { partes.push(r.v.pantalla); forzadosTrozos += r.v.forzados }
      }
    }
    if (fallo) { mal++; await marcarError(p.pid, fallo); continue }
    const fus = fusionarTrozos(p.orden, partes)
    const v = { pantalla: fus.pantalla, forzados: forzadosTrozos + fus.forzados }
    forzados += v.forzados
    await prisma.$transaction(async (tx) => {
      const m = await tx.$queryRaw<{ mapa: unknown }[]>`
        select mapa from seguros.tarificador_grabaciones where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid for update`
      const mapa = fusionarPantalla(leerMapaGuardado(m[0]?.mapa), v.pantalla)
      await tx.$executeRaw`update seguros.tarificador_grabaciones
        set mapa = ${JSON.stringify(mapa)}::jsonb, mapa_validado = false, validado_por = null, validado_at = null, updated_at = now()
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
      await tx.$executeRaw`update seguros.tarificador_grabacion_pantallas set analisis_estado = 'ok', analisis_error = null, analizada_at = now()
        where id = ${p.pid}::uuid and correduria_id = ${correduriaId}::uuid`
    })
    bien++
  }

  const resto = await prisma.$queryRaw<{ pendientes: number; usadas: number }[]>`
    select (select count(*) from seguros.tarificador_grabacion_pantallas where grabacion_id = ${id}::uuid and analisis_estado = 'pendiente')::int as pendientes,
           (select llamadas_ia from seguros.tarificador_grabaciones where id = ${id}::uuid)::int as usadas`
  const pendientes = resto[0]?.pendientes ?? 0
  const usadas = resto[0]?.usadas ?? 0
  return { estado: 'ok', procesadas, bien, mal, pendientes, tope: tope || (pendientes > 0 && usadas >= max), llamadasUsadas: usadas, maxLlamadas: max, botonesForzados: forzados }
}
