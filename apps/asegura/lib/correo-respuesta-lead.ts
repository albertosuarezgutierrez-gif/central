// La RESPUESTA de un lead en su hilo (19/10/2026, spec lead → propuesta F2). Puerto
// `POST /api/operador/correo/respuesta-lead` (`accion: 'casar' | 'guardar'`) y `POST /api/operador/correo/adjunto`.
//
// Plataforma lee el correo (IMAP + IA, validando contra el texto) y manda aquí SOLO claves del contrato con valor. Aquí:
//   · casar: el hilo se busca por sus Message-ID Y por el índice ciego del remitente (un correo de otra persona que cite
//     el hilo no casa). 0 hilos o hilos de varios clientes → no se lee nada.
//   · guardar: por oportunidad del hilo, en UNA transacción con la fila bloqueada, se vuelve a validar cada valor
//     (`validarValorContrato`), se decide con `decidirFusion` (nunca pisa: lo distinto es discrepancia; lo del bloque
//     confirmado por Alberto no toca el bloque) y se escribe `info_riesgo.datosContrato` (+ los huecos del bloque del
//     ramo por `calcularEdicionRiesgo`, el mismo camino que la pantalla del riesgo). DNI, nacimiento, teléfono y datos
//     de terceros se guardan CIFRADOS (`cifrarJsonEstricto`); sin `PII_ENCRYPTION_KEY` NO se guardan y se dice.
//   · adjunto: el binario se cifra entero y va a `seguros.correduria_adjunto` (SQL 2026-10-19c). Sin clave o sin
//     tabla, no se guarda. Nadie lo lee (ni IA ni Telegram): decisión de Alberto.
// Todo SQL lleva `correduria_id` (puerta única `lib/tenant`). Nada de valores en logs ni en la respuesta: solo claves.
import { prisma } from './tenant'
import { prismaAsegura } from './asegura-db'
import {
  calcularEdicionRiesgo, camposLeibles, claveDatosDeRamo, conocidosDeBloque, decidirFusion, faltanObligatorios,
  nombreDePila, seGuardaCifrado, validarValorContrato, type ValorContrato,
} from '@central/module-seguros'
import {
  agruparHilos, anadirDatosContrato, conPendientes, conocidosDeFicha, estadoDatosTrasRespuesta, leerDatosContrato, previosDeFicha, textoHistorialRespuesta,
  type AdjuntoLead, type Casado, type Casar, type FilaHilo, type Guardar, type ValorGuardado,
} from './correo-respuesta-lead-puro'

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const sinTabla = (err: unknown) => {
  const code = (err as { code?: string; meta?: { code?: string } })?.meta?.code ?? (err as { code?: string })?.code
  return code === '42P01' || /relation .* does not exist/i.test(String((err as Error)?.message))
}

async function hashEmail(from: string): Promise<string | null> {
  const { computeEmailLookupHash } = await import('@central/module-seguros-pii')
  try { return computeEmailLookupHash(from) } catch { return null }
}

async function filasHilo(correduriaId: string, where: { referencias: string[] } | { hiloId: string }, emailCiego: string): Promise<FilaHilo[]> {
  const filas = 'referencias' in where
    ? await prisma.$queryRaw<{ id: bigint; cliente_id: string; raiz: string; oportunidad_id: string | null; ramo: string | null }[]>`
        select h.id, h.cliente_id::text as cliente_id, h.message_id_raiz as raiz, h.oportunidad_id::text as oportunidad_id, o.tipo::text as ramo
        from seguros.correduria_hilo h
        left join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id
        where h.correduria_id = ${correduriaId}::uuid and h.email_cliente_ciego = ${emailCiego}
          and h.message_ids && ${where.referencias}::text[]`
    : await prisma.$queryRaw<{ id: bigint; cliente_id: string; raiz: string; oportunidad_id: string | null; ramo: string | null }[]>`
        select h.id, h.cliente_id::text as cliente_id, h.message_id_raiz as raiz, h.oportunidad_id::text as oportunidad_id, o.tipo::text as ramo
        from seguros.correduria_hilo h
        join seguros.correduria_hilo r on r.id = ${BigInt(where.hiloId)} and r.correduria_id = h.correduria_id
          and r.cliente_id = h.cliente_id and r.message_id_raiz = h.message_id_raiz
        left join seguros.oportunidades o on o.id = h.oportunidad_id and o.correduria_id = h.correduria_id
        where h.correduria_id = ${correduriaId}::uuid and h.email_cliente_ciego = ${emailCiego}`
  return filas.map((f) => ({ id: String(f.id), clienteId: f.cliente_id, raiz: f.raiz, oportunidadId: f.oportunidad_id, ramo: f.ramo }))
}

async function ficha(correduriaId: string, clienteId: string) {
  return prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: { nombre: true, apellidos: true, dniLookupHash: true, telefonoLookupHash: true, emailLookupHash: true, fechaNacimiento: true, estadoCivil: true },
  })
}

export type ResultadoCasar = Exclude<Casado, { estado: 'ok' }> | { estado: 'sin_tabla' } | { estado: 'ok'; hiloId: string; clienteId: string; pila: string | null; oportunidades: { id: string; ramo: string }[] }

export async function casarRespuestaLead(correduriaId: string, c: Casar): Promise<ResultadoCasar> {
  const h = await hashEmail(c.from)
  if (!h) return { estado: 'sin_hilo' }
  let filas: FilaHilo[]
  try { filas = await filasHilo(correduriaId, { referencias: c.referencias }, h) } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
  const r = agruparHilos(filas)
  if (r.estado !== 'ok') return r
  const f = await ficha(correduriaId, r.clienteId)
  if (!f) return { estado: 'sin_hilo' }
  return { estado: 'ok', hiloId: r.hiloId, clienteId: r.clienteId, pila: nombreDePila(f.nombre), oportunidades: r.oportunidades }
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

export type ResultadoOportunidad = {
  id: string; ramo: string
  nuevos: string[]; iguales: string[]; discrepancias: string[]; protegidos: string[]; sinClave: string[]; invalidos: string[]
  faltan: string[]
  /** F3b: discrepancias que esperan la elección de Alberto (claves). Con alguna, la oportunidad NO está completa. */
  pendientes: string[]
  /** `false` = no se pudo escribir (la oportunidad ya no es de la correduría o la BD falló): nada se dio por sabido. */
  guardado: boolean
}
export type ResultadoGuardar =
  | { estado: 'sin_hilo' | 'ambiguo' | 'sin_tabla' | 'sin_oportunidad' }
  | { estado: 'ok'; clienteId: string; pila: string | null; oportunidades: ResultadoOportunidad[]; completo: boolean; estadoDatos: string; estadoHilo: string | null; historial: boolean }

/** Estados del hilo que ya tienen precio pedido o propuesta: una respuesta no los hace retroceder (F4). */
const ESTADOS_CON_PRECIO = new Set(['tarificando', 'tarificada', 'propuesta_enviada'])

/** Cifra en un sobre `v1:`; sin clave (o con clave rota) → `null`: NO se guarda en claro. */
async function cifrar(valor: ValorContrato): Promise<string | null> {
  const { cifrarJsonEstricto } = await import('@central/module-seguros-pii')
  try { return cifrarJsonEstricto(valor) } catch { return null }
}
async function descifrar(v: ValorGuardado): Promise<unknown> {
  if (!esObj(v)) return v
  const { descifrarJsonEstricto } = await import('@central/module-seguros-pii')
  try { return descifrarJsonEstricto((v as { cifrado: string }).cifrado) } catch { return '¿?' } // ilegible: cuenta como «ya hay algo» (no se pisa)
}

export async function guardarRespuestaLead(correduriaId: string, g: Guardar): Promise<ResultadoGuardar> {
  const h = await hashEmail(g.from)
  if (!h) return { estado: 'sin_hilo' }
  let filas: FilaHilo[]
  try { filas = await filasHilo(correduriaId, { hiloId: g.hiloId }, h) } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
  const casado = agruparHilos(filas)
  if (casado.estado !== 'ok') return { estado: casado.estado }
  if (!casado.oportunidades.length) return { estado: 'sin_oportunidad' }
  const f = await ficha(correduriaId, casado.clienteId)
  if (!f) return { estado: 'sin_hilo' }

  const pii = await import('@central/module-seguros-pii')
  const deFicha = new Set(conocidosDeFicha(f))
  // Lo de la ficha con lo que se compara: nombre y apellidos en claro, estado civil (por categoría), nacimiento DESCIFRADO
  // (revisión F2: antes no se comparaba y uno distinto se guardaba como nuevo), y DNI/teléfono por hash más abajo.
  const previosFicha: Record<string, unknown> = previosDeFicha(f, deFicha, pii.decryptField)
  const hoy = hoyMadrid()
  const ahora = new Date().toISOString()
  const resultados: ResultadoOportunidad[] = []

  for (const op of casado.oportunidades) {
    const leibles = new Map(camposLeibles([op.ramo]).map((c) => [c.clave, c]))
    const nuevos: Record<string, ValorContrato> = {}
    const invalidos: string[] = []
    for (const [k, v] of Object.entries(g.valores)) {
      if (!leibles.has(k)) continue
      const val = validarValorContrato(k, v, hoy)
      if (val.ok) nuevos[k] = val.valor
      else invalidos.push(k)
    }
    const fichaDni = nuevos.dni !== undefined && f.dniLookupHash
      ? (safe(() => pii.computeDniLookupHash(String(nuevos.dni))) === f.dniLookupHash ? 'igual' : 'distinto') as 'igual' | 'distinto'
      : null
    if (nuevos.telefono !== undefined && f.telefonoLookupHash) {
      previosFicha.telefono = safe(() => pii.computeTelefonoLookupHash(String(nuevos.telefono))) === f.telefonoLookupHash ? nuevos.telefono : '¿otro?'
    }
    try {
      const r = await prisma.$transaction(async (tx) => {
        const [fila] = await tx.$queryRaw<{ tipo: string; info_riesgo: Record<string, unknown> | null; poliza_id: string | null }[]>`
          select o.tipo::text as tipo, o.info_riesgo, o.poliza_id::text as poliza_id from seguros.oportunidades o
          where o.id = ${op.id}::uuid and o.correduria_id = ${correduriaId}::uuid and o.cliente_id = ${casado.clienteId}::uuid
          for update`
        if (!fila) return null
        const info = esObj(fila.info_riesgo) ? fila.info_riesgo : {}
        const claveBloque = claveDatosDeRamo(fila.tipo)
        const bloque = esObj(info[claveBloque]) ? (info[claveBloque] as Record<string, unknown>) : null
        const dc = leerDatosContrato(info.datosContrato)
        const previos: Record<string, unknown> = { ...previosFicha }
        for (const [k, v] of Object.entries(dc.valores)) {
          if (k === 'dni' && esObj(v) && typeof v.hash === 'string' && nuevos.dni !== undefined) {
            previos.dni = safe(() => pii.computeDniLookupHash(String(nuevos.dni))) === v.hash ? nuevos.dni : '¿otro?'
          } else previos[k] = await descifrar(v)
        }
        const d = decidirFusion({ nuevos, previos, claveBloque, bloque, fichaDni })
        // Lo nuevo, en su forma guardada (cifrado lo personal; sin clave, fuera).
        const aGuardar: Record<string, ValorGuardado> = {}
        const sinClave: string[] = []
        for (const k of d.escribir) {
          const campo = leibles.get(k)!
          if (!seGuardaCifrado(campo)) { aGuardar[k] = nuevos[k]; continue }
          const sobre = await cifrar(nuevos[k])
          if (!sobre) { sinClave.push(k); continue }
          aGuardar[k] = k === 'dni' ? { cifrado: sobre, hash: safe(() => pii.computeDniLookupHash(String(nuevos[k]))) ?? undefined } : { cifrado: sobre }
        }
        let infoNueva: Record<string, unknown> = { ...info }
        // Los huecos del bloque del ramo (no confirmado), por el MISMO cálculo que la pantalla del riesgo. Con póliza y
        // sin bloque propio, no: `calcularEdicionRiesgo` sin la precarga de la póliza la perdería.
        let aBloque = d.aBloque.filter((k) => k in aGuardar && !esObj(aGuardar[k]))
        if (aBloque.length && (bloque || !fila.poliza_id)) {
          for (let intento = 0; intento < 2 && aBloque.length; intento++) {
            const parcial = Object.fromEntries(aBloque.map((k) => [k, nuevos[k]]))
            const e = calcularEdicionRiesgo({ ramo: fila.tipo, clave: claveBloque, info: infoNueva, parcial, confirmar: false, ahora, hoy, precarga: null })
            if (e.ok) { if (e.hayQueEscribir) infoNueva = e.infoNueva as Record<string, unknown>; break }
            const malos = new Set((e.errores ?? []).map((x) => x.campo))
            aBloque = malos.size ? aBloque.filter((k) => !malos.has(k)) : []
          }
        }
        // F3b: lo DISTINTO queda pendiente de que Alberto elija (cifrado lo personal; sin clave, no se guarda y se dice).
        const distintos: Record<string, ValorGuardado> = {}
        for (const k of d.discrepancias) {
          const campo = leibles.get(k)
          if (!campo || nuevos[k] === undefined) continue
          if (!seGuardaCifrado(campo)) { distintos[k] = nuevos[k]; continue }
          const sobre = await cifrar(nuevos[k])
          if (!sobre) { sinClave.push(k); continue }
          distintos[k] = k === 'dni' ? { cifrado: sobre, hash: safe(() => pii.computeDniLookupHash(String(nuevos[k]))) ?? undefined } : { cifrado: sobre }
        }
        const dcNuevo = conPendientes(anadirDatosContrato(dc, aGuardar, { ahora, correo: g.gmailMessageId }), distintos)
        infoNueva = { ...infoNueva, datosContrato: dcNuevo }
        const nuevosGuardados = Object.keys(aGuardar)
        if (nuevosGuardados.length || Object.keys(distintos).length) {
          await tx.$executeRaw`
            update seguros.oportunidades set info_riesgo = ${JSON.stringify(infoNueva)}::jsonb
            where id = ${op.id}::uuid and correduria_id = ${correduriaId}::uuid`
        }
        await tx.$executeRaw`
          insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
          values (${correduriaId}::uuid, ${op.id}::uuid, 'datos_cliente_correo',
                  ${JSON.stringify({ nuevos: nuevosGuardados, discrepancias: d.discrepancias, protegidos: d.protegidos, sinClave, invalidos })}::jsonb, ${g.actor})`
        const bloqueFinal = esObj(infoNueva[claveBloque]) ? (infoNueva[claveBloque] as Record<string, unknown>) : null
        const conocidos = new Set([...deFicha, ...Object.keys(dcNuevo.valores), ...conocidosDeBloque(fila.tipo, bloqueFinal)])
        return {
          id: op.id, ramo: fila.tipo, nuevos: nuevosGuardados, iguales: d.iguales, discrepancias: d.discrepancias,
          protegidos: d.protegidos, sinClave, invalidos, faltan: faltanObligatorios(fila.tipo, conocidos).map((c) => c.clave), guardado: true,
          pendientes: Object.keys(dcNuevo.pendientes),
        } satisfies ResultadoOportunidad
      })
      if (r) resultados.push(r)
    } catch (e) {
      console.error('[correo-respuesta-lead] oportunidad no guardada:', e instanceof Error ? e.name : 'error')
      // Nada se da por sabido: lo que falta es TODO lo obligatorio que la ficha no tiene.
      resultados.push({
        id: op.id, ramo: op.ramo, nuevos: [], iguales: [], discrepancias: [], protegidos: [], sinClave: [], invalidos, guardado: false,
        faltan: faltanObligatorios(op.ramo, deFicha).map((c) => c.clave), pendientes: [],
      })
    }
  }
  if (!resultados.length) return { estado: 'sin_oportunidad' }

  const completo = resultados.every((r) => r.guardado && r.faltan.length === 0 && r.pendientes.length === 0)
  const estadoDatos = estadoDatosTrasRespuesta(completo ? 0 : 1)
  // F4: el estado REAL del hilo tras la respuesta. Con precio ya pedido (tarificando/tarificada) o propuesta enviada no
  // retrocede, y plataforma no vuelve a ofrecer tarificar: la respuesta (p. ej. sus necesidades) actualiza la propuesta.
  let estadoHilo: string | null = null
  try {
    const f = await prisma.$queryRaw<{ estado_datos: string }[]>`
      update seguros.correduria_hilo
      set estado_datos = case when estado_datos in ('sin_pedir', 'pedida', 'incompleta', 'lista_para_tarificar') then ${estadoDatos} else estado_datos end,
          ultimo_contacto_cliente_at = now(),
          message_ids = array(select distinct unnest(message_ids || array[${g.gmailMessageId}]::text[]))
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${casado.clienteId}::uuid and message_id_raiz = ${casado.raiz}
      returning estado_datos`
    estadoHilo = f.find((x) => ESTADOS_CON_PRECIO.has(x.estado_datos))?.estado_datos ?? f[0]?.estado_datos ?? null
  } catch (e) {
    console.error('[correo-respuesta-lead] hilo sin actualizar:', e instanceof Error ? e.name : 'error')
  }
  let historial = false
  try {
    const nuevos = resultados.reduce((n, r) => n + r.nuevos.length, 0)
    const discrepancias = resultados.reduce((n, r) => n + r.discrepancias.length, 0)
    const faltan = new Set(resultados.flatMap((r) => r.faltan)).size
    await prisma.$executeRaw`
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${casado.clienteId}::uuid, cast('contacto' as seguros.tipo_historial_interno),
              ${textoHistorialRespuesta({ nuevos, discrepancias, faltan, actor: g.actor })})`
    historial = true
  } catch (e) {
    console.error('[correo-respuesta-lead] historial no anotado:', e instanceof Error ? e.name : 'error')
  }
  return { estado: 'ok', clienteId: casado.clienteId, pila: nombreDePila(f.nombre), oportunidades: resultados, completo, estadoDatos: completo ? 'lista_para_tarificar' : 'incompleta', estadoHilo, historial }
}

function safe<T>(fn: () => T): T | null {
  try { return fn() } catch { return null }
}

// ─── Adjuntos ────────────────────────────────────────────────────────────────

export type ResultadoAdjunto = { estado: 'guardado' | 'repetido' | 'sin_clave' | 'sin_tabla' | 'sin_hilo' }

/**
 * Guarda un adjunto del cliente CIFRADO entero (contenido y nombre) ligado a su ficha y a la oportunidad del hilo.
 * Fail-closed: sin `PII_ENCRYPTION_KEY` no se guarda, tampoco en desarrollo. Idempotente por (correo, sha256).
 */
export async function guardarAdjuntoLead(correduriaId: string, a: AdjuntoLead): Promise<ResultadoAdjunto> {
  const { cifrarJsonEstricto } = await import('@central/module-seguros-pii')
  let contenido: string, nombre: string
  try {
    contenido = cifrarJsonEstricto(a.contenido.toString('base64'))
    nombre = cifrarJsonEstricto(a.nombre)
  } catch {
    return { estado: 'sin_clave' }
  }
  const h = await hashEmail(a.from)
  if (!h) return { estado: 'sin_hilo' }
  let filas: FilaHilo[]
  try { filas = await filasHilo(correduriaId, { hiloId: a.hiloId }, h) } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
  const c = agruparHilos(filas)
  if (c.estado !== 'ok') return { estado: 'sin_hilo' }
  const { createHash } = await import('node:crypto')
  const sha256 = createHash('sha256').update(a.contenido).digest('hex')
  try {
    const n = await prisma.$executeRaw`
      insert into seguros.correduria_adjunto
        (correduria_id, cliente_id, oportunidad_id, hilo_id, gmail_message_id, nombre_cifrado, mime_type, size_bytes, sha256, contenido_cifrado)
      values (${correduriaId}::uuid, ${c.clienteId}::uuid, ${c.oportunidades[0]?.id ?? null}::uuid, ${BigInt(c.hiloId)}, ${a.gmailMessageId},
              ${nombre}, ${a.mime}, ${a.contenido.length}, ${sha256}, ${contenido})
      on conflict (correduria_id, gmail_message_id, sha256) do nothing`
    return { estado: n > 0 ? 'guardado' : 'repetido' }
  } catch (e) {
    if (sinTabla(e)) return { estado: 'sin_tabla' }
    throw e
  }
}
