// Figuras crudas de una póliza (+ la persona asegurada de vida/decesos) con su documento EN CLARO,
// solo en memoria del servidor de asegura, para decidir cuáles son del cliente (`personasParaCliente`).
// PURO: el descifrado entra inyectado. El documento en claro NUNCA sale de aquí hacia el puente:
// `personasParaCliente` solo lo usa para comparar identidades.
import { figuraDeCima, MAX_FIGURAS_CIMA, type DescifrarFigura } from '@central/module-seguros'
import type { FiguraConDocumento } from '@central/module-seguros-portal'

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

function abrirDocumento(v: unknown, descifrar: DescifrarFigura): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    const c = descifrar(v)
    return typeof c === 'string' && c !== '' && !c.startsWith('v1:') ? c : null
  } catch {
    return null
  }
}

/** `null` = la póliza no trae ni `figuras` ni persona de vida/decesos (anterior a asegura#880). */
export function entradasDePoliza(datos: unknown, descifrar: DescifrarFigura): FiguraConDocumento[] | null {
  if (!esObjeto(datos)) return null
  const crudas: unknown[] = []
  const hayFiguras = Array.isArray(datos.figuras)
  if (hayFiguras) crudas.push(...(datos.figuras as unknown[]))
  let hayPersona = false
  for (const b of [datos, ...(Array.isArray(datos.riesgos) ? datos.riesgos : [])]) {
    if (!esObjeto(b)) continue
    for (const k of ['vida', 'decesos'] as const) {
      const bloque = b[k]
      const p = esObjeto(bloque) ? bloque.persona : null
      if (esObjeto(p)) {
        crudas.push({ papel: 'asegurado', ...p })
        hayPersona = true
      }
    }
  }
  if (!hayFiguras && !hayPersona) return null
  return crudas.slice(0, MAX_FIGURAS_CIMA).flatMap((raw) => {
    const figura = figuraDeCima(raw, descifrar)
    if (!figura) return []
    return [{ figura, documento: esObjeto(raw) ? abrirDocumento(raw.documentoCifrado, descifrar) : null }]
  })
}
