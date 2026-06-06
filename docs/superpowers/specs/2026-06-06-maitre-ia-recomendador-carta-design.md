# Maître IA — Recomendador de carta para el comensal

**Fecha:** 2026-06-06
**Estado:** Diseño aprobado (pendiente de plan de implementación)
**Módulo:** `carta_ia` (gateado, como `carta_vinos`)

---

## 1. Resumen

El comensal, desde el QR de mesa (`/q/[token]`), pulsa "¿No sabes qué pedir?",
marca sus alérgenos (chips), escribe qué le apetece (texto libre opcional) y la
IA le recomienda 2-3 platos **de la carta del restaurante**, con un porqué de una
línea. El comensal puede seleccionar varios y añadirlos al pedido con el flujo de
carrito que ya existe.

Es el equivalente para **platos** del recomendador de vino que ya existe
(`POST /api/vinos/recomendar` + prompt "sumiller"). Reutiliza el mismo patrón:
leer catálogo desde `productos`, montar lista de texto, `callAI()` (NIM → Haiku),
devolver respuesta corta.

**Principio rector de ia.rest:** todo configurable al 100% desde `/owner`. El
dueño adapta tono, nº de sugerencias, secciones, textos, etc. La **única** pieza
no configurable es el filtro de seguridad de alérgenos (ver §4).

---

## 2. Quién lo usa y dónde vive

Motor compartido, dos puertas:

- **`lib/carta-recomendar.ts`** *(nuevo)* — función pura
  `recomendarPlatos({ restauranteId, alergenos, antojo, idioma, comensales, config })`.
  Contiene TODA la lógica: filtro de seguridad + prompt + `callAI` + saneo de salida.
- **`POST /api/qr/recomendar`** *(nuevo)* — puerta del **comensal**. Valida el
  `token` contra `qr_sesiones_cliente` (sin sesión de usuario, como el resto de
  `/api/qr/*`), resuelve `restaurante_id` y llama a la función.
- **`POST /api/carta/recomendar`** *(futuro, NO en v1)* — puerta del **camarero**
  con `getSession()`. La función queda lista para enchufarla sin reescribir nada.

Gateado por `modulos_activos.includes('carta_ia')`. Si el módulo no está activo,
ni el endpoint responde ni el botón aparece en el QR.

---

## 3. Flujo de datos

```
Comensal en /q/[token] → pulsa "¿No sabes qué pedir?"
  → marca chips de alérgenos + escribe antojo (opcional) + nº comensales
    → POST /api/qr/recomendar { token, alergenos[], antojo, idioma, comensales }
      → valida token contra qr_sesiones_cliente → restaurante_id
      → lee productos activos del restaurante
         (id, nombre, descripcion, precio, seccion, categoria, alergenos)
      → FILTRO DE SEGURIDAD en código (§4) → listaSegura
      → callAI(promptJefeDeSala, listaSegura) → JSON [{ producto_id, motivo }]
      → cleanJSON + descarta IDs que no estén en listaSegura (defensa en profundidad)
    → responde 2-3 platos { id, nombre, precio, alergenos, motivo } en el idioma pedido
  → comensal marca los que quiera (multi-selección) → addToCart() → flujo de pedido normal
```

Notas técnicas:
- El QR usa Edge Functions para `qr-order`/`qr-session`, pero el cerebro IA
  (`lib/ai-client.ts` → `callAI`) vive en Next.js. Por eso la puerta del comensal
  es una **API route Next.js** (`/api/qr/recomendar`), no un Edge Function —
  mismo modelo de auth por `token` que ya usa `/api/qr/carta-i18n`.
- `callAI` con `noFallback=false` (default): NIM primario, fallback Haiku.
- Salida en JSON estricto vía `cleanJSON` (ya existe en `ai-client.ts`).

---

## 4. Modelo de seguridad de alérgenos (CRÍTICO — no negociable)

`productos.alergenos` es un `string[]` (ya se lee y pinta en el QR hoy).

1. **Chips para alérgenos, texto libre solo para antojo.** La caja de texto NO es
   un canal de seguridad; la UI lo deja explícito ("¿alergias? márcalas arriba").
2. **Filtro en código, antes del LLM.** Se conservan solo los platos cuyo array
   `alergenos` NO interseca con los alérgenos marcados por el comensal.
3. **Plato con alérgenos sin declarar (array vacío) = NO seguro** cuando el
   comensal ha declarado alergias. Array vacío = "sin datos", no "sin alérgenos".
   Comportamiento por defecto: excluirlos.
   - **Configurable por el dueño** (`incluir_no_declarados`, default `false`) con
     aviso explícito en el panel de que relajarlo es bajo su responsabilidad.
   - Si el comensal NO marca ningún alérgeno, este filtro no aplica (entra todo).
4. **Defensa en profundidad.** La IA solo recibe la lista ya segura y devuelve
   IDs; al volver, se descarta cualquier ID que no esté en la lista segura.
5. **Disclaimer siempre visible** en el resultado: "Sugerencias orientativas;
   confirma cualquier alergia o intolerancia con el personal de sala."

El dueño NUNCA puede desactivar el filtro de seguridad. Solo puede ajustar el
punto 3 (incluir/excluir no declarados).

---

## 5. Configuración del dueño (`/owner → Módulos → Maître IA`)

Persistida en `restaurantes.configuracion.maitre_ia` (JSONB, mismo patrón que
`configuracion.modo_vinos`). Todo con default seguro:

| Clave | Tipo | Default | Qué hace |
|---|---|---|---|
| `nombre_asistente` | string | "Maître IA" | Cómo se llama el asistente en el QR |
| `personalidad` | enum | `cercano` | Tono del prompt: `clasico` \| `cercano` \| `gastro` |
| `num_sugerencias` | int (2-3) | 3 | Cuántos platos sugiere |
| `incluir_no_declarados` | bool | `false` | Incluir platos sin alérgenos declarados cuando hay alergias (con aviso) |
| `secciones` | string[] | todas | Qué secciones de carta entran (p.ej. excluir "bebidas") |
| `permitir_antojo_texto` | bool | `true` | Mostrar la caja de texto libre |
| `mostrar_precios` | bool | `true` | Mostrar precio en las tarjetas de resultado |
| `objetivo` | enum | `equilibrado` | `equilibrado` \| `destacar_recomendados` (prioriza platos marcados como recomendados/alto margen) |
| `texto_intro` | string | "" | Microcopy opcional sobre el botón |

El módulo se activa/desactiva con el flag `carta_ia` en `modulos_activos`
(mismo mecanismo que `carta_vinos`).

---

## 6. UX en el QR (`QrClientApp.tsx`)

- Entrada nueva en la pantalla de **carta**: botón/banner
  **"¿No sabes qué pedir? Pregúntale al {nombre_asistente}"** (solo si `carta_ia` activo).
- **Bottom sheet** (hoja inferior), reusando `C` y tipografías del design system:
  1. Chips de los 14 alérgenos UE (multi-selección).
  2. Caja de antojo (si `permitir_antojo_texto`): placeholder tipo
     "algo ligero para compartir, sin mucha hambre".
  3. Selector de nº de comensales (opcional, default 1).
  4. Botón "Recomiéndame".
- **Resultado:** 2-3 tarjetas (foto si hay, nombre, precio si `mostrar_precios`,
  1 línea de porqué, badge de alérgenos), cada una con check de selección.
  Botón inferior dinámico "Añadir N al pedido" → reusa `addToCart()`.
- **Disclaimer** de alérgenos visible bajo el resultado.
- **Idioma:** el `motivo` vuelve en el idioma activo del comensal (ya hay i18n vía
  `/api/qr/carta-i18n`); se pasa `idioma` al endpoint y el prompt redacta en ese idioma.
- Estados: cargando, sin resultados seguros ("No encontramos platos que encajen
  con tus alergias; pregunta al personal"), error.

---

## 7. Ficheros afectados

**Nuevos:**
- `src/lib/carta-recomendar.ts` — motor (función pura `recomendarPlatos`).
- `src/app/api/qr/recomendar/route.ts` — puerta del comensal (valida token).

**Modificados:**
- `src/app/q/[token]/QrClientApp.tsx` — bottom sheet + estado + entrada en carta.
- Panel `/owner → Módulos` — sección de config `maitre_ia` + toggle del módulo
  `carta_ia` (seguir el componente equivalente de `carta_vinos`).
- `src/components/help/help-prompts.ts` — entrada de ayuda si aplica.

**Sin cambios de esquema obligatorios:** se usa `restaurantes.configuracion` (JSONB)
y `productos.alergenos` (ya existen). No hay migración de tablas en v1.

---

## 8. Fuera de alcance v1 (YAGNI)

- **Maridaje de vino** en la misma tarjeta (se enchufa luego reusando
  `/api/vinos/recomendar`; la arquitectura lo permite).
- **Puerta del camarero** `/api/carta/recomendar` en `/edge` (la función ya queda lista).
- **Voz** (dictar el antojo).
- **Aprendizaje/feedback** sobre qué sugerencias acaban en comanda.

---

## 9. Verificación

- `npx tsc --noEmit` con 0 errores (pre-push obligatorio).
- `next build` con dependencias (no solo `tsc`) — reproduce el build de Vercel.
- Prueba manual: módulo activo vs inactivo; comensal con alergia que vacía la
  carta segura; ID alucinado descartado; idioma del `motivo`; añadir múltiples al
  carrito y que `qr-order` los reciba bien.
