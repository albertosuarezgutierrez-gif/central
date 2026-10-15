'use client'

// Piezas de pantalla del cotizador EMBEBIDO en la oportunidad (13/10/2026): el enlace «Editar arriba», el resumen de
// solo lectura de lo que vive en los bloques de arriba y la «Verificación antes de pedir precio» (✓/✗/!). La lógica
// pura está en `verificacion-embebido.ts`. Las usan `CotizadorMoto.tsx` y (15/10/2026) `AutoNuevo.tsx`, que ya no
// lleva copia local: en auto embebido solo se usa `Verificacion` (el resumen de lo de arriba se quitó: no se repite).

import { rotuloVacioResumen, type GrupoVerificacion, type NivelVacio } from './verificacion-embebido'

/** Enlace que lleva (scroll) a un bloque de la página. En plataforma el scroller es `LayoutShell`: `scrollIntoView` vale. */
export function IrA({ ancla, alternativa, children }: { ancla: string; alternativa?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${ancla}`}
      onClick={(e) => {
        const el = document.getElementById(ancla) ?? (alternativa ? document.getElementById(alternativa) : null)
        if (!el) return
        e.preventDefault()
        el.scrollIntoView({ behavior: 'smooth', block: el.tagName === 'BUTTON' ? 'center' : 'start' })
        if (el.tagName === 'BUTTON') (el as HTMLButtonElement).focus({ preventScroll: true })
      }}
      style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', minHeight: 44, textDecoration: 'underline' }}
    >
      {children}
    </a>
  )
}

/** Un dato que se edita ARRIBA: aquí solo se lee. Vacío = rótulo (rojo «Falta» o ámbar «Sin dato»), nunca un valor inventado. */
export function ResumenCampo({ etiqueta, valor, nota, notaFalta = false, vacio = 'falta', ancla }: {
  etiqueta: string
  valor: string | null
  nota?: string
  /** La nota es un error (p. ej. compra anterior a la matriculación): se pinta en rojo. */
  notaFalta?: boolean
  /** Vacío: `falta` (rojo, bloquea como en la checklist) o `aviso` (ámbar: la checklist lo trata como aviso). */
  vacio?: NivelVacio
  ancla: string
}) {
  const vacioRotulo = rotuloVacioResumen(vacio)
  return (
    <div style={{ minWidth: 0, display: 'grid', gap: 2, alignContent: 'start' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{etiqueta}</span>
      {valor === null ? (
        <span style={{ color: vacioRotulo.color, fontSize: 13, fontWeight: 600 }}>{vacioRotulo.texto}</span>
      ) : (
        <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{valor}</span>
      )}
      {nota && <span style={{ fontSize: 12, color: notaFalta ? 'var(--negative)' : 'var(--muted)' }}>{nota}</span>}
      <IrA ancla={ancla}>Editar arriba</IrA>
    </div>
  )
}

/** La checklist «Verificación antes de pedir precio»: el botón de 0,50€ solo se enciende sin ✗. */
export function Verificacion({ grupos, completa }: { grupos: GrupoVerificacion[]; completa: boolean }) {
  const nFaltan = grupos.reduce((n, g) => n + g.items.filter((i) => i.estado === 'falta').length, 0)
  return (
    <section aria-labelledby="verificacion-titulo" style={{ border: `1px solid ${completa ? 'var(--positive)' : 'var(--negative)'}`, borderRadius: 10, padding: 12, display: 'grid', gap: 10, minWidth: 0, marginTop: 8 }}>
      <div>
        <div id="verificacion-titulo" style={{ fontSize: 14, fontWeight: 700 }}>Verificación antes de pedir precio</div>
        <div style={{ fontSize: 12, color: completa ? 'var(--positive)' : 'var(--negative)', fontWeight: 600, marginTop: 2 }}>
          {completa ? 'Todo listo: el botón de pago ya está encendido.' : `${nFaltan === 1 ? 'Falta 1 dato' : `Faltan ${nFaltan} datos`}: el botón de pago se enciende cuando todo esté en ✓. Corregirlo no cuesta nada.`}
        </div>
      </div>
      {grupos.map((g) => (
        <div key={g.titulo} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{g.titulo}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {g.items.map((i) => (
              <li key={i.clave} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', alignItems: 'center', fontSize: 13, minWidth: 0 }}>
                <span
                  aria-label={i.estado === 'ok' ? 'correcto' : i.estado === 'falta' ? 'falta' : 'aviso'}
                  style={{ fontWeight: 700, width: 16, textAlign: 'center', color: i.estado === 'ok' ? 'var(--positive)' : i.estado === 'falta' ? 'var(--negative)' : 'var(--warning)' }}
                >
                  {i.estado === 'ok' ? '✓' : i.estado === 'falta' ? '✗' : '!'}
                </span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: i.estado === 'falta' ? 600 : 400 }}>{i.texto}</span>
                {i.nota && <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 0, overflowWrap: 'anywhere' }}>· {i.nota}</span>}
                {i.estado !== 'ok' && i.ancla && (
                  <IrA ancla={i.ancla} alternativa={i.alternativa}>{i.arriba ? 'Editar arriba' : 'Ir al campo'}</IrA>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
