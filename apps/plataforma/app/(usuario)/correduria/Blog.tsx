'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Newspaper, ExternalLink, Check, X } from 'lucide-react'
import Bloque from './Bloque'
import { Badge, btnStyle, type Tono } from '@/components/ui'
import { explicarEstadoPr, type EstadoPr } from '@/lib/correduria/blog-pr'

/**
 * Los artículos del blog que esperan el OK de Alberto.
 *
 * ─── Por qué la aprobación está AQUÍ y no en GitHub ────────────────────────
 * El agente de blog de `apps/ia-rest` tiene cuatro borradores parados desde
 * junio. No falló generar: falló que el borrador espera donde nadie entra. Un
 * PR de GitHub es exactamente eso otra vez. Por eso el artículo se lee en la
 * pantalla que Alberto abre a diario, con dos botones, y el PR queda como el
 * registro de lo que se publicó (y como la red que pasa los tests del repo
 * antes de que nada llegue a la web).
 *
 * ─── Publicar es un clic SUYO, siempre ─────────────────────────────────────
 * El artículo se firma con su nombre y su clave DGSFP y lo lee alguien a punto
 * de decidir sobre un plazo legal. La validación del agente comprueba que no
 * cite normas sin verificar; NO comprueba que el razonamiento sea correcto.
 * Eso lo lee una persona, y esa persona es la que pulsa.
 */

type Pr = {
  numero: number
  titulo: string
  url: string
  creado: string
  /** `null` = el cuerpo del PR no traía el texto. NO es un artículo vacío. */
  articulo: string | null
  estado: EstadoPr
}

type Resp =
  | { estado: 'ok'; prs: Pr[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: string }

const TONO: Record<EstadoPr, Tono> = {
  listo: 'positivo',
  // `checks` y `no_comprobado` son NEUTROS a propósito: ninguno de los dos
  // significa que el artículo esté mal, y pintarlos de alarma enseñaría a
  // ignorar el color justo en la pestaña donde importa.
  checks: 'neutral',
  no_comprobado: 'neutral',
  desactualizada: 'aviso',
  borrador: 'aviso',
  conflicto: 'negativo',
}

const ROTULO: Record<EstadoPr, string> = {
  listo: 'Listo',
  checks: 'Tests en marcha',
  no_comprobado: 'Sin comprobar',
  desactualizada: 'Por detrás de main',
  borrador: 'En borrador',
  conflicto: 'Conflicto',
}

export default function Blog({ onContador }: { onContador?: (n: number | null) => void }) {
  const [resp, setResp] = useState<Resp | null>(null)
  const [obrando, setObrando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string>('')
  // El contador se reporta desde un ref: una lambda nueva del padre en cada
  // render relanzaría el fetch en bucle si entrara en las dependencias.
  const avisar = useRef(onContador)
  avisar.current = onContador

  const cargar = useCallback(() => {
    fetch('/api/correduria/blog')
      .then(r => (r.ok ? r.json() : { estado: 'error' as const }))
      .then((d: Resp) => {
        setResp(d)
        // Solo se cuenta lo que se ha podido contar. Si no se pudo leer, `null`
        // pinta «!» en la pestaña; un 0 escondería trabajo en silencio.
        avisar.current?.(d.estado === 'ok' ? d.prs.length : null)
      })
      .catch(() => { setResp({ estado: 'error' }); avisar.current?.(null) })
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function actuar(pr: Pr, accion: 'publicar' | 'descartar') {
    const que = accion === 'publicar'
      ? `¿Publicar «${pr.titulo}» en grupoasegura.es?`
      : `¿Descartar «${pr.titulo}»? El artículo se pierde y el tema vuelve a la cola.`
    if (!window.confirm(que)) return
    setObrando(pr.numero)
    setAviso('')
    try {
      const r = await fetch('/api/correduria/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: pr.numero, accion }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.ok) {
        setAviso(d?.motivo ?? 'No se ha podido completar. Mira el PR en GitHub.')
      } else if (accion === 'publicar') {
        setAviso('Publicado. La web se despliega sola en unos minutos.')
      }
    } catch {
      setAviso('No se ha podido hablar con GitHub. El artículo sigue donde estaba.')
    } finally {
      setObrando(null)
      // Se vuelve a PREGUNTAR en vez de suponer el resultado: el merge puede
      // haber salido bien y GitHub tardar en cerrar el PR, y al revés.
      cargar()
    }
  }

  if (!resp) return null

  if (resp.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Blog de la web" Icono={Newspaper} tono="aviso">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Falta <code>GITHUB_TOKEN</code> en el proyecto de Vercel, así que no puedo mirar si hay
          artículos esperando. <b>No significa que no haya</b>.
        </p>
      </Bloque>
    )
  }

  if (resp.estado === 'error') {
    return (
      <Bloque titulo="Blog de la web" Icono={Newspaper} tono="malo">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          No he podido preguntarle a GitHub{resp.motivo ? ` (${resp.motivo})` : ''}. Puede haber
          artículos esperando y no se ven desde aquí.
        </p>
      </Bloque>
    )
  }

  const n = resp.prs.length

  return (
    <Bloque
      titulo="Blog de la web"
      sub={n === 0
        ? 'Nada esperando. El agente escribe uno cada dos semanas y aparece aquí antes de publicarse.'
        : `${n} artículo${n === 1 ? '' : 's'} esperando tu OK. Nada se publica hasta que pulses.`}
      Icono={Newspaper}
      tono={n > 0 ? 'aviso' : 'neutral'}
      destacado={n > 0}
    >
      {aviso && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text)' }}>{aviso}</p>
      )}

      {n === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Los temas aprobados viven en <code>lib/correduria/blog-temas.ts</code>. Cuando se agoten,
          te aviso por Telegram: el agente no se inventa el siguiente.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {resp.prs.map(pr => (
            <article
              key={pr.numero}
              style={{
                border: '1px solid var(--border)', borderRadius: 10,
                padding: 12, background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{pr.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                    Escrito el {new Date(pr.creado).toLocaleDateString('es-ES')}
                  </div>
                </div>
                <Badge tono={TONO[pr.estado]} title={explicarEstadoPr(pr.estado)}>
                  {ROTULO[pr.estado]}
                </Badge>
              </div>

              {/* 🚨 Sin texto NO se pinta un recuadro vacío: eso invitaría a
                  aprobar a ciegas un artículo firmado con su clave DGSFP. */}
              {pr.articulo === null ? (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--warning)' }}>
                  No puedo enseñarte el texto desde aquí (el PR no lo trae). Ábrelo en GitHub antes
                  de publicarlo.
                </p>
              ) : (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, minHeight: 44, display: 'flex', alignItems: 'center' }}>
                    Leer el artículo
                  </summary>
                  <div
                    style={{
                      marginTop: 8, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      maxHeight: 420, overflowY: 'auto', color: 'var(--text)',
                    }}
                  >
                    {pr.articulo}
                  </div>
                </details>
              )}

              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                {explicarEstadoPr(pr.estado)} La revisión automática comprueba que no cite normas sin
                verificar; <b>no</b> comprueba que el razonamiento sea correcto.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => actuar(pr, 'publicar')}
                  disabled={obrando === pr.numero}
                  style={{ ...btnStyle('primario'), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Check size={15} strokeWidth={2} aria-hidden />
                  {obrando === pr.numero ? 'Publicando…' : 'Publicar'}
                </button>
                <button
                  type="button"
                  onClick={() => actuar(pr, 'descartar')}
                  disabled={obrando === pr.numero}
                  style={{ ...btnStyle(), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={15} strokeWidth={2} aria-hidden />
                  Descartar
                </button>
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...btnStyle(), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <ExternalLink size={15} strokeWidth={2} aria-hidden />
                  Ver en GitHub
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </Bloque>
  )
}
