import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { conLlamadaIA, registrarIntervencion, trabajoVivo } from '@/lib/tarificador-formador'
import { preguntarIA } from '@/lib/tarificador-formador-ia'
import { SYSTEM_SUGERIR, costeMaximoLlamadaFormador, escaleraModelos, formadorActivo, leerPeticionSugerir, maxEurIA, maxLlamadasIA, parsearRespuestaSugerir, promptSugerir } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Escalera de IA (2 × 15 s) dentro de la transacción con lock: margen sobre los 50 s de la tx.
export const maxDuration = 60

/**
 * `POST /api/tarificador/formador/sugerir` — el worker no encuentra un campo o una acción PERMITIDA y
 * pregunta qué candidato de su lista es. Bearer `TARIFICADOR_WORKER_SECRET` (el mismo de
 * `/api/tarificador/resultado`). Cuerpo `{ trabajoId, compania, ramo, clave, tipo, descripcion, estructura }`
 * (estructura SIN valores). 200 `{ indice: number|null, confianza?, motivo }`.
 *
 * Fail-closed: kill-switch `TARIFICADOR_FORMADOR_ACTIVO=1`, tope de llamadas por trabajo
 * (`TARIFICADOR_FORMADOR_MAX_LLAMADAS`) y de € estimados (`TARIFICADOR_FORMADOR_MAX_EUR`), IA escalonada (barato → potente,
 * `TARIFICADOR_FORMADOR_MODELO`), trabajo `en_curso` con lease vivo y de ESA compañía/ramo. La IA
 * solo devuelve un índice: el worker lo valida (lista cerrada + guard de emisión) antes de tocar nada.
 * Sin `auditado()`: puerto del worker, no de operador; el rastro es `tarificador_intervenciones`.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!formadorActivo(process.env)) return NextResponse.json({ indice: null, motivo: 'formador_apagado' })
  const l = leerPeticionSugerir(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    const t = await trabajoVivo(p.trabajoId)
    if (!t) return NextResponse.json({ indice: null, motivo: 'trabajo_no_en_curso' }, { status: 404 })
    if (t.compania !== p.compania || t.ramo !== p.ramo) return NextResponse.json({ indice: null, motivo: 'compania_ramo_no_casan' }, { status: 409 })
    const max = maxLlamadasIA(process.env)
    const escalera = escaleraModelos(process.env)
    // Tope ATÓMICO por trabajo (llamadas y € estimados): comprobación + llamada + registro en una transacción con lock.
    // IA ESCALONADA (14/10/2026): 1º el modelo barato; SOLO si no señala nada con confianza, el potente. Cada escalón se registra.
    const prompt = promptSugerir(p)
    const res = await conLlamadaIA(t, max, async (registrar, cabe) => {
      for (const [n, modelo] of escalera.entries()) {
        const etiquetaModelo = modelo ?? 'por defecto'
        // Presupuesto ANTES de CADA escalón (llamadas y €: lo gastado + lo máximo que puede costar esta, con la tarifa de SU modelo).
        if (!(await cabe(costeMaximoLlamadaFormador(SYSTEM_SUGERIR.length + prompt.length, modelo)))) {
          await registrar({ paso: 'formador', tipo: 'tope', llamadaIA: false, resumen: `${p.tipo} «${p.clave}» [${etiquetaModelo}]: sin presupuesto para este escalón`, coste: 0 })
          break
        }
        let r: { texto: string; coste: number }
        try {
          r = await preguntarIA(SYSTEM_SUGERIR, prompt, modelo, escalera.length > 1 ? 15_000 : 20_000)
        } catch (e) {
          await registrar({ paso: 'formador', tipo: 'error_ia', llamadaIA: true, resumen: `${p.tipo} «${p.clave}» [${etiquetaModelo}]: la IA no respondió (${e instanceof Error ? e.message.slice(0, 150) : 'error'})`, coste: 0 })
          continue
        }
        const s = parsearRespuestaSugerir(r.texto, p.estructura.length)
        const c = s ? p.estructura[s.indice] : null
        await registrar({
          paso: 'formador',
          tipo: s ? 'sugerencia' : 'sin_sugerencia',
          llamadaIA: true,
          resumen: s
            ? `${p.tipo} «${p.clave}» [${etiquetaModelo}] → <${c!.tag}${c!.id ? ` #${c!.id}` : ''}> «${c!.texto ?? c!.etiqueta ?? ''}» (confianza ${s.confianza.toFixed(2)}): ${s.motivo}`
            : `${p.tipo} «${p.clave}» [${etiquetaModelo}]: la IA no señaló un candidato con confianza suficiente${n < escalera.length - 1 ? ' (se sube de modelo)' : ''}`,
          coste: r.coste,
        })
        if (s) return { indice: s.indice, confianza: s.confianza, motivo: s.motivo }
      }
      return { indice: null, motivo: 'sin_candidato' }
    }, maxEurIA(process.env))
    if (res.tope) {
      await registrarIntervencion({ trabajo: t, paso: 'formador', tipo: 'tope', llamadaIA: false, resumen: `tope de ${max} llamadas o de coste del trabajo: no se pregunta por «${p.clave}»`, coste: 0 })
      return NextResponse.json({ indice: null, motivo: 'tope_llamadas' })
    }
    return NextResponse.json(res.valor)
  } catch (e) {
    console.error('[tarificador/formador] sugerir', p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ indice: null, motivo: 'error' }, { status: 503 })
  }
}
