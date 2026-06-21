'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const CATEGORIAS = ['ALQUILER','LIMPIEZA','MANTENIMIENTO','SUMINISTROS','COMUNIDAD','SEGURO','IMPUESTOS','PLATAFORMAS','MOBILIARIO','REFORMAS','OTRO'];
const PROPS = [
  { id: 'prop_busto_reform',      name: 'Busto Reform' },
  { id: 'prop_duplex_center',     name: 'Duplex Center' },
  { id: 'prop_house_sevillana',   name: 'House Sevillana' },
  { id: 'prop_luxury_busto',      name: 'Luxury Busto' },
  { id: 'prop_multi_apartamentos',name: 'Gastos compartidos' },
  { id: 'prop_personal',          name: 'Personal (no pisos)' },
];
const PROP_NAMES: Record<string,string> = Object.fromEntries(PROPS.map(p => [p.id, p.name]));
const CAT_COLORS: Record<string,string> = {
  ALQUILER: 'bg-teal-100 text-teal-800',
  LIMPIEZA: 'bg-blue-100 text-blue-800', MANTENIMIENTO: 'bg-orange-100 text-orange-800',
  SUMINISTROS: 'bg-yellow-100 text-yellow-800', COMUNIDAD: 'bg-purple-100 text-purple-800',
  SEGURO: 'bg-green-100 text-green-800', IMPUESTOS: 'bg-red-100 text-red-800',
  PLATAFORMAS: 'bg-pink-100 text-pink-800', MOBILIARIO: 'bg-indigo-100 text-indigo-800',
  REFORMAS: 'bg-amber-100 text-amber-800', OTRO: 'bg-[#FFFFFF] text-[#9898A8]',
};
const YEARS  = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Gasto = {
  id: string; fecha: string; proveedor: string; concepto: string; categoria: string;
  propiedad: string; base_imponible: number | null; iva: number | null; iva_porcentaje: number | null;
  total: number; notas: string | null; drive_url: string | null; carpeta_drive: string | null;
  drive_file_name: string | null; numero_factura: string | null;
};

const emptyForm = () => ({
  fecha: new Date().toISOString().substring(0,10),
  proveedor:'', concepto:'', categoria:'OTRO', propiedad:'',
  base_imponible:'', iva_porcentaje:'21', iva:'', total:'',
  notas:'', numero_factura:'', nif_proveedor:'',
});

function ExpensesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gastos,      setGastos]      = useState<Gasto[]>([]);
  const [totalSum,    setTotalSum]    = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [extracting,  setExtracting]  = useState(false);
  const [aiSource,    setAiSource]    = useState<string | null>(null);
  const [err,         setErr]         = useState('');
  const [filterYear,  setFilterYear]  = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState('');
  const [filterProp,  setFilterProp]  = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [pendCount,   setPendCount]   = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm());

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterYear)  params.set('year',       filterYear);
      if (filterMonth) params.set('month',      filterMonth);
      if (filterProp)  params.set('propertyId', filterProp);
      if (filterCat)   params.set('category',   filterCat);
      const res  = await fetch('/api/expenses?' + params.toString());
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setGastos(data.gastos || []);
      setTotalSum(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth, filterProp, filterCat]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);
  useEffect(() => {
    fetch('/api/expenses/pendientes').then(r => r.json()).then(d => setPendCount(d.count || 0)).catch(() => {});
  }, []);
  useEffect(() => {
    if (searchParams.get('new') === '1') { setShowModal(true); router.replace('/expenses'); }
  }, [searchParams, router]);

  const calcIva = (base: string, pct: string) => {
    const b = parseFloat(base)||0; const p = parseFloat(pct)||21;
    return (b*p/100).toFixed(2);
  };

  const handleFormChange = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'base_imponible' || field === 'iva_porcentaje') {
        const base = field === 'base_imponible' ? value : prev.base_imponible;
        const pct  = field === 'iva_porcentaje'  ? value : prev.iva_porcentaje;
        if (base) {
          next.iva   = calcIva(base, pct);
          next.total = (parseFloat(base) + parseFloat(next.iva||'0')).toFixed(2);
        }
      }
      return next;
    });
  };

  // ── Auto-extracción con IA al adjuntar fichero ─────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setAiSource(null);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/expenses/parse-invoice', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Error extrayendo');
      const d = json.data || {};
      setForm(prev => ({
        ...prev,
        fecha:          d.fecha          || prev.fecha,
        proveedor:      d.proveedor      || prev.proveedor,
        concepto:       d.concepto       || prev.concepto,
        numero_factura: d.numero_factura || prev.numero_factura,
        nif_proveedor:  d.nif_proveedor  || prev.nif_proveedor,
        base_imponible: d.base_imponible != null ? String(d.base_imponible) : prev.base_imponible,
        iva_porcentaje: d.iva_porcentaje != null ? String(d.iva_porcentaje) : prev.iva_porcentaje,
        iva:            d.iva            != null ? String(d.iva)            : prev.iva,
        total:          d.total          != null ? String(d.total)          : prev.total,
        categoria:      d.categoria && CATEGORIAS.includes(d.categoria) ? d.categoria : prev.categoria,
      }));
      setAiSource(json.source === 'vision' ? '👁️ visión IA' : '📄 texto IA');
    } catch (e: any) {
      setErr('No se pudo extraer la factura automáticamente. Rellena manualmente.');
    }
    setExtracting(false);
  };

  const handleSubmit = async () => {
    if (!form.fecha || !form.total) { setErr('Fecha y total son obligatorios'); return; }
    setSaving(true); setErr('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (v) fd.append(k, v); });
      if (fileRef.current?.files?.[0]) fd.append('file', fileRef.current.files[0]);
      const res  = await fetch('/api/expenses', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error guardando');
      setShowModal(false);
      setForm(emptyForm());
      setAiSource(null);
      if (fileRef.current) fileRef.current.value = '';
      fetchGastos();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await fetch('/api/expenses', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    fetchGastos();
  };

  const fmt     = (n: number | null) => n != null ? parseFloat(String(n)).toFixed(2) + ' €' : '-';
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A2535]">Gastos</h1>
          {!loading && <p className="text-sm text-[#6B7F96]">{gastos.length} registros &bull; Total: <span className="font-semibold text-red-600">{totalSum.toFixed(2)} €</span></p>}
        </div>
        <div className="flex items-center gap-2">
          <a href="/expenses/pendientes" className={'px-3 py-2 rounded-[4px] text-sm font-medium border ' + (pendCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-gray-200 text-[#6B7F96]')}>
            🔔 Bandeja{pendCount > 0 ? ` (${pendCount})` : ''}
          </a>
          <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-[4px] text-sm font-medium flex items-center gap-1">
            <span className="text-lg leading-none">+</span> Añadir gasto
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterYear}  onChange={e => setFilterYear(e.target.value)}  className="border rounded-[4px] px-3 py-1.5 text-sm bg-[#FFFFFF]">
          <option value="">Todos los años</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border rounded-[4px] px-3 py-1.5 text-sm bg-[#FFFFFF]">
          <option value="">Todos los meses</option>
          {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={filterProp}  onChange={e => setFilterProp(e.target.value)}  className="border rounded-[4px] px-3 py-1.5 text-sm bg-[#FFFFFF]">
          <option value="">Todas las propiedades</option>
          {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterCat}   onChange={e => setFilterCat(e.target.value)}   className="border rounded-[4px] px-3 py-1.5 text-sm bg-[#FFFFFF]">
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#6B7F96]">Cargando...</div>
      ) : gastos.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📄</div>
          <p className="text-[#6B7F96]">Sin gastos registrados</p>
          <button onClick={() => setShowModal(true)} className="mt-3 text-blue-600 text-sm hover:underline">Añadir el primero</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#F4F6F9] border-b text-left text-xs text-[#6B7F96] uppercase tracking-wide">
              <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Propiedad</th><th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">IVA</th><th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2">Factura</th><th className="px-3 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {gastos.map(g => (
                <tr key={g.id} className="hover:bg-[#F4F6F9]">
                  <td className="px-3 py-2 whitespace-nowrap text-[#9898A8]">{fmtDate(g.fecha)}</td>
                  <td className="px-3 py-2 font-medium text-[#1A2535]">{g.proveedor||'-'}</td>
                  <td className="px-3 py-2 text-[#9898A8] max-w-xs truncate" title={g.concepto}>{g.concepto||'-'}</td>
                  <td className="px-3 py-2"><span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (CAT_COLORS[g.categoria]||CAT_COLORS.OTRO)}>{g.categoria}</span></td>
                  <td className="px-3 py-2 text-[#9898A8] text-xs">{PROP_NAMES[g.propiedad]||g.propiedad||'-'}</td>
                  <td className="px-3 py-2 text-right text-[#6B7F96]">{fmt(g.base_imponible)}</td>
                  <td className="px-3 py-2 text-right text-[#6B7F96]">{g.iva_porcentaje ? g.iva_porcentaje+'%' : fmt(g.iva)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#1A2535]">{fmt(g.total)}</td>
                  <td className="px-3 py-2">{g.drive_url ? <a href={g.drive_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">📎 {g.carpeta_drive||'Ver'}</a> : <span className="text-gray-300 text-xs">-</span>}</td>
                  <td className="px-3 py-2"><button onClick={() => handleDelete(g.id)} className="text-gray-300 hover:text-red-500">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] rounded-[6px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#FFFFFF] border-b px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nuevo gasto</h2>
              <button onClick={() => { setShowModal(false); setAiSource(null); }} className="text-[#6B7F96] hover:text-[#9898A8] text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-3">

              {/* ── Adjuntar factura PRIMERO con auto-extracción IA ── */}
              <div>
                <label className="block text-xs text-[#6B7F96] mb-1 font-medium">
                  Adjuntar factura (PDF/imagen)
                  {aiSource && <span className="ml-2 text-green-600 font-semibold">✨ Extraído: {aiSource}</span>}
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="w-full text-sm text-[#9898A8] file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700"
                />
                {extracting && (
                  <p className="text-xs text-blue-600 mt-1 animate-pulse">⚡ Extrayendo datos con IA...</p>
                )}
                {!extracting && !aiSource && (
                  <p className="text-xs text-[#9898A8] mt-1">Al adjuntar, la IA rellenará el formulario automáticamente</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-[#6B7F96] mb-1">Fecha *</label><input type="date" value={form.fecha} onChange={e => handleFormChange('fecha', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-[#6B7F96] mb-1">Categoría</label><select value={form.categoria} onChange={e => handleFormChange('categoria', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm bg-[#FFFFFF]">{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div><label className="block text-xs text-[#6B7F96] mb-1">Proveedor</label><input type="text" value={form.proveedor} onChange={e => handleFormChange('proveedor', e.target.value)} placeholder="Ej: Ferretería García" className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-[#6B7F96] mb-1">Concepto</label><input type="text" value={form.concepto} onChange={e => handleFormChange('concepto', e.target.value)} placeholder="Descripción del gasto" className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-[#6B7F96] mb-1">Propiedad</label><select value={form.propiedad} onChange={e => handleFormChange('propiedad', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm bg-[#FFFFFF]"><option value="">General / Compartido</option>{PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-[#6B7F96] mb-1">Base imponible</label><input type="number" step="0.01" value={form.base_imponible} onChange={e => handleFormChange('base_imponible', e.target.value)} placeholder="0.00" className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-[#6B7F96] mb-1">IVA %</label><select value={form.iva_porcentaje} onChange={e => handleFormChange('iva_porcentaje', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm bg-[#FFFFFF]"><option value="0">0%</option><option value="4">4%</option><option value="10">10%</option><option value="21">21%</option></select></div>
                <div><label className="block text-xs text-[#6B7F96] mb-1">Total *</label><input type="number" step="0.01" value={form.total} onChange={e => handleFormChange('total', e.target.value)} placeholder="0.00" className="w-full border rounded-[4px] px-3 py-2 text-sm font-semibold" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-[#6B7F96] mb-1">Nº Factura</label><input type="text" value={form.numero_factura} onChange={e => handleFormChange('numero_factura', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-[#6B7F96] mb-1">NIF Proveedor</label><input type="text" value={form.nif_proveedor} onChange={e => handleFormChange('nif_proveedor', e.target.value)} className="w-full border rounded-[4px] px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs text-[#6B7F96] mb-1">Notas</label><textarea value={form.notas} onChange={e => handleFormChange('notas', e.target.value)} rows={2} className="w-full border rounded-[4px] px-3 py-2 text-sm resize-none" /></div>

              {err && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-[4px]">{err}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowModal(false); setAiSource(null); }} className="flex-1 border border-gray-300 text-[#9898A8] px-4 py-2 rounded-[4px] text-sm hover:bg-[#F4F6F9]">Cancelar</button>
                <button onClick={handleSubmit} disabled={saving || extracting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-[4px] text-sm font-medium">
                  {saving ? 'Guardando...' : 'Guardar gasto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  return (<Suspense fallback={<div className="p-8 text-center text-[#6B7F96]">Cargando...</div>}><ExpensesContent /></Suspense>);
}
