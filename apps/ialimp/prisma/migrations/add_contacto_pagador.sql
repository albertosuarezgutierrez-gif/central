-- =====================================================================
-- Migración: contacto pagador en cliente_contactos
-- Marca cuál de los contactos es la persona pagadora / fiscal.
-- Exclusivo por cliente (como `principal`): al marcar uno, se desmarcan
-- los demás (lógica en la API de contactos).
-- El NIF/CIF fiscal sigue viviendo en `clientes` (fuente única para el
-- snapshot de factura — VeriFactu); este flag solo identifica a la
-- persona y enruta el email de facturación.
-- =====================================================================

ALTER TABLE cliente_contactos
  ADD COLUMN IF NOT EXISTS es_pagador BOOLEAN NOT NULL DEFAULT false;
