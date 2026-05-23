import type { TemplateData } from './types'

export default function TemplateUrbano({ d }: { d: TemplateData }) {
  const a = d.color_acento
  return (
    <html lang={d.idioma}>
      <head>
        <meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,700;1,300&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: `
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:#0D0D0D;color:#F0EDE8;font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
          a{text-decoration:none;color:inherit}
          .nav{padding:18px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1a1a1a}
          .logo-txt{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px}
          .nav-tag{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#444}
          .hero{padding:48px 28px 36px}
          .eyebrow{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${a};margin-bottom:14px}
          .big{font-family:'Bebas Neue',sans-serif;font-size:72px;line-height:.88;letter-spacing:2px}
          .hero-logo{height:64px;object-fit:contain;filter:invert(1);margin-bottom:16px;display:block}
          .hero-sub{font-size:14px;color:#666;line-height:1.75;margin-top:18px;font-weight:300;max-width:340px}
          .hero-btn{display:inline-block;margin-top:26px;background:${a};color:#fff;padding:13px 26px;font-size:11px;letter-spacing:3px;text-transform:uppercase;border:none;cursor:pointer}
          .ticker{background:${a};padding:10px 0;overflow:hidden;white-space:nowrap}
          .ticker-inner{display:inline-flex;gap:0;animation:tick 18s linear infinite}
          @keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
          .tick-item{font-family:'Bebas Neue';font-size:13px;letter-spacing:2px;padding:0 20px;color:#fff}
          .sec{padding:36px 28px 0}
          .sec-label{font-size:9px;letter-spacing:5px;text-transform:uppercase;color:${a};margin-bottom:16px}
          .cat{font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#555;margin:20px 0 10px}
          .item{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;border-bottom:1px solid #161616}
          .item-name{font-size:15px;font-weight:300}
          .item-desc{font-size:11px;color:#555;margin-top:3px}
          .price{font-family:'Bebas Neue';font-size:20px;color:${a};letter-spacing:1px;margin-left:16px}
          .reserva-strip{background:#111;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:28px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:36px}
          .res-left h3{font-family:'Bebas Neue';font-size:28px;letter-spacing:2px}
          .res-left p{font-size:11px;color:#555;letter-spacing:2px;text-transform:uppercase;margin-top:4px}
          .res-btns{display:flex;gap:10px;flex-wrap:wrap}
          .btn{background:transparent;border:1px solid #333;color:#888;padding:10px 18px;font-size:10px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;white-space:nowrap}
          .btn-main{background:${a};border-color:${a};color:#fff}
          .h-item{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #161616;font-size:13px;font-weight:300;color:#666}
          .h-val{color:#F0EDE8}
          .redes{display:flex;gap:16px;flex-wrap:wrap}
          .red{font-size:12px;color:#555;letter-spacing:1px}
          .red:hover{color:${a}}
          footer{padding:22px 28px;border-top:1px solid #111;display:flex;justify-content:space-between;align-items:center;margin-top:36px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#2a2a2a}
          footer a{color:${a}}
          @media(max-width:480px){.big{font-size:54px}.reserva-strip{flex-direction:column;align-items:flex-start}}
        ` }} />
      </head>
      <body>
        <div className="nav">
          {d.logo_url
            ? <img src={d.logo_url} alt={d.nombre} style={{height:32,objectFit:'contain',filter:'invert(1)'}} />
            : <div className="logo-txt">{d.nombre}</div>
          }
          <div className="nav-tag">Sevilla · ES</div>
        </div>

        <div className="hero">
          <div className="eyebrow">· Restaurante ·</div>
          {!d.logo_url && <div className="big">{d.nombre.toUpperCase()}</div>}
          {d.descripcion_local && <div className="hero-sub">{d.descripcion_local}</div>}
          {(d.telefono_reservas || d.url_reserva_directa) && d.mostrar_reservas && (
            <a href={d.url_reserva_directa || `tel:${d.telefono_reservas}`} className="hero-btn">{d.t.reservar}</a>
          )}
        </div>

        <div className="ticker"><div className="ticker-inner">
          {['Cocina local','Reserva directa','Sin comisiones','Producto de mercado','Sevilla','Cocina local','Reserva directa','Sin comisiones','Producto de mercado','Sevilla'].map((t,i) => <span key={i} className="tick-item">{t} &nbsp;/</span>)}
        </div></div>

        {d.mostrar_carta && d.carta.length > 0 && (
          <div className="sec">
            <div className="sec-label">{d.t.carta}</div>
            {d.carta.map(c => (<div key={c.cat}>
              <div className="cat">{c.cat}</div>
              {c.items.map(i => (
                <div key={i.nombre} className="item">
                  <div><div className="item-name">{i.nombre}</div>{i.descripcion && <div className="item-desc">{i.descripcion}</div>}</div>
                  {i.precio != null && <span className="price">{Number(i.precio).toFixed(2)}</span>}
                </div>
              ))}
            </div>))}
          </div>
        )}

        {d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) && (
          <div className="reserva-strip">
            <div className="res-left"><h3>{d.t.reservar}</h3><p>{d.t.reserva_directa}</p></div>
            <div className="res-btns">
              {d.telefono_reservas && <a href={`tel:${d.telefono_reservas}`} className="btn">{d.t.llamar}</a>}
              {d.whatsapp && <a href={`https://wa.me/${d.whatsapp.replace(/\D/g,'')}`} className="btn">{d.t.whatsapp}</a>}
              {d.url_reserva_directa && <a href={d.url_reserva_directa} className="btn btn-main">{d.t.online}</a>}
            </div>
          </div>
        )}

        {d.horarios.length > 0 && (
          <div className="sec">
            <div className="sec-label" style={{marginTop:0}}>{d.t.horarios}</div>
            {d.horarios.map(h => <div key={h.dia} className="h-item"><span style={{textTransform:'capitalize'}}>{h.dia}</span><span className="h-val">{h.hora}</span></div>)}
          </div>
        )}

        {d.url_google_maps && (
          <div className="sec">
            <a href={d.url_google_maps} target="_blank" rel="noopener noreferrer" className="btn btn-main" style={{display:'inline-block',marginTop:0}}>{d.t.maps}</a>
          </div>
        )}

        <footer>
          <span>© {d.nombre} {new Date().getFullYear()}</span>
          <div className="redes">
            {d.redes_sociales.instagram && <a href={`https://instagram.com/${d.redes_sociales.instagram.replace('@','')}`} target="_blank" rel="noopener" className="red">IG</a>}
            {d.redes_sociales.tiktok && <a href={`https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}`} target="_blank" rel="noopener" className="red">TT</a>}
            {d.redes_sociales.tripadvisor && <a href={d.redes_sociales.tripadvisor} target="_blank" rel="noopener" className="red">TA</a>}
          </div>
          <span>{d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a></span>
        </footer>
      </body>
    </html>
  )
}
