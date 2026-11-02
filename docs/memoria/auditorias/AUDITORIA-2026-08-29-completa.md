# Auditoría completa — 29/08/2026 (foco: precios dinámicos)

> Pedida por Alberto: «auditoría lo más completa posible… muy importante el desarrollo de los
> precios dinámicos para los 4 apartamentos turísticos, que está operativo 100% y nos jugamos
> dinero», más limpieza de lo que no sirva. Sesión `claude/auditoria-precios-dinamicos-g80fej`.
> Todo lo de abajo está MEDIDO (comandos en local + BD real por Supabase MCP), no supuesto.

## Resumen ejecutivo

**El monorepo está sano y el motor de pricing hace lo que su fórmula dice.** Los 12 checks del CI
reproducidos en local salen en verde (tests, 11 typechecks, QA, lint). En el motor de precios:
propagación al canal **verificada al 100%** (cerrado el fleco del 27/08), columnas de auditoría
nuevas **rellenándose en producción** (cerrado el check-in del 28/08), **cero** roturas del raíl a
la baja desde el fix del 19/08, y una **validación a mano** de la fórmula que cuadra con el precio
vivo. Dos arreglos de bajo riesgo aplicados en este PR; nada borrado (los 3 candidatos a limpieza
son piezas declaradas de la arquitectura — decisión de Alberto, ver 🟡4).

---

## ✅ Estado del motor de precios dinámicos (bloque crítico)

- **Vivo y sin pausa**: `pricing_config.paused=false`, los 4 pisos con `apply_enabled=true`,
  3 pasadas/día corriendo (última real 28/08 20:31 UTC; la de hoy 08:30 aún no había corrido al
  medir, 08:22). Raíl ±20%/día en los 4, `min_price` puesto (65/85/300/72), canal medido
  (markup 0,949–1,056 + cuota fija por estancia) — nada de valores inventados.
- **Propagación al canal VERIFICADA** *(cerraba el fleco del 27/08: «no se puede afirmar que la
  corrección llegara al mercado»)*: el snapshot de HOY (29/08) coincide con el último precio
  aplicado en **el 100% de las fechas comparables de los 4 pisos** (359+357+332+351 fechas,
  0 discrepancias con snapshot posterior al apply). El precio del motor SÍ llega a Smoobu.
- **Columnas de auditoría del ancla (PR #1826) funcionando** *(cerraba el check-in del 28/08
  14:47, con el INSERT dentro de un `catch{}`)*: las pasadas de 28/08 14:30 y 20:30 escriben
  `base_fuente` y `ancla_origen` en el 100% de sus filas (246/246); la de 08:30 fue código
  anterior al deploy, como esperado. `ancla_origen='acumulada_fiable'` en los 4 pisos.
- **Serrucho, primeros datos del motor nuevo** (ancla acumulada, desde 27/08 ~12:00):
  **1,26 escrituras/noche** frente a 4,87 del motor viejo (18→27/08) y delta medio 12,0% vs
  16,5%. Ventana corta (1,3 días) — la medición formal sigue siendo la del 03/09, ya armada.
  Las pocas «inversiones de dirección» que quedan son rebotes de +3–8% al alcanzar el objetivo
  tras un descenso a tope de raíl, no el baile ±20% de antes.
- **Invariante del raíl comprobado sobre TODO el histórico de 14 días**: las únicas 9 bajadas
  fuera de raíl son del 15–19/08, **anteriores al fix del ancla del 19/08** (el −36% ya
  documentado). Desde entonces: **cero**. Las subidas que saltan el raíl corresponden todas a
  eventos confirmados (Betis–Sevilla 13/11 y 23/02, Semana Santa 24/03, Feria 18/04, Mundial de
  Remo 01/08) — comportamiento de diseño (`eventTarget`).
- **Validación de la fórmula A MANO** (regla del checklist): Dúplex Center, 16/09/2026 —
  evento confirmado Betis–Getafe ×1,35; bucket fiable de sep-2026 med 127€ guest (n=90, 9
  fechas); demanda gateada (20 días vista > mediana 11 del mes → descuento neutralizado);
  conversión canal `(guest − 39,9/3)/0,949`. Objetivo esperado ≈ **162€** de base; el canal está
  a **166€** → 2,4% de diferencia, **dentro de la banda muerta del 3%** (por eso el 28/08 no
  reescribió esa fecha). La fórmula del código y el precio vivo cuadran.
- **Corpus de mercado fresco**: `booking_mcp` con 718 filas en 48h (última 28/08); `serper`
  muerto desde el 22/08 (apagado a propósito el 24/08); `manual` 18/08. La rutina
  `mercado-booking` latió el 28/08 15:05 (240 comps, 24 ventanas).
- **Latidos**: los 20 agentes verdes salvo `ses_transporte` (ver 🟡6).

### 🟡 Único punto a vigilar del pricing
**El bloque Luxury 1-jul→23-ago-2027 (51 noches, sin comps propios) sigue moviéndose entero cada
día**: 119 (25/08) → 95 (26/08) → ~114 (27/08) → ~137-144 (28/08). Con el motor nuevo ya NO
invierte dirección — está subiendo a tope de raíl persiguiendo el ancla acumulada tras el desplome
del 26/08 —, pero hasta que el barrido mida jul-ago 2027 (la cuota para meses sin bucket entró en
el PR #1844, 28/08) el bloque no tiene mercado propio con el que anclarse. **No requiere acción
hoy**: el seguimiento del serrucho del 03/09 y la cuota nueva del barrido son exactamente los dos
mecanismos que lo cubren. Si el 03/09 sigue moviéndose ±20%/día, ahí sí hay que mirar la
realimentación objetivo↔precio propio.

---

## ✅ Salud general del monorepo (bloques 1-3)

| Check | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | lockfile en sync |
| Guardián (`pnpm test:guardia`) | 75/75 (scope viejo + secretos + rama) |
| `pnpm test` raíz | exit 0 (node --test + 53 vitest) |
| Typecheck (`tsc --noEmit`) | **11/11 apps** en verde (prisma generate por app) |
| QA (`qa-check.ts`, desde apps/ia-rest) | «Sin problemas detectados» |
| Lint (desde apps/ia-rest) | 0 errores (warnings no bloqueantes) |
| `ignoreCommand` en `apps/*/vercel.json` | **11/11** (ialimp sin `--sin-previews`, a propósito) |
| `transpilePackages` vs deps `@central/*` | OK en las 11 tras el fix de este PR (ver abajo) |
| Grep `@iarest/` | 0 restos |
| Sin `.env` commiteados | ✓ (solo `.env.example`) |

**Arreglos aplicados en este PR (bajo riesgo):**
1. `apps/plataforma/next.config.ts:7` — faltaba `@central/core-payments` en `transpilePackages`
   pese a importarse en `lib/sivra/extras/stripe.ts` y el webhook de extras (ruta de dinero).
   El build de producción NO estaba roto (el symlink de pnpm lo resolvía — deploy de hoy READY),
   pero era la única divergencia deps↔transpile de las 11 apps; ia-rest e ialimp ya lo listaban.
2. `estructura.generated.json` + `ARQUITECTURA.generated.md` + `mapa-funciones.generated.json`
   estaban desfasados → regenerados con `node scripts/auditar-estructura.mjs`.

---

## ✅ Infra real (bloque 6, solo lectura)

- **Supabase**: `list_projects` devuelve SOLO `central` (`wswbehlcuxqxyinousql`,
  ACTIVE_HEALTHY, PG 17) — correcto tras el borrado del proyecto viejo el 19/08.
  **67 edge functions ACTIVE**, `daily-briefing` en v24 (la redesplegada el 28/08 ✓).
- **Vercel**: producción de `plataforma` en READY con el head de `main` (`fe71c9f1`, hoy
  08:18 UTC). ⚠️ El conector solo lista 5 proyectos (plataforma, ia-rest, ialimp, central-rrhh,
  transporte); sivra/alquiler/almacen/housesevillana/asegura no aparecen — **es alcance del
  conector, NO «no desplegadas»** (housesevillana y sivra sirven tráfico real). No se afirma nada
  de ellas desde aquí.

## 🟡 Hallazgos (ninguno 🔴)

1. **[cerrado en este PR]** `transpilePackages` de plataforma (ver arriba).
2. **[cerrado en este PR]** Generados desfasados (ver arriba).
3. **Luxury jul-ago 2027** — ver el bloque de pricing.
4. **3 packages sin ningún consumidor** — **RESUELTO el mismo día** (Alberto delegó: «no reviso
   nada, usa tu conocimiento»). Decisión y ejecución:
   - **`module-encargo` y `module-revenue` BORRADOS** (2º commit de este PR). Encargo: el agregado
     central nunca se adoptó — `module-alquiler`/`module-transporte` shippearon replicando su
     patrón por id (`encargoId`) en vez de componerse sobre él; el patrón sigue, el package no.
     Revenue: su analítica quedó superada por el motor real de pricing/rentabilidad de plataforma.
     **Recuperables de git** (último commit con ellos: `3dcd5491`). Actualizados `MATRIZ.md`,
     `docs/ESTRUCTURA.md` (26→24 módulos), los comentarios de `module-transporte/src/types.ts` y
     `module-alquiler/src/types.ts`, el lockfile y los generados. Validado: suite completa +
     typecheck de transporte y alquiler en verde tras el borrado.
   - **`module-agenda` SE CONSERVA a propósito**: el plan vivo de `apps/almacen` Fase 2
     (`docs/ALMACEN-JJ-reunion-y-auditoria.md`, cliente Joaquín Jaén) lo asigna al calendario de
     eventos + anti-doble-reserva. No es «lo que no sirve»: es pieza en espera con destino.
5. **Vulns npm (4, ninguna accionable sin riesgo)**: `xlsx` 2×high en ialimp (ya documentada:
   solo ESCRIBE xlsx, no parsea → no explotable; no hay parche en npm); `deepmerge-ts` <8 high
   vía `plataforma>mailparser>html-to-text` (el merge es de OPCIONES de configuración, no del
   correo parseado → sin vector razonable; forzar v8 por override arriesga romper `html-to-text`,
   major); `file-type` moderate vía `ialimp>jimp` (bucle infinito con ASF malformado; jimp solo
   procesa imágenes en una ruta admin; el parche exige file-type ≥21.3.1, ESM-only, incompatible
   con el jimp actual). Documentadas siguiendo la regla «antes de arreglar, mira si es explotable».
6. **Latido `ses_transporte` en rojo permanente** — «no hay ningún establecimiento dado de alta
   en /sivra/partes/establecimientos». Pendiente conocido de Alberto (ya constaba el 27/08); no
   es un fallo de código, pero mancha el parte diario mientras no se resuelva o se saque del registro.
7. **Advisors Supabase** (0 ERROR): 79 funciones `SECURITY DEFINER` del schema `iarest`
   ejecutables por `anon`/`authenticated` (WARN — herencia de la migración del POS; revocarlas en
   masa puede romper el POS: solo con plan y prueba); `public.pricing_factor_aforo` sin
   `search_path` fijado (WARN); 7 pares de **índices duplicados en `public`** (knowledge_base ×2,
   market_rates, rate_snapshots, session_completions, subastas ×2); 1.151
   `multiple_permissive_policies` (casi todas `iarest`, coste de RLS que los roles BYPASSRLS no
   pagan). → checklist manual de abajo.
8. **Pendientes de memoria re-confirmados hoy** (sin cambios): envs `PLATAFORMA_URL` +
   `AI_GATEWAY_SECRET` del `daily-briefing` (sigue mandando en crudo sin ellas);
   `ALERTA_TOKEN` placeholder del trigger de `github-vigia` (nace mudo); 4 edge functions con
   NIM crudo (post-apagado de NIM del 28/08).

## Checklist de acciones manuales (Alberto) — orden seguro

1. **Vercel `plataforma`**: poner `PLATAFORMA_URL` y `AI_GATEWAY_SECRET` (mete el briefing por
   OpenRouter). Rollback: quitarlas — el briefing vuelve al modo crudo actual, nada se rompe.
2. **Trigger `github-vigia`**: pegar el `ALERTA_TOKEN` real en el prompt del trigger
   `trig_017pe2NS4pzKXYhGPM6St7aZ`. Rollback: ninguno necesario (solo permite avisar).
3. ~~Supabase, índices duplicados~~ — **HECHO el 29/08** (delegado por Alberto; migración
   `limpieza_indices_duplicados_y_search_path`). Antes de tocar se verificó contra `pg_index`:
   los dos índices de `rate_snapshots` respaldaban CONSTRAINTS idénticas y ningún código las
   nombra (grep), así que se retiró la constraint duplicada `rate_snapshots_property_date_unique`
   (queda la `_key` original); del resto de pares se soltó uno (kb_category_idx, kb_property_idx,
   market_rates_scenario, idx_session_completions_session, ix_subastas_ref_catastral,
   subastas_tipo_bien_idx). Rollback: recrear con el DDL del par superviviente.
4. ~~`search_path` de `pricing_factor_aforo`~~ — **HECHO el 29/08** (misma migración) y
   verificado en caliente: la función devuelve lo mismo (2,5 / 1 / 1) y 758 filas del corpus de
   ayer computan bien. Rollback: `ALTER FUNCTION public.pricing_factor_aforo RESET search_path`.
5. ~~Decidir los 3 packages huérfanos~~ — **HECHO** (ver 🟡4).
6. **`ses_transporte`**: dar de alta el establecimiento o pedir que se saque del registro de
   vigilancia (esto sí es dato de negocio que solo tiene Alberto).
7. Los 79 `SECURITY DEFINER` de `iarest`: NO tocar sin plan (riesgo POS); queda anotado para
   cuando haya una ventana de revisión de iarest.

## Qué NO se hizo, a propósito

- No se borró ningún package/app/archivo (los candidatos exceden «bajo riesgo»; ver 🟡4).
- No se tocó ninguna migración/env/función de producción (regla de la skill).
- No se «arregló» `ignoreBuildErrors` ni las vulns npm (decisiones deliberadas documentadas).
