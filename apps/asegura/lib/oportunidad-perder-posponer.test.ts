import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 13/10/2026. Lee el FUENTE: lo que vigila es SQL crudo y cableado entre funciones, donde tsc no mira.
const src = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const cuerpo = (nombre: string) => {
  const i = src.search(new RegExp(`(export )?async function ${nombre}\\b`))
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.slice(i + 10).search(/\n(export )?async function /)
  return src.slice(i, j < 0 ? undefined : i + 10 + j)
}

test('perder un rescate abre la del año siguiente por las DOS vías, con la misma función', () => {
  // Una sola llamada a abrirAnioSiguienteRescate: la de trasPerder (ninguna vía duplica la regla).
  const llamadas = src.match(/abrirAnioSiguienteRescate\(tx,/g) ?? []
  assert.equal(llamadas.length, 1, 'abrirAnioSiguienteRescate se llama fuera de trasPerder')
  assert.match(cuerpo('trasPerder'), /abrirAnioSiguienteRescate\(tx,/)
  assert.match(cuerpo('trasPerder'), /MOTIVO_DESCARTE/, 'el descarte por error de alta no abre el año siguiente')
  assert.match(cuerpo('cambiarEstadoOportunidad'), /await trasPerder\(tx, correduriaId, peticion, t\.oportunidad, actor\)/, 'perder explícito no abre el año siguiente')
  assert.match(cuerpo('registrarLlamada'), /await trasPerder\(tx, correduriaId, plan\.accion, despues, actor\)/, 'perder por la llamada no abre el año siguiente')
  assert.match(cuerpo('registrarLlamada'), /await anotarAnioSiguiente\(/, 'la llamada no lo deja escrito en la ficha')
})

test('posponer no mueve los hitos del recibo devuelto (art. 15 LCS)', () => {
  const c = cuerpo('posponerOportunidad')
  const sel = /const \[prox\][\s\S]*?for update`\)/.exec(c)
  assert.ok(sel, 'falta la lectura de la próxima acción')
  assert.match(sel[0], /and not starts_with\(coalesce\(observaciones, ''\), \$\{PREFIJO_TAREA_DEVOLUCION\}\)/, 'posponer puede mover un hito de devolución')
  // Sin próxima acción normal (solo hitos) se CREA una tarea nueva; el hito no se toca.
  assert.match(c, /insert into gestiones/, 'sin acción normal no se crea la de seguimiento')
})
