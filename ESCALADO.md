# ia.rest — Umbrales de escalado

> **INSTRUCCIÓN PARA CLAUDE**: Lee este archivo al inicio de cualquier sesión de desarrollo.
> Si detectas que ia.rest ha superado alguno de estos umbrales, avisa a Alberto
> ANTES de empezar el trabajo técnico. Igual que haces con el aviso de 50 clientes
> para el fine-tuning con ia_training_log.

---

## 🟢 Estado actual (mayo 2026)
- Clientes reales: **0** (STRIPE_MODE=test)
- CI activo: lint + typecheck + build en rama `dev`
- Tests E2E: ninguno (deliberado — ver decisión abajo)

---

## Umbrales y qué activar en cada uno

### 🔵 1er cliente real
**Avisar a Alberto para:**
- Activar `STRIPE_MODE=live` en Vercel (sk_live + webhook secret live)
- Configurar `STRIPE_CLIENT_ID` + `STRIPE_WEBHOOK_SECRET_QR` → activa cobro QR
- Verificar que VeriFactu genera facturas reales con NIF/razón social del cliente
- Activar Sentry o similar para error tracking en producción

---

### 🟡 5 clientes reales
**Activar:**
- **E2E tests con Playwright** — añadir al CI los 5 flujos críticos:
  - Login por PIN (cada rol)
  - Comanda voz → aparece en KDS
  - KDS marca listo → push al camarero
  - Cobro → factura VeriFactu generada
  - Panel owner: carta + supervisor
- **Monitoring básico**: uptime check en Vercel, alertas de Edge Function failures
- Revisar límite de 100 deploys/día Vercel — considerar upgrade de plan

---

### 🟠 10 clientes reales
**Activar:**
- **Tests de Edge Functions** unitarios (brain-parse, verifactu-sign, auth-pin-validate)
- **Sentry** con alertas por email para errores críticos en producción
- **Backup manual mensual** de la BD Supabase
- Revisar plan Supabase — el free tier tiene límites de conexiones concurrentes
- Considerar dominio de email corporativo para soporte (no gmail)

---

### 🔴 20 clientes reales
**Activar:**
- **Tests de carga básicos** (k6 o Artillery) — simular 20 restaurantes con comandas simultáneas
- **CDN para assets** estáticos (imágenes de carta, APK)
- Revisar plan Vercel (límites de bandwidth y funciones)
- Documentación de onboarding para que Alberto no tenga que hacer setup manual de cada cliente

---

### 🚀 50 clientes reales
**Activar (ya preparado en BD):**
- **Fine-tuning propio** con `ia_training_log` — suficientes datos para modelo propio de interpretación de comandas hosteleras
- **API pública (#12)** — integraciones con TPV legacy, TheFork, reservas
- **Forecaster IA (#14)** — predicción de stock y demanda por restaurante
- Revisar si merece la pena **multi-región** Supabase (latencia para clientes fuera de España)
- Contratar soporte técnico externo o primer empleado

---

### 💎 100 clientes reales
**Revisar arquitectura completa:**
- Supabase Pro plan obligatorio (o self-hosted)
- Vercel Pro/Enterprise (SLA, más deploys, support)
- Separar base de datos por región si hay clientes internacionales
- Sistema de versioning de la API pública
- Proceso formal de QA antes de cada release (no solo CI)

---

## Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| No E2E en CI hasta 5 clientes | Coste de mantenimiento > riesgo con 0-4 clientes |
| STRIPE_MODE=test hasta primer cliente | No arriesgar cobros reales antes de validar con cliente |
| Sin Sentry hasta primer cliente | Sin usuarios reales, los errores los detecta Alberto directamente |
| CI básico (lint+types+build) desde ya | ROI inmediato, 0 mantenimiento, protege contra deploys rotos |

---

## Cómo saber cuántos clientes hay

```sql
-- En Supabase SQL Editor
SELECT COUNT(*) FROM restaurantes 
WHERE activo = true 
AND stripe_status = 'active';
```

O en Stripe Dashboard → Customers con suscripción activa.

---

*Última actualización: mayo 2026*
