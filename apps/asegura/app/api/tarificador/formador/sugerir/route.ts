import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { conLlamadaIA, registrarIntervencion, trabajoVivo } from '@/lib/tarificador-formador'
import { preguntarIA } from '@/lib/tarificador-formador-ia'
import { SYSTEM_SUGERIR, formadorActivo, leerPeticionSugerir, maxLlamadasIA, parsearRespuestaSugerir, promptSugerir } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/formador/sugerir` — el worker no encuentra un campo o una acción PERMITIDA y
 * pregunta qué candidato de su lista es. Bearer `TARIFICADOR_WORKER_SECRET` (el mismo de
 * `/api/tarificador/resultado`). Cuerpo `{ trabajoId, compania, ramo, clave, tipo, descripcion, estructura }`
 * (estructura SIN valores). 200 `{ indice: number|null, confianza?, motivo }`.
 *
 * Fail-closed: kill-switch `TARIFICADOR_FORMADOR_ACTIVO=1`, tope de llamadas por trabajo
 * (`TARIFICADOR_FORMADOR_MAX_LLAMADAS`), trabajo `en_curso` con lease vivo y de ESA compañía/ramo. La IA
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
    // Tope ATÓMICO por trabajo: comprobación + llamada + registro en una transacción con lock (conLlamadaIA).
    const res = await conLlamadaIA(t, max, async (registrar) => {
      let r: { texto: string; coste: number }
      try {
        r = await preguntarIA(SYSTEM_SUGERIR, promptSugerir(p))
      } catch (e) {
        await registrar({ paso: 'formador', tipo: 'error_ia', llamadaIA: true, resumen: `${p.tipo} «${p.clave}»: la IA no respondió (${e instanceof Error ? e.message.slice(0, 150) : 'error'})`, coste: 0 })
        return { indice: null, motivo: 'ia_no_disponible' }
      }
      const s = parsearRespuestaSugerir(r.texto, p.estructura.length)
      const c = s ? p.estructura[s.indice] : null
      await registrar({
        paso: 'formador',
        tipo: s ? 'sugerencia' : 'sin_sugerencia',
        llamadaIA: true,
        resumen: s
          ? `${p.tipo} «${p.clave}» → <${c!.tag}${c!.id ? ` #${c!.id}` : ''}> «${c!.texto ?? c!.etiqueta ?? ''}» (confianza ${s.confianza.toFixed(2)}): ${s.motivo}`
          : `${p.tipo} «${p.clave}»: la IA no señaló un candidato con confianza suficiente`,
        coste: r.coste,
      })
      return s ? { indice: s.indice, confianza: s.confianza, motivo: s.motivo } : { indice: null, motivo: 'sin_candidato' }
    })
    if (res.tope) {
      await registrarIntervencion({ trabajo: t, paso: 'formador', tipo: 'tope', llamadaIA: false, resumen: `tope de ${max} llamadas: no se pregunta por «${p.clave}»`, coste: 0 })
      return NextResponse.json({ indice: null, motivo: 'tope_llamadas' })
    }
    return NextResponse.json(res.valor)
  } catch (e) {
    console.error('[tarificador/formador] sugerir', p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ indice: null, motivo: 'error' }, { status: 503 })
  }
}
