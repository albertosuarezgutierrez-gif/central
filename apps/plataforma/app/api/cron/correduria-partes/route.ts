// ────────────────────────────────────────────────────────────────────────────
// Vigía de los PARTES DEL PORTAL que nadie ha abierto en la compañía.
//
// ── El hueco, medido el 05/09/2026 ─────────────────────────────────────────
//
// El cliente da parte en `apps/asegura-portal`, la fila entra en
// `seguros.portal_parte_siniestro`, `apps/asegura` la sirve por
// `/api/operador/partes`… y ahí se acababa. **Ningún cron, ningún Telegram,
// ningún correo.** El plazo del art. 16 LCS se calculaba y solo se PINTABA: si
// Alberto no abría `/correduria`, nadie se enteraba.
//
// O sea, un cliente podía contarnos un accidente el viernes, quedarse tranquilo
// —la pantalla le dijo que nos había llegado— y que los siete días se
// consumieran sin que nada fallara. No se ve, no da error, y lo paga quien
// confió en la pantalla.
//
// La regla pura (qué sigue pendiente, qué se dice y qué NO se puede decir) vive
// en `@central/module-seguros` (`parte-vigilancia.ts`), con sus cepos y sus
// mutaciones comprobadas.
//
// ── Las dos reglas duras de este fichero ───────────────────────────────────
//
//  1. **No poder mirar NO es «no hay partes».** Cualquier duda del puerto acaba
//     en un aviso que lo dice con esas palabras, nunca en un silencio. Un vigía
//     que se calla porque la consulta falló es el fallo más caro que hay.
//  2. **Si el aviso no sale, la firma NO se guarda.** Guardarla igual haría que
//     mañana pareciera «sin cambios» y el parte se perdería para siempre sin que
//     nada fallara. Es la misma regla que la marca de agua de
//     `correduria-siniestros` y la fecha de aviso de `correduria-ingesta`.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import {
  firmaPartes,
  partesPendientes,
  textoAvisoPartes,
  type ParteVigilado,
} from '@central/module-seguros'

import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { interpretarPartes, partesAsegura, textoMotivoParte, type ParteSiniestro } from '@/lib/partes-asegura'
import { tgAviso } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'correduria_partes'

/**
 * Se piden holgados a propósito: el corte del MENSAJE lo hace la regla pura
 * (`TOPE_AVISO_PARTES`) y aquí lo que importa es no dejarse ninguno sin VER —
 * la firma de una lista truncada diría «sin cambios» de partes que ni se han
 * mirado.
 */
const LIMITE = 300

/**
 * `null` en `diasRestantes` = no se pudo calcular (el parte llegó sin fecha del
 * hecho). **No se colapsa a un número**: la regla pura tiene un cubo propio
 * para eso —`sin_plazo`— y lo pone por delante de los holgados, porque no poder
 * contar el plazo es justo el caso que hay que mirar a mano.
 */
function aVigilado(p: ParteSiniestro): ParteVigilado {
  return {
    id: p.id,
    cliente: p.cliente?.nombre ?? null,
    estado: p.estado,
    comunicado: p.comunicado,
    diasRestantes: p.plazo?.diasRestantes ?? null,
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // La firma de la última pasada QUE AVISÓ, en la cabecera del `detalle` del
  // latido. Mismo sitio que `correduria-ingesta`: no hace falta tabla nueva.
  let firmaAnterior: string | null = null
  try {
    const filas = await prisma.$queryRaw<Array<{ detalle: string | null }>>(Prisma.sql`
      SELECT detalle FROM agente_latidos WHERE agente = ${AGENTE}`)
    const d = filas[0]?.detalle ?? null
    if (d !== null) firmaAnterior = d.split(' · ')[0] ?? null
  } catch {
    // Sin estado anterior el aviso se comporta como una primera vez: suena. Es
    // el lado seguro — la alternativa sería callarse por no poder recordar.
    firmaAnterior = null
  }

  const { status, json } = await partesAsegura({ limite: LIMITE })
  const lectura = interpretarPartes(status, json)

  if (lectura.estado !== 'ok') {
    // 🚨 No se guarda ninguna firma: mañana esto vuelve a ser una primera vez.
    const causa = lectura.estado === 'error' ? textoMotivoParte(lectura.motivo) : lectura.estado
    await tgAviso(
      'correduria.parte-sin-abrir',
      '🚑 <b>Partes del portal</b>\nNo he podido comprobar si hay partes sin abrir en la compañía ' +
        `(${causa}). Esto NO significa que no haya ninguno: significa que hoy no se ha podido mirar.`,
      { html: true },
    ).catch(() => {})
    await registrarLatido(AGENTE, false, `sin lectura: ${causa}`).catch(() => {})
    return NextResponse.json({ ok: false, causa })
  }

  const vigilados = lectura.partes.map(aVigilado)
  const pendientes = partesPendientes(vigilados)
  const firmaActual = firmaPartes(vigilados)

  // Nada pendiente: se guarda la firma vacía —que es un estado legítimo— para
  // que el día que entre el primero cuente como cambio y suene.
  if (pendientes.length === 0) {
    await registrarLatido(
      AGENTE,
      true,
      ` · sin partes pendientes de abrir (${lectura.partes.length} vistos)`,
    ).catch(() => {})
    return NextResponse.json({ ok: true, pendientes: 0, ilegibles: lectura.ilegibles })
  }

  // 🚨 La firma va por CUBO de urgencia, no por días exactos: si no, sonaría los
  // siete días seguidos de cada parte, y un aviso que suena a diario se silencia
  // —y entonces deja de sonar también el día que importa. Suena cuando entra uno
  // nuevo y cuando uno EMPEORA de cubo, que es cuando hay algo nuevo que hacer.
  if (firmaAnterior === firmaActual) {
    await registrarLatido(
      AGENTE,
      true,
      `${firmaActual} · ${pendientes.length} pendientes, sin cambios`,
    ).catch(() => {})
    return NextResponse.json({ ok: true, pendientes: pendientes.length, avisado: false })
  }

  const aviso = textoAvisoPartes(vigilados)
  // Las filas que llegaron con forma rara se declaran: un parte ilegible es un
  // parte que existe y que este aviso no está contando.
  const cola =
    lectura.ilegibles > 0
      ? `\n\n⚠️ Y ${lectura.ilegibles} fila(s) llegaron ilegibles del puerto: no están contadas aquí.`
      : ''

  const enviado = await tgAviso('correduria.parte-sin-abrir', aviso.texto + cola, { html: true })
    .then((r) => r !== null)
    .catch(() => false)

  // 🚨 Si el aviso no salió, la firma NO se guarda: mañana vuelve a intentarlo.
  const detalle = enviado
    ? `${firmaActual} · ${aviso.pendientes} pendientes de abrir en la compañía`
    : `${firmaAnterior ?? ''} · ${aviso.pendientes} pendientes; el aviso NO salió`

  await registrarLatido(AGENTE, enviado, detalle).catch(() => {})
  return NextResponse.json({ ok: true, pendientes: aviso.pendientes, avisado: enviado })
}
