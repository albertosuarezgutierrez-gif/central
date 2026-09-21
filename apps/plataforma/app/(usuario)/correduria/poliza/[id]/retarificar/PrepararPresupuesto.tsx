'use client'

import { useState } from 'react'

import { eur } from '@/lib/dinero'
import {
  frasePresupuesto,
  interpretarPreparado,
  type PresupuestoPreparado,
} from '@/lib/presupuesto-asegura'

/**
 * «Preparar presupuesto» — PR 1 del §6 de
 * `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md`.
 *
 * 🚨 ESTE BOTÓN NO MANDA NADA Y NO CUESTA NADA. Congela en
 * `seguros.presupuesto` lo que se le pondría delante al cliente, sobre la
 * cotización que YA se pagó. El envío (correo / enlace de WhatsApp) es el PR 3
 * y no existe todavía — por eso el pie lo dice en vez de dejarlo suponer.
 *
 * Se separa de `retarificador.tsx` a propósito: aquel ya pasa de 2.000 líneas y
 * este bloque tiene su propio estado, su propio `fetch` y su propio texto.
 */
export default function PrepararPresupuesto({
  tarificacionId,
  simulado,
}: {
  tarificacionId: string
  /** La cotización de la que sale. Si es simulada, no se podrá enviar nunca. */
  simulado: boolean
}) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ p: PresupuestoPreparado; token: string } | null>(null)

  async function preparar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/correduria/presupuesto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tarificacionId }),
      })
      const r = interpretarPreparado(res.status, await res.json().catch(() => null))
      if (r.estado === 'ok') setHecho({ p: r.presupuesto, token: r.token })
      else if (r.estado === 'sin_configurar') {
        setError('El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).')
      } else setError(r.detalle ? `${r.motivo}: ${r.detalle}` : r.motivo)
    } catch {
      // Un fallo de red NO se pinta como «preparado»: eso dejaría a Alberto
      // creyendo que tiene un presupuesto que no existe.
      setError('No se ha podido hablar con asegura. No se ha preparado nada.')
    } finally {
      setCargando(false)
    }
  }

  if (hecho) return <Preparado p={hecho.p} token={hecho.token} />

  return (
    <section style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <p style={{ margin: '0 0 8px' }}>
        <strong>Preparar el presupuesto para el cliente</strong>
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Congela las opciones de arriba tal y como se le enseñarían. <strong>No manda nada</strong> y{' '}
        <strong>no vuelve a cotizar</strong>: sale de esta misma consulta, que ya está pagada.
      </p>
      <button
        type="button"
        onClick={preparar}
        disabled={cargando}
        style={{ minHeight: 44, padding: '0 16px' }}
      >
        {cargando ? 'Preparando…' : 'Preparar presupuesto'}
      </button>
      {simulado && (
        <p className="muted" style={{ marginTop: 8 }}>
          Ojo: esta cotización es <strong>simulada</strong>. El presupuesto se prepara igual para
          poder verlo, pero no se podrá enviar a nadie.
        </p>
      )}
      {error && (
        <p className="err" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </section>
  )
}

const ROTULO_PAPEL: Record<string, string> = {
  equivalente: 'la equivalente a la suya',
  mas_barata: 'la más barata',
  mejor_cubierta: 'la mejor cubierta',
}

function Preparado({ p, token }: { p: PresupuestoPreparado; token: string }) {
  const avisos = frasePresupuesto(p)
  return (
    <section style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <p style={{ margin: '0 0 8px' }}>
        <strong>Presupuesto preparado</strong> · {p.opciones.length} de {p.preciosTotales} precios ·
        caduca el {new Date(p.venceEl).toLocaleDateString('es-ES')}
      </p>

      {avisos.map((a) => (
        <p key={a} className="err" style={{ margin: '0 0 6px' }}>
          {a}
        </p>
      ))}

      <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
        {p.opciones.map((o) => (
          <li key={o.orden} style={{ marginBottom: 4 }}>
            <strong>{o.compania}</strong> · {o.producto} — {eur(o.primaEur)}
            {/* 🚨 `null` = el producto NO declara franquicia. Nunca «sin franquicia». */}
            {o.franquiciaEur !== null ? (
              <> · franquicia {eur(o.franquiciaEur)}</>
            ) : (
              <> · franquicia no declarada</>
            )}
            {o.papeles.length > 0 && (
              <> · {o.papeles.map((x) => ROTULO_PAPEL[x] ?? x).join(' y ')}</>
            )}
            {o.firmeza !== 'firme' && <> · precio {o.firmeza}</>}
          </li>
        ))}
      </ul>

      {/* 🔑 El enlace en claro viaja UNA vez y no se guarda: en la BD solo vive
          su hash. Se enseña aquí para poder abrirlo cuando exista la pantalla
          del cliente (PR 2); hoy todavía no hay nada al otro lado, y decirlo es
          parte del trabajo — un enlace que promete una página que no existe es
          peor que no darlo. */}
      <p className="muted" style={{ marginTop: 0, wordBreak: 'break-all' }}>
        Enlace del presupuesto (se enseña <strong>una sola vez</strong>; en la base solo se guarda su
        huella): <code>{token}</code>
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Todavía <strong>no se puede enviar</strong>: la pantalla que ve el cliente y el envío por
        correo o WhatsApp son los pasos siguientes. Lo que hay hecho es lo que se le enseñará, ya
        congelado.
      </p>
    </section>
  )
}
