// Markdown mínimo → HTML para la salida del LLM (panel del agente arquitecto).
// 🚨 La salida del modelo es input NO confiable y se inyecta con dangerouslySetInnerHTML:
// se ESCAPA el HTML antes de aplicar los regex de markdown (auditoría 11/2026).
export interface ColoresMd { ink: string; ink2: string; paper3: string; red: string }

export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function renderMd(raw: string, C: ColoresMd): string {
  let text = escaparHtml(raw)
  text = text.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink}">$1</strong>`)
  text = text.replace(/`([^`]+)`/g, `<code style="background:${C.paper3};color:${C.red};padding:1px 5px;border-radius:3px;font-size:11px;font-family:monospace">$1</code>`)
  text = text.replace(/^### (.+)$/gm, `<div style="font-weight:700;margin:10px 0 4px;font-size:13px;color:${C.ink2}">$1</div>`)
  text = text.replace(/^## (.+)$/gm, `<div style="font-weight:700;margin:12px 0 6px;font-size:14px;color:${C.ink}">$1</div>`)
  text = text.replace(/^[-•] (.+)$/gm, `<div style="display:flex;gap:6px;margin:2px 0"><span style="color:${C.red}">▸</span><span>$1</span></div>`)
  text = text.split('\n\n').map(p => {
    if (p.startsWith('<')) return p
    return `<p style="margin:5px 0;line-height:1.65">${p.replace(/\n/g, '<br/>')}</p>`
  }).join('')
  return text
}
