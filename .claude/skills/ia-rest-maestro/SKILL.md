---
name: ia-rest-maestro
description: >
  Router del MAESTRO de ia.rest (Voice POS hostelería): fuentes, contexto core
  y módulos (QR, VeriFactu, Supabase-patterns, Hardware Bridge) en references/.
  USAR SIEMPRE que Alberto pida cualquier cosa de ia.rest: código, Edge
  Functions, SQL, UI, integraciones, arquitectura, despliegue, agentes.
  Sin secretos: solo nombres de variable.
---

# ia.rest — DOCUMENTO MAESTRO (router)

**ia.rest** es el Voice POS para hostelería española (`www.iarest.es`, app en
`apps/ia-rest/` del monorepo `central`). Next.js App Router + Supabase (BD, RLS,
Edge Functions Deno) + Vercel (deploy, crons, secretos). Multi-tenant por
`restaurante_id`. Módulos: voz+Brain, KDS, QR de mesa, VeriFactu, almacén,
contabilidad, CRM/eventos, storefront, hardware bridge (impresión ESC/POS) y
agentes IA de producción (NIM/Gemini, sin Anthropic).

## 🚨 No romper / crítico

1. **BD unificada (cierre 19/08/2026):** producción vive en el COMPARTIDO
   `wswbehlcuxqxyinousql`, **schema `iarest`** — runtime POS, Edge Functions (45) y crons
   pg_cron. El proyecto viejo `efncqyvhniaxsirhdxaa` fue **BORRADO definitivamente**
   el 19/08/2026 — ya no existe; el único proyecto Supabase es `central`. TODO cliente/EF/Realtime nuevo
   DEBE fijar schema `iarest` (`db: { schema: 'iarest' }`; Realtime `schema: 'iarest'` y la
   tabla añadida a la publication `supabase_realtime`). NUNCA desplegar functions ni aplicar
   SQL al proyecto viejo.
2. **Sesión firmada HMAC:** TODA ruta nueva que emita sesión DEBE envolverla con
   `firmarSesion()` (app) o `firmarObjeto()` (portales). Con `SESSION_ENFORCE=true` las
   sesiones sin firma → 401. NUNCA `x-session-token` ni `sesiones_activas` directas.
3. **Multi-tenant:** SIEMPRE filtrar por `restaurante_id`. `comanda_items` exige
   `nombre` + `restaurante_id` (RLS) o el INSERT falla/viola RLS.
4. **Impresión:** NUNCA llamar `/api/marchar` tras `/api/comanda` — el courier ya genera
   el push marchar; llamarlo DUPLICA la impresión (guard dedup 30s).
5. **`comandas.estado` valores exactos:** `'nueva' | 'en_cocina' | 'lista' | 'entregada'
   | 'cancelada' | 'cerrada' | 'cuenta_pedida' | 'pendiente_confirmacion'`. NO existen
   `'pendiente'`, `'abierta'`, `'en_curso'` (CHECK constraint falla).
6. **VeriFactu:** NUNCA borrar de `facturas_verifactu` (rompe la cadena de hash SHA-256;
   anular = factura rectificativa). Fechas obligatorias APLAZADAS a 2027 (RD-ley 15/2025)
   — no comunicar "2026" como fecha límite.
7. **Secretos:** NUNCA commitear valores — solo nombres de variable. Valores en Vercel
   env / Supabase secrets / `.env.local` (gitignored). Si se cuela uno: rotarlo.
8. **Git/deploy:** pre-push obligatorio `npx tsc --noEmit` con 0 errores. NUNCA
   `git pull --rebase` (pierde archivos nuevos).
9. **Turnos (2 tipos):** servicio = `.is('camarero_id', null)` + `.maybeSingle()`;
   fichaje = `.eq('camarero_id', uuid)`. NUNCA `.eq('camarero_id', null)` ni `.single()`.
10. **IA:** NUNCA llamar NIM/Gemini directo desde componentes/API routes — siempre
    `lib/ai-client.ts`. Límite ~60s en funciones Vercel de ia-rest: generaciones largas
    → modelo rápido `meta/llama-3.1-8b-instruct`. ASR = Groq Whisper, NUNCA NIM.

## ÍNDICE de references/

**Lee SOLO el archivo de references/ que necesite la tarea; no los cargues todos.**

| Archivo | Secciones | Cuándo leerlo |
|---|---|---|
| `references/contexto-y-fuentes.md` | 0 (mapa de fuentes GitHub/Supabase/Vercel/Drive) + 1 (contexto core: secretos, infra, stack IA, roles, cocina central, materiales, PATRONES CRÍTICOS, git/deploy, design system, módulos en prod, tablas BD, EFs, crons, pendientes, pricing) | Dudas de dónde vive algo, arquitectura/infra general, o antes de escribir cualquier código de la app |
| `references/modulos-qr-verifactu.md` | 2 (módulo QR de mesa) + 3 (módulo VeriFactu) | Al tocar pedidos/cobro QR (`/q/[token]`, `qr-*`) o facturación AEAT (`verifactu-sign`, facturas, IVA) |
| `references/supabase-y-hardware.md` | 4 (patrones Supabase/Next.js: 401, RLS, EF, migraciones, Realtime, RPCs) + 5 (Hardware Bridge: impresoras ESC/POS, bridge-local.js, Cashdro, CloudPRNT) | Antes de API routes, Edge Functions o migraciones SQL; o al tocar impresión/bridge/hardware |
| `references/agentes-setup-git.md` | 6 (agentes IA de producción: dónde viven, crons, estado) + 7 (setup de secretos y entorno local, `.env.example`) + 8 (flujo de commit/push) | Al trabajar con agentes/crons, configurar envs o subir cambios a GitHub |
