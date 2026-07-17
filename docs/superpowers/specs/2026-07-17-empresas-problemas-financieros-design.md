# Diseño — Detección y análisis de empresas en dificultad financiera

> **Estado:** borrador de diseño (brainstorming). Pendiente de revisión de Alberto antes de plan de implementación.
> **Fecha:** 2026-07-17
> **Rama:** `claude/empresas-problemas-financieros-h46hr6`

## 1. Objetivo

Sistema **interno** que detecta y analiza **pymes pequeñas en dificultad financiera** (o que han "tocado
financiación") como oportunidades para **captar cliente** (asesoría/reestructuración/financiación) y, con un
flag, **comprar** (M&A oportunista). El uso a terceros (SaaS) queda **fuera de alcance de esta fase** por la
restricción contractual de redistribución de datos de las plataformas de pago.

La lógica diferencial es el **cruce sector↔empresa**: identificar sectores sanos/al alza donde una empresa
concreta va mal (mala gestión en buen mercado = reconducible/comprable), no solo "empresas que van mal".

## 2. Principio de arquitectura: embudo de dos etapas

El coste del problema está en confundir dos etapas con necesidades de datos opuestas:

- **Etapa 1 — Cribado (amplitud):** barrer miles de empresas para sacar candidatas. Se hace con **fuentes
  gratis** para no disparar el gasto.
- **Etapa 2 — Enriquecimiento/análisis (profundidad):** solo sobre la lista corta (~50–200), se bajan balances
  completos vía **API de pago metered**. El coste se controla porque la lista ya está filtrada.

**Regla:** nunca usar API de pago para barrer el mercado; solo para enriquecer supervivientes del cribado gratis.

## 3. Fuentes de datos (en capas, de gratis a caro)

| Capa | Fuente | Qué aporta | Coste | Fase |
|---|---|---|---|---|
| Señal de problema | **BORME** (boe.es/borme) | Concursos de acreedores, disoluciones, ceses, nombramientos, ampliaciones de capital | 0€ | 1 |
| Benchmark de sector | **Central de Balances Banco de España** + INE | Ratios medianos por sector (CNAE) para el cruce | 0€ | 1 |
| Enriquecimiento | **API eInforma / Iberinform** | Balance completo + scoring de riesgo, por empresa | €€ metered | 2 |
| Cribado masivo *(opcional)* | **SABI (Bureau van Dijk)** | Filtrado masivo de balances por CNAE+facturación+ratios | €€€€ | 3 (solo si el cribado gratis se queda corto) |

**Decisión:** arrancar con capas gratis (BORME + BdE) + eInforma metered. SABI solo si el cribado gratis
demuestra ser el cuello de botella. No redistribuir datos de fuentes de pago a terceros.

## 4. Variables / señales (modelo de scoring)

Cada empresa recibe un **score compuesto (0–100)** con **motivo legible**. Cuatro bloques:

**A. Problema financiero**
- Concurso de acreedores (BORME) — señal dura.
- Fondos propios negativos o < ½ capital social (causa de disolución, art. 363 LSC).
- Pérdidas 2–3 ejercicios seguidos.
- EBITDA negativo / margen deteriorándose interanual.
- Fondo de maniobra negativo (tensión de tesorería).
- Endeudamiento alto / deuda financiera alta sobre EBITDA.
- Cuentas depositadas tarde o sin depositar (señal blanda).

**B. "Tocó financiación"**
- Ampliaciones de capital recientes, entrada de socios, préstamos participativos, avales ICO, prendas/hipotecas.

**C. Contexto de sector (cruce estrella)**
- CNAE de la empresa vs. mediana del sector (Central de Balances BdE). Sector sano + empresa en cola = objetivo.

**D. Filtros de encaje (seleccionables por el usuario)**
- **Facturación:** rango configurable (defecto sugerido 0,5–2 M€).
- **Geografía:** seleccionable — España entera o CCAA/provincia (p. ej. Andalucía/Sevilla).
- **Sector:** seleccionable — todos o uno/varios CNAE.
- Antigüedad, nº empleados, forma jurídica (SL).

El score y el motivo son lo que consume el agente. Los pesos de cada señal son configurables (fase de tuning).

## 5. Componentes

Encaja con la infra existente de `central` (`@central/core-ai`, cadena de fallback, Telegram, Supabase compartida).

1. **Ingesta (cron):** baja BORME diario + benchmarks BdE → normaliza → Supabase. Llena la base de candidatas
   **sin gasto**. Unidad aislada: entra "documento oficial", sale "señales estructuradas".
2. **Motor de scoring:** aplica el modelo de la §4 sobre las señales almacenadas → score + motivo por empresa.
   Puro y testeable en aislamiento (entra empresa+señales+benchmarks, sale score+motivo).
3. **Enriquecimiento bajo demanda:** al marcar una candidata, tira de API eInforma → balance completo en BD.
   Metered, con tope de gasto. Aislado tras interfaz (poder cambiar de proveedor sin tocar el resto).
4. **Agente conversacional:** lenguaje natural → consulta estructurada sobre la BD → lista rankeada con porqué;
   "analiza la nº3" → dispara enriquecimiento + razonamiento sobre el balance. Memoria en BD, chat efímero
   (mismo patrón que pricing-agente / code-map).

## 6. Modelo de datos (borrador Supabase)

- `empresas_objetivo` — identidad (CIF, nombre, CNAE, provincia, forma jurídica, facturación estimada).
- `senales` — evento/señal por empresa (tipo, fuente, fecha, payload); histórico.
- `benchmarks_sector` — ratios medianos por CNAE/año (Central de Balances).
- `scores` — score compuesto + desglose + motivo legible, versionado por fecha de cálculo.
- `enriquecimientos` — balances completos bajados por API (con coste registrado para control de gasto).

Esquema/rol propio en la Supabase compartida (a confirmar nombre de rol, patrón de las demás verticales).

## 7. Fuera de alcance (esta fase)

- SaaS a terceros / redistribución de datos de pago.
- SABI (se pospone a fase 3 condicional).
- Automatizar el contacto/outreach a las empresas detectadas (primero detectar y analizar bien).
- Valoración/pricing de la operación de compra (posible fase posterior).

## 8. Riesgos / cuestiones abiertas

- **Cobertura del cribado gratis:** BORME da *eventos* (concurso, ampliaciones) bien, pero "fondos propios
  negativos en sector sano" sin evento puede requerir cuentas depositadas (de pago por empresa) o SABI. Validar
  en fase 1 cuántas candidatas salen solo con gratis antes de decidir SABI.
- **Calidad de la facturación estimada** en fuentes gratis (a menudo por tramos, no exacta).
- **Presupuesto eInforma:** definir tope mensual y coste por consulta antes de conectar la API.
- **Legalidad/uso:** datos de fuentes oficiales para uso interno; revisar términos de cada API antes de escalar.

## 9. Enfoque incremental sugerido

1. **F1 (gratis, valida la hipótesis):** ingesta BORME + benchmarks BdE + scoring + consulta básica. Sin gasto.
   Objetivo: ver si el embudo gratis genera candidatas útiles.
2. **F2 (agente + enriquecimiento):** agente conversacional + API eInforma metered sobre lista corta.
3. **F3 (condicional):** SABI para cribado masivo solo si F1 se queda corto.
