// Resumen del ciclo de mensajes automáticos a huéspedes, para /apartamentos.
// Pedido por Alberto (31/08/2026): «ponme en el panel un resumen de lo que hace, así lo tengo en
// cuenta». Server component: lee estado real, no promete nada que no haya mirado.
import { CICLO } from '@/lib/sivra/mensajes-prog/ciclo'
import { getEstadoCiclo } from '@/lib/sivra/mensajes-prog/estado-panel'

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default async function MensajesHuesped() {
  const est = await getEstadoCiclo()
  const activos = est.pisos.filter(p => p.activo)
  const enSombra = est.pisos.filter(p => !p.activo)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '20px 24px', marginBottom: '28px', boxShadow: 'var(--shadow)',
    }}>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>📬 Mensajes automáticos al huésped</h2>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {est.ultimaPasada ? `última pasada ${fecha(est.ultimaPasada)}` : 'sin pasadas registradas'}
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 16px' }}>
        Sustituye a los automáticos de Smoobu. El cron mira las reservas cada 30 min y manda lo que toca.
      </p>

      {est.aviso && (
        <div style={{
          fontSize: '12px', background: 'var(--warning-bg)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', color: 'var(--text)',
        }}>⚠️ {est.aviso}</div>
      )}

      {/* Estado por piso: quién escribe HOY a cada huésped */}
      <div className="msg-pisos" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {est.pisos.map(p => (
          <div key={p.propertyId} style={{
            border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>
              {p.activo ? '🟢' : '🕶️'} {p.nombre}
            </div>
            <div style={{ color: 'var(--muted)' }}>
              {p.activo
                ? <>Escribimos <b>nosotros</b>{p.desde ? ` desde el ${fecha(p.desde)}` : ''}.</>
                : <>Los manda <b>Smoobu</b>. Aquí solo se generan y se guardan.</>}
            </div>
            <div style={{ color: 'var(--muted)', marginTop: '4px' }}>
              {p.enviados > 0 && <>{p.enviados} enviado{p.enviados === 1 ? '' : 's'} · </>}
              {p.enSombra > 0 && <>{p.enSombra} en sombra · </>}
              {p.fallos > 0 && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>{p.fallos} con fallo · </span>}
              {p.enviados === 0 && p.enSombra === 0 && p.fallos === 0 && <>sin movimientos todavía</>}
              {p.ultimoEnvio && <>último {fecha(p.ultimoEnvio)}</>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
        {activos.length === 0
          ? '🕶️ Ningún piso activado: hoy no le llega nada a ningún huésped desde aquí.'
          : `🟢 ${activos.length} piso(s) enviando de verdad${enSombra.length ? ` · ${enSombra.length} todavía en sombra (los cubre Smoobu)` : ''}.`}
      </div>

      {/* El ciclo, plegado: está para consultarlo, no para ocupar la pantalla */}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, minHeight: '40px', display: 'flex', alignItems: 'center' }}>
          Ver los {CICLO.length} mensajes y cuándo sale cada uno
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          {CICLO.map((p, i) => (
            <div key={p.tipo} className="msg-paso" style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div className="msg-paso-cuando" style={{ minWidth: '190px', fontSize: '12px' }}>
                <div style={{ fontWeight: 700 }}>{i + 1}. {p.titulo} {p.conCodigos ? '🔑' : ''}</div>
                <div style={{ color: 'var(--muted)' }}>{p.cuando}</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)' }}>{p.contenido}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>
          🔑 = lleva códigos de acceso. Si una reserva se hace a última hora, el ciclo se COLAPSA:
          sale como mucho la confirmación y el mensaje de acceso con los códigos, nunca la ristra entera.
          Un código que falte en la base de datos NO se inventa: el mensaje declara el hueco y avisa por Telegram.
        </p>
      </details>
    </div>
  )
}
