'use client'
import { useCallback, useEffect, useState } from 'react'

import { DIAS_RECOMPENSA_RECOMENDACION, textoRecomendacion } from '@central/module-patrimonio'

type Recomendacion = { id: string; estado: 'pendiente' | 'conseguida' | 'caducada' | 'anulada'; creadaEn: string; caducaEn: string | null }

const ESTADO: Record<Recomendacion['estado'], string> = {
  pendiente: 'Esperando a que se dé de alta',
  conseguida: 'Conseguida: los dos tenéis más cupo de IA',
  caducada: 'Caducada',
  anulada: 'Anulada',
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES')

/**
 * «Invita a otro propietario» (27/10/2026). El portal NO envía nada: registra la recomendación (solo el hash del correo) y te
 * da el texto para que lo copies o lo mandes tú (WhatsApp sin número). Si el invitado se da de alta con ese correo y activa
 * patrimonio, los dos tenéis el cupo de lectura de facturas con IA «amplio» durante 90 días. La lista no repite a quién invitaste.
 */
export function InvitaPropietario() {
  const [correo, setCorreo] = useState('')
  const [texto, setTexto] = useState<string | null>(null)
  const [lista, setLista] = useState<Recomendacion[] | null>(null)
  const [hasta, setHasta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/patrimonio/recomendaciones')
      if (!r.ok) return
      const j = (await r.json()) as { recomendaciones: Recomendacion[]; recompensaHasta: string | null }
      setLista(j.recomendaciones)
      setHasta(j.recompensaHasta)
    } catch {
      setAviso('No hemos podido cargar tus invitaciones. Recarga la página.')
    }
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function crear() {
    setOcupado(true)
    setAviso(null)
    setTexto(null)
    try {
      const r = await fetch('/api/patrimonio/recomendaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ correo }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string } | null
      if (r.ok) {
        setTexto(textoRecomendacion(window.location.origin))
        setCorreo('')
        void cargar()
      } else {
        setAviso(
          j?.error === 'datos_invalidos'
            ? 'Escribe un correo válido.'
            : j?.error === 'a_si_mismo'
              ? 'Ese es tu propio correo: escribe el de la otra persona.'
              : j?.error === 'limite_diario'
                ? 'Has invitado a muchas personas hoy. Prueba mañana.'
                : 'No hemos podido registrar la invitación. Inténtalo otra vez.',
        )
      }
    } catch {
      setAviso('No hemos podido registrar la invitación: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  async function copiar() {
    if (!texto) return
    try {
      await navigator.clipboard.writeText(texto)
      setAviso('Texto copiado.')
    } catch {
      setAviso('No hemos podido copiarlo: mantén pulsado el texto y cópialo.')
    }
  }

  async function compartir() {
    if (!texto) return
    try {
      await navigator.share({ title: 'Portal de Grupo ASegura', text: texto })
    } catch {
      /* cerrar el menú de compartir no es un error */
    }
  }

  async function anular(id: string) {
    setOcupado(true)
    try {
      const r = await fetch(`/api/patrimonio/recomendaciones/${id}`, { method: 'DELETE' })
      setAviso(r.ok ? 'Invitación anulada.' : 'No hemos podido anularla.')
      void cargar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="seccion" aria-labelledby="invita-titulo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <p className="antetitulo">Recomienda el portal</p>
      <h2 id="invita-titulo" style={{ margin: 0 }}>Invita a otro propietario</h2>
      <p className="suave" style={{ margin: 0, fontSize: 14 }}>
        Si conoces a alguien con inmuebles, escribe su correo y te damos un texto para que se lo mandes tú: nosotros no le enviamos
        nada. Si se da de alta con ese correo y activa “Mi patrimonio”, los dos tenéis más lecturas de facturas con IA durante{' '}
        {DIAS_RECOMPENSA_RECOMENDACION} días. Solo vale para personas que aún no estén en el portal.
      </p>
      {hasta && <p role="status" style={{ margin: 0 }}>Tienes más cupo de IA hasta el {fecha(hasta)} por recomendar el portal.</p>}
      <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
        Correo de la otra persona
        <input type="email" inputMode="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={254} style={{ minHeight: 44 }} />
      </label>
      <div>
        <button type="button" onClick={crear} disabled={ocupado || correo.trim() === ''} style={{ minHeight: 44 }}>
          Preparar invitación
        </button>
      </div>
      {texto && (
        <div className="editor">
          <p style={{ margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{texto}</p>
          <p className="suave" style={{ margin: '6px 0', fontSize: 13 }}>Dile que entre con el correo que has escrito. Tú decides cómo mandárselo.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={copiar} style={{ minHeight: 44 }}>
              Copiar texto
            </button>
            <a
              className="boton-tenue"
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Compartir por WhatsApp
            </a>
            {puedeCompartir && (
              <button type="button" onClick={compartir} style={{ minHeight: 44 }}>
                Compartir…
              </button>
            )}
          </div>
        </div>
      )}
      {aviso && (
        <p role="status" style={{ margin: 0 }}>
          {aviso}
        </p>
      )}
      {lista && lista.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {lista.map((r) => (
            <li key={r.id} style={{ overflowWrap: 'anywhere' }}>
              Invitación del {fecha(r.creadaEn)} · {ESTADO[r.estado]}
              {r.estado === 'pendiente' && (
                <>
                  {' '}
                  <button type="button" onClick={() => anular(r.id)} disabled={ocupado} style={{ minHeight: 44 }}>
                    Anular
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
