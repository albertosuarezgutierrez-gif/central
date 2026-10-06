import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { conLlamadaIA, registrarIntervencion, trabajoVivo } from '@/lib/tarificador-formador'
import { preguntarIA } from '@/lib/tarificador-formador-ia'
import {
  SYSTEM_REVISAR,
  formadorActivo,
  incidenciasResultado,
  leerPeticionRevisar,
  maxLlamadasIA,
  parsearRespuestaRevisar,
  promptRevisar,
  type Revision,
} from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/formador/revisar-paso` — MODO ACOMPAÑADO: el worker enseña un paso (pantalla
 * esperada, elementos sin valores, textos de avisos ya redactados) y la IA dice si está donde debe y qué
 * significan los avisos en lenguaje de correduría. Para `paso: 'resultado'` se comprueba ADEMÁS la
 * coherencia del precio con una regla DETERMINISTA (`coherenciaPrecio`), con o sin IA.
 * Bearer del worker. 200 `{ revisadoPorIA, enPantallaEsperada, avisos, sugerencias, incidencias }`.
 * Si la IA falla o se agota el tope, `revisadoPorIA: false` y sin avisos de IA: nunca bloquea por ruido.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!formadorActivo(process.env)) return NextResponse.json({ revisadoPorIA: false, enPantallaEsperada: null, avisos: [], sugerencias: [], incidencias: [], motivo: 'formador_apagado' })
  const l = leerPeticionRevisar(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    const t = await trabajoVivo(p.trabajoId)
    if (!t) return NextResponse.json({ estado: 'trabajo_no_en_curso' }, { status: 404 })
    if (t.compania !== p.compania || t.ramo !== p.ramo) return NextResponse.json({ estado: 'compania_ramo_no_casan' }, { status: 409 })

    const incidencias = incidenciasResultado(p)
    const bloqueantesPrecio = incidencias.filter((i) => i.bloqueante)
    if (bloqueantesPrecio.length) {
      await registrarIntervencion({ trabajo: t, paso: p.paso, tipo: 'incidencia_precio', llamadaIA: false, resumen: bloqueantesPrecio.map((i) => i.mensaje).join(' · '), coste: 0 })
    }

    const max = maxLlamadasIA(process.env)
    // Tope ATÓMICO por trabajo: comprobación + llamada + registro en una transacción con lock (conLlamadaIA).
    const res = await conLlamadaIA(t, max, async (registrar): Promise<Revision | null> => {
      try {
        const r = await preguntarIA(SYSTEM_REVISAR, promptRevisar(p))
        const rev = parsearRespuestaRevisar(r.texto)
        const bloqueantes = rev?.avisos.filter((a) => a.bloqueante) ?? []
        await registrar({
          paso: p.paso,
          tipo: bloqueantes.length ? 'aviso_bloqueante' : 'revision',
          llamadaIA: true,
          resumen: !rev
            ? `paso «${p.paso}»: respuesta de la IA ilegible`
            : bloqueantes.length
              ? bloqueantes.map((a) => `«${a.texto}» → ${a.interpretacion}`).join(' · ')
              : `paso «${p.paso}»: ${rev.enPantallaEsperada === false ? 'NO parece la pantalla esperada' : 'correcto'}${rev.avisos.length ? ` (${rev.avisos.length} aviso/s informativo/s)` : ''}`,
          coste: r.coste,
        })
        return rev
      } catch (e) {
        await registrar({ paso: p.paso, tipo: 'error_ia', llamadaIA: true, resumen: `paso «${p.paso}»: la IA no respondió (${e instanceof Error ? e.message.slice(0, 150) : 'error'})`, coste: 0 })
        return null
      }
    })
    if (res.tope) {
      await registrarIntervencion({ trabajo: t, paso: p.paso, tipo: 'tope', llamadaIA: false, resumen: `tope de ${max} llamadas: paso «${p.paso}» sin revisar`, coste: 0 })
    }
    const revision: Revision | null = res.tope ? null : res.valor
    return NextResponse.json({
      revisadoPorIA: revision !== null,
      enPantallaEsperada: revision?.enPantallaEsperada ?? null,
      avisos: revision?.avisos ?? [],
      sugerencias: revision?.sugerencias ?? [],
      incidencias,
    })
  } catch (e) {
    console.error('[tarificador/formador] revisar-paso', p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
