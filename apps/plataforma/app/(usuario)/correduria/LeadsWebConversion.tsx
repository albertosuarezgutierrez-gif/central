'use client'
import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import Bloque from './Bloque'
import { Badge, Pendiente, TablaScroll } from '@/components/ui'
import type { ConversionLeadsWeb } from '@/lib/leads-web-conversion-asegura'

/**
 * Conversión de leads de `apps/asegura-web` (el formulario público,
 * `grupoasegura.es`) a cartera viva. Alberto lo pidió como paso previo a
 * gastar en Ads: «necesito saber que convierte antes de meterle presupuesto».
 *
 * ─── Por qué esto es un informe y no una cola de trabajo ────────────────────
 * A diferencia de `Recaptacion` (leads sin vencimiento a los que SÍ hay que
 * llamar), aquí no se pinta contador en la barra de secciones: con 1 lead
 * medido el 15/09/2026 (la web lleva 10 días viva) una tasa de conversión
 * sería estadísticamente inútil como aviso — es infraestructura de medición
 * que necesita acumular datos, no un aviso accionable hoy. Los pendientes se
 * listan para que Alberto pueda trabajarlos desde «Clientes»/su ficha, no
 * para que esta pantalla reclame atención por ellos.
 *
 * ─── `total === 0` no es `tasaConversion: 0` ─────────────────────────────────
 * El lector (`leads-web-conversion-asegura.ts`) ya lo distingue: sin ningún
 * lead no hay ratio que calcular. Esta pantalla respeta esa distinción en vez
 * de pintar «0% de conversión», que sería una afirmación sobre datos que no
 * existen todavía.
 */
export default function LeadsWebConversion() {
  const [r, setR] = useState<ConversionLeadsWeb | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/leads-web')
      .then((res) => (res.ok ? res.json() : { estado: 'error', motivo: `HTTP ${res.status}` }))
      .then((d) => { if (vivo) setR(d) })
      .catch(() => { if (vivo) setR({ estado: 'error', motivo: 'red' }) })
    return () => { vivo = false }
  }, [])

  if (r === null) {
    return (
      <Bloque titulo="Conversión de leads web" Icono={TrendingUp}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
      </Bloque>
    )
  }

  if (r.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Conversión de leads web" Icono={TrendingUp}>
        <Pendiente texto="Puerto de asegura sin configurar." donde="Falta ASEGURA_OPERADOR_SECRET en el proyecto Vercel de plataforma." />
      </Bloque>
    )
  }

  if (r.estado === 'error') {
    return (
      <Bloque titulo="Conversión de leads web" Icono={TrendingUp} tono="aviso">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer ({r.motivo}). No significa que no haya leads: inténtalo de nuevo más tarde.
        </p>
      </Bloque>
    )
  }

  const { total, convertidos, tasaConversion, pendientes } = r

  return (
    <Bloque
      titulo="Conversión de leads web"
      Icono={TrendingUp}
      sub={
        total === 0
          ? 'Todavía no ha entrado ningún lead por grupoasegura.es.'
          : `${total} lead${total === 1 ? '' : 's'} desde la web · ${convertidos} convertido${convertidos === 1 ? '' : 's'} a cartera viva.`
      }
    >
      {total === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Sin leads todavía no hay tasa de conversión que calcular — esto empezará a decir algo cuando
          la web lleve un tiempo captando.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: pendientes.length ? 12 : 0 }}>
            <Badge tono="neutral" title="Leads captados por el formulario de grupoasegura.es">
              {total} lead{total === 1 ? '' : 's'}
            </Badge>
            <Badge tono="neutral" title="Con al menos una póliza de cartera viva">
              {convertidos} convertido{convertidos === 1 ? '' : 's'}
            </Badge>
            <Badge tono="neutral">
              {tasaConversion === null ? 'tasa: —' : `tasa: ${(tasaConversion * 100).toFixed(0)}%`}
            </Badge>
          </div>

          {pendientes.length > 0 && (
            <TablaScroll>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                    <th style={{ padding: '4px 8px' }}>Lead sin convertir</th>
                    <th style={{ padding: '4px 8px' }}>Desde hace</th>
                    <th style={{ padding: '4px 8px' }}>Canal</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.slice(0, 50).map((p) => (
                    <tr key={p.clienteId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <a href={`/correduria/cliente/${encodeURIComponent(p.clienteId)}`}>{p.nombre}</a>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{p.diasDesdeAlta} día{p.diasDesdeAlta === 1 ? '' : 's'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {p.tieneTelefono ? '📞 ' : ''}{p.tieneEmail ? '✉️' : ''}
                        {!p.tieneTelefono && !p.tieneEmail && '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScroll>
          )}
        </>
      )}
    </Bloque>
  )
}
