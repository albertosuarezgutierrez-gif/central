# Coordinador patrimonial (patrimonio-cfo) + radar España + base patrimonial — diseño

> Aprobado por Alberto el 22/08/2026 (conversación de diseño; «me gustan todos» a las 10
> ampliaciones). Solo análisis→diseño→implementación por fases; nada ejecuta decisiones.

## Principio rector (dictado por Alberto)

**El objetivo no es informar: es sacar el rendimiento MÁXIMO a lo que ya existe** (él + su
familia). Cada activo debe justificar periódicamente por qué sigue en el patrimonio en vez de
estar convertido en otra cosa. El coste de oportunidad por activo es el corazón del sistema.
Jugada de referencia que debe poder analizar con números: *vender el Dúplex cerca del tope de
mercado → aparcar el dinero en un fondo → recomprar inmueble cuando el ciclo baje en 1-2 años*.

**Calibración del coordinador:**
- **Objetivo del patrimonio: MIXTO** — rentas que sostengan a la familia hoy + crecimiento a
  largo plazo; avisar cuando una decisión favorezca una cosa a costa de la otra.
- **Perfil de riesgo: DINÁMICO** — puede proponer apalancamiento (hipotecar un piso pagado
  para comprar otro), concentración y rotación si los números salen. Salvaguarda: toda
  propuesta dinámica que toque la base de subsistencia familiar (Socorro) se marca como tal
  y cuantifica el peor caso.
- **Nunca ejecuta nada**: ni vende, ni ordena, ni comunica a terceros (regla global de
  comunicaciones salientes). Solo analiza, orienta y pregunta.

## Por qué (huecos medidos en la exploración del 22/08/2026)

- El ladrillo —el grueso del patrimonio— está A CERO como activo en el sistema: `properties`
  no tiene m², ref. catastral, titularidad, valor de compra, hipoteca ni valor de mercado;
  Monte Carmelo 68 no existe como fila; no hay tabla de hipotecas (solo la cuota 772,86€/mes
  como gasto); no hay vista de patrimonio neto.
- El único inmueble con ficha completa es el Dúplex, y vive en markdown
  (`docs/FISCAL-venta-duplex-villasis.md` + `docs/DUPLEX-plan-precio-reforma-venta.md`).
- Ya existen y NO se usan para los pisos propios: `mercado_zonas` (€/m² por zona; casco
  antiguo p50 4.390 €/m²), `mercado_comparables` (1.363 testigos), el enriquecedor de
  Catastro del cron de subastas y `lib/subastas/rendimiento.ts` (yield con datos propios).
- No existe ningún agente que consolide los informes de los demás (entrenador/auditoría/
  latidos son meta-nivel de calidad y frescura, no de contenido).

## Piezas

### Fase 0 — Base patrimonial + intake (este PR)

**Tablas nuevas** (BD compartida, sin RLS + REVOKE anon/authenticated, patrón de la casa):

- **`patrimonio_activos`** — activos Y pasivos por `cuenta_id`. Inmuebles con: dirección,
  ref. catastral, m², año, uso (turístico/vivienda habitual/alquiler), tenencia
  (propiedad/alquilado), % titularidad Alberto/Pilar/SL, modo y valor de adquisición (+gastos,
  +fecha), enlace a `properties.id` para la explotación, licencia VUT (tri-estado), e
  hipoteca (capital pendiente, cuota, tipo, vencimiento — todo NULL-able: NULL = «no se
  sabe», nunca 0).
- **`patrimonio_valoraciones`** — historial de valoraciones: activo, enfoque
  (`vivienda` | `vut` | `mixto` — la valoración DUAL vive aquí como filas distintas), valor,
  fecha, **fuente** (`alberto` | `agente:<método>` | `tasacion`), método/notas. Nunca se
  pisa una valoración: se añade fila; la vigente es la más reciente por (activo, enfoque).

**Seed:** 6 filas — los 4 pisos turísticos (enlazados a `properties`), Monte Carmelo 68 y la
posición IBKR NO se duplica (el bróker ya está en `broker_saldos`; la vista lo suma de ahí).
El Dúplex entra completo desde los docs (65,46 m², ref. catastral, adquisición donación
21/05/2024, valor corregido 173.307,08€). Socorro entra con el valor de compra ~360.000€
como ORIENTATIVO (fuente `alberto`, nota). Todo lo que no se sabe queda NULL.

**Vista `/patrimonio`** (plataforma, grupo `(usuario)`): patrimonio neto arriba (líquido
`getSaldoConsolidado` + bróker `getBrokerSaldos` + activos a valoración vigente − pasivos),
declarando SIEMPRE qué falta («neto parcial: faltan N valoraciones y el capital de la
hipoteca»). Tabla de activos con tri-estado por celda (valorado / pendiente de dato / no
aplica) y bloque **intake**: la lista viva de preguntas a Alberto (los NULL que más duelen).
Lógica de titulares en helper puro testeado (`lib/patrimonio.ts` + `resumen-patrimonio.ts`).

### Fase 1 — Agente `radar-espana` (skill, quincenal; este PR deja la skill lista)

- Coyuntura España: inmobiliaria (tipos BCE, normativa vivienda/VUT, tendencia €/m² en las
  zonas de interés — Sevilla + provincias de los criterios de subastas incl. Asturias),
  económica, y fiscal SOLO como consumidor de `fiscal-novedades` (no duplica su trabajo).
- **Termómetro de ciclo por zona**: señales medibles (€/m² y su velocidad, compraventas,
  tipos, esfuerzo hipotecario, oferta) → semáforo «señales de agotamiento sí/no» con datos.
  Nunca promete acertar el tope.
- **Valoración viva por inmueble**, DUAL (como vivienda / como VUT en explotación con su
  licencia e histórico real de `incomes`): €/m² zona × m² + testigos de `mercado_comparables`
  + Catastro → escribe filas en `patrimonio_valoraciones` con `fuente='agente:<método>'`.
  Riesgo regulatorio VUT vigilado en ambos sentidos (escasez ↑valor / recorte ↓valor).
- Estado entre pasadas: `docs/RADAR-ESPANA.md` + BD. Patrón estándar de agente programado
  (dos carriles, bitácora, preflight alerta, sin secretos).

### Fase 2 — Agente `patrimonio-cfo` (skill, mensual día 2; este PR deja la skill lista)

- Día 2 para consumir las pasadas del día 1 (fiscal-novedades, plan Dúplex, quincenal trading).
- Recopila: bitácora de agentes + BD (finanzas, `incomes`, P&L por piso, cartera IBKR,
  `patrimonio_*`) + `docs/RADAR-ESPANA.md` + docs de decisión.
- Informe mensual por Telegram + actualización de `docs/PATRIMONIO-CFO.md` con:
  1. Foto patrimonial (neto y evolución).
  2. **Rentabilidad y coste de oportunidad POR ACTIVO** (yield real sobre valor de mercado
     vigente, comparado contra VWCE/letras/alquiler tradicional).
  3. Escenarios de decisión con impuestos y gastos (plantilla: el estudio fiscal del Dúplex).
     Si hay escenario de recompra, se apoya en el radar de subastas (lotes reales).
  4. Preguntas a Alberto (intake pendiente + datos caducados).
  5. Propuestas de agentes nuevos si detecta huecos (por PR draft, jamás auto-alta).
- **Alertas de ventana sin esperar al mes**: cambio con plazo (fiscal, giro de €/m²,
  IBKR acercándose a 50.000€ → Modelo 720) → Telegram inmediato en la pasada que lo detecte
  (suya o del radar).
- **Memoria de decisiones**: cada recomendación queda registrada (tabla
  `patrimonio_recomendaciones`: qué aconsejó, datos, decisión de Alberto, outcome) para
  medir acierto — mismo espíritu que `trading_tesis`; el `agentes-entrenador` la consume.
- Primera pasada = dossier inicial completo + cuestionario intake.

### Fase posterior (NO en este PR)

Simulador «¿y si?» interactivo en plataforma; plan de aparcamiento de liquidez detallado
(monetarios/letras vs indexado, traspasos entre fondos sin peaje) — el CFO ya lo trata como
escenario textual desde la fase 2; planificación sucesoria/donaciones; calendario completo
de obligaciones; absorber la rutina «revisión mensual plan Dúplex» dentro del CFO cuando
esté vivo; reparar el radar de compra por email (`/sivra/inversion`, cursor congelado
19/05/2026).

## Reutilización

- Patrón de agente programado + `rutinas-automerge` + bitácora (`docs/RUTINAS-PROGRAMADAS.md`).
- `lib/subastas/rendimiento.ts`, `mercado_zonas`/`mercado_comparables`, enriquecedor Catastro.
- `getResumenFinanciero`, `getSaldoConsolidado`, `getBrokerSaldos`, `lib/fiscal-deducciones.ts`.
- `eur()` de `lib/dinero.ts` para todo importe.

## Registro y vigilancia

Alta en `docs/RUTINAS-PROGRAMADAS.md` (triggers los crea Alberto en claude.ai/code → Rutinas),
`docs/SKILLS.md`, `docs/AGENTES-MAPA.md`, `apps/plataforma/lib/agentes-catalogo.ts`
(estado `pendiente-trigger` hasta que existan los triggers). De paso se corrige el drift del
catálogo (falta `mercado-booking`; estados desfasados de trading-analista/buscador-ia).

## Errores que este diseño debe evitar (reglas de la casa)

- NULL = «no se sabe»; jamás colapsar a 0 ni pintar 🟢 sin dato (regla global del CLAUDE.md).
- Las tablas DEMO (`propiedades`, `propietario_*`, seed-demo de `sociedades`/`negocios`) NO
  son de Alberto: el consolidador no las toca.
- Valores centinela prohibidos: una valoración sin método/fuente no se escribe.
- Importes en formato español con `eur()`.
- Multi-tenant: todo por `cuenta_id`.
