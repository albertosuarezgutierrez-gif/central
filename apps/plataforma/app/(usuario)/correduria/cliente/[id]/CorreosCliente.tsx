'use client'
import { useState } from 'react'
import { fechaHoraEs } from '@/lib/ficha-asegura'
import { ETIQUETA_EVENTO, NOMBRE_TIPO_CORREO, titularCorreo, type CorreoCliente, type Tono } from '@/lib/correos-cliente'

/**
 * ✉️ Correos que la correduría ha mandado al cliente y lo que Resend ha contado de cada uno.
 * Es la prueba por si el cliente reclama: fecha y hora de envío, de entrega, de apertura y de cada
 * clic (con enlace, IP y navegador), y el motivo de un rebote.
 *
 * Tres estados: `null` = no se pudo leer (NUNCA «no se le ha escrito») · `[]` = no hay ninguno ·
 * con filas. Cada correo se abre para ver su línea de tiempo (montaje perezoso).
 */
const COLOR: Record<Tono, string> = { bueno: 'var(--positive)', aviso: 'var(--warning)', malo: 'var(--negative)', neutro: 'var(--muted)' }

export default function CorreosCliente({ correos }: { correos: CorreoCliente[] | null }) {
  if (correos === null) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        No se han podido leer los correos de esta ficha (asegura no los manda o su consulta ha fallado).
        No lo leas como «no se le ha escrito nunca».
      </p>
    )
  }
  if (correos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        Todavía no hay correos registrados. El registro empezó el 25/09/2026: lo enviado antes no sale aquí.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
        «Entregado» = su servidor de correo lo aceptó (la prueba más fuerte). «Abierto» no garantiza que lo
        leyera: algunos móviles abren solos los correos. Un clic sí es una lectura.
      </p>
      {correos.map((c) => <Correo key={c.id} c={c} />)}
    </div>
  )
}

function Correo({ c }: { c: CorreoCliente }) {
  const [abierto, setAbierto] = useState(false)
  const t = titularCorreo(c)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 4, width: '100%', minHeight: 44 }}
      >
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14 }}>{NOMBRE_TIPO_CORREO[c.tipo] ?? c.tipo.replace(/_/g, ' ')}</strong>
          <span style={{ fontSize: 12, color: COLOR[t.tono], fontWeight: 700 }}>{t.texto}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
          {fechaHoraEs(c.enviadoEn)} · {c.asunto} · a {c.destino ?? 'dirección ilegible'}
        </span>
      </button>
      {abierto && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          <li style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fechaHoraEs(c.enviadoEn)}</span> · Salió de Grupo ASegura
            {c.estado === 'fallido' && c.error ? ` — falló: ${c.error}` : ''}
          </li>
          {!c.conSeguimiento && c.estado === 'enviado' && (
            <li style={{ fontSize: 12, color: 'var(--muted)' }}>Salió sin seguimiento: no habrá datos de entrega ni de apertura.</li>
          )}
          {c.eventos.map((e, i) => (
            <li key={i} style={{ fontSize: 13, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fechaHoraEs(e.fecha)}</span> · {ETIQUETA_EVENTO[e.tipo]}
              {Object.keys(e.detalle).length > 0 && (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
                  {[
                    e.detalle.enlace && `enlace: ${e.detalle.enlace}`,
                    e.detalle.motivo && `motivo: ${e.detalle.motivo}`,
                    e.detalle.ip && `IP: ${e.detalle.ip}`,
                    e.detalle.navegador && `dispositivo: ${e.detalle.navegador}`,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </li>
          ))}
          {c.conSeguimiento && c.eventos.length === 0 && (
            <li style={{ fontSize: 12, color: 'var(--muted)' }}>Resend aún no ha informado de nada sobre este correo.</li>
          )}
        </ul>
      )}
    </div>
  )
}
