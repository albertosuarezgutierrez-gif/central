import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardián de la ficha de cliente de la correduría con pestañas (03/09/2026).
 *
 * 🚨 Lo que protege es UNA promesa: **lo que exige una llamada vive en la
 * cabecera, fuera de las pestañas.** El CRM anterior de Alberto necesita
 * chapitas rojas precisamente porque lo que no está en la pestaña abierta no
 * existe; un recibo devuelto escondido tras un clic es un recibo que no se
 * reclama. Si alguien "ordena" la pantalla metiendo los contadores dentro de la
 * pestaña «Resumen», la ficha vuelve a ese fallo sin que nada se rompa.
 */

const DIR = path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/cliente/[id]')
const leer = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

test('la cabecera se monta FUERA de las pestañas y lleva los contadores de alarma', () => {
  const page = leer('page.tsx')
  // Montada sin condición de pestaña: se ve en las siete.
  assert.match(page, /<Cabecera ficha=\{ficha\} resumen=\{resumen\}[^>]*\/>/)
  assert.doesNotMatch(page, /tab === '\w+' && \(?\s*<Cabecera/, 'la cabecera no puede colgar de una pestaña')

  const cab = leer('Cabecera.tsx')
  for (const titular of ['Recibos devueltos', 'Recibos al cobro', 'Siniestros abiertos', 'Pólizas vivas']) {
    assert.ok(cab.includes(titular), `«${titular}» tiene que estar en la cabecera`)
  }
})

test('los tres estados siguen vivos: «—» no es 0 y 0 no es «—»', () => {
  const cab = leer('Cabecera.tsx')
  // El «no se ha podido mirar» se pinta como «—», y sale de un `=== null`.
  assert.match(cab, /devueltos === null \? '—'/)
  assert.match(cab, /pendientes === null \? '—'/)
  assert.match(cab, /abiertos === null \? '—'/)
  // Y nunca se colapsa lo no informado a cero.
  assert.doesNotMatch(cab, /\?\?\s*0/, '?? 0 convierte «no se sabe» en «no hay»')
  assert.doesNotMatch(cab, /\|\|\s*0/)
})

test('la fecha grande del quinto tile es el LÍMITE DE AVISO, no el vencimiento', () => {
  // LCS art. 22: el tomador tiene que oponerse un mes antes. Enseñar el
  // vencimiento como fecha de acción deja creer que hay 30 días más de los que
  // hay — el plazo ya se pasó cuando el cliente mira el calendario.
  const cab = leer('Cabecera.tsx')
  assert.match(cab, /valor=\{fmt\((?:proximo|a)\.limiteAviso(?: as string)?\)\}/)
  assert.match(cab, /Hay que avisar antes del/)
  assert.ok(cab.includes('vence el ${fmt(proximo.vencimiento)}'), 'el vencimiento se dice, pero debajo')
})

test('un ?tab= desconocido cae en «Resumen» en vez de dejar la ficha en blanco', async () => {
  const { tabDeParametro } = await import('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/tabs.ts')
  assert.equal(tabDeParametro(undefined), 'resumen')
  // Recibos, Siniestros y Pólizas ya no son pestañas: un enlace viejo lleva a la vista de seguros
  // («resumen», tarjeta «Seguros»), donde viven las pólizas, el histórico y los siniestros.
  assert.equal(tabDeParametro('recibos'), 'resumen')
  assert.equal(tabDeParametro('siniestros'), 'resumen')
  assert.equal(tabDeParametro('polizas'), 'resumen')
  assert.equal(tabDeParametro('inventada'), 'resumen')
  // Claves heredadas de Object no pueden colarse como pestaña (dejarían la ficha en blanco).
  for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(tabDeParametro(t), 'resumen', t)
  assert.equal(tabDeParametro(['contactos', 'recibos']), 'contactos')
})

test('un contador nulo NO se pinta (0 diría «se miró y no hay»)', () => {
  // Desde el 28/09/2026 el texto sale de `detallesAccesos` (probado abajo con
  // valores): la baldosa solo pinta lo que esa función devuelve.
  const tabs = leer('FichaTabs.tsx')
  assert.match(tabs, /detalle: d\?\.texto \?\? null/)
  assert.doesNotMatch(leer('page.tsx'), /length \?\? 0|\?\? 0\b/)
})

test('las pestañas no se prefetchean: cada una repite la llamada al puerto', () => {
  // `fichaAsegura` trae la ficha entera de una vez; prefetchear las siete serían
  // siete consultas a la cartera por pasar el ratón por encima.
  const accesos = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/Accesos.tsx'), 'utf8')
  assert.match(accesos, /<Link key=\{a\.id\} href=\{a\.href\} prefetch=\{false\}/)
})

test('la sección lleva el acento de Grupo ASegura por TOKENS, no por hex sueltos', () => {
  const layout = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/layout.tsx'), 'utf8')
  assert.match(layout, /className="correduria"/)
  const css = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/globals.css'), 'utf8')
  // #3364ee = oklch(0.555 0.215 265), el cobalto de app.grupoasegura.com.
  // Desde el 24/09/2026 el cobalto es el acento de TODO el panel: vive en :root y en el tema oscuro.
  assert.match(css, /:root\s*\{[^}]*--primary:\s*#3364ee/)
  assert.match(css, /\[data-theme="dark"\]\s*\{[^}]*--primary:\s*#497cfd/)
  for (const f of ['Cabecera.tsx', 'FichaTabs.tsx', 'TabPendiente.tsx', 'SegurosCliente.tsx']) {
    assert.doesNotMatch(leer(f), /#[0-9a-fA-F]{3,6}\b/, `${f}: solo tokens var(--…), sin hex`)
  }
})

test('los siniestros del cliente siguen alcanzables: se montan en la tarjeta «Seguros»', () => {
  // Al quitar la pestaña propia, el único sitio de la ficha donde abrir o seguir un siniestro es
  // la vista de seguros. Si alguien lo quita de ahí, solo se vería entrando póliza a póliza.
  const page = leer('page.tsx')
  const bloque = page.slice(page.indexOf("tab === 'resumen'"), page.indexOf('<FichaTabs'))
  assert.match(bloque, /<Siniestros\b/)
  assert.match(bloque, /<SegurosCliente\b/)
  assert.match(bloque, /<TabPolizas\b/)
})

test('«Todas las pólizas» se fundió en «Seguros»: sin acceso propio, ?tab=polizas aterriza en seguros', async () => {
  const { tabDeParametro, TABS_FICHA, detallesAccesos, textoSeguros } = await import('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/tabs.ts')
  assert.equal(tabDeParametro('polizas'), 'resumen')
  assert.equal(tabDeParametro(['polizas']), 'resumen')
  assert.ok(!(TABS_FICHA as readonly string[]).includes('polizas'), 'el grid vuelve a tener la entrada «polizas»')
  const tabs = leer('FichaTabs.tsx')
  assert.doesNotMatch(tabs, /Todas las pólizas/)
  assert.doesNotMatch(tabs, /\bpolizas:/)
  assert.match(tabs, /resumen: \{[^\n]*titulo: 'Seguros'/)
  // Ningún enlace interno al alias viejo.
  for (const f of ['SegurosCliente.tsx', 'TabPendiente.tsx', 'page.tsx']) assert.doesNotMatch(leer(f), /tab=polizas/, f)
  // El bloque redundante «Pólizas vivas» no vuelve (ya es «Con nosotros»).
  assert.doesNotMatch(leer('TabPolizas.tsx'), /titulo="Pólizas vivas"/)
  // Subtítulo único.
  assert.equal(textoSeguros(2, 1), '2 con nosotros · 1 oportunidad')
  assert.equal(textoSeguros(2, 3), '2 con nosotros · 3 oportunidades')
  assert.equal(textoSeguros(2, 0), '2 con nosotros')
  assert.equal(textoSeguros(2, null), '2 con nosotros')
  assert.equal(textoSeguros(0, 0), 'ninguno')
  assert.equal(textoSeguros(0, 2), 'ninguno con nosotros · 2 oportunidades')
  const d = detallesAccesos({ conNosotros: 1, oportunidadesAbiertas: 2, pendiente: { estado: 'nada' }, telefonos: 0, emails: 0, personas: 0, documentos: 0, documentosPedidos: 0, correos: 0, notas: 0, historial: 0 })
  assert.equal(d.resumen?.texto, '1 con nosotros · 2 oportunidades')
  assert.equal((d as Record<string, unknown>).polizas, undefined)
})

test('los accesos dicen algo: contactos cuenta teléfonos, correos y personas; null no es 0', async () => {
  const { detallesAccesos } = await import('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/tabs.ts')
  const base = {
    conNosotros: 1, oportunidadesAbiertas: 0, pendiente: { estado: 'nada' as const },
    telefonos: 2, emails: 1, personas: 3, documentos: 0, documentosPedidos: 0, correos: 0, notas: 2, historial: 5,
  }
  const d = detallesAccesos(base)
  assert.equal(d.contactos?.texto, '2 teléfonos · 1 correo · 3 personas')
  assert.equal(d.oportunidades?.texto, 'ninguna abierta')
  assert.equal(d.pendiente?.texto, 'al día')
  assert.equal(d.notas?.texto, '2 notas')
  assert.equal(d.historial?.texto, '5 anotaciones')
  // Lo que no se pudo leer NO se pinta como cero.
  const n = detallesAccesos({ ...base, telefonos: null, emails: null, personas: null, oportunidadesAbiertas: null, correos: null, notas: null, historial: null, documentos: null, documentosPedidos: null, pendiente: { estado: 'sin_comprobar' } })
  for (const k of ['contactos', 'oportunidades', 'correos', 'notas', 'historial', 'documentos', 'pendiente'] as const) {
    assert.equal(n[k], undefined, `${k} sin leer no puede pintarse`)
  }
  assert.equal(detallesAccesos({ ...base, telefonos: 0, emails: 0, personas: 0 }).contactos?.texto, 'sin teléfono ni correo')
  assert.equal(detallesAccesos({ ...base, pendiente: { estado: 'accion', urgente: true } }).pendiente?.tono, 'malo')
})

test('contarPersonas: pólizas + vínculos declarados, sin contar dos veces; null si falta una lista', async () => {
  const { contarPersonas } = await import('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/tabs.ts')
  // Antonio Lozano: nadie en su póliza y 3 vínculos (empresa, Manuel y uno sin nombre).
  assert.equal(contarPersonas([], Array.from({ length: 3 }, (_, i) => ({ relacionadoId: `r${i}` }))), 3)
  // Quien sale en una póliza Y tiene vínculo declarado es UNA persona.
  assert.equal(contarPersonas([{ fichaId: 'a' }, { fichaId: null }], [{ relacionadoId: 'a' }, { relacionadoId: 'b' }]), 3)
  assert.equal(contarPersonas(null, []), null)
  assert.equal(contarPersonas([], null), null)
})
