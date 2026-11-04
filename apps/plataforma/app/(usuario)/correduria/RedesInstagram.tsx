'use client'
import { useEffect, useState } from 'react'
import { Camera, ExternalLink } from 'lucide-react'
import Bloque from './Bloque'
import { Badge, type Tono } from '@/components/ui'

/**
 * Los borradores de Instagram de Grupo ASegura (cron L/X/V) y qué les pasó. Solo lectura: se aprueban
 * con el botón de Telegram (`asig_*`), que es donde llegan. Máx 50 filas (las más recientes).
 *
 * Tres estados de la LISTA: cargando · no se pudo mirar (error/sin migración) · lista (vacía o no).
 * «No se pudo mirar» nunca se pinta como «no hay borradores».
 */

type Fila = {
  id: string
  estado: string
  plantilla: string
  tema: string
  titulo: string
  caption: string
  imageUrl: string | null
  motivo: string | null
  igPostId: string | null
  creadoAt: string
}

type Respuesta =
  | { estado: 'ok'; borradores: Fila[] }
  | { estado: 'sin_migracion' }
  | { estado: 'error'; motivo?: string }

const ESTADO: Record<string, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  publicando: { texto: 'Publicando…', tono: 'info' },
  aprobado_manual: { texto: 'Aprobado (a mano)', tono: 'info' },
  publicado: { texto: 'Publicado', tono: 'positivo' },
  descartado: { texto: 'Descartado', tono: 'neutral' },
  rechazado_copy: { texto: 'Parado por el cepo', tono: 'negativo' },
}

const TEMA: Record<string, string> = {
  comunidades: 'Comunidades', comercio: 'Comercio y pyme', flota: 'Flota',
  hogar: 'Hogar', renovacion: 'Renovación', marca: 'Marca',
}

function fecha(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' })
}

export default function RedesInstagram() {
  const [r, setR] = useState<Respuesta | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/instagram', { cache: 'no-store' })
      .then((x) => x.json() as Promise<Respuesta>)
      .then((j) => { if (vivo) setR(j) })
      .catch(() => { if (vivo) setR({ estado: 'error', motivo: 'no se pudo conectar' }) })
    return () => { vivo = false }
  }, [])

  return (
    <Bloque
      titulo="Borradores para Instagram"
      sub="Los genera el agente lunes, miércoles y viernes y te llegan por Telegram. Nada se publica sin tu ✅. Sin perfil de Instagram conectado, el ✅ te da imagen y texto para subirlo a mano."
      Icono={Camera}
    >
      {r === null && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cargando…</p>}
      {r?.estado === 'sin_migracion' && (
        <p style={{ fontSize: 13, color: 'var(--warning)', margin: 0 }}>
          No se puede mirar: falta aplicar la migración <code>2026-11-04_asegura_instagram_borradores.sql</code>.
        </p>
      )}
      {r?.estado === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--negative)', margin: 0 }}>
          No se ha podido leer la lista{r.motivo ? `: ${r.motivo}` : ''}. Esto no significa que no haya borradores.
        </p>
      )}
      {r?.estado === 'ok' && r.borradores.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Todavía no hay ninguno.</p>
      )}
      {r?.estado === 'ok' && r.borradores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {r.borradores.slice(0, 50).map((b) => {
            const e = ESTADO[b.estado] ?? { texto: b.estado, tono: 'neutral' as Tono }
            return (
              <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface)', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge tono={e.tono}>{e.texto}</Badge>
                  <Badge tono="neutral">{TEMA[b.tema] ?? b.tema}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{b.plantilla} · {fecha(b.creadoAt)}</span>
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, overflowWrap: 'anywhere' }}>{b.titulo || '—'}</div>
                {b.motivo && b.estado !== 'publicado' && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{b.motivo}</div>
                )}
                {b.imageUrl && b.estado !== 'descartado' && b.estado !== 'rechazado_copy' && (
                  <a
                    href={b.imageUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, fontSize: 13 }}
                  >
                    Ver imagen <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Bloque>
  )
}
