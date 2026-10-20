import Papa from 'papaparse';
import type { SalesOrder } from '../data/mockData';

export function money(amount: number, currency = 'INR') {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `₹${Math.round(amount).toLocaleString('en-IN')}`; }
}
export function number(value: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value); }
export function shortNumber(value: number) { return Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
export function pct(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`; }
export function isoToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 date system.
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]); if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(year, Number(dmy[2])-1, Number(dmy[1]));
    if (d.getFullYear() === year && d.getMonth() === Number(dmy[2])-1 && d.getDate() === Number(dmy[1])) return `${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const parsed = new Date(s); if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
}
export function safeAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₹$£,\s]/g, '').replace(/\((.*)\)/, '-$1');
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const csv = Papa.unparse(rows, { quotes: true, skipEmptyLines: true });
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
export function orderToCsv(o: SalesOrder) {
  return { order_id: o.id, order_date: o.date, status: o.status, record_type: o.type, product_service: o.product, revenue_amount: o.amount, currency: o.currency, source_channel: o.channel, data_source: o.source };
}
