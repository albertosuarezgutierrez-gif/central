# 🗄️ Diseño — Fusión física de bases de datos (ia-rest → BD compartida)

> **Estado: DISEÑO, no ejecutado.** Documento para decidir con datos reales antes de
> tocar producción. Pedido por Alberto (10/06/2026) tras plantear "unir todas las BD".
> Regla de oro del proyecto (`PLAN-plataforma-modular.md`): **esquema antes que código;
> nunca romper producción.**

## 1. Contexto y objetivo

Objetivo de negocio: un **panel de operador (god-panel)** donde Alberto vea y gestione
**todos los clientes de todas las verticales** (bloquear/liberar, crear, vista 360, módulos
por cliente). La pregunta de diseño: ¿hace falta **fusionar físicamente** las dos Postgres
para lograrlo? Este documento responde con el inventario real de ambas bases.

## 2. Inventario real (vía Supabase MCP, 10/06/2026)

| Proyecto | Ref | Apps | Tablas (public) | Edge Functions | Notas |
|---|---|---|---|---|---|
| **Compartida** | `wswbehlcuxqxyinousql` ("Ingresos Y gastos Smoobu") | ialimp + sivra + plataforma | ~115 | — (lógica en Vercel) | PG 17, eu-west-1 |
| **ia-rest** | `efncqyvhniaxsirhdxaa` | ia-rest (hostelería/catering/eventos) | **~200** | **39** | PG 17, eu-west-1, misma org |

Datos relevantes de ia-rest: tablas muy grandes (`alerta_log` 180.885 filas, `ia_training_log`,
`comanda_items`, `rate_snapshots`…), pagos (Monei/Stripe Edge Functions + webhooks),
**VeriFactu** (firma vía Edge Function `verifactu-sign`/`enviar-verifactu`), QR de mesa, bridge
de hardware. Todo ligado al **ref del proyecto** (URL, service-role key, secrets, JWT).

## 3. El bloqueo nº1: colisiones de tablas

Meter ia-rest en el **mismo esquema `public`** es inviable: hay **7 colisiones de nombre
directas con esquema/semántica distintos** (no se pueden fusionar, se machacarían):

| Tabla | En compartida | En ia-rest | Conflicto |
|---|---|---|---|
| `cuentas` | plataforma (dueños), 1 fila | restaurante (cuentas de mesa), 3 filas | **semántica opuesta** |
| `sociedades` | plataforma, 2 filas | ia-rest, 0 filas | esquema distinto |
| `productos` | ialimp (stock limpieza), 6 | ia-rest (carta), 101 | esquema totalmente distinto |
| `proveedores` | ialimp, 5 | ia-rest, 4 | esquema distinto |
| `leads` | ialimp, 8 | ia-rest, 395 | esquema distinto |
| `push_subscriptions` | compartida, 1 | ia-rest, 0 | esquema distinto |
| `checklist_templates` | ialimp, 5 | ia-rest, 0 | esquema distinto |

**Conclusión:** "una sola lista de tablas para todo" **no existe como opción**. Cualquier fusión
física obliga a **separar por esquema de Postgres** (namespacing).

## 4. Única fusión física viable: schema-per-vertical

Un Postgres, **esquemas separados**: el `public` actual sigue siendo de ialimp+sivra+plataforma,
e ia-rest entra en un esquema nuevo **`iarest`** (`iarest.productos`, `iarest.cuentas`, …).
Resultado real: **no es "una BD unificada"**, son **dos mundos en una misma instancia**. El cruce
de datos entre verticales sigue siendo por consulta explícita, igual que hoy se haría por el puerto.

Lo que esa fusión exige (todo sobre **producción en vivo**):
1. **Migrar ~200 tablas + datos** de ia-rest al esquema `iarest` (incluye `alerta_log` 180k filas).
2. **Re-desplegar las 39 Edge Functions** al proyecto compartido (no se "mueven": se recrean) y
   re-cablear sus **secrets** (Monei, Stripe, VeriFactu, NVIDIA, Telegram…).
3. **Re-apuntar la app ia-rest** (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, anon key, service-role,
   y todas las URLs de funciones → al nuevo ref.
4. **Webhooks externos** (Monei, Stripe) → cambiar endpoints al nuevo proyecto.
5. **Storage buckets** de ia-rest → migrar objetos + repuntar.
6. **RLS/policies, secuencias, triggers, vistas, extensiones** → recrear en el esquema destino.
7. **Ventana de corte** con ia-rest en modo lectura/mantenimiento mientras se copia y verifica.

**Coste/beneficio:** semanas de trabajo + ventana de riesgo sobre **dos** apps en producción
(iarest.es y, por radio de explosión compartido, ialimp con Vanessa), a cambio de **cero
beneficio funcional** para el god-panel (ver §6). Aumenta el radio de explosión: una migración
mala podría afectar a las 4 apps a la vez.

## 5. Plan por fases (SI se decide ejecutar)

> Solo arrancar con backup verificado + Instant Rollback de Vercel listo + ventana acordada.

- **F0 — Congelar inventario:** `pg_dump --schema-only` de ambos proyectos; lista cerrada de
  tablas, vistas, funciones, secuencias, extensiones, policies y secrets de ia-rest.
- **F1 — Esquema destino:** crear esquema `iarest` en la compartida; recrear extensiones y tipos.
- **F2 — Datos:** `pg_dump`/`COPY` de ia-rest → `iarest.*` (orden por FKs; verificar `alerta_log`
  y tablas grandes por lotes). Doble escritura o congelación durante la copia.
- **F3 — Lógica:** recrear las 39 Edge Functions en el proyecto compartido + secrets; recrear
  triggers/vistas en `iarest`.
- **F4 — Repunte app + externos:** cambiar envs de Vercel de ia-rest; reapuntar webhooks
  Monei/Stripe; migrar Storage.
- **F5 — Cutover vigilado:** ia-rest en mantenimiento → última sincronización delta → switch →
  smoke tests (comanda, cobro QR, VeriFactu, push). **Rollback:** revertir envs al ref viejo
  (el proyecto ia-rest original se conserva intacto N días como red).
- **F6 — Limpieza:** tras estabilizar, retirar el proyecto ia-rest viejo.

## 6. Alternativa recomendada (sin fusionar): unificar la GESTIÓN

El god-panel **no necesita** que los datos vivan en la misma Postgres. La matriz (`plataforma`)
agrega por **adaptadores/puerto** —patrón ya adoptado por `module-contabilidad` y `module-concursos`,
y exigido por `PLAN-plataforma-modular.md` ("agnóstico de BD … sirve a ia.rest que tiene otra BD
vía el puerto")—:
- Lee directo de la BD compartida (ialimp+sivra+plataforma).
- Lee de ia-rest por su **puerto** (consulta read-only / endpoint), sin mover datos.
- Mantiene un **registro unificado de clientes** en la matriz (tabla ligera que referencia cada
  cliente con `{vertical, ref_externa}`) para la vista 360, el alta y el bloqueo/liberación.

Para el operador se ve **idéntico** (todos los clientes en un panel), con **cero downtime** y
**cero riesgo** sobre producción. Es además reversible y alineado con el plan maestro.

## 7. Comparativa

| | Fusión física (schema-per-vertical) | Unificar la gestión (puerto) |
|---|---|---|
| Resultado para el operador | Todo en un panel | **Todo en un panel (igual)** |
| Riesgo sobre producción | Alto (2 apps + radio a 4) | **Mínimo (aditivo)** |
| Esfuerzo | Semanas (migración + 39 funciones + webhooks) | Días |
| Reversibilidad | Compleja (cutover) | **Trivial** |
| Alineado con plan maestro | No (lo contradice) | **Sí** |
| Beneficio funcional extra | Ninguno para el god-panel | — |

## 8. Recomendación y decisión pendiente

**Recomendación:** **no fusionar físicamente** ahora. Construir el god-panel por la vía de
**gestión unificada (puerto)**, que entrega el objetivo ya y sin riesgo; reconsiderar una fusión
física solo si en el futuro aparece una necesidad concreta que el puerto no cubra (p. ej. JOINs
analíticos masivos cross-vertical en tiempo real) — y, aun entonces, como **schema-per-vertical**,
nunca en `public`.

**Decisión de Alberto (pendiente):** (a) seguir la recomendación y montar el god-panel por puerto;
(b) ejecutar la fusión física por fases (§5) asumiendo coste/riesgo; (c) híbrido: god-panel por
puerto ahora + retomar fusión más adelante si hace falta.

## 9. Nota de seguridad (hallazgo del inventario)

En ia-rest, la tabla `public.instagram_estilos_usados` tiene **RLS desactivada** → expuesta a la
anon key. Independiente de la fusión, conviene revisarla:
`ALTER TABLE public.instagram_estilos_usados ENABLE ROW LEVEL SECURITY;` (+ políticas) — decidir
políticas antes de aplicar para no bloquear accesos legítimos.
