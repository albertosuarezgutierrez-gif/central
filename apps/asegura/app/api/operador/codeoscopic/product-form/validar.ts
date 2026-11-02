// Lista blanca del relé `POST /api/operador/codeoscopic/product-form` (02/11/2026). PURO, sin
// imports: lo prueba `test/regression-correduria-product-form.test.ts` con `node --test`.
//
// ─── Por qué ─────────────────────────────────────────────────────────────────
// El relé reenvía a `POST /product-form-requests` el `method`/`path`/`body` que manda el widget
// de Codeoscopic DESDE EL NAVEGADOR. Antes aceptaba GET/POST/PUT/DELETE/PATCH y cualquier `path`,
// fuera del interruptor: si el vendor resolviera por ahí un recurso que cotiza o compromete
// (`/insurances`, `/policy-applications`…), era un camino de gasto fuera del embudo y del libro.
//
// Lo que se deja pasar: GET y POST (el widget LEE catálogos y sub-formularios; la API documenta
// `{ method: 'GET', path: '/places/provinces' }` como ejemplo), una ruta relativa limpia y NUNCA
// las raíces que cotizan, emiten o dan credenciales. 🚧 Lo ideal es una lista EXACTA de rutas; no
// la hay porque nadie ha capturado aún las que pide el widget de cada compañía. Si una falla con
// 400 aquí, se ve en pantalla («ruta no permitida») y se añade a mano tras mirarla.

export const METODOS_PRODUCT_FORM = ['GET', 'POST'] as const
export type MetodoProductForm = (typeof METODOS_PRODUCT_FORM)[number]

/** Raíces del vendor que cotizan (0,50€), emiten, crean borradores o dan credenciales. */
const RAICES_PROHIBIDAS = [
  'insurances',
  'insurance-drafts',
  'policy-applications',
  'policies',
  'receipts',
  'product-form-requests',
  'app-auth-tokens',
  'oauth2',
  'token',
  'webhooks',
  'users',
]

export type ValidacionProductForm =
  | { ok: true; metodo: MetodoProductForm; path: string }
  | { ok: false; mensaje: string }

export function validarProductForm(entrada: { method: unknown; path: unknown }): ValidacionProductForm {
  const path = typeof entrada.path === 'string' ? entrada.path.trim() : ''
  if (path === '') return { ok: false, mensaje: 'falta `path` (string)' }
  const metodo = entrada.method === undefined || entrada.method === null ? 'GET'
    : typeof entrada.method === 'string' ? entrada.method.trim().toUpperCase() : ''
  if (!(METODOS_PRODUCT_FORM as readonly string[]).includes(metodo)) {
    return { ok: false, mensaje: `method «${String(entrada.method)}» no permitido (solo GET y POST)` }
  }
  // Ruta relativa al API del vendor: `/segmento/segmento…`, sin esquema, host, query, fragmento,
  // `..`, barras dobles ni caracteres codificados (que esconderían cualquiera de los anteriores).
  if (path.length > 300 || !/^(\/[A-Za-z0-9_\-.]+)+\/?$/.test(path) || path.split('/').some(s => s === '.' || s === '..')) {
    return { ok: false, mensaje: `ruta «${path.slice(0, 80)}» no permitida` }
  }
  const raiz = path.split('/')[1]!.toLowerCase()
  if (RAICES_PROHIBIDAS.includes(raiz)) {
    return { ok: false, mensaje: `ruta «/${raiz}» no permitida por el relé del formulario: cotiza, emite o da credenciales` }
  }
  return { ok: true, metodo: metodo as MetodoProductForm, path }
}
