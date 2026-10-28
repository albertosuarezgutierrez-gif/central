'use client'
import { useCallback, useEffect, useState } from 'react'
import Bloque from '../../Bloque'
import Documentos from '../../Documentos'
import { leerHilo, modoDeMensaje, motivoFallo, type HiloSiniestro, type Mensaje } from '@/lib/correduria/siniestro-hilo'
import { leerSiniestro } from '@/lib/siniestros-asegura'
import type { DocumentoResumen } from '@central/module-seguros'
import Cabecera from './Cabecera'
import Plazos from './Plazos'
import Hilo from './Hilo'
import CajaMensaje, { type Precarga } from './CajaMensaje'
import AccionesIa from './AccionesIa'
import Cierre from './Cierre'
import { ERROR, NOTA } from './estilos'

type Carga = { estado: 'cargando' } | { estado: 'error'; motivo: string } | { estado: 'ok'; hilo: HiloSiniestro }

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export default function Expediente({ siniestroId }: { siniestroId: string }) {
  const [c, setC] = useState<Carga>({ estado: 'cargando' })
  const [precarga, setPrecarga] = useState<Precarga | null>(null)
  const [copiado, setCopiado] = useState(false)

  // Recarga SIN desmontar: mientras vuelve a pedir, se sigue pintando lo anterior.
  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/correduria/siniestro/hilo?siniestroId=${encodeURIComponent(siniestroId)}`, { cache: 'no-store' })
      const j: unknown = await r.json().catch(() => null)
      const hilo = r.ok ? leerHilo(j) : null
      const motivo = r.status === 404 ? 'No existe ese siniestro.' : (j as { estado?: string } | null)?.estado === 'sin_migracion' ? `${motivoFallo(r.status, j)}.` : `No se pudo leer (error ${r.status}).`
      setC(hilo ? { estado: 'ok', hilo } : { estado: 'error', motivo })
    } catch {
      setC(prev => (prev.estado === 'ok' ? prev : { estado: 'error', motivo: 'Sin conexión.' }))
    }
  }, [siniestroId])
  useEffect(() => { void cargar() }, [cargar])

  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* el texto sigue visible para copiar a mano */ }
  }

  function editar(m: Mensaje) {
    const modo = modoDeMensaje(m)
    if (!modo || m.texto === null) return
    setPrecarga({ modo, texto: m.texto, n: Date.now(), sustituyeA: m.id, documentoId: m.documentoId, reclamacionSac: m.meta?.reclamacionSac === true })
  }

  if (c.estado === 'cargando') return <p style={NOTA}>Cargando expediente…</p>
  if (c.estado === 'error') return <p role="alert" style={ERROR}>{c.motivo} No significa que no haya datos.</p>

  const h = c.hilo
  const s = leerSiniestro(h.siniestro)
  const docs = (h.documentosSiniestro ?? []) as DocumentoResumen[]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
      <Cabecera s={s} poliza={h.poliza} />
      <Plazos plazos={h.plazos} esperando={h.diasEsperandoCompania} />
      <Hilo mensajes={h.mensajes} onCopiar={copiar} onEnviado={t => setPrecarga({ modo: 'enviado', texto: t, n: Date.now() })} onEditar={editar} />
      {copiado && <p role="status" style={NOTA}>Copiado.</p>}
      <CajaMensaje siniestroId={siniestroId} documentos={docs} precarga={precarga} onGuardado={cargar} />
      <AccionesIa siniestroId={siniestroId} onHecho={cargar} />
      <Cierre siniestroId={siniestroId} resultado={texto(h.siniestro?.resultado)} motivo={texto(h.siniestro?.resultadoMotivo)} onGuardado={cargar} />
      <Bloque titulo="Documentos del siniestro">
        <Documentos siniestroId={siniestroId} clienteId={s?.clienteId ?? null} polizaId={h.poliza?.id ?? s?.polizaId ?? null}
          inicial={h.documentosSiniestro === null ? null : docs} />
      </Bloque>
    </div>
  )
}
