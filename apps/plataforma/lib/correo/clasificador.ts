// lib/correo/clasificador.ts — Clasifica un correo en una categoría de rutas.ts.
//
// Orden (barato → caro): (1) correo_reglas por email exacto o @dominio → 0 tokens;
// (2) regex de código OTP en el asunto; (3) IA (aiComplete, NVIDIA NIM). Duda o error → 'dudoso'
// (default seguro: no se toca el correo). Auto-aprende reglas cuando la IA repite decisión.
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import {
  CATEGORIAS_IA, CONFIANZA_MINIMA, descripcionParaPrompt,
  AUTO_APRENDER_VECES, AUTO_APRENDER_CONFIANZA,
} from './rutas'
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

  // (3) IA.
  const prompt = [
    'Eres el triaje del buzón de correo de Alberto. Clasifica el correo en UNA sola categoría.',
    '',
    'Categorías:',
    descripcionParaPrompt(),
    '',
    'Marca "seguridad-sospechosa" si el correo simula ser de un banco/entidad/servicio y pide',
    'credenciales, mete prisa o parece suplantación/phishing. Si no encaja con claridad, usa "dudoso".',
    '',
    `Remitente: ${correo.fromRaw}`,
    `Asunto: ${correo.subject}`,
    `Cuerpo (extracto): ${correo.extracto}`,
    '',
    'Responde SOLO con JSON, sin markdown:',
    '{"categoria":"...","confianza":0.0-1.0,"resumen":"una línea en español",',
    ' "accion":"qué debe hacer Alberto, o null","fecha_limite":"YYYY-MM-DD o null"}',
  ].join('\n')

  try {
    const raw = await aiComplete([{ role: 'user', content: prompt }])
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no json')
    const p = JSON.parse(match[0]) as Record<string, unknown>
    const categoria = String(p.categoria || '')
    const confianza = Math.max(0, Math.min(1, Number(p.confianza) || 0))
    if (!CATEGORIAS_IA.includes(categoria) || categoria === 'dudoso' || confianza < CONFIANZA_MINIMA) {
      return { categoria: 'dudoso', confianza, via: 'ia', resumen: String(p.resumen || correo.subject).slice(0, 140), accionSugerida: null, fechaLimite: null }
    }
    return {
      categoria,
      confianza,
      via: 'ia',
      resumen: String(p.resumen || correo.subject).slice(0, 140),
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
