# Agente de inversión inmobiliaria (VUT) — plan de implementación

**Goal:** que dada la ficha de un inmueble y unas mediciones de mercado reales, el sistema
devuelva ingresos por temporada, costes, yield, cash-on-cash, payback, TIR y un veredicto
que dice NO por defecto — comparando SIEMPRE explotación entera contra segregada.

**Architecture:** el cálculo es un helper PURO en `apps/plataforma/lib/inversion/*` (sin BD ni
red, testeado con `node --test`); un endpoint lo expone y persiste el análisis con sus supuestos
versionados; una skill hace lo que necesita conector (medir Booking, resolver el bloque legal) y
llama al endpoint. Es el patrón de pricing: la rutina mide, el motor determinista decide.

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma `$queryRaw` (tabla fuera del schema,
como `inmuebles_busqueda`), `node --test`, conector MCP de Booking.com.

**Spec:** `docs/superpowers/specs/2026-08-27-agente-inversion-inmobiliaria-design.md`

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `lib/inversion/tipos.ts` | Contratos compartidos (ficha, curva, costes, resultado). Sin lógica. |
| `lib/inversion/curva-mercado.ts` | Mediciones de Booking → curva mensual (ADR mediano, €/plaza, nº comparables, proxy de ocupación). |
| `lib/inversion/competencia.ts` | Describe el campo competitivo: profundidad a TU aforo, calidad de los vecinos, rampa sugerida. |
| `lib/inversion/underwriting.ts` | Motor: ingresos → costes → NOI → yield/CoC/payback/TIR → escenarios → veredicto. |
| `lib/inversion/*.test.ts` | Un test por fichero, con los casos de regresión del spec. |
| `migrations/2026-08-27_inversion_analisis.sql` | Tabla `inversion_analisis` con supuestos versionados. |
| `app/api/inversion/underwrite/route.ts` | POST autenticado: valida, calcula, persiste, devuelve. |
| `app/(usuario)/inversion/page.tsx` | Pantalla: formulario + informe. Responsive. |
| `.claude/skills/inversion-inmueble/SKILL.md` | La skill que mide y llama al endpoint. |

## Decisiones que fija este plan

1. **Ruta fuera de `/api/sivra/*`.** El primer caso es Conil, no Sevilla.
2. **Sin cambios en el schema de Prisma**: `$queryRaw` contra `inversion_analisis`, igual que
   hace hoy `/api/sivra/inversion` con `inmuebles_busqueda`.
3. **Tres estados de verdad en TODO el motor.** `null` = no medido. Prohibido `?? 0`.
   Si falta un dato que cambia el veredicto, el resultado es `no_calculable` + `faltan[]`,
   nunca un número optimista.
4. **La ocupación de Booking es un PROXY.** Se etiqueta como tal en el tipo y en la pantalla.
   Un mes sin proxy usa el supuesto del usuario y queda anotado en `mesesConOcupacionSupuesta`.
5. **Veredicto NO por defecto**, con umbral pre-registrado en constantes exportadas.

---

## Task 1 · Tipos y curva de mercado

**Files:** crear `lib/inversion/tipos.ts`, `lib/inversion/curva-mercado.ts`,
`lib/inversion/curva-mercado.test.ts`

- [ ] Escribir los tests: mediana con muestra par e impar; `price.book` es TOTAL de la estancia y
      hay que dividir por noches; una ventana sin respuesta cuenta como `comparables: 0` y
      `adrGuest: null` (NO como mercado a 0€); el proxy de ocupación es `null` si no se pasó
      saturación medida.
- [ ] Ejecutar: `node --test apps/plataforma/lib/inversion/curva-mercado.test.ts` → FAIL.
- [ ] Implementar mínimo.
- [ ] Ejecutar → PASS. Commit.

## Task 2 · Competencia

**Files:** crear `lib/inversion/competencia.ts` + `.test.ts`

- [ ] Tests: profundidad a aforo alto es menor que a aforo bajo con los datos reales de Conil;
      €/plaza baja al subir el aforo (el hallazgo del spec); con 0 comparables devuelve
      `null`, no `0`; la rampa sugerida sube cuando los vecinos tienen nota alta y muchas reseñas.
- [ ] FAIL → implementar → PASS. Commit.

## Task 3 · Motor de underwriting

**Files:** crear `lib/inversion/underwriting.ts` + `.test.ts`

- [ ] Tests, en este orden:
      1. Sin licencia confirmada → `veredicto.decision === 'no_calculable'` y el yield NO se pinta.
      2. Precio `null` → `no_calculable`, y `faltan` incluye `'precio'`.
      3. Ingreso bruto = Σ (ADR × noches del mes × ocupación); el neto descuenta la comisión del
         canal UNA sola vez (el ADR de Booking ya es precio guest).
      4. Año 1 aplica la rampa de reseñas; el año 2 en adelante no.
      5. `cashOnCash` es `null` si no hay financiación declarada (no 0).
      6. `payback` es `null` si el flujo anual es ≤ 0 (no «infinito» ni un número gigante).
      7. Con los números del spec, segregado rinde más por plaza que entero.
      8. Un yield por encima del umbral pero por debajo de la alternativa + prima de iliquidez
         sigue dando `no`.
- [ ] FAIL → implementar → PASS. Commit.

## Task 4 · Tabla y endpoint

**Files:** crear `migrations/2026-08-27_inversion_analisis.sql`,
`app/api/inversion/underwrite/route.ts`

- [ ] SQL: `CREATE TABLE IF NOT EXISTS inversion_analisis` con `supuestos jsonb`,
      `resultado jsonb`, `motor_version text`, índice por `(municipio, created_at desc)`.
- [ ] Endpoint POST: `getSession()` obligatorio; valida con zod; llama al motor; intenta
      persistir; **si la tabla no existe devuelve el análisis igual con `guardado:false` y el
      motivo** (un fallo de persistencia no puede disfrazarse de análisis correcto ni al revés).
- [ ] Aplicar la migración en Supabase y verificar con un `SELECT`.

## Task 5 · Pantalla

**Files:** crear `app/(usuario)/inversion/page.tsx`, modificar `app/(usuario)/UserSidebar.tsx`

- [ ] Formulario con los datos de la ficha + supuestos, y el informe con los dos escenarios.
- [ ] Importes con `eur()`. Responsive a 320 px (tabla con `overflow-x:auto`).
- [ ] Los tres estados visibles: «pendiente de verificar» ≠ «no hay» ≠ dato.
- [ ] Enlace en el sidebar.

## Task 6 · Skill

**Files:** crear `.claude/skills/inversion-inmueble/SKILL.md`

- [ ] Pasos: ficha → medir Booking por fecha × aforo → bloque legal → POST al endpoint → informe.
- [ ] Las trampas heredadas de `mercado-booking`: `price.book` es total, no inventar comparables,
      una ventana muda es `sinRespuesta`. Sin secretos: solo nombres de variable.

## Task 7 · Prueba de extremo a extremo y registro

- [ ] Script de demo que corre el pipeline entero con las mediciones REALES de Conil y un precio
      declarado como supuesto, e imprime el informe.
- [ ] `node --test` de los tres módulos + `pnpm test:guardia` + typecheck de plataforma.
- [ ] Alta en `docs/SKILLS.md` y `docs/AGENTES-MAPA.md` (ahora la skill ya existe).
- [ ] Entrada en `docs/CONTEXTO-SESIONES.md`, PR y merge con CI verde.
