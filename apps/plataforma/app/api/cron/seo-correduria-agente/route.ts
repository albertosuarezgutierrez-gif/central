// Cron SEO AUTÓNOMO de la correduría — lunes 09:00 UTC (30 min detrás de `seo-correduria`,
// que deja escrita la foto semanal de la que este agente se alimenta).
//
// Qué hace: mira qué ramos de apps/asegura-web NO aparecen en el top-10 de su consulta
// principal (SERP semanal), propone un title/description nuevo con la IA gratis de la
// pasarela, y abre un PR DRAFT contra apps/asegura-web — NUNCA escribe a main directo y
// NUNCA lo mergea. Alberto revisa el diff (CI + `ramos.test.ts`, que ya bloquea precio y
// acotamiento geográfico) antes de mergear.
//
// Kill switch: SEO_ASEGURA_AGENT_ENABLED debe ser EXACTAMENTE 'true' o esto no hace nada.
// Guardarraíles: apps/plataforma/lib/seo-correduria/agente-guardrails.ts (ver ahí el porqué).
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { aiComplete } from '@central/core-ai'
import { revisarCopy } from '@central/module-seguros'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram'
import { CONSULTAS } from '@/lib/seo-correduria/consultas'
import {
  agenteHabilitado, maxCambios, minImpresiones,
} from '@/lib/seo-correduria/agente-guardrails'
import { candidatosRamo, slugDeRuta } from '@/lib/seo-correduria/agente-decidir'
import { leerCampoRamo, aplicarCambioRamo } from '@/lib/seo-correduria/agente-ramos-texto'
import { leerRamosTs, proponerCambioRamos } from '@/lib/seo-correduria/agente-github'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'seo_correduria_agente'
const TITLE_MAX = 49 // 65 - ' · Grupo ASegura' (16), ver apps/asegura-web/lib/ramos.test.ts
const DESC_MIN = 110
const DESC_MAX = 165

/** Los slugs de ramo con página propia, derivados de CONSULTAS (fuente única con la skill
 *  seo-asegura). No se duplica la lista de ramos aquí: si CONSULTAS no la trae, no es editable. */
const RAMOS_EDITABLES = [...new Set(CONSULTAS.map((c) => slugDeRuta(c.pagina)).filter((s): s is string => s !== null))]

const SYSTEM = `Escribes metadata SEO para páginas de ramo de Grupo ASegura (correduría de seguros,
grupoasegura.es), que media en TODA ESPAÑA.

🚨 REGLAS INVIOLABLES:
- NUNCA prometas precio, ahorro ni superlativos ("el mejor", "más barato", "ahorra un X%").
  Un texto así convierte la información en asesoramiento (RDL 3/2020) y arrastra análisis
  objetivo documentado + IPID. Habla de lo que se REVISA, no de lo que se garantiza.
- NUNCA acotes el ámbito a Sevilla, Andalucía ni ninguna provincia: se media en toda España.
- Responde SOLO con el JSON pedido, sin explicación alrededor.`

async function proponerTexto(slug: string, tituloActual: string, descActual: string, consulta: string) {
  const prompt = `Ramo: ${slug}. Consulta objetivo que NO está en el top-10 de Google: "${consulta}".
Title actual (sin la marca, que se añade sola): "${tituloActual}"
Description actual: "${descActual}"

Propón un title (máx ${TITLE_MAX} caracteres, SIN la marca "Grupo ASegura") y una description
(entre ${DESC_MIN} y ${DESC_MAX} caracteres) mejor orientados a esa consulta, manteniendo el tono
informativo (correduría, varias compañías, revisar antes de contratar). Responde SOLO:
{"title":"...","description":"..."}`
  const texto = await aiComplete(prompt, { system: SYSTEM, maxTokens: 500, temperature: 0.4 })
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`la IA no devolvió JSON para '${slug}': ${texto.slice(0, 200)}`)
  const json = JSON.parse(m[0]) as { title?: string; description?: string }
  if (!json.title || !json.description) throw new Error(`JSON incompleto para '${slug}'`)
  return { title: json.title.trim(), description: json.description.trim() }
}

/** `null` = pasa todos los guardarraíles de copy/longitud. Si no, el motivo por el que se descarta. */
function validar(propuesta: { title: string; description: string }): string | null {
  if (propuesta.title.length > TITLE_MAX) return `title de ${propuesta.title.length} chars (máx ${TITLE_MAX})`
  if (propuesta.description.length < DESC_MIN || propuesta.description.length > DESC_MAX) {
    return `description de ${propuesta.description.length} chars (rango ${DESC_MIN}-${DESC_MAX})`
  }
  const infracciones = revisarCopy(`${propuesta.title} ${propuesta.description}`)
  if (infracciones.length) return infracciones.map((i) => `«${i.fragmento}» → ${i.porque}`).join(' · ')
  return null
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!agenteHabilitado(process.env as any)) {
    return NextResponse.json({ ok: false, msg: 'SEO_ASEGURA_AGENT_ENABLED != true' })
  }

  const semana = await prisma.seoCorreduriaSemana.findFirst({
    where: { fuente: 'serp' },
    orderBy: { semana: 'desc' },
  })
  if (!semana || semana.estado !== 'ok' || !semana.datos) {
    return NextResponse.json({ ok: false, msg: `sin foto SERP utilizable (estado=${semana?.estado ?? 'sin fila'})` })
  }

  const consultas = (semana.datos as any)?.consultas ?? []
  const recientes = await prisma.seoCorreduriaCambio.findMany({
    where: { creadoEn: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    select: { ruta: true, creadoEn: true },
  })
  const candidatos = candidatosRamo(consultas, RAMOS_EDITABLES, recientes, new Date(), maxCambios(process.env as any))

  if (!candidatos.length) {
    await tgAviso('correduria.seo-agente-cambio', `🤖 Agente SEO de asegura-web: sin candidatos esta pasada (todos los ramos con página ya aparecen en el top-10, o están en cooldown).`, { html: false })
    return NextResponse.json({ ok: true, aplicados: 0 })
  }

  const min = minImpresiones(process.env as any)
  const aplicados: { slug: string; motivo: string }[] = []
  const descartados: { slug: string; motivo: string }[] = []
  let prUrl: string | null = null

  for (const c of candidatos) {
    try {
      const { content } = await leerRamosTs()
      const tituloActual = leerCampoRamo(content, c.slug, 'title')
      const descActual = leerCampoRamo(content, c.slug, 'description')
      const propuesta = await proponerTexto(c.slug, tituloActual, descActual, c.consulta)
      const motivoDescartado = validar(propuesta)
      if (motivoDescartado) {
        descartados.push({ slug: c.slug, motivo: motivoDescartado })
        continue
      }

      prUrl = await proponerCambioRamos({
        transformar: (contenidoMain) => aplicarCambioRamo(contenidoMain, c.slug, propuesta),
        commitMsg: `seo(asegura-web): propuesta de metadata para /seguros/${c.slug}`,
        prTitulo: `🤖 SEO: metadata de /seguros/${c.slug} (agente autónomo)`,
        prCuerpo: `Consulta objetivo sin top-10: **${c.consulta}**\n\n` +
          `- title: «${tituloActual}» → «${propuesta.title}»\n` +
          `- description: «${descActual}» → «${propuesta.description}»\n\n` +
          `Umbral mínimo de impresiones configurado: ${min}. Guardarraíles de copy (RDL 3/2020, ámbito nacional) pasados en el propio agente antes de proponer — CI los vuelve a comprobar con \`ramos.test.ts\`.\n\n` +
          `Revisa y mergea a mano si te convence.`,
      })

      await prisma.seoCorreduriaCambio.create({
        data: { ruta: c.slug, campo: 'title', antes: tituloActual, despues: propuesta.title, motivo: c.consulta, prUrl },
      })
      await prisma.seoCorreduriaCambio.create({
        data: { ruta: c.slug, campo: 'description', antes: descActual, despues: propuesta.description, motivo: c.consulta, prUrl },
      })
      aplicados.push({ slug: c.slug, motivo: c.consulta })
    } catch (e) {
      descartados.push({ slug: c.slug, motivo: e instanceof Error ? e.message : String(e) })
    }
  }

  const partes = [
    aplicados.length ? `✅ ${aplicados.length} propuesta(s): ${aplicados.map((a) => a.slug).join(', ')}` : null,
    descartados.length ? `⏭️ ${descartados.length} descartada(s): ${descartados.map((d) => `${d.slug} (${d.motivo})`).join(' · ')}` : null,
    prUrl ? `PR: ${prUrl}` : null,
  ].filter(Boolean)
  await tgAviso('correduria.seo-agente-cambio', `🤖 <b>Agente SEO de asegura-web</b>\n\n${partes.join('\n')}`, { html: true })

  return NextResponse.json({ ok: true, aplicados, descartados, prUrl })
}

export { handler as GET, handler as POST }
