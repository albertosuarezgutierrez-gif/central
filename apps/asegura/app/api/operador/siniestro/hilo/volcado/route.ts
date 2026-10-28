import { NextResponse } from 'next/server'
import { fichaInformePerito, huellaMensaje, trocearVolcadoIntranet, type FichaInformePerito, type TrozoVolcado } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { anadirMensajeSiniestro, leerHiloSiniestro, metaPreRehuse } from '@/lib/siniestro-hilo'
import { actorDe, cadena, correduriaPedida, respuestaFallo } from '@/lib/siniestro-hilo-puerto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_TEXTO = 200_000

/**
 * Volcado del historial de la intranet de la compañía (texto pegado) al hilo del siniestro.
 *
 *   POST { correduriaId?, siniestroId, texto (≤ 200.000), confirmar:boolean, actor? }
 *   confirmar=false → { estado:'propuesta', trozos:[{emisor, rol, fechaOriginal, texto, huella, tipo, duplicado, fichaPerito|null}],
 *                        fichaPerito|null, duplicados:n }   (NO escribe nada)
 *   confirmar=true  → { estado:'ok', insertados:n, duplicados:n, preRehuse?: true }   (cada trozo = mensaje autor 'compania', tipo 'comentario'
 *                        o 'rehuse' si contiene «rehus»; meta {fechaOriginal, emisor, rol, huella, fichaPerito?}; se salta
 *                        el que ya existe en ese siniestro con la misma huella; si falla uno se corta y se devuelve su error)
 * 400 falta siniestroId · 403 otra correduría · 404 siniestro · 422 texto vacío/enorme o `confirmar` no booleano · 503 sin_migracion.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
  const siniestroId = cadena(b.siniestroId)
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  if (typeof b.confirmar !== 'boolean') return NextResponse.json({ estado: 'invalido', motivo: 'confirmar tiene que ser true o false' }, { status: 422 })
  const texto = typeof b.texto === 'string' ? b.texto : ''
  if (texto.trim() === '') return NextResponse.json({ estado: 'invalido', motivo: 'falta el texto del volcado' }, { status: 422 })
  if (texto.length > MAX_TEXTO) return NextResponse.json({ estado: 'invalido', motivo: `el volcado supera ${MAX_TEXTO} caracteres` }, { status: 422 })
  try {
    const c = await correduriaPedida(b.correduriaId)
    if (!c.ok) return c.res
    const h = await leerHiloSiniestro(c.id, siniestroId)
    if (!h.ok) return respuestaFallo(h)
    const existentes = new Set<string>()
    for (const m of h.hilo.mensajes ?? []) {
      const hu = m.meta?.huella
      if (typeof hu === 'string') existentes.add(hu)
    }
    const trozos = trocearVolcadoIntranet(texto).map((t: TrozoVolcado) => {
      const huella = huellaMensaje(t.texto, t.fechaOriginal)
      const ficha: FichaInformePerito | null = fichaInformePerito(t.texto)
      return { ...t, huella, tipo: /rehus/i.test(t.texto) ? ('rehuse' as const) : ('comentario' as const), duplicado: existentes.has(huella), fichaPerito: ficha }
    })
    const duplicados = trozos.filter((t) => t.duplicado).length
    if (!b.confirmar) {
      const fichas = trozos.filter((t) => t.fichaPerito !== null)
      return NextResponse.json({ estado: 'propuesta', trozos, fichaPerito: fichas.length ? fichas[fichas.length - 1].fichaPerito : null, duplicados })
    }
    const actor = actorDe(req, b)
    let insertados = 0
    let preRehuse = false
    for (const t of trozos) {
      if (t.duplicado) continue
      // Solo UN mensaje por siniestro lleva `preRehuseAvisado`: tras marcarlo aquí, `metaPreRehuse` ya lo ve en BD.
      const pre = await metaPreRehuse(c.id, siniestroId, t.texto)
      const r = await anadirMensajeSiniestro(c.id, {
        siniestroId,
        autor: 'compania',
        tipo: t.tipo,
        texto: t.texto,
        creadoPor: actor,
        meta: { fechaOriginal: t.fechaOriginal, emisor: t.emisor, rol: t.rol, huella: t.huella, ...(t.fichaPerito ? { fichaPerito: t.fichaPerito } : {}), ...(pre ?? {}) },
        canal: 'operador',
      })
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo, insertados, duplicados }, { status: r.status })
      insertados++
      if (pre) preRehuse = true
      existentes.add(t.huella)
    }
    return NextResponse.json({ estado: 'ok', insertados, duplicados, ...(preRehuse ? { preRehuse: true } : {}) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/hilo/volcado', e) }, { status: 500 })
  }
})
