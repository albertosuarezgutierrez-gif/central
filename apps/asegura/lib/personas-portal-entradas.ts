// Figuras crudas de una póliza (+ la persona asegurada de vida/decesos) con su documento EN CLARO,
// solo en memoria del servidor de asegura, para decidir cuáles son del cliente (`personasParaCliente`).
// PURO: el descifrado entra inyectado. El documento en claro NUNCA sale de aquí hacia el puente:
// `personasParaCliente` solo lo usa para comparar identidades.
import { figuraDeCima, MAX_FIGURAS_CIMA, type DescifrarFigura } from '@central/module-seguros'
import {
  NIVELES,
  documentoIdentidad,
  figurasEnPolizas,
  type FiguraConDocumento,
  type FilaInterviniente,
  type Nivel,
} from '@central/module-seguros-portal'

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
  const todas = crudas.slice(0, MAX_FIGURAS_CIMA).flatMap((raw) => {
    const figura = figuraDeCima(raw, descifrar)
    if (!figura) return []
    return [{ figura, documento: esObjeto(raw) ? abrirDocumento(raw.documentoCifrado, descifrar) : null }]
  })
  return deduplicar(todas)
}

const nombreNormal = (n: string | null) => (n ? n.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase() : null)

/**
 * ¿Es la MISMA persona en el mismo papel? Siempre mismo papel, y además: con documento en las dos, mismo
 * documento (dos distintos no se funden jamás, aunque se llamen igual); si a alguna le falta, mismo nombre.
 */
function misma(a: FiguraConDocumento, b: FiguraConDocumento): boolean {
  // Mismo PAPEL siempre: el tomador que además es el asegurado son dos papeles y se dicen los dos.
  if (a.figura.papel !== b.figura.papel) return false
  const da = documentoIdentidad(a.documento)
  const db = documentoIdentidad(b.documento)
  if (da !== null && db !== null) return da === db
  const na = nombreNormal(a.figura.nombre)
  return na !== null && na === nombreNormal(b.figura.nombre)
}

/**
 * La persona de vida/decesos que CIMA trae TAMBIÉN en `figuras[]` saldría dos veces: se queda la
 * primera (la de `figuras`) y lo que le falte se completa con la repetida (p. ej. la fecha de nacimiento).
 */
export function deduplicar(lista: FiguraConDocumento[]): FiguraConDocumento[] {
  const out: FiguraConDocumento[] = []
  for (const e of lista) {
    const previa = out.find((o) => misma(o, e))
    if (!previa) {
      out.push(e)
      continue
    }
    const f = { ...previa.figura }
    for (const k of Object.keys(f) as (keyof typeof f)[]) {
      if (f[k] === null && e.figura[k] !== null) (f as Record<string, unknown>)[k] = e.figura[k]
    }
    f.documentoConsta = previa.figura.documentoConsta || e.figura.documentoConsta
    f.ilegible = previa.figura.ilegible || e.figura.ilegible
    previa.figura = f
    previa.documento = previa.documento ?? e.documento
  }
  return out
}

/**
 * ¿Abre el puente esta póliza a esta identidad? EXACTAMENTE la regla de la cartera del portal: es
 * propia (su tomador es una ficha vinculada) o la abre `figurasEnPolizas` — la MISMA función que usa
 * `carteraDeIdentidad` para «pólizas donde figura» (`@central/module-seguros-portal`), sin copia aquí.
 * `poliza` ya viene filtrada a viva, de esta correduría y sin fusionar; `filas`, solo las de sus fichas.
 */
export function puenteAbrePoliza(args: {
  poliza: { id: string; clienteId: string }
  filas: readonly FilaInterviniente[]
  vinculos: readonly { clienteId: string; nivel: string }[]
}): boolean {
  const fichas = args.vinculos.map((v) => v.clienteId)
  if (fichas.includes(args.poliza.clienteId)) return true
  const nivelPorCliente = new Map(
    args.vinculos.map((v) => [v.clienteId, (NIVELES as readonly string[]).includes(v.nivel) ? (v.nivel as Nivel) : ('tarjeta' as Nivel)]),
  )
  return figurasEnPolizas({
    filas: args.filas,
    polizas: [args.poliza],
    propiosIds: fichas,
    nivelPorCliente,
    yaVisibles: new Set(),
  }).has(args.poliza.id)
}
