// lib/correo/clasificador.ts — Clasifica un correo en una categoría de rutas.ts.
//
// Orden (barato → caro): (1) correo_reglas por email exacto o @dominio → 0 tokens;
// (2) regex de código OTP en el asunto; (3) IA (aiComplete, NVIDIA NIM). Duda o error → 'dudoso'
// (default seguro: no se toca el correo). Auto-aprende reglas cuando la IA repite decisión.
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import { groqText } from '@central/core-ai'
import {
  CATEGORIAS_IA, CONFIANZA_MINIMA, descripcionParaPrompt,
  AUTO_APRENDER_VECES, AUTO_APRENDER_CONFIANZA,
} from './rutas'
import { clasificarPorKeyword } from './keywords'
import type { CorreoNuevo } from './imap'

export interface Clasificacion {
  categoria: string
  confianza: number
  via: 'regla' | 'ia' | 'skip'
  resumen: string
  accionSugerida: string | null
  fechaLimite: Date | null
}

const RE_OTP = /\b(c[oó]digo|verification|verificaci[oó]n|one[- ]?time|OTP|c[oó]d\.?)\b.*\b(\d{4,8})\b|\b(\d{4,8})\b.*\b(c[oó]digo|code|verification)\b/i

// Busca una regla que aplique al remitente: primero email exacto, luego su dominio.
async function reglaDe(from: string): Promise<string | null> {
  if (!from) return null
  const dominio = from.includes('@') ? '@' + from.split('@')[1] : ''
  const rows = await prisma.$queryRaw<{ patron: string; categoria: string }[]>`
    SELECT patron, categoria FROM correo_reglas
    WHERE patron = ${from} OR patron = ${dominio}
    ORDER BY CASE WHEN patron = ${from} THEN 0 ELSE 1 END
    LIMIT 1
  `
  return rows[0]?.categoria ?? null
}

function parseFecha(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Normaliza la categoría que devuelve el modelo a una de CATEGORIAS_IA (o '' si no encaja).
// Tolera mayúsculas, puntuación y texto extra ("Contabilidad", "contabilidad.", "contabilidad (factura)").
function normalizarCategoria(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[.\s]+$/, '')
  if (!s) return ''
  return CATEGORIAS_IA.find(c => s === c || s.startsWith(c)) ?? ''
}

// Corta una llamada colgada a la IA para que no agote el tiempo de la función (dejaría el cursor sin avanzar).
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ia-timeout')), ms)),
  ])
}

// Llama a la IA para clasificar. Groq PRIMERO (mismo Llama-70b pero en segundos, no ~25s como NIM,
// que agotaba el tiempo de la función y hacía caer todo a 'dudoso'); NIM como respaldo si no hay
// GROQ_API_KEY o Groq falla. Lanza si ambos fallan (el llamador lo trata como 'dudoso').
async function llamarIA(system: string, user: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    try {
      return await conTimeout(groqText({ apiKey: groqKey }, system, user, 400), 15_000)
    } catch (e) {
      console.warn('[triaje/clasif] Groq falló, pruebo NIM:', String(e).slice(0, 120))
    }
  }
  return conTimeout(aiComplete([{ role: 'system', content: system }, { role: 'user', content: user }]), 20_000)
}

export async function clasificar(correo: CorreoNuevo): Promise<Clasificacion> {
  // (1) Regla explícita (semilla VIP o auto-aprendida).
  const regla = await reglaDe(correo.from)
  if (regla) {
    return { categoria: regla, confianza: 1, via: 'regla', resumen: correo.subject.slice(0, 140), accionSugerida: null, fechaLimite: null }
  }

  // (2) Código de verificación (barato, no gasta IA).
  if (RE_OTP.test(correo.subject)) {
    return { categoria: 'codigos-verificacion', confianza: 1, via: 'regla', resumen: correo.subject.slice(0, 140), accionSugerida: null, fechaLimite: null }
  }

  // (2.5) Keyword determinista (0 tokens): remitentes/asuntos INEQUÍVOCOS (procesadores de pago,
  // plataformas de reserva, aseguradoras, marketing conocido). No depende de que la IA responda, así
  // que rescata lo que antes caía a 'dudoso' con la pasarela saturada. Alta precisión; si no aplica,
  // decide la IA. Se registra como 'regla' (no gasta IA) y NO auto-aprende (ya es determinista).
  const kw = clasificarPorKeyword(correo.from, correo.subject)
  if (kw) {
    return { categoria: kw.categoria, confianza: 1, via: 'regla', resumen: correo.subject.slice(0, 140), accionSugerida: null, fechaLimite: null }
  }

  // (3) IA. system = instrucciones + categorías; user = el correo (más rápido y limpio para Groq/NIM).
  const system = [
    'Eres el triaje del buzón de correo de Alberto. Clasifica el correo en UNA sola categoría.',
    '',
    'Categorías:',
    descripcionParaPrompt(),
    '',
    'Marca "seguridad-sospechosa" si el correo simula ser de un banco/entidad/servicio y pide',
    'credenciales, mete prisa o parece suplantación/phishing. Si no encaja con claridad, usa "dudoso".',
    '',
    'Responde SOLO con JSON, sin markdown:',
    '{"categoria":"...","confianza":0.0-1.0,"resumen":"una línea en español",',
    ' "accion":"qué debe hacer Alberto, o null","fecha_limite":"YYYY-MM-DD o null"}',
  ].join('\n')
  const user = [
    `Remitente: ${correo.fromRaw}`,
    `Asunto: ${correo.subject}`,
    `Cuerpo (extracto): ${correo.extracto}`,
  ].join('\n')

  try {
    const raw = await llamarIA(system, user)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no json')
    const p = JSON.parse(match[0]) as Record<string, unknown>
    const categoria = normalizarCategoria(p.categoria)      // canónica, o '' si no la reconoce
    let confianza = Number(p.confianza)
    const resumen = String(p.resumen || correo.subject).slice(0, 140)
    // Diagnóstico temporal (quitar cuando esté validado): qué categoría/confianza devuelve el modelo.
    console.log('[triaje/clasif]', JSON.stringify({ from: correo.from, catRaw: p.categoria, cat: categoria, conf: p.confianza }))

    // El modelo no dio una categoría reconocible → dudoso (default seguro).
    if (!categoria || categoria === 'dudoso') {
      return { categoria: 'dudoso', confianza: isFinite(confianza) ? confianza : 0, via: 'ia', resumen, accionSugerida: null, fechaLimite: null }
    }
    // Categoría VÁLIDA: si el modelo no da una confianza usable, confiamos en la categoría (0.7);
    // solo la degradamos a dudoso si el propio modelo la marca por debajo del umbral.
    if (!isFinite(confianza)) confianza = 0.7
    confianza = Math.max(0, Math.min(1, confianza))
    if (confianza < CONFIANZA_MINIMA) {
      return { categoria: 'dudoso', confianza, via: 'ia', resumen, accionSugerida: null, fechaLimite: null }
    }
    return {
      categoria,
      confianza,
      via: 'ia',
      resumen,
      accionSugerida: p.accion && p.accion !== 'null' ? String(p.accion).slice(0, 200) : null,
      fechaLimite: parseFecha(p.fecha_limite),
    }
  } catch {
    // Duda/error → default seguro: no se toca el correo, sale en el digest.
    return { categoria: 'dudoso', confianza: 0, via: 'ia', resumen: correo.subject.slice(0, 140), accionSugerida: null, fechaLimite: null }
  }
}

// Auto-aprendizaje (mejora 4): si la IA ha clasificado este remitente igual ≥N veces con
// confianza ≥X (contando la actual), fija la regla en correo_reglas (creado_por='auto').
export async function quizaAutoAprender(from: string, categoria: string, confianza: number): Promise<void> {
  if (!from || categoria === 'dudoso' || confianza < AUTO_APRENDER_CONFIANZA) return
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM correo_triaje
    WHERE remitente = ${from} AND categoria = ${categoria}
      AND via = 'ia' AND confianza >= ${AUTO_APRENDER_CONFIANZA}
  `
  const n = Number(rows[0]?.n ?? 0)
  if (n < AUTO_APRENDER_VECES) return
  await prisma.$executeRaw`
    INSERT INTO correo_reglas (patron, categoria, creado_por)
    VALUES (${from}, ${categoria}, 'auto')
    ON CONFLICT (patron) DO NOTHING
  `
}
