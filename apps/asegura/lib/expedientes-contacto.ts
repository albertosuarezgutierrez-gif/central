// apps/asegura/lib/expedientes-contacto.ts
//
// Contacto (teléfono/email) de cada fila de «Mi mesa» (13/10/2026): expedientes, tareas sueltas y
// pérdidas por revisar, para pintar llamar · WhatsApp · correo sin abrir la ficha.
//
// PURO: la lectura es `contactosDe()` de `cartera-busqueda.ts` (el ÚNICO lector del contacto de N
// fichas: descifra campo a campo con `descifrarCampo` y rellena el email secundario de
// `cliente_emails`); aquí solo se decide qué recibe cada fila. Como en la búsqueda y en renovaciones,
// es el contacto del TITULAR: no cae a los intervinientes de sus pólizas (dos consultas más por fila).
// Por eso un hueco no afirma nada: la pantalla no pinta el icono, no dice «sin teléfono».
//
// Tres estados:
//   · `null`                      → no se pudo leer (la consulta falló) o la fila no cuelga de ninguna ficha.
//   · `{ telefono: null, ... }`   → se leyó y no consta, o está cifrado y la clave no lo abre.
//   · `{ telefono: '6…', ... }`   → dato.
// Un fallo NUNCA tumba la lista: `contactosDe` ya se traga el suyo y devuelve `null`.

import type { Contacto } from './cartera-busqueda'

export type ContactoFila = { telefono: string | null; email: string | null }

export function contactoDeFila(
  mapa: ReadonlyMap<string, Pick<Contacto, 'telefono' | 'email'>> | null,
  clienteId: string | null | undefined,
): ContactoFila | null {
  if (mapa === null || !clienteId) return null
  const c = mapa.get(clienteId)
  // Se preguntó por esa ficha y no vino: no consta (la consulta ya filtra por correduría).
  if (!c) return { telefono: null, email: null }
  return { telefono: limpio(c.telefono), email: limpio(c.email) }
}

function limpio(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
