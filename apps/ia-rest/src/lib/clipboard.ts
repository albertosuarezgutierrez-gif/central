// clipboard.ts — utilidad compartida para copiar al portapapeles
// Con fallback para WebViews, contextos sin foco y browsers antiguos

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback abajo
  }

  // Fallback: textarea + execCommand (compatible con Android WebView, iOS Safari <13, etc.)
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return true
  } catch {
    // fallback final abajo
  }

  // Último recurso: prompt para que el usuario copie manualmente
  window.prompt('Copia esta URL:', text)
  return false
}
