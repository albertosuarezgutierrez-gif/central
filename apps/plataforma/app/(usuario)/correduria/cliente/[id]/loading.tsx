/**
 * Lo que se ve mientras llega la ficha. Cada pestaña es una carga en el servidor que vuelve a pedir
 * la ficha entera a asegura: sin esto, al pulsar una pestaña la pantalla se quedaba congelada
 * hasta que contestaba, y parecía que el clic no había hecho nada.
 */
export default function CargandoFicha() {
  const barra = (ancho: string, alto = 14): React.CSSProperties => ({
    width: ancho, height: alto, borderRadius: 6, background: 'var(--border)', opacity: 0.6,
  })
  return (
    <div role="status" aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      <span className="solo-lectores">Cargando la ficha del cliente…</span>
      <div style={barra('40%', 22)} />
      <div style={barra('65%')} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={{ ...barra('100%', 64), borderRadius: 10 }} />)}
      </div>
      <div style={barra('90%')} />
      <div style={barra('80%')} />
    </div>
  )
}
