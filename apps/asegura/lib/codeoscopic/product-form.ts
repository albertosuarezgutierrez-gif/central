// Relay hacia `POST /product-form-requests` — el recurso GENÉRICO que la
// Product Form Library (widget JS de Codeoscopic) usa para sus propias
// sub-peticiones (catálogos de provincias, tipos de documento, sub-formularios
// de una compañía…). Existe porque el iframe del widget NO puede guardar el
// `access_token` OAuth2 (RFC 6749 §4.4: un cliente de navegador no es
// confidencial) — su `dataCallback` reenvía la petición a NUESTRO backend, y
// este es el único sitio donde se hace la llamada real, con las credenciales
// de servidor que ya usa todo lo demás.
//
// 🚨 Reemplaza al catálogo ESTÁTICO de `opciones-producto.ts` (hoy solo
// Allianz auto, adivinado a mano tras 3 errores 500 reales): en vez de
// suponer qué campos pide cada compañía/ramo, el corredor rellena el
// formulario REAL de la compañía (el que Codeoscopic ya mantiene al día) y el
// resultado (`getProductOptions()`) es el `product.options` de verdad — sin
// inventar ni un nombre de campo.
//
// Body y ejemplo, tal cual los documenta `overview.md` del portal (bloqueado
// desde este contenedor, capturado vía Claude en Chrome el 17/09/2026):
//   { method?: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH' (default GET), path: string,
//     params?: unknown[], body?: object }
//   ejemplo: { method: 'GET', path: '/places/provinces' }
//
// Se reenvía TAL CUAL — sin interpretar `path`/`params`/`body` en este lado:
// es Codeoscopic quien decide, dentro de SU endpoint, qué sub-petición hace.
// Esto es DISTINTO de `peticion()` contra `/insurances*` (eso sí cotiza/
// compromete un contrato): `/product-form-requests` es una operación propia,
// no documentada como facturable (`docs/CODEOSCOPIC-API-PORTAL.md` solo marca
// `POST /insurances` como facturable), así que corre en la vía GRATIS
// (`resolverConfig({ignorarInterruptor:true})`), igual que `/insurance-lines`.

import { peticion } from './cliente'
import type { ConfigCodeoscopic } from './config'

export type ProductFormRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  params?: unknown[]
  body?: Record<string, unknown>
}

/** `POST /product-form-requests`. Relay puro: entra el cuerpo del widget, sale
 *  la respuesta de Codeoscopic tal cual — sin reshaping. */
export async function reenviarProductForm(
  config: ConfigCodeoscopic,
  cuerpo: ProductFormRequest,
): Promise<unknown> {
  return peticion(config, {
    metodo: 'POST',
    path: '/product-form-requests',
    cuerpo,
    timeoutMs: config.timeoutGenericoMs,
  })
}
