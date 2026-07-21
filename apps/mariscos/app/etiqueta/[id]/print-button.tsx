'use client'

export default function PrintButton() {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0' }}>
      <button className="primary" onClick={() => window.print()}>
        🖨️ Imprimir etiqueta
      </button>
      <button className="ghost" onClick={() => window.close()}>
        Cerrar
      </button>
    </div>
  )
}
