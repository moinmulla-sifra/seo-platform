import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Clock3,
  CloudDownload, Database, Download, ExternalLink, FileSpreadsheet, Filter, Globe2, HardDriveUpload, LayoutDashboard,
  LoaderCircle, LockKeyhole, MapPin, Menu, MessageSquareText, MoreHorizontal, MousePointerClick,
  PanelLeftClose, RefreshCw, Search, Settings2, ShieldCheck, ShoppingBag, Sparkles, Star,
  Store, Target, TrendingUp, Upload, X, Zap, Phone, type LucideIcon
} from 'lucide-react';
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import * as XLSX from 'xlsx';
import { getDemoBundle, integrationCatalog, workspaces, type DailyMetric, type Lead, type Keyword, type RecordSource, type Review, type SalesOrder, type SeoTask, type WorkspaceId } from './data/mockData';
import { downloadCsv, money, number, orderToCsv, parseDate, safeAmount } from './lib/utils';
import './index.css';

type PageId = 'overview' | 'seo' | 'local' | 'sales' | 'reviews' | 'reports' | 'integrations' | 'settings';
type RangeDays = 7 | 30 | 90;
type ToastState = { message: string; tone: 'success' | 'error' | 'info' } | null;
type ImportField = 'id' | 'date' | 'status' | 'type' | 'product' | 'amount' | 'channel';
type ImportMapping = Record<ImportField, string>;
type ImportedRow = { rowNumber: number; values: Record<string, unknown>; order: SalesOrder | null; errors: string[] };
type ImportRun = { id: string; fileName: string; date: string; total: number; imported: number; rejected: number; workspace: string };

const navSections: { id: PageId; title: string; icon: LucideIcon; group: string }[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'seo', title: 'SEO performance', icon: TrendingUp, group: 'WORKSPACE' },
  { id: 'local', title: 'Local SEO', icon: MapPin, group: 'WORKSPACE' },
  { id: 'sales', title: 'Leads & sales', icon: ShoppingBag, group: 'WORKSPACE' },
  { id: 'reviews', title: 'Reviews', icon: MessageSquareText, group: 'GROWTH' },
  { id: 'reports', title: 'Reports', icon: BarChart3, group: 'GROWTH' },
  { id: 'integrations', title: 'Data sources', icon: Database, group: 'MANAGE' },
  { id: 'settings', title: 'Settings', icon: Settings2, group: 'MANAGE' },
];
const titleByPage: Record<PageId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Your business at a glance' },
  seo: { title: 'SEO performance', subtitle: 'Understand how people find you in search' },
  local: { title: 'Local SEO', subtitle: 'Keep your local presence accurate and useful' },
  sales: { title: 'Leads & sales', subtitle: 'Bring enquiries and recorded sales together' },
  reviews: { title: 'Reviews', subtitle: 'Listen to customer feedback and plan your response' },
  reports: { title: 'Reports', subtitle: 'A clear summary you can share with your team' },
  integrations: { title: 'Data sources', subtitle: 'See what is connected and where each metric comes from' },
  settings: { title: 'Settings', subtitle: 'Configure this workspace for your business' },
};
const rangeOptions: { label: string; value: RangeDays }[] = [{ label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }, { label: 'Last 90 days', value: 90 }];

function dayString(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function subtractDays(days: number) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - days); return dayString(d); }
function inRange(date: string, range: RangeDays, previous = false) {
  const end = previous ? subtractDays(range) : dayString(new Date());
  const start = previous ? subtractDays(range * 2 - 1) : subtractDays(range - 1);
  return date >= start && date <= end;
}
function sum<T>(values: T[], picker: (value: T) => number) { return values.reduce((acc, item) => acc + picker(item), 0); }
function deltaPct(current: number | null, previous: number | null) { if (current === null || previous === null || previous <= 0) return null; return ((current - previous) / previous) * 100; }
function moneyOrMixed(value: number | null, currency: string) { return value === null ? 'Mixed currencies' : money(value, currency); }
function oneCurrency(rows: SalesOrder[], fallback: string): string | null { const codes = new Set(rows.map(row => row.currency || 'INR')); return codes.size > 1 ? null : (Array.from(codes)[0] ?? fallback); }
function chartDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }); }
function normalStatus(raw: unknown): SalesOrder['status'] | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['completed', 'complete', 'paid', 'success', 'successful', 'delivered', 'closed'].includes(value)) return 'Completed';
  if (['pending', 'open', 'processing', 'in progress', 'booked'].includes(value)) return 'Pending';
  if (['cancelled', 'canceled', 'void', 'failed'].includes(value)) return 'Cancelled';
  return null;
}
function detectMapping(headers: string[]): ImportMapping {
  const find = (patterns: RegExp[]) => headers.find(h => patterns.some(p => p.test(h))) ?? '';
  return {
    id: find([/^(order|invoice|transaction|receipt)[ _-]?(id|no|number|#)?$/, /^(id|order_id|invoice_id|txn_id)$/]),
    date: find([/date|created|time|order_dt/i]), status: find([/status|order_state|payment_state/i]),
    type: find([/type|category|kind/i]), product: find([/product|item|service|description|name/i]),
    amount: find([/amount|revenue|total|price|value|paid/i]), channel: find([/channel|source|medium|origin/i]),
  };
}
function normalizeHeader(header: unknown, index: number) {
  const value = String(header ?? '').trim(); return value || `Column ${index + 1}`;
}
function fileStamp() { return new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }); }

export default function App() {
  const [page, setPage] = useState<PageId>('overview');
  const [range, setRange] = useState<RangeDays>(30);
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>('technova');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [taskState, setTaskState] = useState<Record<string, boolean>>({});
  const [importedOrders, setImportedOrders] = useState<Record<string, SalesOrder[]>>({});
  const [importRuns, setImportRuns] = useState<ImportRun[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<Record<string, { currency: string; timezone: string; website: string; phone: string; address: string }>>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [integrationsFilter, setIntegrationsFilter] = useState('All');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [keywordIntentFilter, setKeywordIntentFilter] = useState('All intents');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesStatusFilter, setSalesStatusFilter] = useState('All statuses');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState('All ratings');
  const [leadSearch, setLeadSearch] = useState('');
  const [reviewDraft, setReviewDraft] = useState<Review | null>(null);
  const [draftText, setDraftText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'validation' | 'history'>('upload');
  const [importFileName, setImportFileName] = useState('');
  const [rawImportRows, setRawImportRows] = useState<Record<string, unknown>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState<ImportMapping>({ id: '', date: '', status: '', type: '', product: '', amount: '', channel: '' });
  const [validatedImportRows, setValidatedImportRows] = useState<ImportedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reportNote, setReportNote] = useState('');

  const bundle = useMemo(() => getDemoBundle(workspaceId), [workspaceId]);
  const settings = workspaceSettings[workspaceId] ?? { currency: bundle.business.currency, timezone: bundle.business.timezone, website: bundle.business.website, phone: bundle.business.phone, address: bundle.business.address };
  const businessView = { ...bundle.business, website: settings.website, phone: settings.phone, address: settings.address, currency: settings.currency, timezone: settings.timezone };
  const orders = useMemo(() => [...bundle.orders, ...(importedOrders[workspaceId] ?? [])], [bundle.orders, importedOrders, workspaceId]);
  const filteredDaily = useMemo(() => bundle.daily.filter(d => inRange(d.date, range)), [bundle.daily, range]);
  const previousDaily = useMemo(() => bundle.daily.filter(d => inRange(d.date, range, true)), [bundle.daily, range]);
  const currentOrders = useMemo(() => orders.filter(o => inRange(o.date, range)), [orders, range]);
  const previousOrders = useMemo(() => orders.filter(o => inRange(o.date, range, true)), [orders, range]);
  const currentLeads = useMemo(() => bundle.leads.filter(l => inRange(l.date, range)), [bundle.leads, range]);
  const importedForWorkspace = importedOrders[workspaceId] ?? [];
  const visibleOrders = useMemo(() => currentOrders.filter(o => {
    const matchesSearch = `${o.id} ${o.product} ${o.type} ${o.channel} ${o.status} ${o.source}`.toLowerCase().includes(salesSearch.toLowerCase());
    return matchesSearch && (salesStatusFilter === 'All statuses' || o.status === salesStatusFilter);
  }), [currentOrders, salesSearch, salesStatusFilter]);
  const visibleKeywords = useMemo(() => bundle.keywords.filter(k => `${k.keyword} ${k.intent} ${k.landingPage} ${k.location} ${k.device}`.toLowerCase().includes(keywordSearch.toLowerCase()) && (keywordIntentFilter === 'All intents' || k.intent === keywordIntentFilter)), [bundle.keywords, keywordSearch, keywordIntentFilter]);
  const visibleReviews = useMemo(() => bundle.reviews.filter(r => `${r.author} ${r.text} ${r.source}`.toLowerCase().includes(reviewSearch.toLowerCase()) && (reviewRatingFilter === 'All ratings' || String(r.rating) === reviewRatingFilter)), [bundle.reviews, reviewSearch, reviewRatingFilter]);
  const visibleLeads = useMemo(() => bundle.leads.filter(l => `${l.id} ${l.name} ${l.interest} ${l.source} ${l.status}`.toLowerCase().includes(leadSearch.toLowerCase()) && inRange(l.date, range)), [bundle.leads, leadSearch, range]);
  const tasks = useMemo(() => bundle.tasks.map(t => ({ ...t, done: taskState[`${workspaceId}:${t.id}`] ?? t.done })), [bundle.tasks, taskState, workspaceId]);
  const currency = settings.currency;
  const completedOrders = currentOrders.filter(o => o.status === 'Completed');
  const previousCompleted = previousOrders.filter(o => o.status === 'Completed');
  const revenueCurrency = oneCurrency(completedOrders, currency);
  const previousRevenueCurrency = oneCurrency(previousCompleted, currency);
  const revenue = revenueCurrency ? sum(completedOrders, o => o.amount) : null;
  const previousRevenue = revenueCurrency && previousRevenueCurrency === revenueCurrency ? sum(previousCompleted, o => o.amount) : null;
  const sessions = sum(filteredDaily, d => d.sessions);
  const previousSessions = sum(previousDaily, d => d.sessions);
  const clicks = sum(filteredDaily, d => d.clicks);
  const impressions = sum(filteredDaily, d => d.impressions);
  const ctr = impressions ? clicks / impressions * 100 : 0;
  const leads = currentLeads.length;
  const previousLeads = bundle.leads.filter(l => inRange(l.date, range, true)).length;
  const aov = revenue === null ? null : completedOrders.length ? revenue / completedOrders.length : 0;
  const pageMeta = titleByPage[page];

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => { setSettingsSaved(false); }, [workspaceId]);

  const notify = (message: string, tone: 'success' | 'error' | 'info' = 'info') => setToast({ message, tone });
  const navigate = (next: PageId) => { setPage(next); setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const exportOrders = (rows: SalesOrder[] = visibleOrders, filename = `${workspaceId}-sales-${range}d.csv`) => {
    downloadCsv(filename, rows.map(orderToCsv));
    notify(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} to CSV.`, 'success');
  };
  const toggleTask = (task: SeoTask) => {
    setTaskState(prev => ({ ...prev, [`${workspaceId}:${task.id}`]: !task.done }));
    notify('Checklist updated for this session only.', 'success');
  };
  const beginImport = () => {
    setShowImport(true); setImportStep('upload'); setParseError(''); setValidatedImportRows([]); setRawImportRows([]); setImportFileName('');
  };
  const openIntegrationAction = (id: string) => {
    if (id === 'csv') { beginImport(); navigate('sales'); return; }
    notify('Not configured yet. No OAuth flow started and no source data was changed.', 'info');
  };
  const handleImportFile = async (file?: File) => {
    if (!file) return;
    setImportBusy(true); setParseError(''); setValidatedImportRows([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('The workbook has no sheets.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: '', raw: true });
      if (!rows.length) throw new Error('No data rows found. Add a header row and at least one record.');
      const headers = Object.keys(rows[0]).map((h, i) => normalizeHeader(h, i));
      const normalizedRows = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key, 0), value])));
      setImportFileName(file.name); setImportHeaders(headers); setRawImportRows(normalizedRows); setImportMapping(detectMapping(headers)); setImportStep('mapping');
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'The file could not be read. Try a CSV or Excel workbook.');
    } finally { setImportBusy(false); }
  };
  const runValidation = () => {
    const currentIds = new Set(orders.map(o => o.id.toLowerCase()));
    const seen = new Set<string>();
    const rows = rawImportRows.map((values, index): ImportedRow => {
      const errors: string[] = [];
      const idValue = String(values[importMapping.id] ?? '').trim();
      const dateValue = parseDate(values[importMapping.date]);
      const status = normalStatus(values[importMapping.status]);
      const amount = safeAmount(values[importMapping.amount]);
      const product = importMapping.product ? String(values[importMapping.product] ?? '').trim() : '';
      const type = importMapping.type ? String(values[importMapping.type] ?? '').trim() : '';
      const channel = importMapping.channel ? String(values[importMapping.channel] ?? '').trim() : '';
      if (!idValue) errors.push('Missing order ID');
      else if (currentIds.has(idValue.toLowerCase())) errors.push('Order ID already exists in this workspace');
      else if (seen.has(idValue.toLowerCase())) errors.push('Duplicate order ID inside this file');
      if (idValue) seen.add(idValue.toLowerCase());
      if (!importMapping.date || !dateValue) errors.push('Missing or invalid date');
      if (!importMapping.amount || amount === null || amount < 0) errors.push('Amount must be a valid number ≥ 0');
      if (!importMapping.status || !status) errors.push('Status must be Completed, Pending or Cancelled');
      const order = errors.length ? null : {
        id: idValue, date: dateValue!, status: status!, type: type || 'Sale / service', product: product || 'Unspecified item',
        amount: amount!, channel: channel || 'Imported spreadsheet', source: 'Imported' as RecordSource, currency
      };
      return { rowNumber: index + 2, values, order, errors };
    });
    setValidatedImportRows(rows); setImportStep('validation');
  };
  const confirmImport = () => {
    const valid = validatedImportRows.filter(r => r.order).map(r => r.order!);
    if (!valid.length) { notify('There are no valid rows to import.', 'error'); return; }
    setImportedOrders(prev => ({ ...prev, [workspaceId]: [...(prev[workspaceId] ?? []), ...valid] }));
    const run: ImportRun = { id: `${Date.now()}`, fileName: importFileName, date: fileStamp(), total: validatedImportRows.length, imported: valid.length, rejected: validatedImportRows.length - valid.length, workspace: bundle.business.name };
    setImportRuns(prev => [run, ...prev]);
    setShowImport(false); setImportStep('upload'); setRawImportRows([]); setValidatedImportRows([]);
    notify(`${valid.length} records imported. Existing records were not replaced.`, 'success');
  };
  const resetDemo = () => {
    setTaskState(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${workspaceId}:`))));
    setWorkspaceSettings(prev => { const next = { ...prev }; delete next[workspaceId]; return next; });
    setSettingsSaved(false);
    notify('Demo workspace settings and task checks reset. Imported rows were kept separate and preserved.', 'success');
  };
  const updateSettings = (key: keyof typeof settings, value: string) => {
    setWorkspaceSettings(prev => ({ ...prev, [workspaceId]: { ...settings, [key]: value } })); setSettingsSaved(false);
  };
  const saveSettings = () => { setSettingsSaved(true); notify('Settings saved in this browser session only. Backend persistence is not configured.', 'success'); };
  const downloadTemplate = () => {
    downloadCsv('localpulse-sales-import-template.csv', [
      { order_id: 'STORE-1001', order_date: subtractDays(2), status: 'Completed', record_type: 'Product sale', product_service: 'Sample laptop', revenue_amount: 24999, source_channel: 'Walk-in' },
      { order_id: 'STORE-1002', order_date: subtractDays(1), status: 'Pending', record_type: 'Repair / service', product_service: 'Sample repair', revenue_amount: 1200, source_channel: 'Website form' }
    ]);
    notify('Sample CSV template downloaded.', 'success');
  };

  const chartData = filteredDaily.map(d => ({ ...d, day: chartDate(d.date), leads: currentLeads.filter(l => l.date === d.date).length }));
  const previousCompareAvailable = previousDaily.length === range;
  const visibleHistory = importRuns.filter(run => run.workspace === bundle.business.name);

  return (
    <div className="app-frame">
      <Sidebar page={page} navigate={navigate} business={businessView} compact={sidebarCompact} setCompact={setSidebarCompact} mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen} />
      <div className={`app-main ${sidebarCompact ? 'sidebar-is-compact' : ''}`}>
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageMeta.title}</strong></div>
          <div className="topbar-actions">
            <div className="workspace-switcher">
              <span className="workspace-label">Workspace</span>
              <select aria-label="Choose demo workspace" value={workspaceId} onChange={e => { setWorkspaceId(e.target.value as WorkspaceId); setKeywordSearch(''); setSalesSearch(''); setReviewSearch(''); setLeadSearch(''); }}>
                {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <ChevronDown className="select-chevron" size={14} />
            </div>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up. Connected-source alerts will appear here after setup.', 'info')}><Bell size={18} /><span className="notification-dot" /></button>
            <button className="avatar-button" aria-label="Account menu" onClick={() => navigate('settings')}>MM</button>
          </div>
        </header>
        <main className="page-content">
          <div className="page-heading-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> LOCAL BUSINESS INTELLIGENCE</div>
              <h1>{pageMeta.title}</h1>
              <p className="page-subtitle">{page === 'overview' ? `Good afternoon — here's how ${bundle.business.name} is looking.` : pageMeta.subtitle}</p>
            </div>
            <div className="heading-controls">
              <div className="demo-chip"><Sparkles size={13} /> DEMO MODE</div>
              {['overview', 'seo', 'sales', 'reports'].includes(page) && <RangeSelector range={range} onChange={setRange} />}
            </div>
          </div>
          <div className="workspace-context">
            <div className="context-business"><span className={`business-monogram ${businessView.accent}`}>{businessView.short}</span><div><strong>{businessView.name}</strong><span><MapPin size={12} /> {businessView.location}</span></div></div>
            <div className="context-right"><span className="sample-label"><span className="sample-dot" /> Sample data</span><span className="context-divider" /><span><Clock3 size={13} /> No live sync</span><button className="text-button" onClick={() => navigate('integrations')}>Manage sources <ArrowRight size={13} /></button></div>
          </div>

          {page === 'overview' && <OverviewPage business={businessView} daily={chartData} revenue={revenue} revenueCurrency={revenueCurrency} previousRevenue={previousRevenue} completedOrders={completedOrders} previousCompleted={previousCompleted} sessions={sessions} previousSessions={previousSessions} leads={leads} previousLeads={previousLeads} previousCompareAvailable={previousCompareAvailable} keywords={bundle.keywords} tasks={tasks} toggleTask={toggleTask} reviews={bundle.reviews} localActions={bundle.localActions} currency={currency} navigate={navigate} range={range} notify={notify} />}
          {page === 'seo' && <SeoPage keywords={visibleKeywords} allKeywords={bundle.keywords} daily={filteredDaily} clicks={clicks} impressions={impressions} ctr={ctr} search={keywordSearch} setSearch={setKeywordSearch} intentFilter={keywordIntentFilter} setIntentFilter={setKeywordIntentFilter} exportCsv={() => downloadCsv(`${workspaceId}-keyword-tracker.csv`, visibleKeywords.map(keywordCsv))} notify={notify} range={range} />}
          {page === 'local' && <LocalPage business={businessView} localActions={bundle.localActions} tasks={tasks} toggleTask={toggleTask} notify={notify} navigate={navigate} />}
          {page === 'sales' && <SalesPage orders={visibleOrders} allOrders={currentOrders} range={range} currentLeads={visibleLeads} allLeads={currentLeads} revenue={revenue} previousRevenue={previousRevenue} completedOrders={completedOrders} previousCompleted={previousCompleted} aov={aov} currency={currency} revenueCurrency={revenueCurrency} leadSearch={leadSearch} setLeadSearch={setLeadSearch} search={salesSearch} setSearch={setSalesSearch} statusFilter={salesStatusFilter} setStatusFilter={setSalesStatusFilter} exportOrders={exportOrders} onImport={beginImport} onTemplate={downloadTemplate} history={visibleHistory} />}
          {page === 'reviews' && <ReviewsPage reviews={visibleReviews} allReviews={bundle.reviews} search={reviewSearch} setSearch={setReviewSearch} ratingFilter={reviewRatingFilter} setRatingFilter={setReviewRatingFilter} notify={notify} onDraft={(review: Review) => { setReviewDraft(review); setDraftText(`Hi ${review.author.split(' ')[0]}, thank you for sharing your feedback. We appreciate you taking the time to let us know about your experience. We’ll use your comments to keep improving.`); }} />}
          {page === 'reports' && <ReportsPage business={businessView} range={range} revenue={revenue} revenueCurrency={revenueCurrency} completedOrders={completedOrders} sessions={sessions} clicks={clicks} leads={leads} keywords={bundle.keywords} tasks={tasks} localActions={bundle.localActions} currency={currency} note={reportNote} setNote={setReportNote} notify={notify} />}
          {page === 'integrations' && <IntegrationsPage integrations={integrationCatalog} filter={integrationsFilter} setFilter={setIntegrationsFilter} onAction={openIntegrationAction} notify={notify} />}
          {page === 'settings' && <SettingsPage business={businessView} settings={settings} updateSettings={updateSettings} saveSettings={saveSettings} saved={settingsSaved} resetDemo={resetDemo} importCount={importedForWorkspace.length} importHistoryCount={visibleHistory.length} notify={notify} />}
          <footer className="app-footer"><span>© 2026 LocalPulse</span><span><ShieldCheck size={13} /> Demo data stays separate from connected data.</span><button onClick={() => notify('This build runs locally in demo mode. OAuth and persistent storage are not configured.', 'info')}><CircleHelp size={13} /> Help & data definitions</button></footer>
        </main>
      </div>

      {showImport && <ImportModal step={importStep} setStep={setImportStep} fileName={importFileName} rawRows={rawImportRows} headers={importHeaders} mapping={importMapping} setMapping={setImportMapping} validatedRows={validatedImportRows} parseError={parseError} busy={importBusy} fileInputRef={fileInputRef} onChoose={() => fileInputRef.current?.click()} onFile={handleImportFile} onValidate={runValidation} onConfirm={confirmImport} onTemplate={downloadTemplate} onHistory={() => setImportStep('history')} history={visibleHistory} onClose={() => setShowImport(false)} />}
      {reviewDraft && <Modal title="Draft a review reply" eyebrow="SAMPLE REVIEW · NOT CONNECTED" onClose={() => setReviewDraft(null)}><div className="review-reply-source"><div className="review-avatar">{reviewDraft.author.slice(0, 1)}</div><div><strong>{reviewDraft.author}</strong><div className="stars small-stars">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} fill={i < reviewDraft.rating ? 'currentColor' : 'none'} />)}</div><p>“{reviewDraft.text}”</p></div></div><label className="field-label" htmlFor="reply-draft">Your reply draft</label><textarea id="reply-draft" className="form-textarea" rows={5} value={draftText} onChange={e => setDraftText(e.target.value)} /><div className="modal-note"><AlertCircle size={15} /> This only creates text for you to review and copy. It will not post to Google.</div><div className="modal-actions"><button className="button button-secondary" onClick={() => setReviewDraft(null)}>Close</button><button className="button button-primary" onClick={async () => { try { await navigator.clipboard.writeText(draftText); notify('Draft copied. It has not been posted.', 'success'); } catch { notify('Clipboard access was blocked. Select and copy the draft manually.', 'error'); } }}><ClipboardCheck size={15} /> Copy draft</button></div></Modal>}
      {toast && <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite"><span className="toast-icon">{toast.tone === 'success' ? <CheckCircle2 size={17} /> : toast.tone === 'error' ? <AlertCircle size={17} /> : <CircleHelp size={17} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function Sidebar({ page, navigate, business, compact, setCompact, mobileOpen, setMobileOpen }: { page: PageId; navigate: (page: PageId) => void; business: typeof workspaces[number]; compact: boolean; setCompact: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const groups = ['WORKSPACE', 'GROWTH', 'MANAGE'];
  return <>
    {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${compact ? 'compact' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><Activity size={19} strokeWidth={2.6} /></div>{!compact && <div className="brand-wordmark">local<span>pulse</span><i>•</i></div>}<button className="sidebar-toggle" title={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCompact(!compact)} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}><PanelLeftClose size={16} /></button><button className="sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="sidebar-workspace"><div className="sidebar-workspace-avatar">{business.short}</div>{!compact && <><div className="sidebar-workspace-name"><strong>{business.name}</strong><span>Demo workspace</span></div><ChevronDown size={14} /></>}</div>
      <div className="sidebar-nav">
        {groups.map(group => <div className="nav-group" key={group}><div className="nav-group-title">{!compact && group}</div>{navSections.filter(n => n.group === group).map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} title={compact ? item.title : undefined} onClick={() => navigate(item.id)}><Icon size={18} strokeWidth={page === item.id ? 2.2 : 1.8} /><span>{item.title}</span>{item.id === 'integrations' && !compact && <span className="nav-state-dot" />}</button>; })}</div>)}
      </div>
      {!compact && <div className="sidebar-bottom"><div className="plan-card"><div className="plan-card-icon"><Zap size={15} /></div><div><strong>Demo workspace</strong><p>Explore all core flows</p></div><span className="plan-badge">FREE</span><div className="plan-progress"><span /></div></div><button className="sidebar-help" onClick={() => navigate('settings')}><CircleHelp size={16} /><span>Help & settings</span><ArrowRight size={14} /></button><div className="sidebar-user"><div className="user-avatar">MM</div><div className="user-info"><strong>Workspace owner</strong><span>Demo account</span></div><MoreHorizontal size={18} /></div></div>}
      {compact && <button className="compact-avatar" onClick={() => navigate('settings')} aria-label="Open settings">MM</button>}
    </aside>
  </>;
}

function RangeSelector({ range, onChange }: { range: RangeDays; onChange: (range: RangeDays) => void }) {
  return <div className="range-selector"><CalendarDays size={15} /><select aria-label="Select date range" value={range} onChange={e => onChange(Number(e.target.value) as RangeDays)}>{rangeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={13} /></div>;
}

function KPI({ title, value, change, source, detail, icon: Icon, tint = 'blue' }: { title: string; value: string; change?: number | null; source: string; detail: string; icon: LucideIcon; tint?: string }) {
  return <article className="kpi-card"><div className="kpi-top"><span>{title}</span><span className={`kpi-icon tint-${tint}`}><Icon size={18} /></span></div><div className="kpi-value-row"><strong>{value}</strong>{change !== undefined && change !== null && <span className={`kpi-change ${change >= 0 ? 'positive' : 'negative'}`}>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(1)}%</span>}</div><div className="kpi-foot"><span>{change === undefined ? 'No comparison available' : change === null ? 'No previous data' : 'vs previous period'}</span><span className="kpi-source" title={source}>{source}</span></div><div className="kpi-detail">{detail}</div></article>;
}
function SectionCard({ title, subtitle, children, action, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <section className={`section-card ${className}`}><div className="section-card-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="section-card-action">{action}</div>}</div>{children}</section>;
}
function SamplePill({ label = 'Sample data' }: { label?: string }) { return <span className="sample-pill"><span />{label}</span>; }
function PageEmpty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function TableEmpty({ colspan, label }: { colspan: number; label: string }) { return <tr><td colSpan={colspan}><div className="table-empty"><Search size={17} /><span>{label}</span></div></td></tr>; }

function OverviewPage({ business, daily, revenue, revenueCurrency, previousRevenue, completedOrders, previousCompleted, sessions, previousSessions, leads, previousLeads, previousCompareAvailable, keywords, tasks, toggleTask, reviews, localActions, currency, navigate, range, notify }: any) {
  const chart = daily.map((d: DailyMetric) => ({ ...d, day: chartDate(d.date) }));
  const completedLeads = leads;
  return <>
    <div className="notice-banner"><div className="notice-icon"><Sparkles size={16} /></div><div><strong>You’re exploring LocalPulse in demo mode</strong><span>Every metric below is fictional sample data. Connect an authorized source to replace it with your business data.</span></div><button onClick={() => navigate('integrations')}>View data sources <ArrowRight size={14} /></button></div>
    <div className="kpi-grid four-col">
      <KPI title="Recorded revenue" value={moneyOrMixed(revenue, revenueCurrency ?? currency)} change={deltaPct(revenue, previousRevenue)} source="Sample POS / sales import" detail={`${completedOrders.length} completed orders · ${range} days`} icon={ShoppingBag} tint="blue" />
      <KPI title="Completed orders" value={number(completedOrders.length)} change={deltaPct(completedOrders.length, previousCompleted.length)} source="Sample POS / sales import" detail="Completed records only · no lead counted as an order" icon={ClipboardCheck} tint="teal" />
      <KPI title="Organic sessions" value={number(sessions)} change={previousCompareAvailable ? deltaPct(sessions, previousSessions) : null} source="GA4-style sample adapter" detail="Website sessions · not connected to Google Analytics" icon={MousePointerClick} tint="violet" />
      <KPI title="Recorded leads" value={number(completedLeads)} change={deltaPct(completedLeads, previousLeads)} source="Sample CRM / enquiry list" detail="Enquiries in range · separate from orders" icon={Target} tint="amber" />
    </div>
    <div className="overview-grid main-chart-grid">
      <SectionCard title="Traffic & enquiries" subtitle={`Daily activity for the last ${range} days`} action={<SamplePill />} className="traffic-card">
        <div className="chart-legend"><span><i className="legend-dot legend-sessions" /> Organic sessions <small>GA4 · sample</small></span><span><i className="legend-dot legend-clicks" /> Search clicks <small>GSC · sample</small></span><span><i className="legend-dot legend-leads" /> Recorded leads <small>CRM · sample</small></span></div>
        <div className="chart-wrap traffic-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ top: 12, right: 2, bottom: 0, left: -14 }}>
          <defs><linearGradient id="sessionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6277e8" stopOpacity={0.22} /><stop offset="100%" stopColor="#6277e8" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#edf0f6" /><XAxis dataKey="day" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={25} /><YAxis yAxisId="traffic" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={42} /><YAxis yAxisId="leads" orientation="right" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={26} allowDecimals={false} /><Tooltip content={<ChartTooltip />} />
          <Area yAxisId="traffic" type="monotone" dataKey="sessions" name="Organic sessions" stroke="#6679e9" strokeWidth={2.2} fill="url(#sessionFill)" activeDot={{ r: 4 }} /><Line yAxisId="traffic" type="monotone" dataKey="clicks" name="Search clicks" stroke="#18a999" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /><Line yAxisId="leads" type="monotone" dataKey="leads" name="Recorded leads" stroke="#e5a04e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </ComposedChart></ResponsiveContainer></div><div className="chart-bottom-note"><span><span className="note-dot" /> Demo time series — no Google connection</span><button className="text-button" onClick={() => navigate('seo')}>Explore SEO <ArrowRight size={13} /></button></div>
      </SectionCard>
      <SectionCard title="SEO audit status" subtitle="Technical checks for your website" action={<span className="status-pill status-neutral">Not run</span>} className="audit-card">
        <div className="audit-empty-art"><div className="audit-art-circle"><Globe2 size={29} /></div><span className="audit-orbit orbit-one" /><span className="audit-orbit orbit-two" /><span className="audit-art-spark spark-one"><Sparkles size={13} /></span><span className="audit-art-spark spark-two"><Check size={12} /></span></div>
        <h3>No site audit yet</h3><p>LocalPulse hasn't crawled this website. We won't report broken links or technical errors until a scanner is configured.</p>
        <button className="button button-secondary button-full" onClick={() => notify('A real crawl/audit service is not configured. No checks were run.', 'info')}>Audit setup details <ArrowRight size={14} /></button>
        <div className="audit-footer"><span><span className="status-dot grey" /> No crawl data</span><span>Website <strong>{business.website}</strong></span></div>
      </SectionCard>
    </div>
    <div className="overview-grid lower-grid">
      <SectionCard title="Keyword snapshot" subtitle="Tracked search terms · illustrative positions" action={<button className="text-button" onClick={() => navigate('seo')}>View all <ArrowRight size={13} /></button>}>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Keyword</th><th>Position</th><th>Change</th><th>Location</th></tr></thead><tbody>{keywords.slice(0, 5).map((k: Keyword) => <tr key={k.id}><td><div className="keyword-cell"><strong>{k.keyword}</strong><span>{k.intent}</span></div></td><td><span className="position-pill">#{k.position}</span></td><td><Movement current={k.position} previous={k.previousPosition} /></td><td>{k.location}</td></tr>)}</tbody></table></div>
        <div className="table-source"><SamplePill label="Demo keyword tracker" /><span>Not a live Google ranking</span></div>
      </SectionCard>
      <SectionCard title="Local profile activity" subtitle="Individual interaction types · not unique leads" action={<button className="text-button" onClick={() => navigate('local')}>Local SEO <ArrowRight size={13} /></button>}>
        <div className="local-metric-grid"><LocalMetric icon={Globe2} title="Profile views" value={number(localActions.profileViews)} change="Sample" /><LocalMetric icon={MousePointerClick} title="Website clicks" value={number(localActions.websiteClicks)} change="Sample" /><LocalMetric icon={Phone} title="Call clicks" value={number(localActions.calls)} change="Sample" /><LocalMetric icon={MapPin} title="Direction requests" value={number(localActions.directions)} change="Sample" /></div>
        <div className="source-footnote"><AlertCircle size={13} /> Illustrative metrics only. Google Business Profile is not connected.</div>
      </SectionCard>
      <SectionCard title="Recent reviews" subtitle="A small sample of customer feedback" action={<button className="text-button" onClick={() => navigate('reviews')}>All reviews <ArrowRight size={13} /></button>}>
        <div className="review-summary"><div className="review-rating-number">4.0<span>/5</span></div><div><div className="stars"><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star /></div><span className="review-count">3 illustrative reviews</span></div><SamplePill /></div>
        <div className="review-mini-list">{reviews.slice(0, 2).map((r: Review) => <div className="review-mini" key={r.id}><div className="review-avatar">{r.author.slice(0, 1)}</div><div className="review-mini-body"><div className="review-mini-top"><strong>{r.author}</strong><span>{r.rating}.0 <Star size={11} fill="currentColor" /></span></div><p>{r.text}</p></div></div>)}</div>
      </SectionCard>
    </div>
    <SectionCard title="Recommended next actions" subtitle="Small improvements to work through over time" action={<span className="tasks-count">{tasks.filter((t: SeoTask) => t.done).length} of {tasks.length} completed</span>} className="tasks-card">
      <div className="task-list">{tasks.slice(0, 5).map((task: SeoTask) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />)}</div><div className="task-footer"><span><CheckCircle2 size={14} /> Checklist state is session-only in this demo.</span><button className="text-button" onClick={() => navigate('local')}>Open action plan <ArrowRight size={13} /></button></div>
    </SectionCard>
    <div className="bottom-data-note"><Database size={15} /><span><strong>Data clarity, by design.</strong> The figures shown here are fictional demo records, not live Google metrics. Sales come from sample order rows, and enquiries are stored separately.</span><button onClick={() => navigate('integrations')}>See source status</button></div>
  </>;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((p: any) => <div key={p.dataKey}><i style={{ background: p.color }} />{p.name}<b>{number(Number(p.value ?? 0))}</b></div>)}</div>;
}
function Movement({ current, previous }: { current: number; previous: number }) {
  const delta = previous - current;
  if (delta === 0) return <span className="movement flat"><ArrowRight size={13} /> —</span>;
  return <span className={`movement ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta)}</span>;
}
function LocalMetric({ icon: Icon, title, value, change }: { icon: LucideIcon; title: string; value: string; change: string }) { return <div className="local-metric"><div className="local-metric-icon"><Icon size={15} /></div><div><span>{title}</span><strong>{value}</strong></div><small>{change}</small></div>; }
function TaskRow({ task, onToggle }: { task: SeoTask; onToggle: () => void }) { return <div className={`task-row ${task.done ? 'task-done' : ''}`}><button className={`task-check ${task.done ? 'checked' : ''}`} onClick={onToggle} aria-label={`${task.done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}>{task.done && <Check size={13} />}</button><div className="task-main"><strong>{task.title}</strong><span>{task.description}</span></div><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span className="task-category">{task.category}</span></div>; }
function keywordCsv(k: Keyword) { return { keyword: k.keyword, intent: k.intent, current_position_demo: k.position, previous_position_demo: k.previousPosition, movement_demo: k.previousPosition - k.position, landing_page_demo: k.landingPage, location_demo: k.location, device_demo: k.device, sample_clicks: k.clicks, sample_impressions: k.impressions, source: 'Synthetic demo data; not a live Google ranking' }; }

function SeoPage({ keywords, allKeywords, daily, clicks, impressions, ctr, search, setSearch, intentFilter, setIntentFilter, exportCsv, notify, range }: any) {
  const chart = daily.map((d: DailyMetric) => ({ ...d, day: chartDate(d.date) }));
  const avgPosition = averageNum(allKeywords.map((k: Keyword) => k.position));
  const intents: string[] = ['All intents', ...Array.from(new Set<string>((allKeywords as Keyword[]).map((k: Keyword) => k.intent)))];
  return <>
    <div className="notice-banner compact-notice"><div className="notice-icon"><Search size={16} /></div><div><strong>Search Console preview · demo only</strong><span>Search Console is not connected. Values below follow provider definitions but are synthetic and do not represent real performance.</span></div><button onClick={() => notify('Connect Google Search Console with approved OAuth access to fetch live property data.', 'info')}>Connection details <ArrowRight size={14} /></button></div>
    <div className="kpi-grid four-col"><KPI title="Search clicks" value={number(clicks)} source="Google Search Console · sample" detail={`${range}-day sum of search clicks`} icon={MousePointerClick} tint="blue" /><KPI title="Impressions" value={number(impressions)} source="Google Search Console · sample" detail="Times a result was shown in search" icon={Globe2} tint="violet" /><KPI title="Click-through rate" value={`${ctr.toFixed(2)}%`} source="Clicks ÷ impressions · sample" detail="Calculated from the displayed sample totals" icon={TrendingUp} tint="teal" /><KPI title="Average position" value={avgPosition.toFixed(1)} source="Sample query tracker" detail="Illustrative mean of listed sample positions; not GSC aggregate" icon={Target} tint="amber" /></div>
    <SectionCard title="Search visibility trend" subtitle={`Daily Search Console-style sample · last ${range} days`} action={<SamplePill />}>
      <div className="chart-legend"><span><i className="legend-dot legend-sessions" /> Clicks</span><span><i className="legend-dot legend-clicks" /> Impressions</span></div><div className="chart-wrap seo-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ top: 12, right: 6, bottom: 0, left: -10 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#edf0f6" /><XAxis dataKey="day" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={25} /><YAxis yAxisId="left" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={42} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={36} /><Tooltip content={<ChartTooltip />} /><Area yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#a3acef" fill="#eff1ff" strokeWidth={1.8} /><Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#6679e9" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div><div className="chart-bottom-note"><span><span className="note-dot" /> No previous-period live data is available in this demo.</span><button className="text-button" onClick={() => notify('Keyword volume is not available from Search Console. Add your own list or configure a permitted research provider.', 'info')}>About keyword volume <CircleHelp size={13} /></button></div>
    </SectionCard>
    <SectionCard title="Keyword tracker" subtitle="Current and prior positions are fictional examples" action={<button className="button button-secondary button-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>}>
      <div className="table-toolbar"><div className="search-input-wrap"><Search size={16} /><input aria-label="Search keywords" placeholder="Search keyword, page or location…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-wrap"><Filter size={15} /><select aria-label="Filter keyword intent" value={intentFilter} onChange={e => setIntentFilter(e.target.value)}>{intents.map((i: string) => <option key={i}>{i}</option>)}</select></div><span className="toolbar-count">{keywords.length} keywords</span></div>
      <div className="table-scroll"><table className="data-table wide-table"><thead><tr><th>Keyword</th><th>Intent</th><th>Position</th><th>Previous</th><th>Movement</th><th>Location / device</th><th>Landing page</th><th>Source / updated</th></tr></thead><tbody>{keywords.length ? keywords.map((k: Keyword) => <tr key={k.id}><td><strong>{k.keyword}</strong></td><td><span className="soft-badge">{k.intent}</span></td><td><span className="position-pill">#{k.position}</span></td><td>{k.previousPosition}</td><td><Movement current={k.position} previous={k.previousPosition} /></td><td><span>{k.location}</span><small className="cell-subtext">{k.device}</small></td><td><span className="mono-link">{new URL(k.landingPage).pathname}</span></td><td><span className="source-pill">Sample tracker</span><small className="cell-subtext">Not fetched live</small></td></tr>) : <TableEmpty colspan={8} label="No keywords match those filters." />}</tbody></table></div>
      <div className="table-footer"><span>Demo records only · positions are not actual Google rankings.</span><span>Showing {keywords.length} of {allKeywords.length}</span></div>
    </SectionCard>
    <div className="overview-grid two-col-grid"><SectionCard title="Queries & landing pages" subtitle="Illustrative rows until Search Console is connected" action={<SamplePill />}><div className="table-scroll"><table className="data-table"><thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th></tr></thead><tbody>{keywords.slice(0, 5).map((k: Keyword) => <tr key={k.id}><td><div className="keyword-cell"><strong>{k.landingPage.split('/').pop() || 'home'}</strong><span>{k.keyword}</span></div></td><td>{k.clicks}</td><td>{number(k.impressions)}</td><td>{(k.clicks / Math.max(k.impressions, 1) * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></SectionCard><SectionCard title="Technical site audit" subtitle="No crawler configured" action={<span className="status-pill status-neutral">Audit not run</span>}><PageEmpty icon={Globe2} title="No crawl results yet" text="Indexability, metadata, broken links, image alt text, speed and mobile usability are not checked in this build." action={<button className="button button-secondary" onClick={() => notify('A crawler and Core Web Vitals integration must be configured before audit results can appear.', 'info')}>What needs setup? <ArrowRight size={14} /></button>} /></SectionCard></div>
  </>;
}
function averageNum(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function LocalPage({ business, localActions, tasks, toggleTask, notify, navigate }: any) {
  const completeness = [{ title: 'Business name', value: business.name, done: true }, { title: 'Address', value: business.address, done: true }, { title: 'Phone number', value: business.phone, done: true }, { title: 'Website', value: business.website, done: true }, { title: 'Opening hours', value: 'Not entered', done: false }, { title: 'Primary category', value: business.category, done: true }, { title: 'Service areas', value: business.serviceAreas.join(', '), done: true }];
  return <>
    <div className="notice-banner compact-notice"><div className="notice-icon"><MapPin size={16} /></div><div><strong>Profile state: demo only · not connected</strong><span>These details are sample workspace settings. No Google Business Profile was accessed or updated.</span></div><button onClick={() => navigate('integrations')}>Connect a source <ArrowRight size={14} /></button></div>
    <div className="kpi-grid four-col"><KPI title="Profile views" value={number(localActions.profileViews)} source="GBP-style sample" detail="Illustrative profile interactions" icon={Globe2} tint="blue" /><KPI title="Call clicks" value={number(localActions.calls)} source="GBP-style sample" detail="Clicks are not confirmed calls" icon={Phone} tint="teal" /><KPI title="Direction requests" value={number(localActions.directions)} source="GBP-style sample" detail="Not a count of visits to the store" icon={MapPin} tint="violet" /><KPI title="Website clicks" value={number(localActions.websiteClicks)} source="GBP-style sample" detail="Separate from website sessions" icon={MousePointerClick} tint="amber" /></div>
    <div className="overview-grid two-col-grid"><SectionCard title="Business profile details" subtitle="Name, address and contact information (sample)" action={<span className="status-pill status-neutral">Not connected</span>}><div className="profile-preview"><div className="profile-preview-head"><div className="profile-store-icon"><Store size={21} /></div><div><h3>{business.name}</h3><p>{business.category}</p><span className="source-pill">Demo profile</span></div></div><div className="profile-detail-list"><ProfileDetail icon={MapPin} title="Address" value={business.address} /><ProfileDetail icon={Phone} title="Phone" value={business.phone} /><ProfileDetail icon={Globe2} title="Website" value={business.website} /><ProfileDetail icon={MapPin} title="Service areas" value={business.serviceAreas.join(' · ')} /></div><button className="button button-secondary button-full" onClick={() => navigate('settings')}>Edit workspace details <ArrowRight size={14} /></button></div></SectionCard>
      <SectionCard title="Profile completeness" subtitle="Workspace fields only — this is not a Google listing check" action={<span className="completeness-value">{Math.round(completeness.filter(i => i.done).length / completeness.length * 100)}%</span>}><div className="completeness-bar"><span style={{ width: `${completeness.filter(i => i.done).length / completeness.length * 100}%` }} /></div><div className="checklist-detail-list">{completeness.map(item => <div className={`checklist-detail ${item.done ? 'complete' : ''}`} key={item.title}><span className="checklist-icon">{item.done ? <Check size={13} /> : <AlertCircle size={13} />}</span><div><strong>{item.title}</strong><small>{item.value}</small></div><span className="checklist-state">{item.done ? 'Entered' : 'Missing'}</span></div>)}</div><div className="source-footnote"><AlertCircle size={13} /> Completeness does not imply anything was saved to Google.</div></SectionCard></div>
    <div className="overview-grid two-col-grid"><SectionCard title="Local visibility tracker" subtitle="No configured rank grid or third-party source" action={<span className="status-pill status-neutral">Not configured</span>}><PageEmpty icon={Target} title="No verified local rankings" text="Local rankings can vary by search location. A legitimate third-party data source or an implemented grid tracker is needed before rankings can be shown." action={<button className="button button-secondary" onClick={() => navigate('integrations')}>Review data sources <ArrowRight size={14} /></button>} /></SectionCard><SectionCard title="Directory consistency" subtitle="Citation listings have not been checked" action={<span className="status-pill status-neutral">Not checked</span>}><div className="directory-list">{['Google Business Profile', 'Bing Places', 'Apple Business Connect', 'Relevant local directories'].map(name => <div className="directory-row" key={name}><div className="directory-icon"><Globe2 size={16} /></div><div><strong>{name}</strong><span>No listing check performed</span></div><span className="status-pill status-neutral">Pending</span></div>)}</div><div className="source-footnote"><LockKeyhole size={13} /> No listings were searched or modified.</div></SectionCard></div>
    <SectionCard title="Open action plan" subtitle="Session-only checklist to prepare your local presence" action={<span className="tasks-count">{tasks.filter((t: SeoTask) => t.done).length}/{tasks.length} done</span>}><div className="task-list">{tasks.map((task: SeoTask) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />)}</div><div className="task-footer"><span><CheckCircle2 size={14} /> Completion updates last for this session only.</span><button className="text-button" onClick={() => notify('Task persistence requires an authenticated backend.', 'info')}>Persistence status <ArrowRight size={13} /></button></div></SectionCard>
  </>;
}
function ProfileDetail({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) { return <div className="profile-detail"><Icon size={15} /><span>{title}</span><strong>{value}</strong></div>; }

function SalesPage({ orders, allOrders, range, currentLeads, allLeads, revenue, previousRevenue, completedOrders, previousCompleted, aov, currency, revenueCurrency, leadSearch, setLeadSearch, search, setSearch, statusFilter, setStatusFilter, exportOrders, onImport, onTemplate, history }: any) {
  const leadCount = allLeads.length;
  const qualified = allLeads.filter((l: Lead) => l.status === 'Qualified').length;
  const oneSalesCurrency = oneCurrency(completedOrders, currency);
  const typeMix = oneSalesCurrency ? Object.entries(completedOrders.reduce((acc: Record<string, number>, o: SalesOrder) => { acc[o.type] = (acc[o.type] || 0) + o.amount; return acc; }, {})).sort((a, b) => Number(b[1]) - Number(a[1])) : [];
  return <>
    <div className="notice-banner compact-notice"><div className="notice-icon"><FileSpreadsheet size={16} /></div><div><strong>Sales are sourced from recorded order rows</strong><span>No revenue is inferred from website visits. Imported rows are tagged separately from fictional demo orders.</span></div><button onClick={onImport}><Upload size={14} /> Import data</button></div>
    <div className="kpi-grid four-col"><KPI title="Recorded revenue" value={moneyOrMixed(revenue, revenueCurrency ?? currency)} change={deltaPct(revenue, previousRevenue)} source="Sample / imported orders" detail={`${completedOrders.length} completed records`} icon={ShoppingBag} tint="blue" /><KPI title="Completed orders" value={number(completedOrders.length)} change={deltaPct(completedOrders.length, previousCompleted.length)} source="Order rows only" detail="Pending and cancelled excluded" icon={ClipboardCheck} tint="teal" /><KPI title="Average order value" value={moneyOrMixed(aov, revenueCurrency ?? currency)} source="Revenue ÷ completed orders" detail="Calculated from displayed order records" icon={BarChart3} tint="violet" /><KPI title="Leads / enquiries" value={number(leadCount)} source="Sample CRM list" detail={`${qualified} qualified · separate from orders`} icon={Target} tint="amber" /></div>
    <div className="sales-workspace-grid"><SectionCard title="Revenue & orders" subtitle="Recorded order dates; no marketing attribution implied" action={<SamplePill />}><div className="chart-legend"><span><i className="legend-dot legend-sessions" /> Revenue {revenueCurrency ? `(${revenueCurrency})` : '(mixed currencies)'}</span><span><i className="legend-dot legend-clicks" /> Order count</span></div><div className="chart-wrap sales-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={aggregateSalesSeries(allOrders, range)} margin={{ top: 12, right: 4, bottom: 0, left: -10 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#edf0f6" /><XAxis dataKey="day" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} /><YAxis yAxisId="rev" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={45} /><YAxis yAxisId="orders" orientation="right" tick={{ fill: '#8792a8', fontSize: 11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#6679e9" radius={[4,4,0,0]} maxBarSize={18} /><Line yAxisId="orders" dataKey="orders" name="Completed orders" stroke="#18a999" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div><div className="chart-bottom-note"><span><span className="note-dot" /> Demo rows and imported rows may both appear.</span><span className="source-pill">Not attributed to SEO</span></div></SectionCard><SectionCard title="Revenue by record type" subtitle="Completed orders only" action={<SamplePill />}><div className="category-breakdown">{typeMix.map(([name, value]) => <div className="category-row" key={name}><div className="category-row-head"><span>{name}</span><strong>{money(Number(value), oneSalesCurrency ?? currency)}</strong></div><div className="category-bar"><span style={{ width: `${Math.max(4, Number(value) / Math.max(...typeMix.map(t => Number(t[1]))) * 100)}%` }} /></div></div>)}{!typeMix.length && <p className="muted">{completedOrders.length ? 'Category totals are hidden because this range contains multiple currencies. No conversion is applied.' : 'No completed orders in this date range.'}</p>}</div><div className="source-footnote"><AlertCircle size={13} /> Actual attribution needs reliable tracking fields and a defined attribution model.</div></SectionCard></div>
    <SectionCard title="Sales records" subtitle="Use your own spreadsheet structure with column mapping" action={<div className="header-actions"><button className="button button-secondary button-sm" onClick={onTemplate}><Download size={14} /> Template</button><button className="button button-secondary button-sm" onClick={() => exportOrders(allOrders, 'localpulse-sales-records.csv')}><Download size={14} /> Export CSV</button><button className="button button-primary button-sm" onClick={onImport}><Upload size={14} /> Import file</button></div>}>
      <div className="table-toolbar"><div className="search-input-wrap"><Search size={16} /><input aria-label="Search sales rows" placeholder="Search order, item, channel…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-wrap"><Filter size={15} /><select aria-label="Filter order status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{['All statuses', 'Completed', 'Pending', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></div><span className="toolbar-count">{orders.length} rows in selected range</span></div>
      <div className="table-scroll"><table className="data-table wide-table"><thead><tr><th>Order ID</th><th>Date</th><th>Record type / item</th><th>Status</th><th>Amount</th><th>Channel</th><th>Source</th></tr></thead><tbody>{orders.length ? orders.map((o: SalesOrder) => <tr key={`${o.source}-${o.id}`}><td><strong className="mono-cell">{o.id}</strong></td><td>{o.date}</td><td><div className="keyword-cell"><strong>{o.product}</strong><span>{o.type}</span></div></td><td><span className={`status-pill status-${o.status.toLowerCase()}`}>{o.status}</span></td><td className="amount-cell">{money(o.amount, o.currency || currency)}</td><td>{o.channel}</td><td><span className={`source-pill ${o.source === 'Imported' ? 'source-imported' : ''}`}>{o.source}</span></td></tr>) : <TableEmpty colspan={7} label="No order rows match these filters and dates." />}</tbody></table></div>
      <div className="table-footer"><span>Existing rows are never overwritten during import.</span><span>{orders.filter((o: SalesOrder) => o.source === 'Imported').length} imported records total in current workspace</span></div>
    </SectionCard>
    <div className="overview-grid two-col-grid"><SectionCard title="Enquiry funnel" subtitle="Sample CRM records, not confirmed orders" action={<SamplePill />}><div className="funnel"><FunnelStep title="Recorded enquiries" count={allLeads.length} percent={100} color="blue" /><FunnelStep title="Qualified" count={allLeads.filter((l: Lead) => l.status === 'Qualified').length} percent={allLeads.length ? allLeads.filter((l: Lead) => l.status === 'Qualified').length / allLeads.length * 100 : 0} color="teal" /><FunnelStep title="Won / converted" count={allLeads.filter((l: Lead) => l.status === 'Won').length} percent={allLeads.length ? allLeads.filter((l: Lead) => l.status === 'Won').length / allLeads.length * 100 : 0} color="amber" /></div><div className="source-footnote"><AlertCircle size={13} /> Funnel counts are sample CRM statuses. No lead is automatically counted as a sale.</div></SectionCard><SectionCard title="Recent enquiries" subtitle="Customer identifiers are minimized in this demo" action={<SamplePill />}><div className="table-toolbar"><div className="search-input-wrap"><Search size={16} /><input aria-label="Search enquiries" placeholder="Search interest, source or status…" value={leadSearch} onChange={e => setLeadSearch(e.target.value)} /></div><span className="toolbar-count">{currentLeads.length} enquiries</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Enquiry</th><th>Source</th><th>Status</th></tr></thead><tbody>{currentLeads.slice(0, 5).map((l: Lead) => <tr key={l.id}><td><div className="keyword-cell"><strong>{l.interest}</strong><span>{l.name} · {l.date}</span></div></td><td>{l.source}</td><td><span className={`status-pill status-${l.status.toLowerCase()}`}>{l.status}</span></td></tr>)}</tbody></table></div></SectionCard></div>
    <SectionCard title="Import history" subtitle="Runs created in this browser session" action={<button className="text-button" onClick={onImport}>Start new import <ArrowRight size={13} /></button>}><ImportHistoryTable history={history} /></SectionCard>
  </>;
}
function aggregateSalesSeries(orders: SalesOrder[], range: RangeDays) {
  const currencySet = new Set(orders.filter(o => inRange(o.date, range) && o.status === 'Completed').map(o => o.currency || 'INR'));
  const canSumRevenue = currencySet.size <= 1;
  const grouped = new Map<string, { revenue: number; orders: number }>();
  orders.filter(o => inRange(o.date, range) && o.status === 'Completed').forEach(o => { const d = grouped.get(o.date) ?? { revenue: 0, orders: 0 }; d.revenue += o.amount; d.orders += 1; grouped.set(o.date, d); });
  const days = Array.from({ length: range }, (_, i) => subtractDays(range - 1 - i));
  return days.map(d => ({ day: chartDate(d), revenue: canSumRevenue ? (grouped.get(d)?.revenue ?? 0) : null, orders: grouped.get(d)?.orders ?? 0 }));
}
function FunnelStep({ title, count, percent, color }: { title: string; count: number; percent: number; color: string }) { return <div className="funnel-step"><div className="funnel-title"><span>{title}</span><strong>{count}</strong></div><div className="funnel-track"><span className={`funnel-fill ${color}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div></div>; }
function ImportHistoryTable({ history }: { history: ImportRun[] }) { return <div className="table-scroll"><table className="data-table"><thead><tr><th>File</th><th>Imported at</th><th>Rows</th><th>Imported</th><th>Rejected</th><th>Workspace</th></tr></thead><tbody>{history.length ? history.map(run => <tr key={run.id}><td><div className="file-name-cell"><FileSpreadsheet size={16} /><strong>{run.fileName}</strong></div></td><td>{run.date}</td><td>{run.total}</td><td><span className="status-pill status-completed">{run.imported}</span></td><td>{run.rejected ? <span className="status-pill status-cancelled">{run.rejected}</span> : '0'}</td><td>{run.workspace}</td></tr>) : <TableEmpty colspan={6} label="No imports yet. Imported records will appear here after confirmation." />}</tbody></table></div>; }

function ReviewsPage({ reviews, allReviews, search, setSearch, ratingFilter, setRatingFilter, onDraft, notify }: any) {
  const averageRating = allReviews.length ? allReviews.reduce((n: number, r: Review) => n + r.rating, 0) / allReviews.length : 0;
  const needsReply = allReviews.filter((r: Review) => r.responseStatus === 'Needs reply').length;
  return <>
    <div className="notice-banner compact-notice"><div className="notice-icon"><MessageSquareText size={16} /></div><div><strong>Reviews are illustrative demo records</strong><span>Google Business Profile isn't connected. Reply drafting is local only and never posts a response.</span></div><button onClick={() => notify('Connect an approved review data provider before importing live reviews or posting responses.', 'info')}>Connection details <ArrowRight size={14} /></button></div>
    <div className="kpi-grid four-col"><KPI title="Average rating" value={`${averageRating.toFixed(1)} / 5`} source="3 sample review rows" detail="Computed from the shown demo records" icon={Star} tint="amber" /><KPI title="Total reviews" value={String(allReviews.length)} source="Illustrative sample" detail="Not fetched from Google" icon={MessageSquareText} tint="blue" /><KPI title="New this period" value={String(allReviews.filter((r: Review) => inRange(r.date, 30)).length)} source="Sample review dates" detail="Last 30 days · demo records" icon={TrendingUp} tint="teal" /><KPI title="Needs a reply" value={String(needsReply)} source="Sample response-status field" detail="No reply has been sent from LocalPulse" icon={ClipboardCheck} tint="violet" /></div>
    <SectionCard title="Customer feedback" subtitle="Search and filter the review examples" action={<SamplePill />}><div className="table-toolbar"><div className="search-input-wrap"><Search size={16} /><input aria-label="Search reviews" placeholder="Search reviewer or review text…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-wrap"><Filter size={15} /><select aria-label="Filter review rating" value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}>{['All ratings', '5', '4', '3', '2', '1'].map(s => <option key={s} value={s}>{s === 'All ratings' ? s : `${s} star${s === '1' ? '' : 's'}`}</option>)}</select></div><span className="toolbar-count">{reviews.length} reviews</span></div><div className="reviews-list">{reviews.length ? reviews.map((r: Review) => <article className="review-card" key={r.id}><div className="review-avatar large-review-avatar">{r.author.slice(0, 1)}</div><div className="review-card-main"><div className="review-card-top"><div><strong>{r.author}</strong><div className="review-meta"><span className="stars small-stars">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} fill={i < r.rating ? 'currentColor' : 'none'} />)}</span><span>{r.date}</span><span className="review-source-label">{r.source}</span></div></div><span className={`status-pill ${r.responseStatus === 'Replied' ? 'status-completed' : 'status-pending'}`}>{r.responseStatus}</span></div><p className="review-text">{r.text}</p><div className="review-card-bottom"><span className="sample-label"><span className="sample-dot" /> Sample content</span><button className="button button-secondary button-sm" onClick={() => onDraft(r)}><MessageSquareText size={14} /> Draft reply</button></div></div></article>) : <PageEmpty icon={MessageSquareText} title="No reviews found" text="Try changing the search or rating filter." />}</div><div className="table-footer"><span>Reply drafts are copied manually; no provider reply has been sent.</span><span>{allReviews.length} sample records</span></div></SectionCard>
    <div className="overview-grid two-col-grid"><SectionCard title="Themes to explore" subtitle="Illustrative text-based observations" action={<SamplePill label="Illustrative themes" />}><div className="theme-row"><span className="theme-marker green" /><div><strong>Helpful service advice</strong><span>Positive mention in sample text · verify against imported reviews</span></div><span className="theme-count">1</span></div><div className="theme-row"><span className="theme-marker blue" /><div><strong>Clear estimates</strong><span>Positive mention in sample text · not an AI sentiment claim</span></div><span className="theme-count">1</span></div><div className="theme-row"><span className="theme-marker amber" /><div><strong>Service timing</strong><span>Suggestion in sample text · consider clarifying turnaround times</span></div><span className="theme-count">1</span></div></SectionCard><SectionCard title="Response workflow" subtitle="Suggested review-handling routine"><div className="workflow-list"><div><span>01</span><p><strong>Read in context</strong>Check the actual customer experience before replying.</p></div><div><span>02</span><p><strong>Draft a human response</strong>Keep the reply specific, polite and accurate.</p></div><div><span>03</span><p><strong>Post in the source platform</strong>Only after verifying the review and reply.</p></div></div></SectionCard></div>
  </>;
}

function ReportsPage({ business, range, revenue, revenueCurrency, completedOrders, sessions, clicks, leads, keywords, tasks, localActions, currency, note, setNote, notify }: any) {
  const wins = keywords.filter((k: Keyword) => k.position < k.previousPosition).slice(0, 3);
  const outstanding = tasks.filter((t: SeoTask) => !t.done);
  return <>
    <div className="report-toolbar"><div><span className="eyebrow">OWNER SUMMARY</span><h2>{business.name} — performance report</h2><p>{range === 7 ? 'Last 7 days' : range === 30 ? 'Last 30 days' : 'Last 90 days'} · Prepared {fileStamp()} · Demo preview</p></div><div className="header-actions"><button className="button button-secondary" onClick={() => { downloadCsv('localpulse-report-summary.csv', [{ metric: 'Recorded revenue', value: revenue, currency: revenueCurrency ?? 'MIXED', source: 'Sample / imported order rows; no FX conversion' }, { metric: 'Completed orders', value: completedOrders.length, source: 'Sample / imported order rows' }, { metric: 'Organic sessions', value: sessions, source: 'GA4-style sample adapter' }, { metric: 'Search clicks', value: clicks, source: 'GSC-style sample adapter' }, { metric: 'Recorded leads', value: leads, source: 'Sample CRM list' }]); notify('Report data exported as CSV with source labels.', 'success'); }}><Download size={15} /> Export summary CSV</button><button className="button button-primary" onClick={() => { window.print(); notify('Use your browser print dialog to save a PDF. Demo labels remain in this report.', 'info'); }}><CloudDownload size={15} /> Print / save PDF</button></div></div>
    <div className="report-preview"><div className="report-cover"><div className="report-cover-brand"><div className="brand-mark small-brand"><Activity size={14} /></div><span>localpulse</span><SamplePill /></div><div className="report-cover-body"><span className="report-kicker">LOCAL BUSINESS PERFORMANCE</span><h1>{business.name}</h1><p>{business.category}</p><div className="report-location"><MapPin size={14} /> {business.location}</div></div><div className="report-cover-meta"><div><span>REPORTING PERIOD</span><strong>{range === 7 ? 'Last 7 days' : range === 30 ? 'Last 30 days' : 'Last 90 days'}</strong></div><div><span>DATA STATUS</span><strong><i className="sample-dot" /> Demo data — not connected</strong></div><div><span>GENERATED</span><strong>{new Date().toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })}</strong></div></div></div>
      <div className="report-content"><div className="report-section-head"><div><span className="report-section-number">01 / BUSINESS SNAPSHOT</span><h2>Key performance indicators</h2></div><SamplePill /></div><div className="report-kpi-grid"><div><span>Recorded revenue</span><strong>{moneyOrMixed(revenue, revenueCurrency ?? currency)}</strong><small>Sample / imported completed orders</small></div><div><span>Completed orders</span><strong>{completedOrders.length}</strong><small>Order rows only</small></div><div><span>Organic sessions</span><strong>{number(sessions)}</strong><small>GA4-style sample series</small></div><div><span>Search clicks</span><strong>{number(clicks)}</strong><small>GSC-style sample series</small></div></div>
        <div className="report-section-head"><div><span className="report-section-number">02 / SEARCH OPPORTUNITIES</span><h2>Keywords to review</h2></div><span className="report-annotation">Synthetic positions; not live Google rankings</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Keyword</th><th>Demo position</th><th>Prior demo position</th><th>Movement</th><th>Landing path</th></tr></thead><tbody>{wins.map((k: Keyword) => <tr key={k.id}><td><strong>{k.keyword}</strong></td><td>#{k.position}</td><td>{k.previousPosition}</td><td><Movement current={k.position} previous={k.previousPosition} /></td><td className="mono-link">{new URL(k.landingPage).pathname}</td></tr>)}{!wins.length && <TableEmpty colspan={5} label="No sample keyword movement in this view." />}</tbody></table></div>
        <div className="report-section-head"><div><span className="report-section-number">03 / LOCAL ACTIVITY</span><h2>Profile interaction examples</h2></div><SamplePill /></div><div className="report-local-grid"><div><span>Profile views</span><strong>{localActions.profileViews}</strong></div><div><span>Website clicks</span><strong>{localActions.websiteClicks}</strong></div><div><span>Call clicks</span><strong>{localActions.calls}</strong></div><div><span>Direction requests</span><strong>{localActions.directions}</strong></div></div><p className="report-disclaimer">These profile figures are illustrative sample values. Google Business Profile is not connected. Interaction types are kept separate and should not be read as unique enquiries.</p>
        <div className="report-section-head"><div><span className="report-section-number">04 / NEXT STEPS</span><h2>Outstanding actions</h2></div><span className="tasks-count">{outstanding.length} open</span></div><div className="report-task-list">{outstanding.slice(0, 5).map((t: SeoTask) => <div key={t.id}><span className={`priority-dot priority-${t.priority.toLowerCase()}`} /><div><strong>{t.title}</strong><span>{t.description}</span></div><small>{t.priority} priority</small></div>)}</div><label className="field-label" htmlFor="report-note">Owner note (optional)</label><textarea id="report-note" className="form-textarea report-note" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Add context for your team…" />
        <div className="report-source-notes"><ShieldCheck size={17} /><div><strong>Source & freshness notes</strong><p>All analytics values and review/profile examples in this report are synthetic demo data. CSV-imported sales rows, if any, are explicitly tagged as Imported. No Google source is connected, so last-sync timestamps are unavailable. No SEO attribution is claimed.</p></div></div>
      </div>
    </div>
  </>;
}

function IntegrationsPage({ integrations, filter, setFilter, onAction, notify }: any) {
  const filtered = integrations.filter((i: any) => filter === 'All' || (filter === 'Not connected' ? i.state === 'Not connected' : filter === 'Available in demo' ? i.state === 'Available in demo' : i.state === 'Future setup' ? i.state === 'Future setup' : true));
  const iconFor = (name: string): LucideIcon => ({ search: Search, chart: BarChart3, map: MapPin, file: FileSpreadsheet, sheet: FileSpreadsheet, store: Store, target: Target } as Record<string, LucideIcon>)[name] ?? Database;
  return <>
    <div className="integration-summary-banner"><div className="integration-summary-icon"><LockKeyhole size={19} /></div><div><strong>Data access stays explicit</strong><p>Unconfigured services are never shown as connected. Google connections require OAuth and approved scopes; private credentials belong on a secure server, not in the browser.</p></div><span className="secure-tag"><ShieldCheck size={14} /> Secure by default</span></div>
    <div className="integration-status-strip"><div><span className="status-dot grey" /><strong>0</strong><span>Live provider connections</span></div><div><span className="status-dot green" /><strong>1</strong><span>Available demo import flow</span></div><div><span className="status-dot grey" /><strong>—</strong><span>Last provider sync</span></div><div><span className="status-dot amber" /><strong>Demo</strong><span>Data mode</span></div></div>
    <div className="section-card plain-integration-header"><div><div><h2>Your data sources</h2><p>Review provider support, setup requirements and permissions before connecting anything.</p></div></div><div className="filter-chip-row">{['All', 'Not connected', 'Available in demo', 'Future setup'].map(v => <button key={v} className={`filter-chip ${filter === v ? 'selected' : ''}`} onClick={() => setFilter(v)}>{v}</button>)}</div></div>
    <div className="integration-grid">{filtered.map((integration: any) => { const Icon = iconFor(integration.icon); const isAvailable = integration.id === 'csv'; return <article className="integration-card" key={integration.id}><div className="integration-card-top"><div className={`integration-logo integration-logo-${integration.id}`}><Icon size={20} /></div><span className={`status-pill ${isAvailable ? 'status-completed' : integration.state === 'Future setup' ? 'status-pending' : 'status-neutral'}`}>{integration.state}</span></div><h3>{integration.name}</h3><p className="integration-description">{integration.description}</p><div className="integration-detail"><span>SUPPORTED DATA</span><p>{integration.description}</p></div><div className="integration-detail"><span>PERMISSIONS / ACCESS</span><p>{integration.scope}</p></div><div className="integration-detail"><span>SETUP REQUIREMENTS</span><p>{integration.needs}</p></div><div className="integration-last-sync"><Clock3 size={13} /> Last synced: <strong>{isAvailable ? 'On user import' : 'Never · not connected'}</strong></div><button className={`button ${isAvailable ? 'button-primary' : 'button-secondary'} button-full`} onClick={() => onAction(integration.id)}>{isAvailable ? <><Upload size={14} /> Upload a file</> : <>View setup details <ArrowRight size={14} /></>}</button></article>; })}</div>
    <div className="security-note"><ShieldCheck size={17} /><div><strong>Connection truthfulness</strong><p>This build does not start OAuth, call Google APIs, or store credentials. Provider cards are setup guides only until the backend and credentials are configured end-to-end.</p></div><button className="text-button" onClick={() => notify('See README.md for the integration readiness checklist and Supabase schema starter.', 'info')}>Implementation notes <ExternalLink size={13} /></button></div>
  </>;
}

function SettingsPage({ business, settings, updateSettings, saveSettings, saved, resetDemo, importCount, importHistoryCount, notify }: any) {
  return <>
    <div className="notice-banner compact-notice"><div className="notice-icon"><Settings2 size={16} /></div><div><strong>Workspace settings are stored in the current browser session</strong><span>Authentication and backend persistence are not configured in this demo.</span></div><span className="status-pill status-neutral">Session-only</span></div>
    <div className="settings-grid"><div className="settings-main"><SectionCard title="Business profile" subtitle="Used for labels, report headers and import currency"><div className="business-settings-header"><div className="settings-business-logo">{business.short}</div><div><h3>{business.name}</h3><p>{business.category}</p><span className="sample-label"><span className="sample-dot" /> Demo workspace</span></div><button className="button button-secondary button-sm" onClick={() => notify('Workspace renaming and creation require configured backend persistence.', 'info')}>Workspace options</button></div><div className="form-grid"><div className="form-field"><label htmlFor="business-name">Business name</label><input id="business-name" className="form-input" value={business.name} readOnly /><small>Seed business name in this demo cannot be renamed.</small></div><div className="form-field"><label htmlFor="business-website">Website</label><input id="business-website" className="form-input" value={settings.website} onChange={e => updateSettings('website', e.target.value)} /><small>Placeholder domain; not verified.</small></div><div className="form-field"><label htmlFor="business-phone">Phone</label><input id="business-phone" className="form-input" value={settings.phone} onChange={e => updateSettings('phone', e.target.value)} /></div><div className="form-field full-field"><label htmlFor="business-address">Business address</label><input id="business-address" className="form-input" value={settings.address} onChange={e => updateSettings('address', e.target.value)} /></div></div></SectionCard>
      <SectionCard title="Regional preferences" subtitle="Currency and timezone used for amounts and dates"><div className="form-grid"><div className="form-field"><label htmlFor="currency">Workspace currency</label><select id="currency" className="form-input" value={settings.currency} onChange={e => updateSettings('currency', e.target.value)}>{[['INR', 'Indian rupee (INR)'], ['USD', 'US dollar (USD)'], ['GBP', 'British pound (GBP)'], ['AED', 'UAE dirham (AED)'], ['EUR', 'Euro (EUR)']].map(([val, label]) => <option value={val} key={val}>{label}</option>)}</select><small>Imported values are treated as this workspace currency.</small></div><div className="form-field"><label htmlFor="timezone">Timezone</label><select id="timezone" className="form-input" value={settings.timezone} onChange={e => updateSettings('timezone', e.target.value)}>{[['Asia/Kolkata', 'India (Asia/Kolkata)'], ['Asia/Dubai', 'Dubai (Asia/Dubai)'], ['Europe/London', 'London (Europe/London)'], ['America/New_York', 'New York (America/New_York)'], ['America/Los_Angeles', 'Los Angeles (America/Los_Angeles)']].map(([val, label]) => <option value={val} key={val}>{label}</option>)}</select><small>India-friendly defaults are enabled.</small></div></div><div className="source-footnote"><AlertCircle size={13} /> Currency changes do not convert historical amounts. Imported rows retain the currency selected when imported; if a view contains multiple currencies, LocalPulse labels totals as mixed rather than adding unlike amounts.</div><div className="settings-actions"><button className="button button-primary" onClick={saveSettings}><Check size={15} /> Save settings</button>{saved && <span className="saved-indicator"><CheckCircle2 size={14} /> Saved in this session</span>}</div></SectionCard>
      <SectionCard title="Reports & notifications" subtitle="Demo preferences for future report delivery"><div className="setting-row"><div className="setting-row-icon"><Bell size={17} /></div><div><strong>Weekly business summary</strong><span>Delivery schedule will be available when email notifications are configured.</span></div><span className="status-pill status-neutral">Not configured</span></div><div className="setting-row"><div className="setting-row-icon"><Database size={17} /></div><div><strong>Data freshness alerts</strong><span>Alert rules require successful provider sync jobs.</span></div><span className="status-pill status-neutral">Not configured</span></div></SectionCard></div>
      <div className="settings-side"><SectionCard title="Workspace status"><div className="status-summary-list"><div><span>Workspace type</span><strong>Demo</strong></div><div><span>Authentication</span><strong>Not configured</strong></div><div><span>Provider connections</span><strong>0 live</strong></div><div><span>Imported rows</span><strong>{importCount}</strong></div><div><span>Import runs</span><strong>{importHistoryCount}</strong></div></div><button className="button button-secondary button-full" onClick={() => notify('Tenant isolation and Row Level Security need an authenticated Supabase project; see the included SQL starter.', 'info')}>View security status <ArrowRight size={14} /></button></SectionCard><SectionCard title="Demo data controls" subtitle="Keep sample and imported rows separate"><div className="reset-card"><div className="reset-icon"><RefreshCw size={18} /></div><h3>Reset demo workspace</h3><p>Resets task checks and regional/business settings to the seed defaults. Imported rows are intentionally preserved.</p><button className="button button-danger button-full" onClick={resetDemo}>Reset demo settings</button></div><div className="reset-card reset-card-muted"><div className="reset-icon"><HardDriveUpload size={18} /></div><h3>Imported data stays separate</h3><p>There are {importCount} imported order rows in this workspace. Removing them should be an explicit, reviewable action.</p><button className="button button-secondary button-full" onClick={() => notify('No bulk-delete action is enabled in this demo. Export your rows before implementing managed deletion.', 'info')}>Data handling details</button></div></SectionCard><SectionCard title="Privacy by design"><div className="privacy-list"><p><CheckCircle2 size={15} /> No Google password prompts</p><p><CheckCircle2 size={15} /> No live analytics fabricated</p><p><CheckCircle2 size={15} /> Minimal sample customer fields</p><p><CheckCircle2 size={15} /> Backend secrets stay server-side</p></div></SectionCard></div></div>
  </>;
}

function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div>{eyebrow && <span className="modal-eyebrow">{eyebrow}</span>}<h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>;
}

function ImportModal({ step, setStep, fileName, rawRows, headers, mapping, setMapping, validatedRows, parseError, busy, fileInputRef, onChoose, onFile, onValidate, onConfirm, onTemplate, onHistory, history, onClose }: any) {
  const validCount = validatedRows.filter((r: ImportedRow) => r.order).length;
  const rejectedCount = validatedRows.length - validCount;
  const fields: { key: ImportField; label: string; required: boolean; help: string }[] = [
    { key: 'id', label: 'Order ID', required: true, help: 'Must be unique within this workspace.' }, { key: 'date', label: 'Order date', required: true, help: 'YYYY-MM-DD or a recognizable date.' },
    { key: 'status', label: 'Order status', required: true, help: 'Completed, Pending or Cancelled.' }, { key: 'amount', label: 'Revenue amount', required: true, help: 'Numeric amount, without formulas.' },
    { key: 'product', label: 'Product / service', required: false, help: 'Optional; defaults to Unspecified item.' }, { key: 'type', label: 'Record type', required: false, help: 'Optional; defaults to Sale / service.' },
    { key: 'channel', label: 'Source / channel', required: false, help: 'Optional; defaults to Imported spreadsheet.' }
  ];
  return <Modal title="Import sales records" eyebrow="CSV / EXCEL IMPORT WIZARD" onClose={onClose}>
    <div className="import-stepper"><div className={['upload', 'mapping', 'validation'].includes(step) ? 'active' : ''}><span>1</span> Upload</div><i /><div className={['mapping', 'validation'].includes(step) ? 'active' : ''}><span>2</span> Map columns</div><i /><div className={step === 'validation' ? 'active' : ''}><span>3</span> Validate & import</div></div>
    {step === 'upload' && <div className="import-upload-step"><div className="drop-zone" role="button" tabIndex={0} onClick={onChoose} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onChoose(); }}><div className="upload-circle"><HardDriveUpload size={23} /></div><h3>Choose your sales spreadsheet</h3><p>CSV, XLS or XLSX · first worksheet only · parsed in this browser</p><button type="button" className="button button-primary" onClick={e => { e.stopPropagation(); onChoose(); }}><Upload size={15} /> Browse files</button><span className="upload-limit">No records are added until you confirm the import.</span></div><input ref={fileInputRef} type="file" className="hidden-file-input" accept=".csv,.xls,.xlsx" onChange={e => { const file = e.currentTarget.files?.[0]; if (file) onFile(file); e.currentTarget.value = ''; }} />{busy && <div className="inline-progress"><LoaderCircle className="spin" size={16} /> Reading spreadsheet…</div>}{parseError && <div className="error-banner"><AlertCircle size={15} />{parseError}</div>}<div className="import-help-row"><div><FileSpreadsheet size={18} /><div><strong>Need a starting point?</strong><span>Download a template with accepted columns and two sample rows.</span></div></div><button className="button button-secondary button-sm" onClick={onTemplate}><Download size={14} /> Download template</button></div><div className="import-privacy"><LockKeyhole size={14} /> The selected file is processed locally by this demo. It is not uploaded to a server.</div><button className="text-button modal-history-link" onClick={onHistory}>View previous import runs <ArrowRight size={13} /></button></div>}
    {step === 'mapping' && <div className="import-mapping-step"><div className="file-selected-banner"><FileSpreadsheet size={18} /><div><strong>{fileName}</strong><span>{rawRows.length} data rows · {headers.length} columns detected</span></div><SamplePill label="Preview only" /></div><p className="modal-intro">Match each LocalPulse field to the column in your spreadsheet. Required fields are marked. Nothing has been imported yet.</p><div className="mapping-grid">{fields.map(field => <div className="mapping-row" key={field.key}><div><label htmlFor={`map-${field.key}`}>{field.label}{field.required && <em>*</em>}</label><small>{field.help}</small></div><select id={`map-${field.key}`} className="form-input" value={mapping[field.key]} onChange={e => setMapping((prev: ImportMapping) => ({ ...prev, [field.key]: e.target.value }))}><option value="">— Not mapped —</option>{headers.map((header: string) => <option key={header} value={header}>{header}</option>)}</select></div>)}</div><div className="preview-section"><div className="preview-title"><strong>First 3 rows</strong><span>Values shown exactly as read from the sheet</span></div><div className="table-scroll preview-scroll"><table className="data-table"><thead><tr>{headers.slice(0, 6).map((h: string) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rawRows.slice(0, 3).map((row: Record<string, unknown>, i: number) => <tr key={i}>{headers.slice(0, 6).map((h: string) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>)}</tbody></table></div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setStep('upload')}>Back</button><button className="button button-primary" onClick={onValidate} disabled={!mapping.id || !mapping.date || !mapping.amount || !mapping.status}>Validate rows <ArrowRight size={15} /></button></div></div>}
    {step === 'validation' && <div className="import-validation-step"><div className="validation-summary"><div className="validation-total"><span>Rows checked</span><strong>{validatedRows.length}</strong></div><div className="validation-valid"><CheckCircle2 size={18} /><span>Valid rows</span><strong>{validCount}</strong></div><div className="validation-invalid"><AlertCircle size={18} /><span>Rejected rows</span><strong>{rejectedCount}</strong></div></div><div className="validation-notice"><ShieldCheck size={15} /> Existing order IDs were checked. Valid rows will be appended; records won't be replaced or deleted.</div><div className="table-scroll validation-table-scroll"><table className="data-table"><thead><tr><th>Row</th><th>Order ID</th><th>Date</th><th>Status</th><th>Amount</th><th>Validation</th></tr></thead><tbody>{validatedRows.map((row: ImportedRow) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{String(row.values[mapping.id] ?? '—')}</td><td>{row.order?.date ?? String(row.values[mapping.date] ?? '—')}</td><td>{row.order?.status ?? String(row.values[mapping.status] ?? '—')}</td><td>{row.order ? money(row.order.amount, row.order.currency) : String(row.values[mapping.amount] ?? '—')}</td><td>{row.errors.length ? <span className="validation-error-text"><AlertCircle size={13} />{row.errors.join('; ')}</span> : <span className="validation-ok"><CheckCircle2 size={13} /> Ready to import</span>}</td></tr>)}</tbody></table></div>{!validCount && <div className="error-banner"><AlertCircle size={15} /> No valid rows found. Go back to adjust column mapping or correct the spreadsheet.</div>}<div className="modal-actions"><button className="button button-secondary" onClick={() => setStep('mapping')}>Back to mapping</button><button className="button button-primary" onClick={onConfirm} disabled={!validCount}><Check size={15} /> Import {validCount} valid rows</button></div><p className="modal-footnote">This adds imported records to the current browser session. Backend persistence and scheduled sync are not enabled.</p></div>}
    {step === 'history' && <div className="import-history-step"><p className="modal-intro">Import runs are tracked in this browser session, grouped by workspace.</p><ImportHistoryTable history={history} /><div className="modal-actions"><button className="button button-secondary" onClick={() => setStep('upload')}>Back to upload</button><button className="button button-primary" onClick={onClose}>Done</button></div></div>}
  </Modal>;
}
