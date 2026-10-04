# Codeoscopic / Avant2 — qué está confirmado y qué falta comprobar

> Checklist vivo de la conexión con las compañías (29/09/2026, caso Manuel Piña 2121NST).
> Cada punto se marca con la fuente que lo cierra (pantalla de Avant2, respuesta de soporte, llamada real).
> El detalle técnico de la API está en `CODEOSCOPIC-API-REFERENCIA-2026-09.md` y `CODEOSCOPIC-API-PORTAL.md`.

## Confirmado (29/09/2026)

- **Estimado ≠ confirmado.** `POST /insurances` devuelve precios con `MainQuote_V1.estimate: true` y la
  acción `ReRate` requerida. El precio confirmado sale de `POST /insurances/{id}/offers` (ReRate): es
  síncrono y crea una oferta en el mismo proyecto, no un proyecto nuevo. Lo tenemos en
  `apps/asegura/app/api/operador/codeoscopic/oferta/route.ts` (la reconfirmación de la ficha).
- **Los descuentos comerciales van en el ReRate, no al tarificar.** Por eso la comparativa sale más cara
  que la web de Avant2. En la web, con 20% CAP + 20% venta cruzada y Divina Pastora bien puesta, Allianz
  Motos Básico dio 106,77€ confirmado, frente a 216,53€ estimado por nuestra API.
- **El seguro anterior NO se puede corregir por PATCH** (`MotorcycleRiskPatch_V1` no incluye
  `previousInsurance`): o va bien en la primera tarificación, o hay que tarificar de nuevo (0,50€).
- **`previousInsurance.registrationPlate`** es la matrícula del vehículo de la póliza anterior (campo
  «Matrícula de esa póliza», PR #3992).
- **Compañía anterior:** hay que elegirla del catálogo de mercado de Avant2, no de nuestras 14. Divina
  Pastora no estaba en nuestra lista de moto (PR #3992).

## Comparación real web ↔ API (29/09/2026, proyectos 40956228 web y 40953692 API)

Mismos datos en los dos proyectos (moto, 5.000 km, `ThisMotorcycle`, matrícula 2121NST también en
`previousInsurance`). **Solo cambia la compañía anterior:** web `C0247` «DIVINA PASTORA / CLEVEREA»
póliza 05139; API `C0109` Allianz póliza 8846622.

| Compañía | Web (C0247) | API (C0109) |
|---|---|---|
| Allianz Básico | **106,77€, `estimate: false`** (real 115,98€) | 215,88€, `estimate: true` (real 234,51€) |
| Occident Terceros | 217,57€ | 217,57€ |
| Reale Básico | 243,78€ | 243,78€ |
| Mapfre Básico | 344,52€ + «no aparece asociado» | 344,52€ + «no aparece asociado» |
| Generali Terceros | 510,15€ | 510,15€ |

- **La API ve los proyectos hechos en la web** (misma organización 24683): `GET /insurances/{id}`
  devuelve el 40956228, y `GET /insurances?holderIdentification=` lista juntos los de la web y los
  de plataforma. **Desde el 29/09/2026 da igual dónde se tarifique:** la ficha del cliente
  (Oportunidades → «Presupuestos en Avant2») los lista y trae los de la web como tarificación con su
  oportunidad (`/api/operador/codeoscopic/proyectos-cliente`; libro de consumo a coste 0, motivo
  `importada_web`, fuera del tope). Para emitir sobre una póliza existente sigue `/importar`.
- **Solo Allianz verifica el seguro anterior al tarificar:** con la compañía y póliza reales confirma
  el precio y lo baja a la mitad. Con Allianz como compañía anterior y una póliza que Allianz no tiene,
  no confirma. Las otras cuatro no cambian el precio.
- **Mapfre no encuentra el historial ni con la compañía correcta.** Hipótesis sin comprobar: le hace
  falta la póliza completa, no los 5 últimos dígitos.
- **La matrícula del seguro anterior NO fue la causa:** la web también manda la actual.
- No se sabe cuánto del 106,77€ es la bonificación y cuánto el 20% + 20% de descuento comercial: el
  proyecto no guarda las opciones de producto.

## Campos de descuento por compañía (lo que han devuelto las compañías en nuestras 311 tarificaciones)

| Compañía | Ramo | Campos disponibles | Id interno | Máximo |
|---|---|---|---|---|
| Allianz | Autos | Descuento comercial % (CAP) / (venta cruzada) + Tipo de comisión (A) | `dtoCap` / `dtoVentaCruzada` | Vendor permite 0-99 / 0-100; recorta a su tope (≤20%) |
| Allianz | Motos | Descuento comercial % (CAP) / (venta cruzada) + Tipo de comisión (A) | `dtoCap` / `dtoVentaCruzada` (03/10) | ✅ Se manda 50; tope real desconocido (web 50 devuelve igual precio) |
| Allianz | Hogar | Descuento comercial % (CAP) / (venta cruzada) | `dtoCap` / `dtoVentaCruzada` (03/10) | ✅ Se manda 50; antes 0/0 |
| Generali | Motos | Descuento comercial % | `commercialDiscountNumber` (03/10) | ✅ Se manda 50; la compañía recorta sola (~12 %), sin error |
| Generali | Hogar | Descuento comercial % + Código Flota | `commercialDiscountNumber` (03/10) | ✅ Se manda 50 (Código Flota no se toca) |
| Occident | Autos | Descuento comercial + Colectivo | no consta | 30 por defecto (estimado, sin confirmar) |
| Occident | Motos | Descuento comercial + Colectivo | `commercialDiscount` (03/10) | NO se manda: trae 30 de serie, máximo sin medir |
| Occident | Hogar | Descuento comercial + Colectivo | `discount` (03/10) | NO se manda: trae 30 de serie, máximo sin medir |
| Fidelidade | Hogar | Descuento (vacío) | `discount` (03/10) | NO se manda: máximo sin medir |
| Mapfre | Autos | sin campo de descuento | — | no disponible |
| Mapfre | Motos | sin campo de descuento | — | no disponible |
| Reale | Autos | sin descuento manual; solo Campaña comercial (no disponibles) | — | no disponible |
| Reale | Motos | sin descuento manual; solo Campaña comercial (no disponibles) | — | no disponible |
| Reale | Hogar | sin descuento manual; Campaña comercial + Producto comercial (REALE HOGAR) | — | no disponible |

Que no haya salido un campo no prueba que no exista: hay que abrir el formulario de cada compañía.

### Decisiones de Alberto (03/10/2026)

- El descuento por defecto se queda en **50** (se valoró 30 y se descartó, PR #4166 cerrado sin mergear). La compañía recorta sola a su máximo; es lo mismo que se decidió el 29/09.
- `comissionType` NO se toca: afecta a la comisión con la compañía.
- Aplicar en los dos campos de Allianz (CAP + venta cruzada).

### Pendiente

- Sacar los ids internos de los campos de descuento de Allianz moto/hogar, Generali moto/hogar, Occident y Fidelidade. Las opciones con id NO se guardan en BD (`respuesta.ts:198` las deja en memoria como `productOptions`; `tarificacion_precios.opciones` solo guarda etiqueta/valor).
- Vías: un prompt de Claude en Chrome que lea el `id`/`name` de los inputs del iframe `product-form.avant.codeoscopic.io`, o el GET gratuito `/api/operador/codeoscopic/proyecto?projectId=` (necesita `ASEGURA_OPERADOR_SECRET`).
- Con los ids, ampliar `opcionesPorDefecto()` (`apps/asegura/lib/codeoscopic/opciones-producto.ts`, hoy solo Allianz auto) para mandar 50 en moto y hogar.
- Marcar como resueltos los puntos 1 y 2 de «Para comprobar en la pantalla de Avant2»: el 1 en parte (los máximos reales siguen sin medirse) y el 2 del todo (Mapfre y Reale sin descuento).

**Prueba de Alberto en la web (29/09/2026, proyecto 40961885, misma moto que el 40956228):** solo tres
compañías dejan meter descuento en moto: Allianz (CAP + venta cruzada), Generali y Catalana Occidente
(Mapfre y Reale no tienen el campo). Metió 50 en todos y todas devolvieron precio. Comparado con el 40956228:

| Compañía | 40956228 | 40961885 (50 en todo) | Lectura |
|---|---|---|---|
| Allianz Básico | 106,77€ confirmado (20 % + 20 %) | 106,77€ confirmado | 50 = 20: la compañía NO da más; recorta a su tope (≤ 20 %) |
| Generali Terceros | 510,15€ (sin descuento) | 449,08€ | aplica ~12 %, no el 50 |
| Occident Terceros básico | 217,57€ | 217,57€ | sin cambio: estimado, no reconfirmado (sin «precio confirmado») |

Conclusión [Probable]: poner 50 no rompe nada, cada compañía se queda con lo suyo. Falta saber el tope
exacto de Allianz (prueba con 10 % para ver si baja el precio) y confirmar el precio de Occident.

## Para comprobar en la pantalla de Avant2 (gratis)

1. [ ] **Máximo de descuento por compañía y ramo:** en el formulario de cada compañía del multitarificador,
   escribir 50 en cada campo de descuento y apuntar a cuánto lo baja (Allianz, Generali, Occident,
   Mapfre, Reale y cualquier otra que tenga el campo; en auto, moto y hogar).
2. [ ] **Mapfre y Reale:** ¿tienen algún campo de descuento o bonificación en su formulario?
3. [x] **Divina Pastora:** `C0247` («DIVINA PASTORA / CLEVEREA»).
4. [x] **«Experiencia: 1»** = `ThisMotorcycle` («Esta Motocicleta»), lo mismo que mandamos.
5. [ ] **Facturación:** si la web tiene sección de consumo o facturas, comprobar si cada re-tarificación
   (confirmar precio) cuenta como una consulta de 0,50€ o solo cuenta la tarificación.
   Resuelto por inferencia del correo de Codeoscopic 02/10/2026 (se factura 0,50 € por cada `POST /insurances` con
   HTTP 200; ReRate y Submit no aparecen como facturables); confirmación explícita no pedida.
6. [x] **¿La API ve los presupuestos hechos en la web?** Sí (ver la comparación de arriba).
7. [ ] **Tipo de comisión** (`comissionType`, en Allianz «A»): qué opciones da la web y si afecta a la prima.

## Para preguntar a Codeoscopic (borradores sin enviar, los manda Alberto)

- ¿El ReRate y el Submit se facturan? → **Resuelto por inferencia (no aparecen como facturables); confirmación explícita no pedida.**
- ¿Vale el historial de un coche para asegurar una moto? ¿Hay algún código estructurado de «bonus verificado» o solo texto en `messages[]`?
- ✅ **GET /insurances, resuelto con la especificación OpenAPI del portal (03/10/2026):**
  - `fromDate`/`toDate` (yyyy-MM-dd, obligatorias sin id/externalId, rango ≤1 año) filtran por fecha de CREACIÓN del proyecto, salvo con `policyApplicationSubmitted=true`, que filtra por fecha de la solicitud de emisión (es lo que usa el cron).
  - No hay filtro por fecha de modificación.
  - `pageNumber` (por defecto 1) y `pageSize` (por defecto 10, ≤100); `X-Total-Count` solo en la página 1.
  - Ordenación: no consta.
  - Sin `X-User-Email`, alcance de toda la correduría.

## Pendiente en código

- Descuento por defecto en el ReRate = **50 %**. ✅ Ya lo llevan Allianz auto/moto/hogar y Generali moto/hogar (ids leídos el 03/10/2026). Pendiente: Occident y Fidelidade (máximos sin medir). `comissionType` no se manda nunca.
- Aviso «bonificación NO verificada» a partir de `messages[]`.
- ✅ **Descubrimiento autónomo:** cron `correduria-descubrir-emisiones` implementado (plataforma, `10,40 5-21 * * *` UTC); cola de revisión `seguros.codeoscopic_emisiones_revision` activa; rotación en anillo 40 llamadas/pasada. Acuñado atómico vía `registrarPolizaEmitida` (PR #4158, mergeado). URL del webhook cambiada a `api.grupoasegura.es` (PENDIENTE que Codeoscopic actualice de su lado).
