export const dynamic = 'force-dynamic'

const VARIANTES = {
  stat: [
    { v: 1, label: 'Bloque oscuro' },
    { v: 2, label: 'Editorial crema' },
    { v: 3, label: 'Rojo total' },
    { v: 4, label: 'Split vertical' },
    { v: 5, label: 'Onda de fondo' },
    { v: 6, label: 'Tarjeta producto' },
  ],
  pregunta: [
    { v: 1, label: 'Editorial crema' },
    { v: 2, label: 'Oscuro dramático' },
    { v: 3, label: 'Rojo comillas' },
    { v: 4, label: 'Onda lateral' },
  ],
}

export default function IgLab() {
  const C = { dark:'#14110E', d2:'#1E1A15', cr:'#F6F1E7', red:'#D9442B', i3:'#9C8E7E', rule:'#2E2720' }
  const Grid = ({ tipo, items }: { tipo: string; items: { v:number; label:string }[] }) => (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ color: C.cr, fontFamily: 'Georgia, serif', fontStyle:'italic', fontSize: 28, margin: '0 0 4px' }}>
        Plantilla «{tipo}»
      </h2>
      <p style={{ color: C.i3, fontSize: 14, margin: '0 0 20px' }}>Mismo contenido, {items.length} diseños distintos</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {items.map(it => (
          <div key={it.v} style={{ background: C.d2, border:`1px solid ${C.rule}`, borderRadius: 16, overflow:'hidden' }}>
            <img src={`/api/ig-lab-img?tipo=${tipo}&v=${it.v}`} alt={it.label} width={1080} height={1080}
                 style={{ width:'100%', height:'auto', display:'block' }} />
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ color: C.cr, fontSize: 15, fontWeight: 600 }}>{it.label}</span>
              <span style={{ color: C.i3, fontSize: 13 }}>v{it.v}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div style={{ minHeight:'100vh', background: C.dark, padding:'40px 24px', fontFamily:'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin:'0 auto' }}>
        <header style={{ marginBottom: 40 }}>
          <h1 style={{ color: C.cr, fontFamily:'Georgia, serif', fontStyle:'italic', fontSize: 40, margin:'0 0 8px' }}>
            ia<span style={{ color: C.red }}>.</span>rest · laboratorio de variantes
          </h1>
          <p style={{ color: C.i3, fontSize: 16, margin: 0, lineHeight: 1.5 }}>
            Prueba de cómo el director de arte rotaría diseños para el mismo contenido, manteniendo la marca.
          </p>
        </header>
        <Grid tipo="stat" items={VARIANTES.stat} />
        <Grid tipo="pregunta" items={VARIANTES.pregunta} />
      </div>
    </div>
  )
}
