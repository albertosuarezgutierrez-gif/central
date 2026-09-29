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

## Campos de descuento por compañía (lo que han devuelto las compañías en nuestras 311 tarificaciones)

| Compañía | Producto | Campo | Id interno | Máximo |
|---|---|---|---|---|
| Allianz | Autos | Descuento comercial % (CAP) / (venta cruzada) | `dtoCap` / `dtoVentaCruzada` | ❓ (el vendor admite 0-99 / 0-100) |
| Allianz | Motos | idem | ❓ (probablemente iguales) | ❓ |
| Allianz | Hogar | idem | ❓ | ❓ |
| Generali | Motos | Descuento comercial % | ❓ | ❓ |
| Occident | Autos y Motos | Descuento comercial | ❓ | ❓ (se mandó 30) |
| Mapfre | Autos y Motos | no ha salido ninguno | — | ❓ |
| Reale | Autos | no ha salido ninguno; Motos no devuelve opciones | — | ❓ |

Que no haya salido un campo no prueba que no exista: hay que abrir el formulario de cada compañía.

## Para comprobar en la pantalla de Avant2 (gratis)

1. [ ] **Máximo de descuento por compañía y ramo:** en el formulario de cada compañía del multitarificador,
   escribir 50 en cada campo de descuento y apuntar a cuánto lo baja (Allianz, Generali, Occident,
   Mapfre, Reale y cualquier otra que tenga el campo; en auto, moto y hogar).
2. [ ] **Mapfre y Reale:** ¿tienen algún campo de descuento o bonificación en su formulario?
3. [ ] **Divina Pastora:** su código DGS en el desplegable de «Compañía anterior».
4. [ ] **«Experiencia: 1»** del PDF: qué texto es en la web (nosotros mandamos `ThisMotorcycle`).
5. [ ] **Facturación:** si la web tiene sección de consumo o facturas, comprobar si cada re-tarificación
   (confirmar precio) cuenta como una consulta de 0,50€ o solo cuenta la tarificación.
6. [ ] **¿La API ve los presupuestos hechos en la web?** Sin comprobar. `GET /insurances?id=40956228`
   (el presupuesto de Manuel hecho en la web) es gratis, pero no hay botón para lanzarlo: «Traer póliza
   de Codeoscopic» de `Documentos.tsx` solo sirve para una póliza ya emitida, y el contenedor de las
   sesiones no tiene credenciales. Hace falta un endpoint de solo lectura o lanzarlo desde Vercel.
7. [ ] **Tipo de comisión** (`comissionType`, en Allianz «A»): qué opciones da la web y si afecta a la prima.

## Para preguntar a Codeoscopic (borradores sin enviar, los manda Alberto)

- ¿El ReRate y el Submit se facturan? → `docs/BORRADOR-CODEOSCOPIC-COSTE-RERATE-SUBMIT.md`.
- ¿Vale el historial de un coche para asegurar una moto? ¿Hay algún código estructurado de «bonus
  verificado» o solo texto en `messages[]`? (soporteapi@codeoscopic.com)

## Pendiente en código

- Aplicar la tabla de máximos de descuento por compañía en el ReRate (hoy solo Allianz auto, 25/25).
- Aviso «bonificación NO verificada» a partir de `messages[]` (p. ej. Mapfre: «el cliente identificado
  no aparece asociado a una póliza de otra compañía»).
