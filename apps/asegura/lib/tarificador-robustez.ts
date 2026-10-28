// F2 del plan de robustez de los bots RPA (14/10/2026) — la parte con BD. Reglas PURAS en
// packages/module-tarificacion/src/robustez.ts; SQL en prisma/sql/2026-10-14e_tarificador_robustez_f2.sql.
//
//   · ATASCO: `guardarAtasco` (dentro de `marcarFallo`, misma transacción), `listarAtascos` / `responderAtasco` (puerto de
//     operador: pantalla «Bots atascados» y botones de Telegram), `caducarAtascos` (barrido) y los avisos.
//   · CORTE: `evaluarCorte` (tras cada `error_definitivo` de un trabajo de tarificar), `pausaViva` (encolar), la condición de
//     `reclamarSiguiente` (`sqlSinPausa`), `listarPausas` / `reanudarPausa` y sus avisos.
//
// 🛡️ Todo por `correduria_id` (puerto de operador) o por el id del trabajo dentro de su transacción (worker).
// 🚨 TARIFICAR ≠ EMITIR: elegir un candidato solo APRENDE un selector; el worker lo vuelve a validar con sus tablas cerradas
//    y lo pulsa/rellena por el guard. Nada de aquí pulsa, emite ni manda nada a terceros.
// 🔒 Hacia Telegram y la pantalla, solo `candidatosVisibles` (sin selector) y compañía/ramo. La captura va SOLO al chat de
//    Alberto (como la de la emisión) y nunca se manda si el trabajo llevaba secretos del riesgo (el worker no la hace).

import {
  MAX_RONDAS_ATASCO,
  UMBRAL_CORTE_BOT,
  atascoActivo,
  cabeCapturaEnRespuesta,
  candidatosVisibles,
  motivoCorte,
  decidirAtasco,
  elegirCandidatoAtasco,
  horasAtasco,
  leerAtascoWorker,
  type AtascoWorker,
  type CandidatoAtascoVisible,
} from '@central/module-tarificacion'
import { Prisma } from '@prisma/client' // el MISMO cliente que el `prisma` de ./tenant: un Prisma.sql de otro cliente generado se envía como parámetro (P2010 en $6)
import { prisma } from './tenant'
import { capturaConDatos as capturaConDatosDe, opcionesDeError } from './tarificador-reglas'
import { hayAtascos, hayConfianzaAprendido, hayPausas } from './esquema-bd'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { decidirRelanzar } from './tarificador-relanzar-reglas'
import { purgarRiesgoTrabajos } from './tarificador-purga'
import { MENSAJE_HUMO_OMITIDO_CREDENCIALES, motivoPausaHumo } from './tarificador-humo-reglas'
import { PAUSA_CADUCA_HORAS, PAUSA_CADUCABLE_REGEX } from './tarificador-reglas'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
type Db = Pick<Tx, '$queryRaw' | '$executeRaw'>

/** Tope de bytes de la captura que viaja por el puerto (el cuerpo de Vercel ronda 4,5 MB). */
const MAX_BYTES_CAPTURA_PUERTO = 3 * 1024 * 1024

// ─── ATASCO: al recibir el fallo ─────────────────────────────────────────────

/**
 * ¿Este fallo se queda `atascado`? Lo llama `marcarFallo` (misma transacción) con el estado que tocaría por política. Sin el
 * SQL de la F2, sin interruptor, de otro modo/tipo o pasado el tope de rondas → `null` (sigue como antes).
 */
export async function atascoParaFallo(db: Db, f: { trabajoId: string; estado: string; modo: string | null; tipoError: string; atasco: AtascoWorker | null | undefined }): Promise<AtascoWorker | null> {
  if (f.estado !== 'error_definitivo' || !f.atasco || !(await hayAtascos())) return null
  const n = await db.$queryRaw<{ n: bigint }[]>`select count(*) as n from seguros.tarificador_atascos where trabajo_id = ${f.trabajoId}::uuid`
  const d = decidirAtasco({ activo: atascoActivo(process.env), modo: f.modo, tipoError: f.tipoError, rondasPrevias: Number(n[0]?.n ?? 0), atasco: f.atasco })
  if (!d.atascar) {
    console.error(`[tarificador-atasco] trabajo ${f.trabajoId}: no se atasca (${d.motivo})`)
    return null
  }
  return f.atasco
}

/** Cierra como `descartado` los atascos ESPERANDO de un trabajo (su id ya no puede aplicarse). Devuelve cuántos cerró. */
export async function descartarAtascosEsperando(db: Db, trabajoId: string, quien: string): Promise<number> {
  return db.$executeRaw`
    update seguros.tarificador_atascos
       set estado = 'descartado', respondido_at = now(), respondido_por = ${quien.slice(0, 200)}
     where trabajo_id = ${trabajoId}::uuid and estado = 'esperando'`
}

/** Guarda el checkpoint (la fila del trabajo ya está `atascado` en esta misma transacción). */
export async function guardarAtasco(db: Db, t: { id: string; correduriaId: string; compania: string; ramo: string }, a: AtascoWorker, capturaId: string | null): Promise<void> {
  const horas = horasAtasco(process.env)
  // Un atasco ESPERANDO anterior del mismo trabajo (p. ej. reintento desde la bandeja) se cierra ANTES: sus candidatos son
  // viejos y su id no debe poder aplicarse (responderAtasco ve estado <> 'esperando' → sin_cambios/conflicto). La fila queda
  // de rastro y cuenta como ronda previa.
  await descartarAtascosEsperando(db, t.id, 'sistema:sustituido')
  await db.$executeRaw`
    insert into seguros.tarificador_atascos
      (correduria_id, trabajo_id, compania, ramo, clave, tipo, descripcion, etiqueta, texto_esperado, candidatos, captura_documento_id, caduca_at)
    values (${t.correduriaId}::uuid, ${t.id}::uuid, ${t.compania}, ${t.ramo}, ${a.clave}, ${a.tipo}, ${a.descripcion}, ${a.etiqueta},
            ${a.textoEsperado}, ${JSON.stringify(a.candidatos)}::jsonb, ${capturaId}::uuid, now() + make_interval(hours => ${horas}::int))
    on conflict (trabajo_id) where estado = 'esperando' do nothing`
}

/** El checkpoint guardado, re-leído por la MISMA lista blanca (una fila rara no se enseña ni se elige). */
function atascoDeFila(f: { clave: string; tipo: string; descripcion: string; etiqueta: string | null; texto_esperado: string | null; candidatos: unknown }): AtascoWorker | null {
  return leerAtascoWorker({ clave: f.clave, tipo: f.tipo, descripcion: f.descripcion, etiqueta: f.etiqueta, textoEsperado: f.texto_esperado, candidatos: f.candidatos })
}

// ─── ATASCO: lectura para la pantalla y Telegram ─────────────────────────────

export type AtascoVisible = {
  id: string
  trabajoId: string
  oportunidadId: string | null
  compania: string
  ramo: string
  tipo: 'campo' | 'accion'
  descripcion: string
  etiqueta: string | null
  textoEsperado: string | null
  candidatos: CandidatoAtascoVisible[]
  ronda: number
  maxRondas: number
  creadoEn: string
  caducaEn: string
  avisadoEn: string | null
  hayCaptura: boolean
  /** Solo si se pidió `conCaptura` (avisos y detalle): PNG o JPEG en base64. `null` = no hay, no cabe o no se da (con datos en avisos). */
  capturaBase64?: string | null
  /** Tipo de `capturaBase64` (21/10/2026: las de atasco son JPEG). */
  capturaMime?: 'image/png' | 'image/jpeg' | null
  /** Clave del paso (sin datos personales): `elegir_opcion_<campo>` = elegir una opción de una lista. */
  clave: string
  /** Nombre del cliente del trabajo (para que Alberto sepa de quién es; solo pantalla de plataforma, nunca Telegram). */
  clienteNombre: string | null
  /** Opciones de lista que vio el worker (texto): `null` = no se miraron (bot antiguo u otro atasco); `[]` = no había. */
  opciones: string[] | null
  /** La captura muestra datos del tomador: no sale a Telegram. */
  capturaConDatos: boolean
}


type FilaAtasco = {
  id: string; trabajo_id: string; oportunidad_id: string | null; compania: string; ramo: string; clave: string; tipo: string; descripcion: string
  etiqueta: string | null; texto_esperado: string | null; candidatos: unknown; created_at: Date; caduca_at: Date; avisado_at: Date | null
  captura_documento_id: string | null; ronda: bigint
  cliente_nombre?: string | null; opciones?: unknown; captura_con_datos?: string | null; con_cliente?: boolean | null
}

type Captura = { b64: string; mime: 'image/png' | 'image/jpeg' }

/** La captura del atasco, SOLO de un documento de ESTA correduría (con BYPASSRLS el aislamiento es este `where`). */
async function capturaDe(correduriaId: string, documentoId: string | null): Promise<Captura | null> {
  if (!documentoId) return null
  const d = await prisma.$queryRaw<{ contenido: Buffer | null; size_bytes: number | null; mime_type: string | null }[]>`
    select contenido, size_bytes, mime_type from seguros.documentos where id = ${documentoId}::uuid and correduria_id = ${correduriaId}::uuid`
  const f = d[0]
  const mime = f?.mime_type === 'image/png' || f?.mime_type === 'image/jpeg' ? f.mime_type : null
  if (!f?.contenido || !mime || f.contenido.length > MAX_BYTES_CAPTURA_PUERTO) return null
  return { b64: Buffer.from(f.contenido).toString('base64'), mime }
}

/** Captura del atasco si cabe en el tope TOTAL de la respuesta (si no, `null`: el aviso sale sin foto). */
async function capturaDentroDeTope(correduriaId: string, documentoId: string | null, usado: number, suma: (n: number) => void): Promise<Captura | null> {
  const c = await capturaDe(correduriaId, documentoId)
  if (c === null || !cabeCapturaEnRespuesta(usado, c.b64.length)) return null
  suma(c.b64.length)
  return c
}

/**
 * Atascos ESPERANDO de la correduría (el trabajo sigue `atascado`). `pendientesAviso` = solo los que aún no se avisaron;
 * `id` = uno concreto; `conCaptura` añade la imagen (avisos y detalle). Filas ilegibles se cuentan, no desaparecen.
 */
export async function listarAtascos(correduriaId: string, o: { pendientesAviso?: boolean; id?: string | null; conCaptura?: boolean; sinCapturaConDatos?: boolean } = {}): Promise<{ estado: 'ok'; atascos: AtascoVisible[]; ilegibles: number } | { estado: 'sin_esquema' }> {
  if (!(await hayAtascos())) return { estado: 'sin_esquema' }
  const soloAviso = o.pendientesAviso === true
  const id = o.id ?? null
  const filas = await prisma.$queryRaw<FilaAtasco[]>`
    select a.id::text as id, a.trabajo_id::text as trabajo_id, t.oportunidad_id::text as oportunidad_id, a.compania, a.ramo, a.clave, a.tipo,
           a.descripcion, a.etiqueta, a.texto_esperado, a.candidatos, a.created_at, a.caduca_at, a.avisado_at,
           a.captura_documento_id::text as captura_documento_id,
           (select count(*) from seguros.tarificador_atascos b where b.trabajo_id = a.trabajo_id) as ronda,
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente_nombre,
           t.error->'atascoOpciones' as opciones, (t.error->>'capturaConDatos') as captura_con_datos, (t.cliente_id is not null) as con_cliente
    from seguros.tarificador_atascos a
    join seguros.tarificacion_trabajos t on t.id = a.trabajo_id and t.correduria_id = a.correduria_id
    left join seguros.clientes c on c.id = t.cliente_id and c.correduria_id = t.correduria_id
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'esperando' and t.estado = 'atascado' and a.caduca_at > now()
      and (${!soloAviso} or a.avisado_at is null)
      and (${id}::uuid is null or a.id = ${id}::uuid)
    order by a.created_at
    limit 50`
  const atascos: AtascoVisible[] = []
  let ilegibles = 0
  let bytesCapturas = 0
  for (const f of filas) {
    const a = atascoDeFila(f)
    if (!a) { ilegibles++; continue }
    const conDatos = capturaConDatosDe(f)
    atascos.push({
      id: f.id, trabajoId: f.trabajo_id, oportunidadId: f.oportunidad_id, compania: f.compania, ramo: f.ramo, tipo: a.tipo,
      descripcion: a.descripcion, etiqueta: a.etiqueta, textoEsperado: a.textoEsperado, candidatos: candidatosVisibles(a),
      ronda: Number(f.ronda), maxRondas: MAX_RONDAS_ATASCO, creadoEn: f.created_at.toISOString(), caducaEn: f.caduca_at.toISOString(),
      avisadoEn: f.avisado_at?.toISOString() ?? null, hayCaptura: f.captura_documento_id !== null,
      clave: f.clave, clienteNombre: f.cliente_nombre ?? null, opciones: opcionesDeError(f.opciones), capturaConDatos: conDatos,
      // Con datos del tomador, la captura NO va a los avisos (Telegram): solo a la pantalla de plataforma (detalle).
      ...(o.conCaptura ? await (async () => {
        if (o.sinCapturaConDatos && conDatos) return { capturaBase64: null, capturaMime: null }
        const c = await capturaDentroDeTope(correduriaId, f.captura_documento_id, bytesCapturas, (n) => { bytesCapturas += n })
        return { capturaBase64: c?.b64 ?? null, capturaMime: c?.mime ?? null }
      })() : {}),
    })
  }
  return { estado: 'ok', atascos, ilegibles }
}

/** Marca como avisados (idempotente). Solo lo que salió por Telegram. */
export async function marcarAtascosAvisados(correduriaId: string, ids: string[]): Promise<number> {
  if (!ids.length || !(await hayAtascos())) return 0
  return prisma.$executeRaw`
    update seguros.tarificador_atascos set avisado_at = now()
    where correduria_id = ${correduriaId}::uuid and id = any(${ids}::uuid[]) and avisado_at is null`
}

// ─── ATASCO: la respuesta de Alberto ─────────────────────────────────────────

export type RespuestaAtasco = { accion: 'elegir'; n: number } | { accion: 'descartar' }

export type ResultadoRespuestaAtasco =
  | { estado: 'respondido' | 'descartado' | 'sin_cambios'; trabajoId: string; compania: string; ramo: string; pausada: boolean }
  | { estado: 'conflicto'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_esquema' }

/**
 * Aplica la respuesta en UNA transacción con `for update` (atasco y trabajo). Elegir = el candidato N se APRENDE
 * (`humano`, consolidado) y el MISMO trabajo vuelve a `pendiente` con los intentos a 0 (decisión humana). Descartar = el
 * trabajo se cancela (y se purga su riesgo). Pulsar dos veces lo mismo = `sin_cambios`.
 */
export async function responderAtasco(correduriaId: string, atascoId: string, r: RespuestaAtasco, actor: string): Promise<ResultadoRespuestaAtasco> {
  if (!(await hayAtascos())) return { estado: 'sin_esquema' }
  const conConfianza = await hayConfianzaAprendido()
  const conPausas = await hayPausas()
  const quien = actor.slice(0, 200)
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<(FilaAtasco & { estado: string; eleccion: number | null; estado_trabajo: string; caducado: boolean })[]>`
      select a.id::text as id, a.trabajo_id::text as trabajo_id, t.oportunidad_id::text as oportunidad_id, a.compania, a.ramo, a.clave, a.tipo,
             a.descripcion, a.etiqueta, a.texto_esperado, a.candidatos, a.created_at, a.caduca_at, a.avisado_at,
             a.captura_documento_id::text as captura_documento_id, 0::bigint as ronda,
             a.estado, a.eleccion, t.estado as estado_trabajo, (a.caduca_at <= now()) as caducado
      from seguros.tarificador_atascos a
      join seguros.tarificacion_trabajos t on t.id = a.trabajo_id and t.correduria_id = a.correduria_id
      where a.id = ${atascoId}::uuid and a.correduria_id = ${correduriaId}::uuid
      for update of a, t`
    const f = filas[0]
    if (!f) return { estado: 'no_encontrado' as const }
    const pausada = conPausas ? await pausaViva(tx, correduriaId, f.compania, f.ramo) : false
    const base = { trabajoId: f.trabajo_id, compania: f.compania, ramo: f.ramo, pausada }
    if (f.estado !== 'esperando') {
      const mismo = (r.accion === 'elegir' && f.estado === 'respondido' && f.eleccion === r.n) || (r.accion === 'descartar' && f.estado === 'descartado')
      return mismo ? { estado: 'sin_cambios' as const, ...base } : { estado: 'conflicto' as const, motivo: `el atasco ya está ${f.estado}` }
    }
    if (f.estado_trabajo !== 'atascado') return { estado: 'conflicto' as const, motivo: `el trabajo ya está ${f.estado_trabajo}` }
    if (f.caducado) return { estado: 'conflicto' as const, motivo: 'el atasco caducó: el trabajo pasará a error en el próximo barrido' }

    if (r.accion === 'descartar') {
      await tx.$executeRaw`
        update seguros.tarificador_atascos set estado = 'descartado', respondido_at = now(), respondido_por = ${quien}
        where id = ${f.id}::uuid and estado = 'esperando'`
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'cancelado', lease_hasta = null, terminado_at = now(), updated_at = now()
        where id = ${f.trabajo_id}::uuid and estado = 'atascado'`
      await purgarRiesgoTrabajos(tx, [f.trabajo_id])
      return { estado: 'descartado' as const, ...base }
    }

    const a = atascoDeFila(f)
    if (!a) return { estado: 'conflicto' as const, motivo: 'el checkpoint guardado no es legible' }
    // Con la clave de una PISTA del localizador (15/10/2026), el selector tiene que ser una pista estable y no bancaria (validarPista).
    const e = elegirCandidatoAtasco(a.candidatos, r.n, a.clave)
    if (!e.ok) return { estado: 'conflicto' as const, motivo: e.motivo }
    // APRENDER: origen `humano` (consolidado al momento). El worker lo valida otra vez al repetir el camino.
    if (conConfianza) {
      await tx.$executeRaw`
        insert into seguros.tarificador_conocimiento
          (correduria_id, compania, ramo, clave, tipo, selector, marco, origen, confirmaciones, fallos, consolidado_at, consolidado_por, notas)
        values (${correduriaId}::uuid, ${f.compania}, ${f.ramo}, ${a.clave}, ${a.tipo}, ${e.c.selector}, ${e.c.marco}, 'humano', 0, 0, now(), ${quien},
                ${`elegido por Alberto en un atasco (nº ${e.c.n})`})
        on conflict (correduria_id, compania, ramo, clave, selector)
        do update set origen = 'humano', marco = excluded.marco, fallos = 0, descartado_at = null,
                      consolidado_at = coalesce(seguros.tarificador_conocimiento.consolidado_at, now()),
                      consolidado_por = coalesce(seguros.tarificador_conocimiento.consolidado_por, excluded.consolidado_por)`
    } else {
      await tx.$executeRaw`
        insert into seguros.tarificador_conocimiento (correduria_id, compania, ramo, clave, tipo, selector, marco, origen, confirmaciones, notas)
        values (${correduriaId}::uuid, ${f.compania}, ${f.ramo}, ${a.clave}, ${a.tipo}, ${e.c.selector}, ${e.c.marco}, 'humano', 0,
                ${`elegido por Alberto en un atasco (nº ${e.c.n})`})
        on conflict (correduria_id, compania, ramo, clave, selector) do update set origen = 'humano', marco = excluded.marco`
    }
    await tx.$executeRaw`
      update seguros.tarificador_atascos set estado = 'respondido', eleccion = ${e.c.n}::int, respondido_at = now(), respondido_por = ${quien}
      where id = ${f.id}::uuid and estado = 'esperando'`
    // El MISMO trabajo vuelve a la cola: intentos a 0 (decisión humana, como Reintentar de la bandeja). El riesgo sigue entero.
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = 'pendiente', intentos = 0, lease_hasta = null, fly_machine_id = null, terminado_at = null, updated_at = now()
      where id = ${f.trabajo_id}::uuid and estado = 'atascado'`
    return { estado: 'respondido' as const, ...base }
  }, { timeout: 15000, maxWait: 10000 })
}

// ─── RELANZAR (puerto de operador) ───────────────────────────────────────────

export type ResultadoRelanzar =
  | { estado: 'relanzado'; trabajoId: string; compania: string; ramo: string; atascosDescartados: number }
  | { estado: 'conflicto'; status: 409 | 429; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_esquema' }

/** Relanzamientos de la compañía en las últimas 24 h, contados en `auditoria` (solo llamadas que salieron bien). */
export async function contarRelanzamientos24h(compania: string): Promise<number> {
  const f = await prismaAsegura().$queryRaw<{ n: number }[]>`
    select count(*)::int as n from auditoria
    where ruta = '/api/operador/tarificador/relanzar' and metodo = 'POST' and estado_http < 400
      and created_at > now() - interval '24 hours'
      and cambios @> jsonb_build_array(jsonb_build_object('entidad', 'trabajo_tarificador', 'campo', 'relanzado', 'despues', ${compania}::text))`
  return f[0]?.n ?? 0
}

/**
 * Devuelve a `pendiente` un trabajo `atascado` de TARIFICAR (no `requiere_humano`: captcha/OTP mandarían otro SMS) con su MISMO riesgo (intentos 0, lease/fly/error/
 * fechas a null), tras descartar sus atascos esperando. Una transacción: `for update` del trabajo, cerrojo consultivo por
 * compañía y `decidirRelanzar` (estado, pausa, un trabajo vivo por compañía, máx. N cada 24 h). El tope se cuenta en la tabla
 * `auditoria` existente: cada relanzamiento deja ahí el cambio `trabajo_tarificador.relanzado` = compañía (lo escribe `auditado`
 * de la ruta). Sin esa BD no se puede contar y, sin tope, no se relanza. No lanza la máquina: eso lo hace la ruta.
 */
export async function relanzarTrabajo(correduriaId: string, trabajoId: string, actor: string): Promise<ResultadoRelanzar> {
  if (!aseguraConfigurada()) return { estado: 'sin_esquema' }
  const previo = await prisma.$queryRaw<{ compania: string }[]>`
    select compania from seguros.tarificacion_trabajos where id = ${trabajoId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!previo[0]) return { estado: 'no_encontrado' }
  const relanzamientos24h = await contarRelanzamientos24h(previo[0].compania)
  const conAtascos = await hayAtascos()
  const conPausas = await hayPausas()
  const quien = actor.slice(0, 200)
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ estado: string; compania: string; ramo: string; modo: string | null; tipo_error: string | null }[]>`
      select t.estado, t.compania, t.ramo, to_jsonb(t)->>'modo' as modo, to_jsonb(t)->'error'->>'tipo' as tipo_error
      from seguros.tarificacion_trabajos t
      where t.id = ${trabajoId}::uuid and t.correduria_id = ${correduriaId}::uuid for update`
    const f = filas[0]
    if (!f) return { estado: 'no_encontrado' as const }
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`relanzar:${correduriaId}:${f.compania}`}, 0))`
    const vivos = await tx.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from seguros.tarificacion_trabajos w
      where w.correduria_id = ${correduriaId}::uuid and w.compania = ${f.compania} and w.id <> ${trabajoId}::uuid
        and w.estado in ('pendiente', 'en_curso', 'error_reintentable', 'autorizado_emision')`
    const pausada = conPausas ? await pausaViva(tx, correduriaId, f.compania, f.ramo) : false
    const d = decidirRelanzar({ estado: f.estado, modo: f.modo, tipoError: f.tipo_error, vivosCompania: vivos[0]?.n ?? 0, relanzamientos24h, pausada })
    if (!d.ok) return { estado: 'conflicto' as const, status: d.status, motivo: d.motivo }
    const descartados = conAtascos ? await descartarAtascosEsperando(tx, trabajoId, quien) : 0
    await tx.$executeRaw`
      update seguros.tarificacion_trabajos
      set estado = 'pendiente', intentos = 0, lease_hasta = null, fly_machine_id = null, error = null,
          iniciado_at = null, terminado_at = null, updated_at = now()
      where id = ${trabajoId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'atascado'`
    anotarCambio({ entidad: 'trabajo_tarificador', id: trabajoId, campo: 'relanzado', despues: f.compania })
    return { estado: 'relanzado' as const, trabajoId, compania: f.compania, ramo: f.ramo, atascosDescartados: descartados }
  }, { timeout: 15000, maxWait: 10000 })
}

// ─── ATASCO: caducidad (barrido) ─────────────────────────────────────────────

/** Motivo del trabajo `atascado` que se quedó sin atasco `esperando` (huérfano): nadie podía verlo ni elegir. */
export const MENSAJE_ATASCO_HUERFANO = 'Atascado sin punto de espera: el robot paró pero no quedó ningún atasco que elegir (ni pantalla ni Telegram). El trabajo se cierra; vuelve a pedir el presupuesto desde la oportunidad.'

/**
 * Atascos sin respuesta pasada su hora → el trabajo a `error_definitivo` (con el motivo), su riesgo purgado y el corte
 * evaluado. Un atasco cuyo trabajo ya no está `atascado` (lo movió otra vía) se cierra como `descartado`, y un trabajo
 * `atascado` sin atasco `esperando` (huérfano) se cierra como error definitivo. Devuelve cuántos trabajos cerró.
 */
export async function caducarAtascos(correduriaId: string): Promise<number> {
  if (!(await hayAtascos())) return 0
  await prisma.$executeRaw`
    update seguros.tarificador_atascos a set estado = 'descartado'
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'esperando'
      and not exists (select 1 from seguros.tarificacion_trabajos t where t.id = a.trabajo_id and t.estado = 'atascado')`
  // HUÉRFANOS (15/10/2026): un trabajo `atascado` sin NINGÚN atasco `esperando` (lo cerró otra vía, se perdió la fila…) no lo
  // ve ni la pantalla «Bots atascados» ni Telegram y no caducaría nunca: se cierra como error definitivo con su motivo. Margen
  // de 2 min (el atasco se guarda en la MISMA transacción que el estado; el margen es solo prudencia).
  const huerfanos = await prisma.$queryRaw<{ id: string }[]>`
    select t.id::text as id from seguros.tarificacion_trabajos t
    where t.correduria_id = ${correduriaId}::uuid and t.estado = 'atascado' and t.updated_at < now() - interval '2 minutes'
      and not exists (select 1 from seguros.tarificador_atascos a where a.trabajo_id = t.id and a.estado = 'esperando')
    limit 100`
  let n = 0
  for (const h of huerfanos) {
    const tocado = await prisma.$transaction(async (tx) => {
      // READ COMMITTED: si se re-atasca en paralelo, el NOT EXISTS va con la foto vieja; updated_at sí se re-chequea.
      const t = await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'error_definitivo', lease_hasta = null, terminado_at = now(), updated_at = now(),
            error = coalesce(error, '{}'::jsonb) || jsonb_build_object('tipo', coalesce(error->>'tipo', 'portal'), 'mensaje', ${MENSAJE_ATASCO_HUERFANO}::text, 'atasco', 'huerfano')
        where id = ${h.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'atascado'
          and not exists (select 1 from seguros.tarificador_atascos a where a.trabajo_id = ${h.id}::uuid and a.estado = 'esperando')
          and updated_at < now() - interval '2 minutes'`
      if (t > 0) {
        await purgarRiesgoTrabajos(tx, [h.id])
        await evaluarCorte(tx, h.id)
      }
      return t > 0
    }, { timeout: 15000, maxWait: 10000 })
    if (tocado) n++
  }
  const vencidos = await prisma.$queryRaw<{ id: string; trabajo_id: string }[]>`
    select id::text as id, trabajo_id::text as trabajo_id from seguros.tarificador_atascos
    where correduria_id = ${correduriaId}::uuid and estado = 'esperando' and caduca_at <= now()
    limit 100`
  for (const v of vencidos) {
    const tocado = await prisma.$transaction(async (tx) => {
      const mensaje = `Atascado sin respuesta en ${horasAtasco(process.env)} h: nadie eligió el elemento y el trabajo se cierra. Vuelve a pedir el presupuesto desde la oportunidad.`
      const t = await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'error_definitivo', lease_hasta = null, terminado_at = now(), updated_at = now(),
            error = coalesce(error, '{}'::jsonb) || jsonb_build_object('tipo', 'portal', 'mensaje', ${mensaje}::text, 'atasco', 'caducado')
        where id = ${v.trabajo_id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'atascado'`
      await tx.$executeRaw`update seguros.tarificador_atascos set estado = 'caducado' where id = ${v.id}::uuid and estado = 'esperando'`
      if (t > 0) {
        await purgarRiesgoTrabajos(tx, [v.trabajo_id])
        await evaluarCorte(tx, v.trabajo_id)
      }
      return t > 0
    }, { timeout: 15000, maxWait: 10000 })
    if (tocado) n++
  }
  return n
}

// ─── CORTE por compañía/ramo ─────────────────────────────────────────────────

/**
 * PRUEBA DE HUMO (15/10/2026) con la contraseña rechazada: abre la pausa de TODAS las parejas activas de esa compañía (la
 * credencial es de la compañía: repetir el login desde otra pareja es como se bloquea una cuenta) y cancela los humos aún
 * `pendiente` de la compañía (no se repite el login esta noche). Misma pausa que `evaluarCorte` (una viva por pareja; la
 * reanuda Alberto). Sin el SQL de la F2 → 0. Devuelve cuántas pausas abrió.
 */
export async function pausarTrasHumo(db: Db, trabajoId: string): Promise<number> {
  if (!(await hayPausas())) return 0
  const t = await db.$queryRaw<{ correduria_id: string; compania: string; ramo: string }[]>`
    select correduria_id::text as correduria_id, compania, ramo
    from seguros.tarificacion_trabajos w where w.id = ${trabajoId}::uuid and to_jsonb(w)->>'modo' = 'humo'`
  const f = t[0]
  if (!f) return 0
  const activas = await db.$queryRaw<{ ramo: string }[]>`
    select ramo from seguros.companias_integracion
    where correduria_id = ${f.correduria_id}::uuid and compania = ${f.compania} and activo and modo = 'rpa_autorizada'`
  let n = 0
  for (const ramo of new Set([f.ramo, ...activas.map((a) => a.ramo)])) {
    n += await db.$executeRaw`
      insert into seguros.tarificador_pausas (correduria_id, compania, ramo, motivo, trabajos)
      values (${f.correduria_id}::uuid, ${f.compania}, ${ramo}, ${motivoPausaHumo(f.compania, ramo)}, ${[trabajoId]}::uuid[])
      on conflict (correduria_id, compania, ramo) where reanudada_at is null do nothing`
  }
  await db.$executeRaw`
    update seguros.tarificacion_trabajos w
    set estado = 'cancelado', terminado_at = now(), updated_at = now(), lease_hasta = null,
        error = jsonb_build_object('tipo', 'datos', 'mensaje', ${MENSAJE_HUMO_OMITIDO_CREDENCIALES}::text)
    where w.correduria_id = ${f.correduria_id}::uuid and w.compania = ${f.compania} and w.estado = 'pendiente'
      and to_jsonb(w)->>'modo' = 'humo' and w.id <> ${trabajoId}::uuid`
  if (n > 0) console.error(`[tarificador-corte] pausa abierta por la prueba de humo: ${f.compania}`)
  return n
}

/**
 * Cierra las pausas CADUCABLES (`PAUSA_CADUCABLE_REGEX`: solo rachas de errores del bot, no credenciales ni prueba nocturna) sin reanudar con más de `PAUSA_CADUCA_HORAS` (19/10/2026): `reanudada_at = now()`, `reanudada_por = 'caducidad'`.
 * No borra filas (queda el rastro y `evaluarCorte` cuenta los fallos desde ahí). Libera además el hueco del índice «una viva por
 * pareja», que si no impediría abrir una pausa nueva. Sin el SQL de la F2 → 0. Devuelve cuántas cerró.
 */
export async function caducarPausas(correduriaId: string): Promise<number> {
  if (!(await hayPausas())) return 0
  return prisma.$executeRaw`
    update seguros.tarificador_pausas
    set reanudada_at = now(), reanudada_por = 'caducidad'
    where correduria_id = ${correduriaId}::uuid and reanudada_at is null
      and pausada_at <= now() - ${PAUSA_CADUCA_HORAS}::int * interval '1 hour'
      and coalesce(motivo ~ ${PAUSA_CADUCABLE_REGEX}::text, false)`
}

/** ¿Hay una pausa viva para la pareja? (Sin el SQL de la F2 → `false`: comportamiento anterior.) */
export async function pausaViva(db: Db, correduriaId: string, compania: string, ramo: string): Promise<boolean> {
  if (!(await hayPausas())) return false
  const f = await db.$queryRaw<{ ok: number }[]>`
    select 1 as ok from seguros.tarificador_pausas
    where correduria_id = ${correduriaId}::uuid and compania = ${compania} and ramo = ${ramo} and reanudada_at is null
      and not (pausada_at <= now() - ${PAUSA_CADUCA_HORAS}::int * interval '1 hour' and coalesce(motivo ~ ${PAUSA_CADUCABLE_REGEX}::text, false)) limit 1`
  return f.length > 0
}

/**
 * Condición para el `where` de `reclamarSiguiente` (alias `w` de `tarificacion_trabajos`): sin pausa viva de su pareja.
 * Sin el SQL de la F2 → vacía (la tabla no existe y nombrarla rompería la consulta de la cola entera).
 */
export async function sqlSinPausa(): Promise<Prisma.Sql> {
  if (!(await hayPausas())) return Prisma.empty
  return Prisma.sql`and not exists (
    select 1 from seguros.tarificador_pausas p
    where p.correduria_id = w.correduria_id and p.compania = w.compania and p.ramo = w.ramo and p.reanudada_at is null
      and not (p.pausada_at <= now() - ${PAUSA_CADUCA_HORAS}::int * interval '1 hour' and coalesce(p.motivo ~ ${PAUSA_CADUCABLE_REGEX}::text, false)))`
}

/**
 * Tras un `error_definitivo` de un trabajo de TARIFICAR: si los `UMBRAL_CORTE_BOT` últimos cerrados de su pareja (desde la
 * última reanudación) son fallos del bot, o el último es de `credenciales` (basta uno), se abre una pausa (una sola viva por pareja). Misma transacción que el cierre.
 */
export async function evaluarCorte(db: Db, trabajoId: string): Promise<boolean> {
  if (!(await hayPausas())) return false
  const t = await db.$queryRaw<{ correduria_id: string; compania: string; ramo: string; modo: string | null }[]>`
    select correduria_id::text as correduria_id, compania, ramo, to_jsonb(w)->>'modo' as modo
    from seguros.tarificacion_trabajos w where w.id = ${trabajoId}::uuid`
  const f = t[0]
  if (!f || (f.modo ?? 'tarificar') !== 'tarificar') return false
  // `cierre_atasco` (27/10/2026): lo cerró el barrido de un atasco (caducado/huérfano, p. ej. atascos de una versión vieja
  // descartados tras un despliegue): no cuenta como fallo del bot (`cuentaComoFalloBot`) y rompe la racha.
  const ultimos = await db.$queryRaw<{ id: string; estado: string; tipo: string | null; cierre_atasco: string | null }[]>`
    select w.id::text as id, w.estado, w.error->>'tipo' as tipo, w.error->>'atasco' as cierre_atasco
    from seguros.tarificacion_trabajos w
    where w.correduria_id = ${f.correduria_id}::uuid and w.compania = ${f.compania} and w.ramo = ${f.ramo}
      and coalesce(to_jsonb(w)->>'modo', 'tarificar') = 'tarificar'
      -- Un trabajo lanzado con una imagen de PRUEBA (rama-*, 27/10/2026) no dice nada de la de producción: ni corta ni rompe racha.
      and to_jsonb(w)->>'imagen_prueba' is null
      and w.estado in ('ok', 'error_definitivo') and w.terminado_at is not null
      and w.terminado_at > coalesce((select max(p.reanudada_at) from seguros.tarificador_pausas p
                                     where p.correduria_id = w.correduria_id and p.compania = w.compania and p.ramo = w.ramo), '-infinity'::timestamptz)
    order by w.terminado_at desc
    limit ${UMBRAL_CORTE_BOT}`
  const motivo = motivoCorte(ultimos.map((u) => ({ estado: u.estado, tipoError: u.tipo, cierreAtasco: u.cierre_atasco })), { compania: f.compania, ramo: f.ramo })
  if (!motivo) return false
  const n = await db.$executeRaw`
    insert into seguros.tarificador_pausas (correduria_id, compania, ramo, motivo, trabajos)
    values (${f.correduria_id}::uuid, ${f.compania}, ${f.ramo}, ${motivo}, ${ultimos.map((u) => u.id)}::uuid[])
    on conflict (correduria_id, compania, ramo) where reanudada_at is null do nothing`
  if (n > 0) console.error(`[tarificador-corte] pausa abierta: ${f.compania}/${f.ramo}`)
  return n > 0
}

export type PausaVisible = { id: string; compania: string; ramo: string; motivo: string; pausadaEn: string; avisadaEn: string | null; pendientes: number }

/** Pausas VIVAS de la correduría (con cuántos trabajos esperan detrás). `pendientesAviso` = solo las no avisadas. */
export async function listarPausas(correduriaId: string, o: { pendientesAviso?: boolean } = {}): Promise<{ estado: 'ok'; pausas: PausaVisible[] } | { estado: 'sin_esquema' }> {
  if (!(await hayPausas())) return { estado: 'sin_esquema' }
  const soloAviso = o.pendientesAviso === true
  const filas = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; motivo: string; pausada_at: Date; avisada_at: Date | null; pendientes: bigint }[]>`
    select p.id::text as id, p.compania, p.ramo, p.motivo, p.pausada_at, p.avisada_at,
           (select count(*) from seguros.tarificacion_trabajos w
             where w.correduria_id = p.correduria_id and w.compania = p.compania and w.ramo = p.ramo and w.estado = 'pendiente') as pendientes
    from seguros.tarificador_pausas p
    where p.correduria_id = ${correduriaId}::uuid and p.reanudada_at is null and (${!soloAviso} or p.avisada_at is null)
    order by p.pausada_at
    limit 50`
  return {
    estado: 'ok',
    pausas: filas.map((p) => ({ id: p.id, compania: p.compania, ramo: p.ramo, motivo: p.motivo, pausadaEn: p.pausada_at.toISOString(), avisadaEn: p.avisada_at?.toISOString() ?? null, pendientes: Number(p.pendientes) })),
  }
}

export async function marcarPausasAvisadas(correduriaId: string, ids: string[]): Promise<number> {
  if (!ids.length || !(await hayPausas())) return 0
  return prisma.$executeRaw`
    update seguros.tarificador_pausas set avisada_at = now()
    where correduria_id = ${correduriaId}::uuid and id = any(${ids}::uuid[]) and avisada_at is null`
}

/** Reanuda (solo Alberto, por el puerto). Idempotente: una ya reanudada → `sin_cambios`. */
export async function reanudarPausa(correduriaId: string, id: string, actor: string): Promise<{ estado: 'reanudada' | 'sin_cambios'; compania: string; ramo: string } | { estado: 'no_encontrado' } | { estado: 'sin_esquema' }> {
  if (!(await hayPausas())) return { estado: 'sin_esquema' }
  const f = await prisma.$queryRaw<{ compania: string; ramo: string; reanudada: boolean }[]>`
    update seguros.tarificador_pausas p
    set reanudada_at = coalesce(p.reanudada_at, now()), reanudada_por = coalesce(p.reanudada_por, ${actor.slice(0, 200)})
    where p.id = ${id}::uuid and p.correduria_id = ${correduriaId}::uuid
    returning p.compania, p.ramo, (p.reanudada_at < now()) as reanudada`
  const r = f[0]
  if (!r) return { estado: 'no_encontrado' }
  return { estado: r.reanudada ? 'sin_cambios' : 'reanudada', compania: r.compania, ramo: r.ramo }
}
