'use client'

// «Saldo total del grupo» con botón 👁 para ocultarlo (como en las apps de banco): Alberto enseña
// el panel a gente y no quiere que se lea la cifra. El importe NO se sustituye ni se desmonta —
// se desenfoca por CSS (`.saldo-privado` en globals.css, activada por html[data-saldo-oculto]),
// así el ancho del bloque no salta al alternar.
//
// El estado persiste en localStorage('saldo-oculto') y lo aplica el script anti-parpadeo del
// layout raíz ANTES del primer pintado: al recargar con el modo activo no hay ni un fotograma con
// la cifra legible (que es exactamente lo que haría inútil el botón).
//
// ⚠️ Ocultación VISUAL, no de seguridad: el importe sigue en el HTML servido.
import { useEffect, useState } from 'react'

export default function SaldoTotal({ texto, positivo }: { texto: string; positivo: boolean }) {
  // Arranca en 'visible' para que servidor y cliente rendericen el mismo icono (sin hydration
  // mismatch); el desenfoque real ya lo ha aplicado el script del layout, así que la cifra nunca
  // parpadea aunque el icono se corrija un instante después.
  const [oculto, setOculto] = useState(false)
  useEffect(() => {
    setOculto(document.documentElement.dataset.saldoOculto === '1')
  }, [])

  function alternar() {
    const sig = !oculto
    setOculto(sig)
    if (sig) document.documentElement.dataset.saldoOculto = '1'
    else delete document.documentElement.dataset.saldoOculto
    try {
      localStorage.setItem('saldo-oculto', sig ? '1' : '0')
    } catch { /* localStorage bloqueado: vale solo para esta pantalla */ }
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Saldo total del grupo</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="saldo-privado" style={{ fontSize: '28px', fontWeight: 800, color: positivo ? '#16a34a' : '#dc2626' }}>
          {texto}
        </div>
        <button
          onClick={alternar}
          aria-pressed={oculto}
          aria-label={oculto ? 'Mostrar el saldo total' : 'Ocultar el saldo total'}
          title={oculto ? 'Mostrar el saldo' : 'Ocultar el saldo (para enseñar el panel)'}
          style={{
            // 44px de lado: mínimo táctil en móvil (regla responsive del monorepo).
            width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', lineHeight: 1, border: '1px solid var(--border)', borderRadius: '10px',
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0,
          }}
        >{oculto ? '🙈' : '👁️'}</button>
      </div>
    </div>
  )
}
