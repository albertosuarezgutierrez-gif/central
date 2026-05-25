'use client'
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ position:'fixed', top:20, right:20, background:'#D9442B', color:'white', border:'none', padding:'10px 20px', borderRadius:6, fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px rgba(217,68,43,.4)', zIndex:100 }}>
      🖨️ Imprimir / PDF
    </button>
  )
}
