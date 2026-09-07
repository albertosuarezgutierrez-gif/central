'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/ficha-asegura'
import { MOTIVOS_PUERTO, interpretarLeads, type LeadVista, type ResultadoLeads } from '@/lib/leads-asegura'
import Bloque from './Bloque'

const AVISO: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  margin: '0 0 10px',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--panel2)',
  color: 'var(--muted)',
}

/**
 * Las pólizas que los CLIENTES suben al portal y que la casa NO lleva: las
 * oportunidades.
 *
 * ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
 * Medido ese día: `portal_poliza_declarada` no la leía ninguna pantalla de
 * Alberto. El cliente subía su póliza de otra compañía —con su vencimiento— y
 * el corredor no se enteraba nunca.
 *
 * ── Por qué va en «Hoy» y no en una pestaña nueva ───────────────────────────
 * «Hoy» es, según su propia definición, *lo que se hace con el teléfono en la
 * mano y caduca*. Un lead caduca literalmente: pasado el mes de preaviso el
 * cliente ya no puede oponerse a la prórroga y la oportunidad se va un año. Es
 * el mismo trabajo que «Renovaciones», con la compañía cambiada — y por eso va
 * justo detrás, no antes: una renovación propia se pierde si no se atiende;
 * un lead solo se aplaza.
 *
 * ── Lo que esta pantalla NO puede decir ─────────────────────────────────────
 * 1. **`yaEnCartera: null` no es «no es tuya».** Es «no se ha podido
 *    comprobar», y pasa cuando la persona no está casada con ninguna ficha o la
 *    póliza no trae número. Se dice con esas palabras: llamar a un cliente para
 *    ofrecerle algo que ya le vendiste es peor que no llamarlo.
 * 2. **`sin_confirmar` no es un detalle técnico.** Significa que la fecha de
 *    vencimiento la leyó una IA de un PDF y NADIE la ha mirado. Es justo la
 *    fecha sobre la que se decide cuándo llamar, así que se etiqueta en la
 *    fila, no en una nota al pie.
 * 3. **Un fallo de lectura no se calla.** Si este bloque desapareciera cuando
 *    el puerto no contesta, se leería como «no hay oportunidades». Se pinta el
 *    error.
 * 4. **El contador que sube a la cabecera es `null` cuando no se ha podido
 *    leer**, nunca 0: un 0 afirma «no hay nada que trabajar».
 *
 * 🚨 Y no hay ningún botón de tarificar. Avant2/Codeoscopic cuesta 0,50 € por
 * consulta y no es idempotente: la decisión de gastar es de Alberto, en su
 * pantalla de tarificación, no de un clic desde una lista.
 */
export default function LeadsPortal({ onContador }: { onContador: (n: number | null) => void }) {
  const [datos, setDatos] = useState<ResultadoLeads | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/leads')
      .then((r) => r.json().catch(() => null))
      .then((j) => { if (vivo) setDatos(interpretarLeads(j)) })
      .catch(() => { if (vivo) setDatos({ ok: false, motivo: 'red', causa: null }) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (datos === null) return
    // `null` = no se ha podido leer. NUNCA 0 aquí: el badge de la cabecera es
    // lo único que se ve desde las otras pestañas.
    onContador(datos.ok ? datos.leads.filter((l) => l.urgente).length : null)
  }, [datos, onContador])

  if (datos === null) return null

  if (!datos.ok) {
    return (
      <Bloque titulo="Pólizas de otras compañías" Icono={TrendingUp} sub="No se han podido leer.">
        <p style={AVISO}>
          {datos.motivo === 'sin_configurar'
            ? 'Falta ASEGURA_OPERADOR_SECRET en este proyecto, así que plataforma no puede preguntarle a asegura.'
            : MOTIVOS_PUERTO[datos.motivo]}
          {datos.causa ? ` — ${datos.causa}` : ''}
        </p>
      </Bloque>
    )
  }

  const { leads, sinIdentificar, ilegibles } = datos
  if (leads.length === 0 && ilegibles === 0) return null

  return (
    <Bloque
      titulo="Pólizas de otras compañías"
      Icono={TrendingUp}
      sub="Las que tus clientes han subido al portal y no llevas tú. Ordenadas por la fecha en la que aún se pueden mover: un mes antes del vencimiento (LCS art. 22), no el día del vencimiento."
    >
      {sinIdentificar !== null && sinIdentificar > 0 && (
        <p style={AVISO}>
          {sinIdentificar === 1
            ? 'Hay 1 póliza subida por alguien que todavía no está casado con ninguna ficha de la cartera: identifícalo antes de llamar.'
            : `Hay ${sinIdentificar} pólizas subidas por gente que todavía no está casada con ninguna ficha de la cartera: identifícalos antes de llamar.`}
        </p>
      )}
      {ilegibles > 0 && (
        <p style={AVISO}>
          {ilegibles === 1
            ? 'Una fila no se ha podido leer y no se muestra.'
            : `${ilegibles} filas no se han podido leer y no se muestran.`}
        </p>
      )}
      {/* Rejilla y no tabla: en móvil una tabla de cinco columnas obliga a
          desplazar en horizontal, y esta lista se mira desde el teléfono. */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {leads.map((l) => (
          <Fila key={l.id} l={l} />
        ))}
      </div>
    </Bloque>
  )
}

function Fila({ l }: { l: LeadVista }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        // El filete de la izquierda distingue lo urgente sin un segundo color
        // de fondo: la pantalla ya usa el fondo tintado para los partes, que
        // son lo único más urgente que esto.
        borderLeft: `4px solid ${l.urgente ? 'var(--warn, #9A6510)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface)',
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{l.compania ?? 'Compañía sin identificar'}</strong>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflowWrap: 'anywhere' }}>
          {l.ramo ?? 'ramo sin identificar'}
          {l.numeroPoliza ? ` · nº ${l.numeroPoliza}` : ''}
          {/* La prima solo se pinta si la hay. `null` = la póliza no la informa,
              y «0,00€» diría que el cliente no paga nada por ella. */}
          {l.primaAnual !== null ? ` · ${eur(l.primaAnual)}/año` : ''}
        </div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>{textoPlazo(l)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {/* El estado de la FECHA, que es lo que decide cuándo llamar. */}
          {l.estado === 'sin_confirmar' && (
            <Badge tono="aviso" title="La fecha la leyó una IA del PDF y el cliente todavía no la ha revisado: confírmala antes de usarla para llamar.">
              Fecha sin confirmar
            </Badge>
          )}
          {l.estado === 'sin_fecha' && (
            <Badge tono="aviso" title="No sabemos cuándo vence, así que no se puede saber cuándo se puede mover.">
              Sin fecha de vencimiento
            </Badge>
          )}
          {/* 🚨 `null` ≠ `false`. Se dice el «no lo sé»; callarlo dejaría creer
              que está comprobado que no es de la casa. */}
          {l.yaEnCartera === null && (
            <Badge title="No se ha podido comprobar si esta póliza ya la llevas tú: o la persona no está casada con ninguna ficha, o la póliza no trae número.">
              ¿Ya es tuya? Sin comprobar
            </Badge>
          )}
          {l.clienteId === null && <Badge tono="aviso">Sin identificar</Badge>}
          {l.ventanaPasada && (
            <Badge title="La ventana de este año ya pasó; la póliza se habrá prorrogado. Vuelve a mirarlo en su próximo vencimiento.">
              Ventana pasada
            </Badge>
          )}
        </div>
      </div>
      {l.clienteId !== null && (
        <Link href={`/correduria/cliente/${l.clienteId}`} style={{ fontSize: 13, flex: '0 0 auto' }}>
          Ver ficha
        </Link>
      )}
    </div>
  )
}

/** Las tres frases posibles, y ninguna inventa una fecha que no se sabe. */
function textoPlazo(l: LeadVista): string {
  if (l.fechaVencimiento === null) return 'Sin fecha de vencimiento: no se puede saber cuándo se puede mover.'
  const vence = fechaEs(l.fechaVencimiento.toISOString()) ?? '—'
  if (l.ventanaPasada) return `Venció el ${vence}: la ventana de este año ya pasó.`
  const util = l.fechaAccionable === null ? null : fechaEs(l.fechaAccionable.toISOString())
  const dias = l.diasParaAccionable
  return `Vence el ${vence}. Se puede mover hasta el ${util ?? '—'}${dias === null ? '' : dias === 0 ? ' (hoy)' : ` (${dias} días)`}.`
}
