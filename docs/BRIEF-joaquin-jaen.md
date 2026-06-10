# BRIEF — Joaquín Jaén (holding) · contexto para reunión + presentación

> Documento de traspaso para arrancar otra conversación y preparar la presentación.
> Fuentes: `docs/DISENO-modularizacion-verticales.md`, `docs/DISENO-modulos-materiales-flota.md`,
> `docs/CONTEXTO-SESIONES.md`. Diagramas en `docs/diagrams/joaquin-*.svg`.

## Quién es
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
