# BRIEF — Joaquín Jaén (holding) · contexto para reunión + presentación

> Documento de traspaso para arrancar otra conversación y preparar la presentación.
> Fuentes: `docs/DISENO-modularizacion-verticales.md`, `docs/DISENO-modulos-materiales-flota.md`,
> `docs/CONTEXTO-SESIONES.md`. Diagramas en `docs/diagrams/joaquin-*.svg`.

---

## ⭐ ESTRUCTURA REAL DEL GRUPO (corrección Alberto — 12/06/2026, MANDA sobre lo de abajo)

> La sección "Quién es / Cómo caben sus 6 negocios" de más abajo era la **hipótesis a ciegas**
> (pre-reunión). Tras la reunión y la revisión de Alberto, la estructura real es ésta. **Esto es lo
> que vale; lo de abajo se conserva solo como registro de la hipótesis inicial.**

### Cómo está montado de verdad
- **Cocina central (la lleva la hermana)** — es la unidad de **producción**. **Produce para los eventos /
  catering** (y abastece a las haciendas). Es su sistema de ~3 años, la joya: *conectamos, no reemplazamos.*
- **Restaurantes — `Doble J` y `Las Dos Jotas`** — van **APARTE, independientes**. **Cada uno pide lo suyo
  por su cuenta** (sus propios proveedores/compras); no dependen de la cocina central.
- **Catering / eventos** — el negocio que mueve la cocina central; es donde encaja material, comercial y marketplace.
- **Haciendas de eventos — `El Alba` y `Trinidad`** — una **en propiedad** y otra **en alquiler**. Cada
  hacienda es su propia unidad operativa (montaje · pases · barra) con **su almacén** y sus eventos.
- **Tiendas de comida para llevar — NO las tienen (aún).** Es futuro, no negocio actual → **fuera de la
  propuesta/diagramas por ahora**.
- **Flota/transporte y alquiler de materiales** — NO confirmados como negocio propio actual; eran supuestos
  del brief a ciegas. Tratar como **verticales futuras**, no como realidad de JJ, hasta confirmar.

### Control de almacenes / economato (lo nombró la reunión — añadir)
- **Un almacén por hacienda** (El Alba + Trinidad) + el de la **cocina central** → control de stock
  **centralizado pero por ubicación**: saber qué hay en cada sitio cuando hay eventos simultáneos.
- **Recepción de mercancía**: hoy ia-rest tiene OCR de albarán; su cocina además tiene **economato con
  códigos + recepción por código de barras** (escaneo de entrada, no solo OCR). Hueco a cubrir/conectar.
- **Pedido automático al proveedor** cuando el stock baja del mínimo; **control de mermas** (comprado vs servido).
- **Reparto de géneros entre haciendas** cuando hay dos eventos a la vez.

### Control de cada hacienda (lo nombró la reunión — añadir)
- Cada hacienda como **negocio/unidad**: su **calendario de eventos**, su **almacén/stock**, su **montaje**,
  sus **pases de cocina (KDS)** y su **barra**.
- Reutilización: **`sivra`** (inmueble + calendario + portal de la hacienda) **+ `ialimp`** (limpieza
  turnaround entre eventos, con cierre por foto). *(Nota interna: esas marcas NO se nombran ante JJ.)*
- **Previsión por hacienda y por evento** (aforo, temporada, temperatura) para material y bebida.

### Lo demás que se nombró en la reunión (checklist para no olvidar nada)
- **Comercial + comisiones:** 4 comerciales; bonos por **margen / ticket más alto / reseñas**; contratos con
  **% escalable** (y rescisión si no se cumple); **ranking** en tiempo real; **martes = día de oficina/formación**; RBAC por comercial.
- **Material de eventos (dpto. más atrasado = piloto limpio):** menaje (mesas/sillas/vajilla/cristalería),
  **roturas post-boda con foto**, **previsión estacional** (consumo de bebida varía verano/invierno, día/noche).
- **Marketplace / presupuestador self-service (el "wow"):** el cliente configura su evento (adultos/niños/días)
  → menú con **margen ya incorporado** → **paga señal**; **multi-tarificador**, **bot de bodas**, **maridaje de vino por IA**.
- **ERP / facturación / contabilidad** consolidado (regalar la contabilidad como gancho; monetizar la capa de decisión).
- **Cocina (su sistema, 10 huecos vs ia-rest):** fichas técnicas/alérgenos, elaboraciones con procesos,
  escandallo dinámico, **etiqueta QR de lote/caducidad**, **partes de trabajo por partida (5 días antes)**,
  **cronometraje/productividad**, **báscula integrada**, **código de barras/economato**, **trazabilidad de lote (APPCC)**, aprovechamiento de sobras. → ver `PLAN-mejoras-joaquin.md`.
- **KDS por pases** para eventos grandes (la cocina trabaja por tandas, no comanda a comanda).
- **Restaurantes (POS, ya en producción, ampliar):** QR comanda (hecho), **fichaje por QR**, **pago por QR**, maridaje de vino.
- **Checklist operativo de sala + productividad de cocina** (ideas de Alberto, ya construidas = Bloques H/I).
- **Fontanería/obra del cuñado:** cuadro de mando con fotos, evolución de obra, avisos WhatsApp, localización
  → cross-sell con el agente de **concursos** (licitaciones públicas, ya terminado).
- **Objeción nº1 = factor humano** (re-educar a la gente). La hermana es protectora con su cocina ("es lo mío")
  → tratarla como **socia técnica / co-diseñadora**, no como prospecto.

### Datos que aún faltan (pedir en el follow-up)
- Nº de **sociedades/CIFs** y qué cuelga de cada una; volumen de operaciones **intercompany** (cocina↔eventos).
- **Stack exacto** del sistema de cocina de la hermana (¿API/exportación? → conectar vs co-diseñar).
- **Tamaño del catálogo de material** y **nº de eventos/mes** (dimensionar el piloto de logística).
- **Estructura de comisiones/bonos** de los comerciales.

---

## Quién es  *(hipótesis a ciegas — pre-reunión; superada por la sección de arriba)*
Joaquín Jaén, dueño de un **holding** con varios negocios de sectores distintos:
1. **Restaurante**
2. **Catering / eventos**
3. **Haciendas de eventos** (en propiedad y en alquiler)
4. **Alquiler de materiales** para eventos
5. **Transporte / flota de camiones**
6. **Tiendas de comida para llevar** (nuevas; se alimentan de una **cocina central**)

## Por qué encaja con la casa de marcas (`central`)
Ya hay 3 verticales en producción —**ia-rest** (hostelería/TPV + eventos), **ialimp** (limpiezas),
**sivra** (pisos/venues)— y una **`plataforma`** que consolida el financiero de todas con jerarquía
**Cuenta → Sociedad (CIF) → Negocio**. Sus negocios se cubren reutilizando lo existente + 2 verticales
nuevas compuestas de módulos.

## Cómo caben sus 6 negocios
| Negocio | Cómo se cubre |
|---|---|
| Restaurante | **ia-rest** (ya funciona) |
| Tiendas para llevar | **ia-rest** (modo Tienda), alimentadas por la cocina central |
| Catering / eventos | **ia-rest eventos** (CRM, presupuestos, menaje, proveedores, portal) |
| Haciendas | **sivra** (inmueble + calendario + portal) **+ ialimp** (limpieza turnaround) |
| Alquiler de materiales | **vertical nueva** componiendo módulos (base real: `inventario_menaje`) |
| Transporte | **vertical nueva** (base real: `vehiculos_grupo` + `evento_transporte`) |

## La idea técnica (lo diferencial)
- Sacar las capacidades horizontales de ia-rest a **`packages/module-*`** (CRM, inventario, agenda,
  presupuestos, proveedores, portales, feedback, ocr, asn) con patrón **conector/adaptador**.
- Agregado genérico **`Encargo`** (`parent_id + parent_type`) que une los módulos: un *evento*, un
  *porte*, un *alquiler* o una *cita de clínica* son el mismo patrón con otra piel. → `joaquin-encargo.svg`
- **Gancho holding = intercompany:** cocina central → tiendas, flota → catering, materiales → eventos
  se facturan **entre sus propias sociedades** y se **consolidan eliminando** esos importes (no inflar
  el agregado del grupo). Muy diferencial frente a un ERP genérico. → `joaquin-holding-intercompany.svg`

## Estado real HOY (hecho vs. diseñado)
- ✅ **HECHO:** 3 verticales en producción; `plataforma` consolida el financiero de las 3 (ia-rest incl.).
  **BD unificada**: las 3 apps en una sola Supabase (`wswbehlcuxqxyinousql`); ia-rest en schema `iarest`.
  `module-*` ya reales: crm, inventario, agenda, presupuestos, proveedores, portales, feedback, ocr, asn,
  **contabilidad** y **concursos** (agente de licitaciones públicas).
- 📐 **DISEÑADO (no construido):** verticales **alquiler de materiales** y **flota/transporte**, y el modelo
  **intercompany** con eliminación en el consolidado.
- 🧱 **Cimientos reales reutilizables** (en BD, schema `iarest`): `inventario_menaje(_evento)` (catálogo/uso
  de material), `vehiculos_grupo` (flota, escopada por `cuenta_id`), `evento_transporte` (portes con
  origen/destino y coste estimado/real).

## Reutilización sin construir nada
ialimp da la **limpieza turnaround** de las haciendas; sivra da la base de **venues** (inmueble + calendario
+ portal).

## Modelo comercial
Venta **por módulos activables** por negocio (pricing por módulo/negocio). Proponer a Joaquín como
**design partner / caso de referencia** del modelo holding a cambio de condiciones de lanzamiento.

## Preguntas para cerrar con él
- Nº real de **sociedades/CIFs** y qué negocio cuelga de cada una.
- Qué **software usa hoy** cada negocio (coste/realidad de migrar).
- Si entran **comerciales/empleados** (→ roles/RBAC por negocio).
- **Dolor nº1** y por dónde arrancar el **piloto**.
- Volumen de **operaciones intercompany** (cocina→tiendas, flota→catering, materiales→eventos).

## Propuesta de piloto
Cocina central → tiendas con **ia-rest** (ya funciona) + **CRM de eventos** como 2º módulo; después
**alquiler de materiales** reutilizando `inventario_menaje`.

---

## Guion de presentación (~8 slides)
1. **Portada** — "Una plataforma para todo tu holding, no seis programas sueltos."
2. **El problema** — 6 negocios, sectores distintos, datos en silos; un ERP genérico no entiende tu
   operación ni lo intercompany.
3. **La idea** — capacidades compartidas que se enchufan a cada negocio. Un mismo CRM para eventos,
   transporte y materiales. *(diagrama `joaquin-encargo.svg`)*
4. **Tus 6 negocios, cubiertos** — la tabla "cómo se cubre cada uno". *Materiales y transporte NO se
   construyen de cero, se componen de módulos que ya existen.*
5. **El gancho holding: intercompany** — cocina→tiendas, flota→catering, materiales→eventos, facturado
   entre sociedades y **consolidado en un solo cuadro de mando**. *(diagrama `joaquin-holding-intercompany.svg`)*
6. **Ya funciona** — demo de `plataforma` consolidando el financiero real de ia-rest + ialimp + sivra;
   mencionar módulos reales (incl. agente de concursos públicos).
7. **El piloto** — cocina central → tiendas (hoy) + CRM de eventos; luego alquiler de materiales. Bajo
   riesgo, valor rápido.
8. **Cierre** — Joaquín como design partner; pedir datos (sociedades, dolor nº1, volumen intercompany) y
   fijar fecha del piloto.

---

## ⭐ POST-REUNIÓN (11/06/2026) — inteligencia real y plan revisado

> Reunión con Joaquín Jaén (dueño) + sus hermanos. Asistentes clave:
> - **Ella = responsable de TODAS las cocinas** (perfil técnico fuerte, ya ha construido sistema propio).
> - **Él = responsable de restaurante + comercial/ventas** (el comprador entusiasta: "vamos a probar").
> - Alberto pitcheando; Joaquín y otro hermano de oyentes/decisores.

### Lo que CAMBIA respecto al brief a ciegas
1. **La cocina NO es campo virgen — es la joya, ya construida.** La responsable de cocina lleva **~3 años**
   montando un sistema de producción/seguridad alimentaria/escandallo muy serio: `proveedores → artículos
   con ficha técnica + alérgenos → ingredientes → elaboraciones con procesos (enfriamiento) → etiquetas QR
   con trazabilidad/caducidad (sanidad/APPCC) → escandallo dinámico (recosteo semanal al cambiar precios) →
   partes de trabajo por partida generados 5 días antes → báscula integrada → cronometraje de elaboraciones
   (productividad) → economato con códigos → merma`. **Es más profundo que la cocina de ia-rest.**
   → No le vendemos una cocina: **conectamos a la suya** (costes→contabilidad/plataforma, material→eventos) o
   absorbemos su modelo en `module-cocina/inventario` **con ella como co-diseñadora**. Es protectora con su
   departamento ("es lo mío") y su objeción nº1 es el **factor humano** (re-educar a la gente, adopción).
   **Tratarla como socia técnica, no como prospecto.** Es a la vez el mayor activo y el mayor riesgo de adopción.

2. **La apertura real a corto = COMERCIAL + LOGÍSTICA (el hermano).** Es el que quiere probar ya. Sus
   necesidades encajan con módulos que ya tenemos o están diseñados:
   - **CRM comercial + incentivos/ranking de comerciales** (4 comerciales; bonos por margen, ticket más caro,
     más reseñas; contratos con % escalable y rescisión automática; martes = día de oficina/formación).
     → `module-crm` + capa **comisiones/incentivos** (net-new, componible) + RBAC por comercial.
   - **ERP comercial / facturación / contabilidad** consolidado → `plataforma` + `module-contabilidad` + `core-fiscal`.
   - **Logística / material de eventos = el departamento más atrasado** (menos defendido políticamente →
     **el piloto más limpio**): inventario de menaje (mesas/platos/copas), **previsión de material por evento**,
     **inventario post-boda con roturas**, **consumo estacional** (temperatura, día/noche, temporada).
     → Coincide casi literal con `docs/DISENO-modulos-materiales-flota.md` (`inventario_menaje` + `asignacion_activo`
     + `parte_danos`). El ángulo **estacional/meteo** (previsión de bebida por temperatura) es enriquecimiento nuevo.

3. **Producto estrella que quieren: marketplace de catering + presupuestador self-service.** Cliente final
   configura su evento (50 adultos/15 niños/2 días) → opciones de menú con **margen ya incorporado** → elige →
   paga (Stripe/banco). Más: **multi-tarificador de eventos** (estilo comparador de seguros de Alberto), **bot/agente
   de bodas** (cualifica primera visita), **maridaje de vino por IA** (sugiere vino para el plato + rango de precio).
   → La pieza "wow" de la demo.

4. **Verticales adyacentes confirmadas:** haciendas (`sivra`) + limpieza con **cierre obligatorio por foto** (`ialimp`)
   + **fontanería/obra** del cuñado (cuadro de mando con fotos, evolución de obra, avisos WhatsApp, localización en obra)
   → cruza con `module-concursos` (licitaciones públicas, ya terminado) como cross-sell ya teed-up.

5. **Tesis de modelo de negocio (Alberto):** regalar el ERP/contabilidad como gancho (igual que a los propietarios
   de pisos turísticos) y monetizar la **capa transaccional/decisión** (pricing, seguros, take del marketplace,
   módulos activables). Framing design-partner con Joaquín se mantiene.

### Plan revisado (vs. el del brief)
- **Piloto recomendado = Logística / Material de eventos.** Bajo riesgo político (es el dpto. más atrasado y menos
  defendido), máxima madurez de diseño (ya hecho) y valida intercompany después. **NO** arrancar por cocina (joya
  ya construida + responsable protectora).
- **Demo para ganar la sala = marketplace/presupuestador de catering** (cliente configura evento → menú con margen →
  paga). Es lo diferencial y visual.
- **Posición explícita sobre cocina:** "conectamos con lo que [ella] ya ha construido, no lo reemplazamos."
- **Siguiente acción acordada:** presentación/demo + piloto en un departamento. Contacto por WhatsApp de Alberto;
  ellos mandan un resumen.

### Datos que aún faltan (preguntar en el follow-up)
- Nº de sociedades/CIFs y qué negocio cuelga de cada una; volumen real de operaciones intercompany.
- Stack actual exacto del sistema de cocina de ella (para decidir integrar vs. absorber) y su disposición a co-diseñar.
- Tamaño del catálogo de material (mesas/menaje) y nº de eventos/mes (dimensionar el piloto de logística).
- Estructura de comisiones/bonos de los comerciales (para la capa de incentivos del CRM).
