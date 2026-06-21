'use client';
import { useState, useEffect, useCallback } from 'react';

const CATEGORIAS = ['ALQUILER','LIMPIEZA','MANTENIMIENTO','SUMINISTROS','COMUNIDAD','SEGURO','IMPUESTOS','PLATAFORMAS','MOBILIARIO','REFORMAS','OTRO'];
const PROPS = [
  { id: '',                       name: 'General / Compartido' },
  { id: 'prop_busto_reform',      name: 'Busto Reform' },
  { id: 'prop_duplex_center',     name: 'Duplex Center' },
  { id: 'prop_house_sevillana',   name: 'House Sevillana' },
  { id: 'prop_luxury_busto',      name: 'Luxury Busto' },
  { id: 'prop_multi_apartamentos',name: 'Gastos compartidos' },
  { id: 'prop_personal',          name: 'Personal (no pisos)' },
];

type Pendiente = {
  id: string; fecha: string; proveedor: string | null; numero_factura: string | null;
  concepto: string | null; categoria: string; propiedad: string | null;
  base_imponible: number | null; iva: number | null; irpf: number | null; total: number;
  drive_url: string | null; confianza: number | null; motivo_revision: string | null; origen: string | null;
};

export default function PendientesPage() {
  const [items, setItems]   = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState<string | null>(null);
  const [edits, setEdits]   = useState<Record<string, Partial<Pendiente>>>({});

  const fetchPend = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expenses/pendientes');
      const data = await res.json();
      setItems(data.pendientes || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { fetchPend(); }, [fetchPend]);

  const setField = (id: string, field: keyof Pendiente, value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const aprobar = async (it: Pendiente) => {
    setBusy(it.id);
    try {
      await fetch(`/api/expenses/pendientes/${it.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits[it.id] || {}),
      });
      setItems(prev => prev.filter(p => p.id !== it.id));
    } finally { setBusy(null); }
  };

  const descartar = async (id: string) => {
    if (!confirm('¿Descartar esta factura? Se borrará de la bandeja.')) return;
    setBusy(id);
    try {
      await fetch(`/api/expenses/pendientes/${id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(p => p.id !== id));
    } finally { setBusy(null); }
  };

  const aprobarTodo = async () => {
    if (!confirm(`¿Aprobar las ${items.length} facturas de la bandeja?`)) return;
    setBusy('all');
    for (const it of [...items]) {
      await fetch(`/api/expenses/pendientes/${it.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits[it.id] || {}),
      }).catch(() => {});
    }
    setBusy(null);
    fetchPend();
  };

  const val = (it: Pendiente, f: keyof Pendiente) => (edits[it.id]?.[f] ?? it[f] ?? '') as string | number;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2535]">Bandeja de revisión</h1>
          <p className="text-sm text-[#6B7F96]">{items.length} factura(s) por revisar &bull; <a href="/expenses" className="text-blue-600 hover:underline">← Gastos</a></p>
        </div>
        {items.length > 0 && (
          <button onClick={aprobarTodo} disabled={busy !== null} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-[4px] text-sm font-medium">
            {busy === 'all' ? 'Aprobando…' : '✓ Aprobar todo'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#6B7F96]">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-[#6B7F96]">Bandeja vacía, nada por revisar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(it => (
            <div key={it.id} className="border rounded-[6px] p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#9898A8]">{fmtDate(it.fecha)} · {it.origen || 'agente'}{it.confianza != null ? ` · conf. ${Math.round(Number(it.confianza) * 100)}%` : ''}</span>
                {it.motivo_revision && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{it.motivo_revision}</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <label className="block"><span className="text-xs text-[#6B7F96]">Proveedor</span>
                  <input value={val(it, 'proveedor')} onChange={e => setField(it.id, 'proveedor', e.target.value)} className="w-full border rounded-[4px] px-2 py-1" /></label>
                <label className="block"><span className="text-xs text-[#6B7F96]">Categoría</span>
                  <select value={val(it, 'categoria')} onChange={e => setField(it.id, 'categoria', e.target.value)} className="w-full border rounded-[4px] px-2 py-1 bg-white">{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></label>
                <label className="block"><span className="text-xs text-[#6B7F96]">Propiedad</span>
                  <select value={val(it, 'propiedad')} onChange={e => setField(it.id, 'propiedad', e.target.value)} className="w-full border rounded-[4px] px-2 py-1 bg-white">{PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label className="block"><span className="text-xs text-[#6B7F96]">Total €</span>
                  <input type="number" step="0.01" value={val(it, 'total')} onChange={e => setField(it.id, 'total', e.target.value)} className="w-full border rounded-[4px] px-2 py-1 font-semibold" /></label>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-[#9898A8] space-x-3">
                  <span>{it.concepto || '—'}</span>
                  {it.drive_url && <a href={it.drive_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">📎 Ver factura</a>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => descartar(it.id)} disabled={busy !== null} className="border border-gray-300 text-[#9898A8] px-3 py-1.5 rounded-[4px] text-sm hover:bg-[#F4F6F9]">Descartar</button>
                  <button onClick={() => aprobar(it)} disabled={busy !== null} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-3 py-1.5 rounded-[4px] text-sm font-medium">{busy === it.id ? '…' : '✓ Aprobar'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
