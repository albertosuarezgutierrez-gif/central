# Avant2: checklist de configuración (04/11/2026)

Fuente: OpenAPI del portal INT (`docs/avant2/`). Detalle y matices en `docs/CODEOSCOPIC-API-PORTAL.md`.
**Regla de oro:** la API de Avant2 LEE la configuración pero no la ESCRIBE. Todo lo de abajo "se fija en el panel"
(`app.avant2.es`, lo hace Alberto) salvo lo marcado "por petición".

## Qué se puede y qué no (por API)
| Cosa | Leer | Fijar |
|---|---|---|
| Ramos activos y si tarifican/emiten (`GET /insurance-lines?onlyActive=true`) | Sí, gratis | No: pedir activación a `apisupport@codeoscopic.com` |
| Productos y `configs` (id, name, favorite) por ramo (`GET /insurance-lines/{id}/products`) | Sí, gratis | No (panel) |
| Vendors / compañías DGS (`GET /insurance-vendors`, `/insurance-companies`) | Sí, gratis | No |
| Opciones por defecto de un producto | Solo vía formulario incrustado (`QUOTATION`) o leyendo `formattedOptions` de una oferta | **Por petición**: `products[].config.id` + `options` en `POST /insurances` / `…/offers` |
| Preemisión (opciones finales previas a emitir) | Formulario `PREISSUANCE` / `GET …/offers/{id}` | Por petición (`POST …/offers`, re-tarificar) |
| Descuentos, bonificaciones | Solo dentro del formulario (`POST /product-form-requests`) | Panel; en petición, como opción |
| Comisión de la correduría (`brokerFee` default/min/max) | Sí (en la `config`) | Por cotización: `PATCH …/quotes/{id}` |
| Comisión de compañía, webhooks | No existen en la API | Panel / alta por Codeoscopic |
| Capitales recomendados de hogar | `POST /home/recommend-limits` (puede facturar) | — |

## Lo que podemos automatizar nosotros
- Leer ramos y compañías GRATIS: `GET /insurance-lines`, `/insurance-vendors`, `/insurance-lines/{id}/products`
  (en central: `/api/operador/codeoscopic/lineas` y `/companias`; plataforma `/correduria/hogar` ya pinta hogar).
- Auditar la config de cada compañía comparando `configs[].favorite` y `name` con lo que Alberto espera.
- Pisar opciones por petición con la `config.id` correcta, y mostrar `formattedOptions` de la oferta.
- NO automatizable: fijar defaults, descuentos, preemisión o comisiones de compañía; ni webhooks.
- 🚨 Facturan (no usar para "probar"): `POST /insurances` (0,50 €), re-tarificar, `GET /vehicles`, `recommend-limits`.

## Checklist del panel, compañía por compañía
Repetir por CADA producto de CADA ramo (auto, moto, hogar, vida temporal, salud, decesos; empezar por auto y hogar):
1. [ ] Producto **activo** y `config` (conexión con la compañía) válida: credenciales de agente/código de mediador correctos.
2. [ ] **Config favorita** marcada (la que se usa por defecto al cotizar; sale como `favorite: true`).
3. [ ] **Opciones por defecto** (franquicias, capitales, garantías opcionales): revisadas con la vista "opciones por defecto".
4. [ ] **Preemisión**: las opciones obligatorias para emitir tienen valor final (si no, la API pedirá re-tarificar).
5. [ ] **Descuentos / bonificaciones** de la compañía: activados y con los porcentajes pactados.
6. [ ] **Comisión de la correduría** (`brokerFee`): importe por defecto, mínimo y máximo coherentes.
7. [ ] Forma y frecuencia de pago admitidas (`/payment-methods`, `/payment-frequencies`).
8. [ ] Hogar: la compañía devuelve capitales en `recommend-limits` (indicio de que está conectada).
9. [ ] Usuario/organización: el `X-User-Email` que usamos ve el producto (los productos dependen de la organización).
10. [ ] Anotar aquí qué compañías quedan sin configurar y pedir a Codeoscopic las que no aparezcan.

## Pendiente de Alberto
- Dar acceso/capturas del panel de configuración (no está en la doc pública) para completar los nombres exactos de campos.
- Confirmar con soporte si existe export de la config de productos (la API pública no lo ofrece).
