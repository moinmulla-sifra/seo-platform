import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, BarChart3, Building2,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Database, FileSpreadsheet,
  Globe2, LayoutDashboard, LoaderCircle, LogOut, MapPin, Menu, MessageSquareText,
  Plug, Plus, RefreshCw, Search, Settings2, ShieldCheck, ShoppingBag, Star,
  Upload, X, type LucideIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import './production.css';

type PageId = 'overview' | 'seo' | 'local' | 'sales' | 'reviews' | 'reports' | 'sources' | 'settings';
type Workspace = { id: string; name: string; currency: string; timezone: string; role: string };
type Business = {
  id: string; workspace_id: string; name: string; category: string | null; address: string | null;
  city: string | null; region: string | null; phone: string | null; website: string | null;
  currency: string; business_timezone: string;
};
type Order = {
  id: string; workspace_id: string; business_id: string | null; import_run_id: string | null;
  order_id: string; order_date: string; status: 'completed' | 'pending' | 'cancelled' | 'refunded';
  record_type: string; product_or_service: string | null; amount: number; currency: string;
  source_channel: string | null; source_provider: string; is_demo: boolean; created_at: string;
};
type Lead = { id: string; lead_date: string; lead_type: string; interest: string | null; source_channel: string | null; status: string; is_demo: boolean };
type Metric = { id: string; metric_date: string; provider: string; metric_type: string; metric_value: number; fetched_at: string; is_demo: boolean };
type LocalMetric = { id: string; metric_date: string; provider: string; metric_type: string; metric_value: number; fetched_at: string; is_demo: boolean };
type Review = { id: string; provider: string; reviewer_display_name: string | null; rating: number | null; review_text: string | null; review_date: string | null; response_status: string; is_demo: boolean };
type Task = { id: string; title: string; description: string | null; priority: 'low' | 'medium' | 'high'; category: string | null; status: string; is_demo: boolean };
type Keyword = { id: string; keyword: string; intent: string | null; search_location: string | null; device: string | null; landing_page: string | null; tracker_provider: string; is_demo: boolean };
type Integration = {
  id: string; workspace_id?: string; business_id?: string | null; provider: string; status: string;
  account_label?: string | null; external_property_id?: string | null; approved_scopes?: string[];
  public_config?: Record<string, unknown> | null; last_sync_at: string | null;
  last_error_code?: string | null; last_error_message: string | null;
};
type GoogleResource = { id: string; title: string; detail?: string };
type PropertyPicker = {
  provider: string; integrationId: string; resources: GoogleResource[];
  selectedId: string; spreadsheetId: string; loading: boolean; saving: boolean;
};
type GoogleSetupInfo = { missingSecrets: string[]; redirectUri: string; message: string } | null;
type ImportRun = { id: string; file_name: string; created_at: string; row_count: number; accepted_count: number; rejected_count: number; status: string };
type ImportField = 'id' | 'date' | 'status' | 'type' | 'product' | 'amount' | 'channel';
type ImportMapping = Record<ImportField, string>;
type ImportRecord = { order_id: string; order_date: string; status: Order['status']; record_type: string; product_or_service: string; amount: number; currency: string; source_channel: string };
type ValidatedRow = { rowNumber: number; raw: Record<string, unknown>; record: ImportRecord | null; errors: string[] };
type Toast = { text: string; tone: 'success' | 'error' | 'info' } | null;

const nav: { id: PageId; title: string; icon: LucideIcon; group: string }[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'seo', title: 'SEO performance', icon: Activity, group: 'WORKSPACE' },
  { id: 'local', title: 'Local SEO', icon: MapPin, group: 'WORKSPACE' },
  { id: 'sales', title: 'Leads & sales', icon: ShoppingBag, group: 'WORKSPACE' },
  { id: 'reviews', title: 'Reviews', icon: MessageSquareText, group: 'GROWTH' },
  { id: 'reports', title: 'Reports', icon: BarChart3, group: 'GROWTH' },
  { id: 'sources', title: 'Data sources', icon: Plug, group: 'MANAGE' },
  { id: 'settings', title: 'Settings', icon: Settings2, group: 'MANAGE' },
];

const providers: {
  id: string; name: string; detail: string; supported: string; scope: string;
  category: string; readiness: 'available' | 'planned' | 'experimental';
}[] = [
  // Search & indexing
  { id: 'google_search_console', name: 'Google Search Console', category: 'Search & indexing', readiness: 'available', detail: 'Google organic search performance', supported: 'Clicks, impressions, CTR, average position and query/page reports after an authorized sync. Average position is not a live rank check.', scope: 'Read-only Google OAuth; requires a verified Search Console property.' },
  { id: 'bing_webmaster', name: 'Bing Webmaster Tools', category: 'Search & indexing', readiness: 'planned', detail: 'Bing search performance', supported: 'Query and traffic statistics, crawl information, backlinks and supported URL/sitemap submissions.', scope: 'Microsoft/Bing OAuth or an API key, plus a site verified in Bing Webmaster Tools.' },
  { id: 'indexnow', name: 'IndexNow', category: 'Search & indexing', readiness: 'planned', detail: 'Notify participating search engines', supported: 'Submit new, changed or removed URLs to participating search engines. A ping does not guarantee indexing or rankings.', scope: 'Requires domain/site ownership and a correctly hosted IndexNow key file.' },

  // Analytics & behavior
  { id: 'google_analytics_4', name: 'Google Analytics 4', category: 'Analytics & behavior', readiness: 'available', detail: 'Website activity and engagement', supported: 'Sessions and selected website metrics/events supported by the current sync implementation.', scope: 'Read-only Google OAuth and access to a GA4 property.' },
  { id: 'microsoft_clarity', name: 'Microsoft Clarity', category: 'Analytics & behavior', readiness: 'planned', detail: 'Behavior insights and heatmaps', supported: 'Project dashboard insights can be exported through Clarity’s Data Export API; replay playback is not treated as a normal metrics export.', scope: 'Customer creates a Clarity project and securely grants an API token; tracking snippet must be installed on the website.' },
  { id: 'matomo_analytics', name: 'Matomo Analytics', category: 'Analytics & behavior', readiness: 'planned', detail: 'Self-hosted or cloud analytics', supported: 'Reporting API metrics from an authorized Matomo site; exact reports depend on the instance and permissions.', scope: 'Matomo site URL, site ID and a securely stored API token. Self-hosting has infrastructure costs.' },

  // Performance & technical audits
  { id: 'pagespeed_insights', name: 'PageSpeed Insights API', category: 'Performance & technical audits', readiness: 'planned', detail: 'On-demand Lighthouse audits', supported: 'Mobile/desktop lab scores, audit opportunities and diagnostics for a submitted URL.', scope: 'Google PageSpeed Insights API and controlled request quotas; this is an audit, not historical real-user data.' },
  { id: 'chrome_ux_report', name: 'Chrome UX Report (CrUX)', category: 'Performance & technical audits', readiness: 'planned', detail: 'Real-user Core Web Vitals', supported: 'Aggregated field data such as LCP, INP and CLS when Chrome has enough eligible data for the URL/origin.', scope: 'Chrome UX Report API key; some pages/origins may return no data due to eligibility/sample thresholds.' },
  { id: 'website_crawler', name: 'Technical website crawler', category: 'Performance & technical audits', readiness: 'planned', detail: 'Site structure and technical checks', supported: 'Planned crawl for HTTP status, broken links, title/H1, canonical and robots directives with per-site crawl limits.', scope: 'A secured crawler worker with rate limits, robots-aware controls, SSRF protection and site ownership validation.' },

  // Local presence
  { id: 'google_business_profile', name: 'Google Business Profile', category: 'Local presence', readiness: 'available', detail: 'Local profile performance', supported: 'Supported profile metrics and search-keyword impressions where the approved Google APIs expose them. Reviews are a separate capability.', scope: 'Official Google OAuth and Business Profile API access; some accounts need separate access approval/quota.' },
  { id: 'bing_places', name: 'Bing Places for Business', category: 'Local presence', readiness: 'planned', detail: 'Local listing management', supported: 'Planned listing status and location-management features, subject to current Microsoft API availability and permissions.', scope: 'Eligible Bing Places account and approved API access where available; not yet connected in LocalPulse.' },

  // Files & operational data
  { id: 'google_sheets', name: 'Google Sheets', category: 'Files & operational data', readiness: 'available', detail: 'Spreadsheet sales-data sync', supported: 'Read-only sheet import after field mapping, with duplicate checks and import history.', scope: 'Least-privilege Google OAuth; the customer must grant access to the selected spreadsheet.' },
  { id: 'google_drive', name: 'Google Drive', category: 'Files & operational data', readiness: 'planned', detail: 'Shared files and folder imports', supported: 'Planned file discovery/import for authorized CSV/XLSX and supported document formats.', scope: 'A separate, least-privilege Drive OAuth scope and explicit file access are required.' },
  { id: 'csv_import', name: 'CSV / Excel import', category: 'Files & operational data', readiness: 'available', detail: 'Sales and service records', supported: 'Upload CSV/XLS/XLSX files, map columns, validate rows and review import history.', scope: 'File selected by a signed-in workspace member. No third-party account password is required.' },
  { id: 'structured_file_import', name: 'JSON / Parquet imports', category: 'Files & operational data', readiness: 'planned', detail: 'Structured data uploads', supported: 'Planned JSON and Parquet ingestion for supported operational metrics and catalogs; CSV/Excel import is available now.', scope: 'File validation, size limits and schema mapping will be required before importing.' },
  { id: 'database_connectors', name: 'PostgreSQL / MySQL / SQLite', category: 'Files & operational data', readiness: 'planned', detail: 'Operational database ingestion', supported: 'Planned controlled ingestion of inventory, POS or service records. SQLite file upload is distinct from live database access.', scope: 'Live connections require encrypted credentials, network allowlists, read-only DB users and query limits.' },

  // Search demand & content platforms
  { id: 'google_trends', name: 'Google Trends (experimental)', category: 'Search demand & content', readiness: 'experimental', detail: 'Relative search-interest research', supported: 'Potential relative interest and seasonal patterns through community tooling; values are not absolute search volumes and calls may break or be rate-limited.', scope: 'pytrends is unofficial and is not a stable official Google Trends API; results must be labeled experimental.' },
  { id: 'wordpress', name: 'WordPress REST API', category: 'Search demand & content', readiness: 'planned', detail: 'WordPress content and SEO metadata', supported: 'Planned reads for published pages/posts and supported SEO plugin metadata; writes would require separate permission.', scope: 'Customer-provided site URL and application password/token stored server-side with least privilege.' },
  { id: 'strapi', name: 'Strapi CMS', category: 'Search demand & content', readiness: 'planned', detail: 'Headless CMS content', supported: 'Planned page/content metadata sync via a customer’s Strapi API.', scope: 'Customer-managed API token and read-only collection permissions where possible.' },
  { id: 'ghost_cms', name: 'Ghost CMS', category: 'Search demand & content', readiness: 'planned', detail: 'Publishing and content metadata', supported: 'Planned post/page and metadata sync using supported Ghost Admin/Content API capabilities.', scope: 'Customer-managed API credentials; only the minimum scopes needed should be granted.' },
  { id: 'cms_webhooks', name: 'Custom CMS & webhooks', category: 'Search demand & content', readiness: 'planned', detail: 'Bring your own platform', supported: 'Planned signed webhook ingestion for approved CMS, static-site and internal tool events.', scope: 'Per-workspace webhook secrets, signature checks, replay protection and payload validation.' },

  // Additional business systems
  { id: 'pos_crm', name: 'POS / CRM connectors', category: 'Business systems', readiness: 'planned', detail: 'Orders, service jobs and enquiries', supported: 'Sales records, service tickets and customer enquiries only for specifically implemented providers.', scope: 'Provider-specific OAuth/API permissions and customer-approved data mapping.' },
  { id: 'rank_review_provider', name: 'Rank tracking & review partners', category: 'Business systems', readiness: 'planned', detail: 'Optional specialist integrations', supported: 'Potential local rank grids or review workflows after selecting a provider. No rankings/reviews are fabricated when disconnected.', scope: 'Provider selection, licensing, API access, permitted review actions and any vendor fees must be checked first.' },
];;

const titles: Record<PageId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'A reliable summary of the data this workspace has provided.' },
  seo: { title: 'SEO performance', subtitle: 'Search data is shown only after an authorized source has synced.' },
  local: { title: 'Local SEO', subtitle: 'Manage business details without inventing profile insights or rankings.' },
  sales: { title: 'Leads & sales', subtitle: 'Revenue and orders come from imported or connected sales records only.' },
  reviews: { title: 'Reviews', subtitle: 'Authorized or imported review records appear here when available.' },
  reports: { title: 'Reports', subtitle: 'A transparent summary with provider, freshness and source notes.' },
  sources: { title: 'Data sources', subtitle: 'Connection state, access scope and sync freshness in one place.' },
  settings: { title: 'Settings', subtitle: 'Business profile, workspace defaults and access controls.' },
};

function todayIso() {
  const d = new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function offsetDate(days: number) {
  const date = new Date(todayIso() + 'T12:00:00+05:30');
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function inSelectedRange(date: string, days: number) {
  return date >= offsetDate(days - 1) && date <= todayIso();
}
function money(value: number | null, currency: string) {
  if (value === null) return 'Mixed currencies';
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value); }
  catch { return '₹' + Math.round(value).toLocaleString('en-IN'); }
}
function number(value: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value); }
function percent(value: number) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value) + '%'; }
function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}
function csvValue(value: unknown) {
  const s = String(value ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}
function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return false;
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const content = [headers.map(csvValue).join(','), ...rows.map(row => headers.map(key => csvValue(row[key])).join(','))].join('\r\n');
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? '').trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
  const india = s.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (india) return india[3] + '-' + india[2].padStart(2, '0') + '-' + india[1].padStart(2, '0');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function normalizedStatus(raw: unknown): Order['status'] | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['completed', 'complete', 'paid', 'success', 'successful', 'delivered', 'closed'].includes(value)) return 'completed';
  if (['pending', 'open', 'processing', 'in progress', 'booked'].includes(value)) return 'pending';
  if (['cancelled', 'canceled', 'void'].includes(value)) return 'cancelled';
  if (['refunded', 'refund'].includes(value)) return 'refunded';
  return null;
}
function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
}
function providerPickerLabel(providerId: string, selected: boolean) {
  if (providerId === 'google_sheets') return selected ? 'Change spreadsheet' : 'Select spreadsheet';
  return selected ? 'Change property' : 'Choose property';
}
function providerName(provider: string) {
  const found = providers.find(p => p.id === provider);
  return found ? found.name : provider.replace(/_/g, ' ');
}
function mapHeaders(headers: string[]): ImportMapping {
  const find = (tests: RegExp[]) => headers.find(h => tests.some(t => t.test(h))) || '';
  return {
    id: find([/order.?id|invoice.?id|transaction.?id|receipt.?id|^id$/i]),
    date: find([/order.?date|date|created.?at|timestamp/i]),
    status: find([/status|state/i]),
    type: find([/type|category|kind/i]),
    product: find([/product|item|service|description|name/i]),
    amount: find([/amount|revenue|total|price|value|paid/i]),
    channel: find([/channel|source|medium|origin/i]),
  };
}
function metricSum(rows: Metric[], provider: string, names: string[]) {
  return rows.filter(r => r.provider === provider && names.includes(r.metric_type)).reduce((v, r) => v + Number(r.metric_value || 0), 0);
}
function latestSync(rows: Integration[], provider: string) {
  return rows.filter(r => r.provider === provider && r.status === 'connected').sort((a, b) => String(b.last_sync_at || '').localeCompare(String(a.last_sync_at || '')))[0]?.last_sync_at || null;
}

export default function ProductionApp() {
  const client = supabase;
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [memberships, setMemberships] = useState<Workspace[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [localMetrics, setLocalMetrics] = useState<LocalMetric[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [importRuns, setImportRuns] = useState<ImportRun[]>([]);
  const [page, setPage] = useState<PageId>('overview');
  const [range, setRange] = useState(30);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState<Toast>(null);
  const [loadError, setLoadError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'validation' | 'history'>('upload');
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({ id: '', date: '', status: '', type: '', product: '', amount: '', channel: '' });
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [importError, setImportError] = useState('');
  const [businessForm, setBusinessForm] = useState({ name: '', category: '', address: '', city: '', region: '', phone: '', website: '' });
  const [currencyForm, setCurrencyForm] = useState('INR');
  const [timezoneForm, setTimezoneForm] = useState('Asia/Kolkata');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newCity, setNewCity] = useState('Dharwad');
  const [newWebsite, setNewWebsite] = useState('');
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordLocation, setKeywordLocation] = useState('Dharwad, Karnataka');
  const [leadForm, setLeadForm] = useState({ interest: '', source: 'Walk-in' });
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [oauthBusyProvider, setOauthBusyProvider] = useState<string | null>(null);
  const [propertyPicker, setPropertyPicker] = useState<PropertyPicker | null>(null);
  const [googleSetupInfo, setGoogleSetupInfo] = useState<GoogleSetupInfo>(null);

  const notify = (text: string, tone: 'success' | 'error' | 'info' = 'info') => setToast({ text, tone });
  const activeWorkspace = memberships.find(w => w.id === activeWorkspaceId) || null;
  const activeBusiness = businesses.find(b => b.id === businessId) || businesses[0] || null;
  const currency = activeBusiness?.currency || activeWorkspace?.currency || currencyForm || 'INR';
  const visibleOrders = useMemo(() => orders.filter(row =>
    inSelectedRange(row.order_date, range) &&
    (statusFilter === 'all' || row.status === statusFilter) &&
    (row.order_id + ' ' + (row.product_or_service || '') + ' ' + row.record_type + ' ' + (row.source_channel || '') + ' ' + row.status).toLowerCase().includes(searchText.toLowerCase())
  ), [orders, range, statusFilter, searchText]);
  const filteredOrders = useMemo(() => orders.filter(row => inSelectedRange(row.order_date, range)), [orders, range]);
  const completedOrders = filteredOrders.filter(row => row.status === 'completed');
  const completedCount = completedOrders.length;
  const orderCurrencies = new Set(completedOrders.map(row => row.currency || 'INR'));
  const orderCurrency = orderCurrencies.size === 1 ? Array.from(orderCurrencies)[0] : null;
  const currencyMismatch = orderCurrency !== null && orderCurrency !== currency;
  const revenue = orderCurrencies.size > 1 || currencyMismatch ? null : completedOrders.reduce((total, row) => total + Number(row.amount || 0), 0);
  const aov = revenue === null ? null : (completedCount ? revenue / completedCount : 0);
  const revenueLabel = orders.length ? (currencyMismatch ? 'Currency mismatch' : money(revenue, currency)) : 'No data yet';
  const aovLabel = aov === null ? (currencyMismatch ? 'Currency mismatch' : 'Mixed currencies') : (completedCount ? money(aov, currency) : 'No data yet');
  const chartOrders = filteredOrders.filter(row => (row.currency || 'INR') === currency);
  const filteredLeads = leads.filter(row => inSelectedRange(row.lead_date, range));
  const filteredMetrics = metrics.filter(row => inSelectedRange(row.metric_date, range) && !row.is_demo);
  const filteredLocalMetrics = localMetrics.filter(row => inSelectedRange(row.metric_date, range) && !row.is_demo);
  const searchClicks = metricSum(filteredMetrics, 'google_search_console', ['clicks']);
  const searchImpressions = metricSum(filteredMetrics, 'google_search_console', ['impressions']);
  const searchCtr = searchImpressions > 0 ? searchClicks / searchImpressions * 100 : 0;
  const hasSearchData = filteredMetrics.some(row => row.provider === 'google_search_console' && ['clicks', 'impressions', 'ctr', 'average_position', 'position'].includes(row.metric_type));
  const sessions = metricSum(filteredMetrics, 'google_analytics_4', ['sessions']);
  const hasSessions = filteredMetrics.some(row => row.provider === 'google_analytics_4' && row.metric_type === 'sessions');
  const sourceIntegrations = integrations.filter(row => row.status === 'connected');
  const businessMetrics: Record<string, number> = {};
  filteredLocalMetrics.forEach(row => { businessMetrics[row.metric_type] = (businessMetrics[row.metric_type] || 0) + Number(row.metric_value || 0); });
  const completedTaskCount = tasks.filter(task => task.status === 'done').length;
  const latestSearchSync = latestSync(integrations, 'google_search_console');
  const latestAnalyticsSync = latestSync(integrations, 'google_analytics_4');
  const pageMeta = titles[page];

  useEffect(() => {
    if (!client) { setSessionLoading(false); return; }
    let alive = true;
    client.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setLoadError(error.message);
      setUser(data.session?.user || null);
      setSessionLoading(false);
    }).catch(error => { if (alive) { setLoadError(error instanceof Error ? error.message : 'Unable to read sign-in session.'); setSessionLoading(false); } });
    const listener = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (!session?.user) { setPasswordRecovery(false); setMemberships([]); setActiveWorkspaceId(''); setBusinesses([]); setBusinessId(''); }
    });
    return () => { alive = false; listener.data.subscription.unsubscribe(); };
  }, [client]);

  const loadMemberships = useCallback(async (userId: string, preferredId?: string) => {
    if (!client) return;
    setWorkspaceLoading(true); setLoadError('');
    try {
      const result = await client.from('workspace_members')
        .select('workspace_id, role, workspaces(id, name, currency, timezone)')
        .eq('user_id', userId);
      if (result.error) throw result.error;
      const rows = (result.data || []) as unknown as { workspace_id: string; role: string; workspaces: Workspace | Workspace[] | null }[];
      const values: Workspace[] = rows.map(row => {
        const raw = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
        return raw ? { id: raw.id, name: raw.name, currency: raw.currency || 'INR', timezone: raw.timezone || 'Asia/Kolkata', role: row.role } : null;
      }).filter((row): row is Workspace => Boolean(row));
      setMemberships(values);
      setActiveWorkspaceId(current => {
        const wanted = preferredId || current;
        return values.some(value => value.id === wanted) ? wanted : (values[0]?.id || '');
      });
    } catch (error) {
      setLoadError('Could not load your workspaces. Confirm the LocalPulse Supabase migration has been applied and RLS policies are enabled. ' + (error instanceof Error ? error.message : 'Unknown error.'));
    } finally { setWorkspaceLoading(false); }
  }, [client]);

  useEffect(() => {
    if (!client || !user) { setMemberships([]); setActiveWorkspaceId(''); return; }
    void loadMemberships(user.id);
  }, [client, user?.id, loadMemberships]);

  useEffect(() => {
    if (!client || !user || !activeWorkspaceId) {
      setBusinesses([]); setBusinessId(''); setOrders([]); setLeads([]); setMetrics([]); setLocalMetrics([]);
      setReviews([]); setTasks([]); setKeywords([]); setIntegrations([]); setImportRuns([]);
      return;
    }
    let alive = true;
    setWorkspaceLoading(true); setLoadError('');
    const load = async () => {
      const result = await Promise.all([
        client.from('businesses').select('id,workspace_id,name,category,address,city,region,phone,website,currency,business_timezone').eq('workspace_id', activeWorkspaceId).order('created_at'),
        client.from('sales_orders').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('order_date', { ascending: false }).limit(2000),
        client.from('leads').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('lead_date', { ascending: false }).limit(1000),
        client.from('seo_metrics_daily').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('metric_date', { ascending: false }).limit(3000),
        client.from('local_profile_metrics_daily').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('metric_date', { ascending: false }).limit(1000),
        client.from('reviews').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('review_date', { ascending: false }).limit(500),
        client.from('seo_tasks').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('created_at', { ascending: false }).limit(500),
        client.from('tracked_keywords').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('created_at', { ascending: false }).limit(500),
        client.from('integrations').select('*').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: false }),
        client.from('sales_imports').select('*').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: false }).limit(50),
      ]);
      if (!alive) return;
      const fatal = result.find(item => item.error);
      if (fatal?.error) {
        setLoadError('Some workspace data could not load. Confirm the LocalPulse database migration and policies. ' + fatal.error.message);
      }
      const businessRows = (result[0].data || []) as Business[];
      setBusinesses(businessRows);
      setBusinessId(current => businessRows.some(b => b.id === current) ? current : (businessRows[0]?.id || ''));
      setOrders((result[1].data || []) as Order[]);
      setLeads((result[2].data || []) as Lead[]);
      setMetrics((result[3].data || []) as Metric[]);
      setLocalMetrics((result[4].data || []) as LocalMetric[]);
      setReviews((result[5].data || []) as Review[]);
      setTasks((result[6].data || []) as Task[]);
      setKeywords((result[7].data || []) as Keyword[]);
      setIntegrations((result[8].data || []) as Integration[]);
      setImportRuns((result[9].data || []) as ImportRun[]);
      setCurrencyForm(activeWorkspace?.currency || 'INR');
      setTimezoneForm(activeWorkspace?.timezone || 'Asia/Kolkata');
      if (businessRows[0]) {
        setBusinessForm({
          name: businessRows[0].name || '', category: businessRows[0].category || '',
          address: businessRows[0].address || '', city: businessRows[0].city || '',
          region: businessRows[0].region || '', phone: businessRows[0].phone || '',
          website: businessRows[0].website || '',
        });
      }
    };
    load().catch(error => { if (alive) setLoadError(error instanceof Error ? error.message : 'Unable to load workspace data.'); })
      .finally(() => { if (alive) setWorkspaceLoading(false); });
    return () => { alive = false; };
  }, [client, user?.id, activeWorkspaceId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_oauth');
    if (!result) return;
    const provider = params.get('provider') || 'Google';
    const message = params.get('message');
    setPage('sources');
    if (result === 'success') {
      notify(message || 'Google authorization succeeded. Choose a property and run your first sync.', 'success');
      void refreshAfterOAuth();
    } else {
      notify(message || 'Google authorization did not complete. Check the setup details and try again.', 'error');
    }
    window.history.replaceState({}, document.title, window.location.pathname);
    void provider;
  }, []);

  const signOut = async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) notify(error.message, 'error');
    else { setUser(null); notify('You have signed out.', 'success'); }
  };

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !user) return;
    const workspaceName = newWorkspaceName.trim();
    const businessName = newBusinessName.trim();
    if (!workspaceName || !businessName) { notify('Enter both a workspace name and business name.', 'error'); return; }
    setOnboardingBusy(true);
    try {
      const profile = await client.from('profiles').upsert({ id: user.id, display_name: String(user.user_metadata?.display_name || user.email || 'LocalPulse user') });
      if (profile.error) throw profile.error;
      const inserted = await client.from('workspaces').insert({
        name: workspaceName, currency: 'INR', timezone: 'Asia/Kolkata', created_by: user.id,
      }).select('id,name,currency,timezone').single();
      if (inserted.error) throw inserted.error;
      const newWs = inserted.data as { id: string; name: string; currency: string; timezone: string };
      const membership = await client.from('workspace_members').insert({ workspace_id: newWs.id, user_id: user.id, role: 'owner' });
      if (membership.error) throw membership.error;
      const businessInsert = await client.from('businesses').insert({
        workspace_id: newWs.id, name: businessName, city: newCity.trim() || null, website: newWebsite.trim() || null,
        category: 'Local business', country_code: 'IN', business_timezone: 'Asia/Kolkata', currency: 'INR',
      }).select('id').single();
      if (businessInsert.error) throw businessInsert.error;
      const businessRef = businessInsert.data as { id: string };
      const tasksToSeed = [
        { title: 'Connect Google Search Console', description: 'Authorize read-only search performance access before reporting clicks or impressions.', priority: 'high', category: 'Integrations', source: 'onboarding' },
        { title: 'Connect Google Analytics 4', description: 'Connect the correct property to report website sessions and events.', priority: 'medium', category: 'Integrations', source: 'onboarding' },
        { title: 'Import your latest sales records', description: 'Use the spreadsheet importer so revenue is based on recorded sales, not website visits.', priority: 'high', category: 'Sales data', source: 'onboarding' },
        { title: 'Verify business profile details', description: 'Confirm name, address, phone and hours before enabling local profile metrics.', priority: 'medium', category: 'Local SEO', source: 'onboarding' },
        { title: 'Add priority search keywords', description: 'Record target keywords; rankings will remain unavailable until a legitimate tracker is configured.', priority: 'low', category: 'SEO planning', source: 'onboarding' },
      ].map(task => ({ ...task, workspace_id: newWs.id, business_id: businessRef.id, status: 'open', is_demo: false }));
      const taskInsert = await client.from('seo_tasks').insert(tasksToSeed);
      if (taskInsert.error) notify('Workspace created, but starter tasks could not be saved: ' + taskInsert.error.message, 'info');
      setMemberships(current => [...current.filter(w => w.id !== newWs.id), { id: newWs.id, name: newWs.name, currency: newWs.currency, timezone: newWs.timezone, role: 'owner' }]);
      setActiveWorkspaceId(newWs.id); setBusinessId(businessRef.id);
      notify('Workspace created and saved securely.', 'success');
    } catch (error) {
      notify('Workspace setup failed: ' + (error instanceof Error ? error.message : 'Please check your Supabase schema and permissions.'), 'error');
    } finally { setOnboardingBusy(false); }
  };

  const beginImport = () => {
    setShowImport(true); setImportStep('upload'); setImportError(''); setImportFileName(''); setImportHeaders([]);
    setImportRows([]); setValidatedRows([]);
  };
  const processImportFile = async (file?: File) => {
    if (!file) return;
    setImportError(''); setValidatedRows([]);
    if (file.size > 10 * 1024 * 1024) { setImportError('Files must be 10 MB or smaller. Split large exports into smaller files.'); return; }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const first = workbook.SheetNames[0];
      if (!first) throw new Error('No worksheet was found in this file.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[first], { defval: '', raw: false });
      if (!rows.length) throw new Error('No rows found. Add a header row and at least one record.');
      if (rows.length > 500) throw new Error('This first version accepts up to 500 records per import. Split this file into smaller batches.');
      const headers = Object.keys(rows[0]).map(String);
      const normalized = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), value])));
      setImportFileName(file.name); setImportRows(normalized); setImportHeaders(headers); setMapping(mapHeaders(headers)); setImportStep('mapping');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read this spreadsheet. Try CSV, XLS or XLSX.');
    }
  };
  const validateImport = () => {
    if (!mapping.id || !mapping.date || !mapping.status || !mapping.amount) {
      setImportError('Map Order ID, Order date, Status and Revenue amount before validating.');
      return;
    }
    const existing = new Set(orders.map(order => order.order_id.toLowerCase()));
    const withinFile = new Set<string>();
    const currencyCode = currency || 'INR';
    const rows: ValidatedRow[] = importRows.map((raw, index) => {
      const errors: string[] = [];
      const id = String(raw[mapping.id] ?? '').trim();
      const date = parseDate(raw[mapping.date]);
      const status = normalizedStatus(raw[mapping.status]);
      const amountText = String(raw[mapping.amount] ?? '').trim();
      const amount = Number(amountText.replace(/[₹$€£,\s]/g, ''));
      if (!id) errors.push('Missing order ID');
      else if (existing.has(id.toLowerCase())) errors.push('Order ID already exists in this workspace');
      else if (withinFile.has(id.toLowerCase())) errors.push('Duplicate order ID in this file');
      if (id) withinFile.add(id.toLowerCase());
      if (!date) errors.push('Missing or invalid order date');
      if (!status) errors.push('Status must be completed, pending, cancelled or refunded');
      if (!amountText || !Number.isFinite(amount) || amount < 0) errors.push('Revenue must be a valid non-negative number');
      const record = errors.length ? null : {
        order_id: id, order_date: date!, status: status!, record_type: mapping.type ? String(raw[mapping.type] || '').trim() || 'sale_or_service' : 'sale_or_service',
        product_or_service: mapping.product ? String(raw[mapping.product] || '').trim() : '',
        amount, currency: currencyCode, source_channel: mapping.channel ? String(raw[mapping.channel] || '').trim() : '',
      };
      return { rowNumber: index + 2, raw, record, errors };
    });
    setValidatedRows(rows); setImportError(''); setImportStep('validation');
  };
  const confirmImport = async () => {
    if (!client || !user || !activeWorkspaceId) return;
    const accepted = validatedRows.filter(row => row.record).map(row => row.record!);
    if (!accepted.length) { setImportError('There are no valid rows to import. Fix the errors or choose a corrected file.'); return; }
    setSaving(true); setImportError('');
    let runId = '';
    try {
      const runInsert = await client.from('sales_imports').insert({
        workspace_id: activeWorkspaceId, business_id: businessId || null, file_name: importFileName,
        imported_by: user.id, row_count: validatedRows.length, accepted_count: accepted.length,
        rejected_count: validatedRows.length - accepted.length, status: 'previewed',
        field_mapping: mapping,
        error_summary: validatedRows.filter(row => row.errors.length).map(row => ({ row: row.rowNumber, errors: row.errors })),
      }).select('id').single();
      if (runInsert.error) throw runInsert.error;
      runId = String((runInsert.data as { id: string }).id);
      const payload = accepted.map(row => ({
        workspace_id: activeWorkspaceId, business_id: businessId || null, import_run_id: runId,
        order_id: row.order_id, order_date: row.order_date, status: row.status, record_type: row.record_type,
        product_or_service: row.product_or_service || null, amount: row.amount, currency: row.currency,
        source_channel: row.source_channel || 'Imported spreadsheet', source_provider: 'csv_import', is_demo: false,
      }));
      const insertedOrders = await client.from('sales_orders').insert(payload);
      if (insertedOrders.error) throw insertedOrders.error;
      const confirmed = await client.from('sales_imports').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', runId).eq('workspace_id', activeWorkspaceId);
      if (confirmed.error) throw confirmed.error;
      setShowImport(false); setImportStep('upload'); setValidatedRows([]); setImportRows([]);
      await refreshDataOnly();
      notify('Imported ' + accepted.length + ' records. Rejected rows were not written and existing records were not replaced.', 'success');
    } catch (error) {
      if (runId && client) await client.from('sales_imports').update({ status: 'failed' }).eq('id', runId).eq('workspace_id', activeWorkspaceId);
      setImportError('Import failed. No existing record was overwritten. ' + (error instanceof Error ? error.message : 'Review the mapping and try again.'));
    } finally { setSaving(false); }
  };
  const refreshDataOnly = async () => {
    if (!client || !activeWorkspaceId) return;
    const [sales, history, leadRows, taskRows, keywordRows, metricRows, localRows, reviewRows, integrationRows] = await Promise.all([
      client.from('sales_orders').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('order_date', { ascending: false }).limit(2000),
      client.from('sales_imports').select('*').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: false }).limit(50),
      client.from('leads').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('lead_date', { ascending: false }).limit(1000),
      client.from('seo_tasks').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('created_at', { ascending: false }).limit(500),
      client.from('tracked_keywords').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('created_at', { ascending: false }).limit(500),
      client.from('seo_metrics_daily').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('metric_date', { ascending: false }).limit(3000),
      client.from('local_profile_metrics_daily').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('metric_date', { ascending: false }).limit(1000),
      client.from('reviews').select('*').eq('workspace_id', activeWorkspaceId).eq('is_demo', false).order('review_date', { ascending: false }).limit(500),
      client.from('integrations').select('*').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: false }),
    ]);
    if (sales.error) throw sales.error;
    setOrders((sales.data || []) as Order[]);
    setImportRuns((history.data || []) as ImportRun[]);
    setLeads((leadRows.data || []) as Lead[]);
    setTasks((taskRows.data || []) as Task[]);
    setKeywords((keywordRows.data || []) as Keyword[]);
    setMetrics((metricRows.data || []) as Metric[]);
    setLocalMetrics((localRows.data || []) as LocalMetric[]);
    setReviews((reviewRows.data || []) as Review[]);
    setIntegrations((integrationRows.data || []) as Integration[]);
  };

  const invokeGoogle = async (body: Record<string, unknown>) => {
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.functions.invoke('google-oauth', { body });
    if (error) {
      let message = error.message || 'Google integration request failed.';
      const context = (error as unknown as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try {
          const detail = await context.json() as { error?: string; message?: string };
          if (detail.error || detail.message) message = detail.error || detail.message || message;
        } catch { /* Keep the SDK message if the response was not JSON. */ }
      }
      throw new Error(message);
    }
    return (data || {}) as Record<string, unknown>;
  };

  const refreshAfterOAuth = async () => {
    if (!client || !activeWorkspaceId) return;
    try { await refreshDataOnly(); } catch { /* The main loader will show any workspace query error. */ }
  };

  const connectGoogle = async (providerId: string) => {
    if (!client || !activeWorkspaceId) return;
    setOauthBusyProvider(providerId);
    setGoogleSetupInfo(null);
    setPropertyPicker(null);
    try {
      const result = await invokeGoogle({
        action: 'start', provider: providerId, workspaceId: activeWorkspaceId,
        businessId: businessId || null, returnOrigin: window.location.origin,
      });
      if (result.setupRequired) {
        const missing = Array.isArray(result.missingSecrets) ? result.missingSecrets.map(String) : [];
        const uri = String(result.redirectUri || '');
        setGoogleSetupInfo({
          missingSecrets: missing, redirectUri: uri,
          message: String(result.error || 'Google OAuth needs one-time server configuration.'),
        });
        notify('One-time Google OAuth setup is required. See the setup instructions above the connector cards.', 'error');
        return;
      }
      if (result.error) throw new Error(String(result.error));
      const authUrl = String(result.authorizationUrl || '');
      if (!authUrl.startsWith('https://accounts.google.com/')) throw new Error('The server did not return a valid Google authorization URL.');
      window.location.assign(authUrl);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start Google authorization.', 'error');
    } finally {
      setOauthBusyProvider(current => current === providerId ? null : current);
    }
  };

  const openPropertyPicker = async (providerId: string, integration: Integration) => {
    if (!client || !activeWorkspaceId) return;
    if (providerId === 'google_sheets') {
      setPropertyPicker({
        provider: providerId, integrationId: integration.id, resources: [],
        selectedId: '', spreadsheetId: '', loading: false, saving: false,
      });
      return;
    }
    setPropertyPicker({
      provider: providerId, integrationId: integration.id, resources: [],
      selectedId: '', spreadsheetId: '', loading: true, saving: false,
    });
    try {
      const result = await invokeGoogle({
        action: 'resources', provider: providerId, integrationId: integration.id,
        workspaceId: activeWorkspaceId, businessId: businessId || null,
      });
      if (result.error) throw new Error(String(result.error));
      const resources = Array.isArray(result.resources) ? result.resources as GoogleResource[] : [];
      setPropertyPicker(current => current?.integrationId === integration.id
        ? { ...current, resources, selectedId: resources[0]?.id || '', loading: false }
        : current);
      if (!resources.length) notify('No accessible properties were returned. Check that this Google account has access and the required API is enabled.', 'info');
    } catch (error) {
      setPropertyPicker(null);
      notify(error instanceof Error ? error.message : 'Could not list Google properties.', 'error');
    }
  };

  const saveGoogleProperty = async () => {
    if (!propertyPicker || !activeWorkspaceId) return;
    const resourceId = propertyPicker.provider === 'google_sheets'
      ? propertyPicker.spreadsheetId.trim()
      : propertyPicker.selectedId;
    if (!resourceId) { notify(propertyPicker.provider === 'google_sheets' ? 'Paste the Google Sheets spreadsheet ID or URL.' : 'Choose a Google property first.', 'error'); return; }
    setPropertyPicker(current => current ? { ...current, saving: true } : current);
    try {
      const result = await invokeGoogle({
        action: 'select_resource', provider: propertyPicker.provider,
        integrationId: propertyPicker.integrationId, workspaceId: activeWorkspaceId,
        businessId: businessId || null, resourceId,
      });
      if (result.error) throw new Error(String(result.error));
      setPropertyPicker(null);
      await refreshDataOnly();
      notify('Google property saved. Run Sync now to import its available data.', 'success');
    } catch (error) {
      setPropertyPicker(current => current ? { ...current, saving: false } : current);
      notify(error instanceof Error ? error.message : 'Could not save the selected Google property.', 'error');
    }
  };

  const syncGoogle = async (providerId: string, integration: Integration) => {
    if (!client || !activeWorkspaceId) return;
    const busyKey = providerId + ':sync';
    setOauthBusyProvider(busyKey);
    try {
      const result = await invokeGoogle({
        action: 'sync', provider: providerId, integrationId: integration.id,
        workspaceId: activeWorkspaceId, businessId: businessId || null,
      });
      if (result.error) throw new Error(String(result.error));
      const summary = result.summary as { rowsSeen?: number; rowsWritten?: number } | undefined;
      await refreshDataOnly();
      notify('Sync completed. ' + Number(summary?.rowsWritten || 0).toLocaleString('en-IN') + ' records saved from ' + providerName(providerId) + '.', 'success');
    } catch (error) {
      try { await refreshDataOnly(); } catch { /* Keep original provider error visible. */ }
      notify(error instanceof Error ? error.message : 'Google sync failed.', 'error');
    } finally {
      setOauthBusyProvider(current => current === busyKey ? null : current);
    }
  };

  const disconnectGoogle = async (providerId: string, integration: Integration) => {
    if (!client || !activeWorkspaceId) return;
    const confirmed = window.confirm('Disconnect ' + providerName(providerId) + ' from this workspace? Stored OAuth tokens will be deleted.');
    if (!confirmed) return;
    setOauthBusyProvider(providerId + ':disconnect');
    try {
      const result = await invokeGoogle({
        action: 'disconnect', provider: providerId, integrationId: integration.id,
        workspaceId: activeWorkspaceId,
      });
      if (result.error) throw new Error(String(result.error));
      await refreshDataOnly();
      notify(providerName(providerId) + ' has been disconnected.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not disconnect provider.', 'error');
    } finally {
      setOauthBusyProvider(current => current === providerId + ':disconnect' ? null : current);
    }
  };

  const handleToggleTask = async (task: Task) => {
    if (!client || !activeWorkspaceId) return;
    const next = task.status === 'done' ? 'open' : 'done';
    const result = await client.from('seo_tasks').update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', task.id).eq('workspace_id', activeWorkspaceId);
    if (result.error) { notify('Task update failed: ' + result.error.message, 'error'); return; }
    setTasks(current => current.map(item => item.id === task.id ? { ...item, status: next } : item));
    notify('Task status saved to this workspace.', 'success');
  };

  const addKeyword = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !activeWorkspaceId || !keywordInput.trim()) return;
    const result = await client.from('tracked_keywords').insert({
      workspace_id: activeWorkspaceId, business_id: businessId || null,
      keyword: keywordInput.trim(), search_location: keywordLocation.trim() || null,
      intent: 'Not classified', device: 'unknown', tracker_provider: 'user_entered', is_demo: false,
    }).select('*').single();
    if (result.error) { notify('Could not save keyword: ' + result.error.message, 'error'); return; }
    setKeywords(current => [result.data as Keyword, ...current]);
    setKeywordInput(''); notify('Keyword saved. Its ranking will remain blank until a legitimate tracker is configured.', 'success');
  };

  const addLead = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !activeWorkspaceId || !leadForm.interest.trim()) return;
    const result = await client.from('leads').insert({
      workspace_id: activeWorkspaceId, business_id: businessId || null, lead_date: todayIso(),
      lead_type: 'enquiry', interest: leadForm.interest.trim(), source_channel: leadForm.source,
      status: 'new', source_provider: 'manual_entry', is_demo: false,
    }).select('*').single();
    if (result.error) { notify('Could not save enquiry: ' + result.error.message, 'error'); return; }
    setLeads(current => [result.data as Lead, ...current]);
    setLeadForm({ interest: '', source: 'Walk-in' }); setShowLeadForm(false);
    notify('Enquiry saved as a lead—not an order.', 'success');
  };

  const saveBusinessSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !activeWorkspaceId) return;
    setSaving(true);
    try {
      const workspaceUpdate = await client.from('workspaces').update({
        currency: currencyForm, timezone: timezoneForm, updated_at: new Date().toISOString(),
      }).eq('id', activeWorkspaceId);
      if (workspaceUpdate.error) throw workspaceUpdate.error;
      if (activeBusiness) {
        const businessUpdate = await client.from('businesses').update({
          name: businessForm.name.trim(), category: businessForm.category.trim() || null,
          address: businessForm.address.trim() || null, city: businessForm.city.trim() || null,
          region: businessForm.region.trim() || null, phone: businessForm.phone.trim() || null,
          website: businessForm.website.trim() || null, currency: currencyForm,
          business_timezone: timezoneForm, updated_at: new Date().toISOString(),
        }).eq('id', activeBusiness.id).eq('workspace_id', activeWorkspaceId);
        if (businessUpdate.error) throw businessUpdate.error;
      }
      setMemberships(current => current.map(w => w.id === activeWorkspaceId ? { ...w, currency: currencyForm, timezone: timezoneForm } : w));
      if (activeBusiness) setBusinesses(current => current.map(b => b.id === activeBusiness.id ? { ...b, ...businessForm, currency: currencyForm, business_timezone: timezoneForm } : b));
      notify('Business and workspace settings saved.', 'success');
    } catch (error) {
      notify('Settings were not fully saved: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally { setSaving(false); }
  };

  if (!isSupabaseConfigured || !client) {
    return <ConfigurationNotice />;
  }
  if (sessionLoading) return <LoadingScreen label="Checking secure session…" />;
  if (passwordRecovery && user) return <PasswordUpdateScreen client={client} onSuccess={() => { setPasswordRecovery(false); notify('Password updated. You can continue using LocalPulse.', 'success'); }} onSignOut={signOut} />;
  if (!user) return <AuthScreen client={client} notify={notify} />;
  if (workspaceLoading && memberships.length === 0) return <LoadingScreen label="Loading your workspaces…" />;
  if (!activeWorkspaceId && memberships.length === 0 && loadError) return <DatabaseSetupScreen error={loadError} onRetry={() => { setLoadError(''); if (user) void loadMemberships(user.id); }} onSignOut={signOut} />;
  if (!activeWorkspaceId && memberships.length === 0) {
    return (
      <WorkspaceSetup
        user={user} busy={onboardingBusy} error={loadError}
        workspaceName={newWorkspaceName} setWorkspaceName={setNewWorkspaceName}
        businessName={newBusinessName} setBusinessName={setNewBusinessName}
        city={newCity} setCity={setNewCity} website={newWebsite} setWebsite={setNewWebsite}
        onSubmit={createWorkspace} onSignOut={signOut}
      />
    );
  }

  const exportVisibleOrders = () => {
    const ok = downloadCsv('localpulse-sales-' + range + 'd.csv', visibleOrders.map(row => ({
      order_id: row.order_id, order_date: row.order_date, status: row.status, record_type: row.record_type,
      product_or_service: row.product_or_service, amount: row.amount, currency: row.currency,
      source_channel: row.source_channel, source_provider: row.source_provider,
    })));
    if (!ok) notify('There are no visible sales rows to export yet.', 'info');
    else notify('Sales CSV downloaded.', 'success');
  };
  const exportReport = () => {
    const rows = [
      { metric: 'Completed revenue', value: revenue, currency, source: 'Imported / connected recorded sales only', last_updated: 'Workspace database query' },
      { metric: 'Completed orders', value: completedCount, currency: '', source: 'Imported / connected recorded sales only', last_updated: 'Workspace database query' },
      { metric: 'Enquiries / leads', value: filteredLeads.length, currency: '', source: 'Leads table; not counted as sales', last_updated: 'Workspace database query' },
      { metric: 'Search Console clicks', value: hasSearchData ? searchClicks : 'No data yet', currency: '', source: 'Google Search Console', last_updated: formatDateTime(latestSearchSync) },
      { metric: 'Analytics sessions', value: hasSessions ? sessions : 'No data yet', currency: '', source: 'Google Analytics 4', last_updated: formatDateTime(latestAnalyticsSync) },
      { metric: 'Source status', value: 'Demo rows are excluded', currency: '', source: 'This report contains workspace records only', last_updated: new Date().toISOString() },
    ];
    const ok = downloadCsv('localpulse-report-' + activeWorkspace?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv', rows);
    if (!ok) notify('No report data available to export yet.', 'info');
    else notify('Source-labelled report CSV downloaded.', 'success');
  };

  return (
    <div className="saas-frame">
      <aside className={'saas-sidebar' + (mobileNavOpen ? ' saas-sidebar-open' : '')}>
        <div className="saas-brand"><span className="saas-brand-mark"><Activity size={19} /></span><span>LocalPulse</span><button className="saas-icon-btn saas-mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="saas-workspace-label">WORKSPACE</div>
        <label className="saas-workspace-select"><Building2 size={17} /><select aria-label="Select workspace" value={activeWorkspaceId} onChange={event => { setActiveWorkspaceId(event.target.value); setPage('overview'); setSearchText(''); }}>{memberships.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><ChevronDown size={13} /></label>
        {['WORKSPACE', 'GROWTH', 'MANAGE'].map(group => (
          <div className="saas-nav-group" key={group}>
            <div className="saas-nav-label">{group}</div>
            {nav.filter(item => item.group === group).map(item => {
              const Icon = item.icon;
              return <button key={item.id} className={'saas-nav-item' + (page === item.id ? ' active' : '')} onClick={() => { setPage(item.id); setMobileNavOpen(false); }} aria-current={page === item.id ? 'page' : undefined}><Icon size={18} /><span>{item.title}</span>{item.id === 'sources' && sourceIntegrations.length > 0 ? <span className="saas-nav-count">{sourceIntegrations.length}</span> : null}</button>;
            })}
          </div>
        ))}
        <div className="saas-sidebar-bottom">
          <div className="saas-secure-note"><ShieldCheck size={16} /><span>Workspace access protected by Supabase RLS</span></div>
          <button className="saas-user-card" onClick={signOut} title="Sign out"><span className="saas-avatar">{String(user.email || 'U').slice(0, 1).toUpperCase()}</span><span className="saas-user-text"><b>{user.user_metadata?.display_name || user.email || 'User'}</b><small>{user.email}</small></span><LogOut size={16} /></button>
        </div>
      </aside>

      {mobileNavOpen ? <button className="saas-nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" /> : null}

      <div className="saas-main">
        <header className="saas-topbar">
          <button className="saas-icon-btn saas-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="saas-breadcrumb">Workspace <span>/</span> <b>{pageMeta.title}</b></div>
          <div className="saas-top-actions">
            <span className="saas-mode-pill"><ShieldCheck size={13} /> WORKSPACE MODE</span>
            <select className="saas-range-select" value={range} onChange={event => setRange(Number(event.target.value))} aria-label="Selected reporting range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
            <button className="saas-icon-btn" title="Refresh workspace data" onClick={() => void refreshDataOnly().then(() => notify('Workspace data refreshed from the database.', 'success')).catch(error => notify(error.message || 'Refresh failed.', 'error'))}><RefreshCw size={17} /></button>
            <button className="saas-icon-btn" title="Help" onClick={() => notify('Every metric has a source label. Unconfigured providers are shown as not connected; no sample values are inserted into this workspace.', 'info')}><CircleHelp size={17} /></button>
          </div>
        </header>

        <main className="saas-content">
          {loadError ? <div className="saas-alert error"><AlertCircle size={18} /><div><b>Workspace needs attention</b><p>{loadError}</p></div><button onClick={() => setLoadError('')} aria-label="Dismiss error"><X size={16} /></button></div> : null}
          {workspaceLoading ? <div className="saas-loading-inline"><LoaderCircle className="saas-spin" size={16} /> Refreshing workspace records…</div> : null}
          <div className="saas-page-heading">
            <div><div className="saas-eyebrow"><span /> LOCAL BUSINESS INTELLIGENCE</div><h1>{pageMeta.title}</h1><p>{pageMeta.subtitle}</p></div>
            <div className="saas-heading-right"><span className="saas-freshness"><ShieldCheck size={13} /> Authenticated workspace</span>{page === 'sales' ? <button className="saas-btn primary" onClick={beginImport}><Upload size={16} /> Import sales</button> : null}</div>
          </div>

          {page === 'overview' ? (
            <>
              <div className="saas-kpi-grid">
                <Kpi title="Recorded revenue" value={revenueLabel} note="Completed sales in selected range" source="Sales orders · workspace database" icon={ShoppingBag} />
                <Kpi title="Completed orders" value={number(completedCount)} note="Completed order records only" source="Sales orders · workspace database" icon={CheckCircle2} />
                <Kpi title="Website sessions" value={hasSessions ? number(sessions) : 'No data yet'} note="Google Analytics 4 sessions" source={hasSessions ? 'Google Analytics 4' : 'Not connected / no synced data'} icon={Globe2} />
                <Kpi title="Search clicks" value={hasSearchData ? number(searchClicks) : 'No data yet'} note="Clicks from Google Search" source={hasSearchData ? 'Google Search Console' : 'Not connected / no synced data'} icon={Search} />
              </div>
              <div className="saas-two-col">
                <section className="saas-card">
                  <CardHeader title="Business activity" subtitle="Recorded sales and enquiries · selected date range" badge="ACTUAL WORKSPACE DATA" />
                  {filteredOrders.length || filteredLeads.length ? <ActivityChart orders={chartOrders} leads={filteredLeads} currency={currency} /> : <EmptyState icon={BarChart3} title="No business activity yet" body="Import a sales spreadsheet or record an enquiry. We will not estimate revenue from web traffic." actionLabel="Import sales" onAction={beginImport} />}
                </section>
                <section className="saas-card">
                  <CardHeader title="SEO data readiness" subtitle="Provider data becomes available after a real authorization and sync." />
                  <div className="saas-readiness-list">
                    <ReadinessRow title="Google Search Console" status={hasSearchData ? 'Data available' : 'Not connected'} detail={hasSearchData ? 'Last sync: ' + formatDateTime(latestSearchSync) : 'Search clicks, impressions and query data are unavailable.'} />
                    <ReadinessRow title="Google Analytics 4" status={hasSessions ? 'Data available' : 'Not connected'} detail={hasSessions ? 'Last sync: ' + formatDateTime(latestAnalyticsSync) : 'Website sessions are not inferred or estimated.'} />
                    <ReadinessRow title="Google Business Profile" status={businessMetrics.profile_views !== undefined ? 'Data available' : 'Not connected'} detail={businessMetrics.profile_views !== undefined ? 'Profile interactions are from stored provider records.' : 'Calls, direction requests and profile views are not yet available.'} />
                    <ReadinessRow title="Site audit" status="Not run" detail="No crawler has run against your business website." />
                  </div>
                  <button className="saas-text-btn" onClick={() => setPage('sources')}>Review data sources <ArrowRight size={15} /></button>
                </section>
              </div>
              <div className="saas-two-col">
                <section className="saas-card">
                  <CardHeader title="Recorded sales" subtitle="Latest records from the workspace database" badge="SAMPLE DATA EXCLUDED" />
                  <SalesTable rows={orders.slice(0, 5)} currency={currency} />
                  <button className="saas-text-btn" onClick={() => setPage('sales')}>View all sales <ArrowRight size={15} /></button>
                </section>
                <section className="saas-card">
                  <CardHeader title="Recommended next actions" subtitle="Setup checklist — these are suggestions, not detected errors." />
                  {tasks.length ? <div className="saas-task-list">{tasks.slice(0, 5).map(task => <label className="saas-task-row" key={task.id}><input type="checkbox" checked={task.status === 'done'} onChange={() => void handleToggleTask(task)} /><span><b>{task.title}</b><small>{task.description}</small></span><em className={'saas-priority ' + task.priority}>{task.priority}</em></label>)}</div> : <EmptyState icon={CheckCircle2} title="No checklist tasks yet" body="Create a workspace to seed setup recommendations." />}
                  {tasks.length ? <small className="saas-footnote">{completedTaskCount} of {tasks.length} setup actions completed. Changes are saved to Supabase.</small> : null}
                </section>
              </div>
            </>
          ) : null}

          {page === 'seo' ? (
            <>
              <div className="saas-kpi-grid">
                <Kpi title="Search clicks" value={hasSearchData ? number(searchClicks) : 'No data yet'} note="Clicks from Google Search results" source="Google Search Console" icon={Search} />
                <Kpi title="Impressions" value={hasSearchData ? number(searchImpressions) : 'No data yet'} note="Times a result was shown" source="Google Search Console" icon={Activity} />
                <Kpi title="Average CTR" value={hasSearchData ? percent(searchCtr) : 'No data yet'} note="Clicks ÷ impressions" source="Google Search Console" icon={BarChart3} />
                <Kpi title="Sessions" value={hasSessions ? number(sessions) : 'No data yet'} note="Website sessions, not search clicks" source="Google Analytics 4" icon={Globe2} />
              </div>
              {!hasSearchData ? <EmptyState icon={Search} title="Search Console is not connected" body="Connect an authorized Google Search Console property before displaying clicks, impressions, CTR, average position or query performance. No ranking or volume is invented." actionLabel="Review integrations" onAction={() => setPage('sources')} /> : <section className="saas-card"><CardHeader title="Search performance" subtitle="Stored provider metrics for the selected range." badge="GOOGLE SEARCH CONSOLE" /><MetricRows rows={filteredMetrics.filter(row => row.provider === 'google_search_console')} /></section>}
              <section className="saas-card">
                <CardHeader title="Keyword tracker" subtitle="Keywords you add are saved; rankings require a connected tracker." />
                <form className="saas-inline-form" onSubmit={addKeyword}><label>Keyword<input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="e.g. laptop repair Dharwad" required /></label><label>Target location<input value={keywordLocation} onChange={e => setKeywordLocation(e.target.value)} /></label><button className="saas-btn primary" type="submit"><Plus size={16} /> Add keyword</button></form>
                {keywords.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Keyword</th><th>Location</th><th>Landing page</th><th>Rank</th><th>Data source</th></tr></thead><tbody>{keywords.map(keyword => <tr key={keyword.id}><td><b>{keyword.keyword}</b><small>{keyword.intent || 'Intent not classified'}</small></td><td>{keyword.search_location || 'Not specified'}</td><td>{keyword.landing_page || 'Not set'}</td><td><span className="saas-muted">Not tracked</span></td><td>User-entered keyword</td></tr>)}</tbody></table></div> : <EmptyState icon={Search} title="No keywords saved" body="Add the search phrases that matter to your business. A position will appear only when a supported tracker returns one." />}
              </section>
              <section className="saas-card"><CardHeader title="Website audit" subtitle="Technical issues are only shown after a real audit has run." /><EmptyState icon={ShieldCheck} title="Audit not run" body="No crawler or Core Web Vitals audit is configured. LocalPulse will not invent missing titles, broken links or performance errors." actionLabel="View data sources" onAction={() => setPage('sources')} /></section>
            </>
          ) : null}

          {page === 'local' ? (
            <>
              <div className="saas-two-col">
                <section className="saas-card"><CardHeader title="Business profile details" subtitle="Stored workspace information—not a live Google profile." />
                  {activeBusiness ? <div className="saas-profile-details"><InfoLine label="Business name" value={activeBusiness.name} /><InfoLine label="Category" value={activeBusiness.category || 'Not set'} /><InfoLine label="Address" value={[activeBusiness.address, activeBusiness.city, activeBusiness.region].filter(Boolean).join(', ') || 'Not set'} /><InfoLine label="Phone" value={activeBusiness.phone || 'Not set'} /><InfoLine label="Website" value={activeBusiness.website || 'Not set'} /><InfoLine label="Timezone" value={activeBusiness.business_timezone || activeWorkspace?.timezone || 'Asia/Kolkata'} /></div> : <EmptyState title="No business profile" body="Add a business in workspace settings." />}
                  <button className="saas-text-btn" onClick={() => setPage('settings')}>Edit business details <ArrowRight size={15} /></button>
                </section>
                <section className="saas-card"><CardHeader title="Local profile interactions" subtitle="Provider-reported values only." />{filteredLocalMetrics.length ? <MetricRows rows={filteredLocalMetrics.map(row => ({ ...row, provider: row.provider }))} /> : <EmptyState icon={MapPin} title="Business Profile not connected" body="Views, calls, direction requests and website clicks are unavailable until supported API access and sync are configured." actionLabel="Review data sources" onAction={() => setPage('sources')} />}</section>
              </div>
              <section className="saas-card"><CardHeader title="Local ranking and directory checks" subtitle="No directory or grid scan has been performed." /><div className="saas-two-col-inner"><ReadinessRow title="Map / local rank grid" status="Not configured" detail="Would require a legitimate configured tracking source and defined search locations." /><ReadinessRow title="Citation consistency" status="Not checked" detail="Business listings have not been crawled or compared." /><ReadinessRow title="Opening hours and photos" status="Manual review" detail="Verify these details in the official business profile before relying on them." /></div></section>
            </>
          ) : null}

          {page === 'sales' ? (
            <>
              <div className="saas-kpi-grid saas-kpi-grid-three"><Kpi title="Completed revenue" value={revenueLabel} note="Completed records only" source="Imported / connected sales" icon={ShoppingBag} /><Kpi title="Completed orders" value={number(completedCount)} note="Orders marked completed" source="Imported / connected sales" icon={CheckCircle2} /><Kpi title="Average order value" value={aovLabel} note="Revenue ÷ completed orders" source="Calculated from recorded orders" icon={BarChart3} /></div>
              <section className="saas-card">
                <div className="saas-card-header"><div><h2>Sales records</h2><p>Only imported or connected records in this workspace. Demo values are excluded.</p></div><div className="saas-card-actions"><button className="saas-btn secondary" onClick={exportVisibleOrders}><ArrowDownToLine size={15} /> Export CSV</button><button className="saas-btn primary" onClick={beginImport}><Upload size={15} /> Import file</button></div></div>
                <div className="saas-table-controls"><label className="saas-search"><Search size={16} /><input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search order, product or channel" /></label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter sales by status"><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select><span className="saas-count-label">{visibleOrders.length} records</span></div>
                {visibleOrders.length ? <SalesTable rows={visibleOrders} currency={currency} /> : <EmptyState icon={FileSpreadsheet} title="No sales records found" body={orders.length ? 'Change the filters or date range.' : 'Import a CSV or Excel sheet to record actual sales and revenue. Website visits are never counted as orders.'} actionLabel="Import sales" onAction={beginImport} />}
              </section>
              <section className="saas-card">
                <CardHeader title="Import history" subtitle="Successful, failed and partial attempts are recorded." />
                {importRuns.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>File</th><th>Imported</th><th>Rejected</th><th>Status</th><th>Created</th></tr></thead><tbody>{importRuns.map(run => <tr key={run.id}><td><b>{run.file_name}</b><small>Batch: {run.id.slice(0, 8)}</small></td><td>{run.accepted_count}</td><td>{run.rejected_count}</td><td><span className={'saas-status ' + (run.status === 'confirmed' ? 'connected' : 'disconnected')}>{statusLabel(run.status)}</span></td><td>{formatDateTime(run.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={FileSpreadsheet} title="No imports yet" body="Confirmed imports will appear here with accepted and rejected row counts." actionLabel="Import a file" onAction={beginImport} />}
              </section>
              <section className="saas-card"><div className="saas-card-header"><div><h2>Customer enquiries</h2><p>Enquiries are leads, not completed orders.</p></div><button className="saas-btn secondary" onClick={() => setShowLeadForm(v => !v)}><Plus size={15} /> Record enquiry</button></div>
                {showLeadForm ? <form className="saas-inline-form" onSubmit={addLead}><label>Enquiry / interest<input value={leadForm.interest} onChange={e => setLeadForm(current => ({ ...current, interest: e.target.value }))} placeholder="e.g. Refurbished laptop enquiry" required /></label><label>Source channel<select value={leadForm.source} onChange={e => setLeadForm(current => ({ ...current, source: e.target.value }))}><option>Walk-in</option><option>Website form</option><option>Phone call</option><option>Google profile</option><option>Referral</option><option>Other</option></select></label><button className="saas-btn primary" type="submit">Save enquiry</button></form> : null}
                {filteredLeads.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Date</th><th>Interest</th><th>Source</th><th>Status</th></tr></thead><tbody>{filteredLeads.map(lead => <tr key={lead.id}><td>{formatDate(lead.lead_date)}</td><td><b>{lead.interest || lead.lead_type}</b></td><td>{lead.source_channel || 'Not recorded'}</td><td><span className="saas-status disconnected">{statusLabel(lead.status)}</span></td></tr>)}</tbody></table></div> : <EmptyState title="No enquiries recorded" body="Add a real enquiry when a customer contacts you. It will not affect revenue until a completed order is recorded." />}</section>
            </>
          ) : null}

          {page === 'reviews' ? (
            <>
              <div className="saas-kpi-grid saas-kpi-grid-three"><Kpi title="Average rating" value={reviews.some(row => row.rating != null) ? (reviews.filter(row => row.rating != null).reduce((sum, row) => sum + Number(row.rating || 0), 0) / reviews.filter(row => row.rating != null).length).toFixed(1) + ' / 5' : 'No data yet'} note="From available review records" source="Authorized / imported review data" icon={Star} /><Kpi title="Review count" value={number(reviews.length)} note="In this workspace" source="Reviews table" icon={MessageSquareText} /><Kpi title="Needs response" value={number(reviews.filter(row => row.response_status === 'needs_reply').length)} note="Only when response status is known" source="Stored review records" icon={MessageSquareText} /></div>
              <section className="saas-card"><CardHeader title="Review list" subtitle="Only authorized or imported review content is shown." />{reviews.length ? <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Reviewer</th><th>Rating</th><th>Review</th><th>Date</th><th>Response</th><th>Source</th></tr></thead><tbody>{reviews.map(review => <tr key={review.id}><td>{review.reviewer_display_name || 'Reviewer'}</td><td>{review.rating == null ? '—' : review.rating + ' / 5'}</td><td className="saas-review-cell">{review.review_text || 'No review text provided'}</td><td>{formatDate(review.review_date)}</td><td>{statusLabel(review.response_status)}</td><td>{review.provider}</td></tr>)}</tbody></table></div> : <EmptyState icon={MessageSquareText} title="No review data yet" body="Connect a supported review source or import authorized review records. LocalPulse will not generate fake reviews or pretend to post responses." actionLabel="Review integrations" onAction={() => setPage('sources')} />}</section>
            </>
          ) : null}

          {page === 'reports' ? (
            <section className="saas-card saas-report-preview">
              <div className="saas-card-header"><div><span className="saas-report-kicker">LOCALPULSE PERFORMANCE REPORT</span><h2>{activeWorkspace?.name || 'Workspace'} performance summary</h2><p>{formatDate(offsetDate(range - 1))} – {formatDate(todayIso())}</p></div><button className="saas-btn primary" onClick={exportReport}><ArrowDownToLine size={15} /> Export report CSV</button></div>
              <div className="saas-report-kpis"><div><small>Recorded revenue</small><b>{revenueLabel}</b><span>Completed sales records</span></div><div><small>Completed orders</small><b>{number(completedCount)}</b><span>Imported / connected</span></div><div><small>Enquiries</small><b>{number(filteredLeads.length)}</b><span>Separate from orders</span></div><div><small>Search clicks</small><b>{hasSearchData ? number(searchClicks) : 'No data yet'}</b><span>Google Search Console</span></div></div>
              <div className="saas-report-section"><h3>Connected sources</h3>{sourceIntegrations.length ? sourceIntegrations.map(item => <ReadinessRow key={item.id} title={providerName(item.provider)} status="Connected" detail={'Last sync: ' + formatDateTime(item.last_sync_at)} />) : <p className="saas-muted">No provider integrations are connected. Sales imports are listed in the import history and are not described as live Google data.</p>}</div>
              <div className="saas-report-section"><h3>Outstanding actions</h3>{tasks.filter(task => task.status !== 'done').length ? tasks.filter(task => task.status !== 'done').slice(0, 8).map(task => <p className="saas-report-action" key={task.id}><span className={'saas-priority ' + task.priority}>{task.priority}</span><b>{task.title}</b><span>{task.description}</span></p>) : <p className="saas-muted">No outstanding tasks are recorded.</p>}</div>
              <p className="saas-report-footnote">Generated {formatDateTime(new Date().toISOString())}. This report excludes sample/demo rows, distinguishes leads from orders, and shows “No data yet” where a provider has not supplied data. It does not attribute sales to SEO without proper tracking.</p>
            </section>
          ) : null}

          {page === 'sources' ? (
            <>
              {googleSetupInfo ? <section className="saas-card saas-google-setup">
                <div className="saas-card-header"><div><h2>One-time Google OAuth setup</h2><p>{googleSetupInfo.message}</p></div><button className="saas-icon-btn" onClick={() => setGoogleSetupInfo(null)} aria-label="Dismiss setup guide"><X size={17} /></button></div>
                <p className="saas-muted">Add these values in Supabase Project → Edge Functions → Secrets. Do not paste private values into GitHub or this chat.</p>
                <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Server secret</th><th>What it is</th></tr></thead><tbody>
                  {googleSetupInfo.missingSecrets.map(secret => <tr key={secret}><td><b>{secret}</b></td><td>{secret === 'GOOGLE_CLIENT_ID' ? 'The OAuth Client ID from your Google Cloud Web application.' : secret === 'GOOGLE_CLIENT_SECRET' ? 'The private client secret from the same Google Cloud OAuth client.' : 'A random Base64 key that decodes to exactly 32 bytes, used to encrypt stored refresh tokens.'}</td></tr>)}
                </tbody></table></div>
                <div className="saas-redirect-line"><div><b>Authorized redirect URI</b><code>{googleSetupInfo.redirectUri}</code></div><button className="saas-btn secondary" onClick={() => { void navigator.clipboard.writeText(googleSetupInfo.redirectUri).then(() => notify('Redirect URI copied.', 'success')).catch(() => notify('Copy failed. Select and copy the redirect URI shown above.', 'error')); }}><ArrowDownToLine size={14} /> Copy URI</button></div>
                <ol className="saas-google-steps">
                  <li>Create a Google Cloud OAuth client of type <b>Web application</b> and add the exact redirect URI above.</li>
                  <li>Enable the Search Console API, Google Analytics Data API and Analytics Admin API. For Google Business Profile, request/enable the required Business Profile APIs and API access first.</li>
                  <li>Add the three missing server secrets above in Supabase, then retry Connect with Google.</li>
                </ol>
                <p className="saas-footnote">OAuth secrets stay server-side. Customers authenticate on Google and grant selected read-only access; LocalPulse never asks for their Google password.</p>
              </section> : null}
              <div className="saas-integrations-grid">{providers.map(provider => {
                const source = integrations.filter(row => row.provider === provider.id).sort((a, b) => String(b.last_sync_at || '').localeCompare(String(a.last_sync_at || '')))[0];
                const isGoogle = ['google_search_console','google_analytics_4','google_business_profile','google_sheets'].includes(provider.id);
                const connected = source?.status === 'connected';
                const selected = Boolean(source?.external_property_id && source.external_property_id !== '__resource_pending__');
                const status = provider.readiness === 'planned' ? 'Planned'
                  : provider.readiness === 'experimental' ? 'Experimental'
                  : provider.id === 'csv_import' ? 'Available'
                  : connected ? (selected ? 'Connected' : 'Choose property')
                  : source?.status === 'pending' ? 'Authorization pending'
                  : source?.status === 'error' ? 'Needs attention' : 'Not connected';
                const statusClass = (status === 'Connected' || status === 'Available') ? 'connected'
                  : status === 'Planned' ? 'planned'
                  : status === 'Experimental' ? 'experimental' : 'disconnected';
                const icon = provider.id.indexOf('google') === 0 || ['bing_webmaster','indexnow','bing_places','wordpress','strapi','ghost_cms'].includes(provider.id) ? Globe2
                  : ['csv_import','google_sheets','google_drive','structured_file_import'].includes(provider.id) ? FileSpreadsheet : Database;
                const ProviderIcon = icon;
                const pickerOpen = Boolean(propertyPicker && source && propertyPicker.integrationId === source.id);
                const busy = oauthBusyProvider === provider.id || oauthBusyProvider === provider.id + ':sync' || oauthBusyProvider === provider.id + ':disconnect';
                const cfg = source?.public_config || {};
                const selectedTitle = typeof cfg.selected_resource_title === 'string' ? cfg.selected_resource_title : '';
                return <section className="saas-card saas-provider-card" key={provider.id}>
                  <div className="saas-provider-top"><span className="saas-provider-icon"><ProviderIcon size={21} /></span><span className={'saas-status ' + statusClass}>{status}</span></div>
                  <p className="saas-provider-category">{provider.category}</p><h2>{provider.name}</h2><p className="saas-provider-detail">{provider.detail}</p><p className="saas-provider-copy">{provider.supported}</p>
                  <div className="saas-scope"><b>Access / setup</b><span>{provider.scope}</span></div>
                  {connected ? <div className="saas-connection-account"><span>Google account</span><b>{source?.account_label || 'Authorized Google account'}</b>{selected ? <small>Property: {selectedTitle || source?.external_property_id}</small> : <small>Authorization saved. Select the correct property before syncing.</small>}</div> : null}
                  <div className="saas-provider-sync"><span>Last synced</span><b>{connected ? formatDateTime(source?.last_sync_at) : provider.id === 'csv_import' ? 'On each confirmed import' : 'Never'}</b></div>
                  {source?.last_error_message ? <p className="saas-error-copy">{source.last_error_message}</p> : null}
                  {provider.id === 'csv_import' ? <button className="saas-btn primary" onClick={beginImport}><Upload size={15} /> Import file</button>
                    : isGoogle ? <div className="saas-provider-actions">
                      {!connected ? <button className="saas-btn primary" disabled={busy} onClick={() => void connectGoogle(provider.id)}>{busy ? <LoaderCircle className="saas-spin" size={15} /> : <Plug size={15} />} Connect with Google</button>
                        : <>
                          <button className="saas-btn secondary" disabled={busy} onClick={() => void openPropertyPicker(provider.id, source!)}>{providerPickerLabel(provider.id, selected)}</button>
                          <button className="saas-btn primary" disabled={busy || !selected} onClick={() => void syncGoogle(provider.id, source!)}>{oauthBusyProvider === provider.id + ':sync' ? <LoaderCircle className="saas-spin" size={15} /> : <RefreshCw size={15} />} Sync now</button>
                          <button className="saas-disconnect-btn" disabled={busy} onClick={() => void disconnectGoogle(provider.id, source!)}>Disconnect</button>
                        </>}
                    </div>
                    : provider.readiness === 'planned' ? <button className="saas-btn secondary" disabled aria-label={provider.name + ' integration is planned'}>Planned integration</button>
                    : provider.readiness === 'experimental' ? <button className="saas-btn secondary" disabled aria-label={provider.name + ' integration is experimental'}>Experimental connector</button>
                    : <button className="saas-btn secondary" disabled>Not configured</button>}
                  {pickerOpen && propertyPicker ? <div className="saas-property-picker">
                    <div><b>{provider.id === 'google_sheets' ? 'Choose a spreadsheet' : 'Choose a property / location'}</b><button className="saas-icon-btn" onClick={() => setPropertyPicker(null)} aria-label="Close property picker"><X size={15} /></button></div>
                    {propertyPicker.loading ? <p className="saas-muted"><LoaderCircle className="saas-spin" size={14} /> Loading resources from Google…</p>
                      : provider.id === 'google_sheets' ? <label>Google Sheets URL or spreadsheet ID<input value={propertyPicker.spreadsheetId} onChange={e => setPropertyPicker(current => current ? {...current,spreadsheetId:e.target.value} : current)} placeholder="Paste spreadsheet URL or ID" /></label>
                      : propertyPicker.resources.length ? <label>Available resources<select value={propertyPicker.selectedId} onChange={e => setPropertyPicker(current => current ? {...current,selectedId:e.target.value} : current)}>{propertyPicker.resources.map(resource => <option key={resource.id} value={resource.id}>{resource.title}{resource.detail ? ' — '+resource.detail : ''}</option>)}</select></label>
                      : <p className="saas-muted">Google returned no accessible resources for this account.</p>}
                    <button className="saas-btn primary" disabled={propertyPicker.loading || propertyPicker.saving || (provider.id === 'google_sheets' ? !propertyPicker.spreadsheetId.trim() : !propertyPicker.selectedId)} onClick={() => void saveGoogleProperty()}>{propertyPicker.saving ? <LoaderCircle className="saas-spin" size={15} /> : <CheckCircle2 size={15} />} Save property</button>
                  </div> : null}
                </section>;
              })}</div>
            </>
          ) : null}

          {page === 'settings' ? (
            <>
              <section className="saas-card"><CardHeader title="Business details" subtitle="Updates are saved to the selected workspace database." />
                {!activeBusiness ? <EmptyState title="No business details" body="Create a workspace first, or ask the workspace owner to add a business." /> : <form className="saas-settings-form" onSubmit={saveBusinessSettings}>
                  <div className="saas-form-grid"><label>Business name<input value={businessForm.name} onChange={e => setBusinessForm(current => ({ ...current, name: e.target.value }))} required /></label><label>Business category<input value={businessForm.category} onChange={e => setBusinessForm(current => ({ ...current, category: e.target.value }))} placeholder="Computer sales and repair" /></label><label>Address<input value={businessForm.address} onChange={e => setBusinessForm(current => ({ ...current, address: e.target.value }))} /></label><label>City<input value={businessForm.city} onChange={e => setBusinessForm(current => ({ ...current, city: e.target.value }))} /></label><label>State / region<input value={businessForm.region} onChange={e => setBusinessForm(current => ({ ...current, region: e.target.value }))} /></label><label>Phone<input value={businessForm.phone} onChange={e => setBusinessForm(current => ({ ...current, phone: e.target.value }))} /></label><label>Website<input type="url" value={businessForm.website} onChange={e => setBusinessForm(current => ({ ...current, website: e.target.value }))} placeholder="https://example.com" /></label><label>Workspace currency<select value={currencyForm} onChange={e => setCurrencyForm(e.target.value)}><option value="INR">INR — Indian rupee</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — Pound sterling</option><option value="EUR">EUR — Euro</option><option value="AED">AED — UAE dirham</option></select></label><label>Workspace timezone<select value={timezoneForm} onChange={e => setTimezoneForm(e.target.value)}><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="UTC">UTC</option></select></label></div><div className="saas-form-actions"><span className="saas-muted">Your changes are scoped to this workspace.</span><button className="saas-btn primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="saas-spin" size={15} /> : null} Save settings</button></div>
                </form>}
              </section>
              <section className="saas-card"><CardHeader title="Workspace security" subtitle="Account and tenant controls" /><div className="saas-readiness-list"><ReadinessRow title="Signed-in user" status="Authenticated" detail={user.email || user.id} /><ReadinessRow title="Workspace role" status={activeWorkspace?.role || 'Unknown'} detail="Database row-level security must remain enabled. The UI is not the security boundary." /><ReadinessRow title="Demo data" status="Excluded" detail="Production mode queries filter demo rows out. Sample records are not seeded into your customer workspace." /><ReadinessRow title="Subscriptions" status="Not connected" detail="Dodo Payments is intentionally not configured yet. No payment or subscription is being simulated." /></div><button className="saas-btn secondary" onClick={signOut}><LogOut size={15} /> Sign out</button></section>
            </>
          ) : null}
        </main>
        <footer className="saas-footer"><span>LocalPulse</span><span>Sources are labelled. Unavailable data is not estimated.</span><span>Timezone: {activeWorkspace?.timezone || 'Asia/Kolkata'}</span></footer>
      </div>

      {showImport ? <div className="saas-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowImport(false); }}><section className="saas-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="saas-modal-header"><div><span className="saas-eyebrow">SALES DATA</span><h2 id="import-title">Import spreadsheet</h2><p>Preview → map → validate → confirm. Existing records are never replaced.</p></div><button className="saas-icon-btn" onClick={() => setShowImport(false)} aria-label="Close import"><X size={18} /></button></div>
        <div className="saas-stepper">{['Upload', 'Map columns', 'Validate'].map((label, index) => <span key={label} className={(index === 0 && importStep === 'upload') || (index === 1 && importStep === 'mapping') || (index === 2 && importStep === 'validation') ? 'current' : ''}>{index + 1}. {label}</span>)}</div>
        {importStep === 'upload' ? <div className="saas-upload-zone"><FileSpreadsheet size={31} /><h3>Select a CSV or Excel file</h3><p>First worksheet only · maximum 10 MB and 500 rows. Sales should be actual recorded orders, not enquiries or website visits.</p><label className="saas-btn primary saas-file-button">Choose file<input type="file" accept=".csv,.xls,.xlsx" onChange={e => void processImportFile(e.target.files?.[0])} /></label><button className="saas-text-btn" onClick={() => { const rows = [{ order_id: 'STORE-1001', order_date: todayIso(), status: 'Completed', record_type: 'Product sale', product_service: 'Sample laptop', revenue_amount: '24999', source_channel: 'Walk-in' }]; downloadCsv('localpulse-sales-template.csv', rows); }}>Download CSV template <ArrowDownToLine size={14} /></button></div> : null}
        {importStep === 'mapping' ? <div className="saas-import-body"><div className="saas-import-file"><FileSpreadsheet size={18} /><span><b>{importFileName}</b><small>{importRows.length} data rows · {importHeaders.length} columns</small></span></div><p className="saas-muted">Map the fields in your spreadsheet. Order ID, date, status and amount are required.</p><div className="saas-map-grid">{([{ key: 'id', label: 'Order ID', required: true }, { key: 'date', label: 'Order date', required: true }, { key: 'status', label: 'Status', required: true }, { key: 'amount', label: 'Revenue amount', required: true }, { key: 'type', label: 'Record type', required: false }, { key: 'product', label: 'Product / service', required: false }, { key: 'channel', label: 'Source channel', required: false }] as { key: ImportField; label: string; required: boolean }[]).map(field => <label key={field.key}>{field.label}{field.required ? <span> *</span> : null}<select value={mapping[field.key]} onChange={e => setMapping(current => ({ ...current, [field.key]: e.target.value }))}><option value="">Not mapped</option>{importHeaders.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><div className="saas-preview-grid"><b>Sample preview</b><div className="saas-table-wrap"><table className="saas-table"><thead><tr>{importHeaders.slice(0, 5).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{importRows.slice(0, 3).map((row, index) => <tr key={index}>{importHeaders.slice(0, 5).map(header => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div></div><div className="saas-form-actions"><button className="saas-btn secondary" onClick={() => setImportStep('upload')}>Back</button><button className="saas-btn primary" onClick={validateImport}>Validate records <ArrowRight size={15} /></button></div></div> : null}
        {importStep === 'validation' ? <div className="saas-import-body"><div className="saas-validation-summary"><div><b>{validatedRows.filter(row => row.record).length}</b><span>Valid rows</span></div><div><b>{validatedRows.filter(row => row.errors.length).length}</b><span>Rejected rows</span></div><div><b>{validatedRows.length}</b><span>Total checked</span></div></div><p className="saas-muted">Only valid records will be imported. Duplicate IDs are rejected; existing sales are never overwritten.</p><div className="saas-table-wrap saas-validation-table"><table className="saas-table"><thead><tr><th>Row</th><th>Order ID</th><th>Date</th><th>Amount</th><th>Validation</th></tr></thead><tbody>{validatedRows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{String(row.raw[mapping.id] ?? '')}</td><td>{String(row.raw[mapping.date] ?? '')}</td><td>{String(row.raw[mapping.amount] ?? '')}</td><td>{row.errors.length ? <span className="saas-error-copy">{row.errors.join('; ')}</span> : <span className="saas-status connected">Valid</span>}</td></tr>)}</tbody></table></div><div className="saas-form-actions"><button className="saas-btn secondary" onClick={() => setImportStep('mapping')}>Back to mapping</button><button className="saas-btn primary" onClick={() => void confirmImport()} disabled={saving || !validatedRows.some(row => row.record)}>{saving ? <LoaderCircle className="saas-spin" size={15} /> : null} Confirm import</button></div></div> : null}
        {importStep === 'history' ? <div className="saas-import-body"><p>History is available in the Leads & Sales page after a successful database save.</p></div> : null}
        {importError ? <div className="saas-alert error"><AlertCircle size={16} /><p>{importError}</p></div> : null}
      </section></div> : null}

      {toast ? <div className={'saas-toast ' + toast.tone} role="status"><span>{toast.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}</span><p>{toast.text}</p><button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={15} /></button></div> : null}
    </div>
  );
}

function ConfigurationNotice() {
  return <div className="saas-auth-shell"><section className="saas-auth-card"><span className="saas-brand-mark"><Activity size={20} /></span><div className="saas-eyebrow">PRODUCTION SETUP</div><h1>Connect your Supabase project</h1><p>Production mode requires the project's URL and public publishable/anon key. No private service-role key belongs in the browser.</p><ol><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Set <code>VITE_LOCALPULSE_MODE=production</code>.</li><li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from Supabase Project Settings → API.</li><li>Apply the reviewed SQL migration, then restart the dev server.</li></ol><div className="saas-alert info"><AlertCircle size={18} /><p>Until the environment is configured, use demo mode for previews. This screen does not imply that any database is connected.</p></div></section></div>;
}

function LoadingScreen({ label }: { label: string }) {
  return <div className="saas-auth-shell"><section className="saas-auth-card saas-loading-card"><LoaderCircle className="saas-spin" size={25} /><h1>LocalPulse</h1><p>{label}</p></section></div>;
}

function AuthScreen({ client, notify }: { client: NonNullable<typeof supabase>; notify: (text: string, tone?: 'success' | 'error' | 'info') => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'reset') {
        const result = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (result.error) throw result.error;
        setMessage('If an account exists for this email, a password-reset link will be sent.');
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const result = await client.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() || email.trim() }, emailRedirectTo: window.location.origin },
        });
        if (result.error) throw result.error;
        if (!result.data.session) setMessage('Account request created. Check your email to confirm the address, then sign in.');
        else setMessage('Account created. Continue by setting up your first workspace.');
        notify('Authentication request completed.', 'success');
      } else {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        notify('Signed in securely.', 'success');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
    } finally { setBusy(false); }
  };
  return <div className="saas-auth-shell"><section className="saas-auth-card">
    <div className="saas-auth-brand"><span className="saas-brand-mark"><Activity size={20} /></span><b>LocalPulse</b><span className="saas-mode-pill">SECURE WORKSPACE</span></div>
    <div className="saas-eyebrow">LOCAL BUSINESS INTELLIGENCE</div>
    <h1>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
    <p>{mode === 'signup' ? 'Start with a workspace for your business.' : mode === 'reset' ? 'We will send instructions if an account is registered.' : 'Sign in to access your business data.'}</p>
    <form className="saas-auth-form" onSubmit={submit}>
      {mode === 'signup' ? <label>Your name<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label> : null}
      <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
      {mode !== 'reset' ? <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /></label> : null}
      {message ? <div className={'saas-alert ' + (message.toLowerCase().includes('fail') || message.toLowerCase().includes('invalid') ? 'error' : 'info')} role="status"><AlertCircle size={17} /><p>{message}</p></div> : null}
      <button className="saas-btn primary saas-full-btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="saas-spin" size={16} /> : null}{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'} <ArrowRight size={16} /></button>
    </form>
    <div className="saas-auth-links">{mode === 'signin' ? <><button onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button><span>·</span><button onClick={() => { setMode('signup'); setMessage(''); }}>Create account</button></> : <button onClick={() => { setMode('signin'); setMessage(''); }}>Back to sign in</button>}</div>
    <p className="saas-auth-footnote"><ShieldCheck size={14} /> Passwords are handled by Supabase Auth and are never sent to LocalPulse chat or support.</p>
    <div className="saas-auth-links"><a href="?demo=1">Explore the demo dashboard</a></div>
  </section></div>;
}

function WorkspaceSetup(props: {
  user: User; busy: boolean; error: string; workspaceName: string; setWorkspaceName: (value: string) => void;
  businessName: string; setBusinessName: (value: string) => void; city: string; setCity: (value: string) => void;
  website: string; setWebsite: (value: string) => void; onSubmit: (event: FormEvent) => void; onSignOut: () => void;
}) {
  return <div className="saas-auth-shell"><section className="saas-auth-card saas-onboarding-card"><div className="saas-auth-brand"><span className="saas-brand-mark"><Activity size={20} /></span><b>LocalPulse</b></div><div className="saas-eyebrow">FIRST-TIME SETUP</div><h1>Create your first workspace</h1><p>Your workspace is a secure tenant boundary. Only members with permissions can access its records.</p>
    <form className="saas-auth-form" onSubmit={props.onSubmit}><label>Workspace / company name<input value={props.workspaceName} onChange={event => props.setWorkspaceName(event.target.value)} placeholder="e.g. My Business" required maxLength={120} /></label><label>Business name<input value={props.businessName} onChange={event => props.setBusinessName(event.target.value)} placeholder="e.g. TechNova Computers" required /></label><label>City<input value={props.city} onChange={event => props.setCity(event.target.value)} placeholder="Dharwad" /></label><label>Website (optional)<input type="url" value={props.website} onChange={event => props.setWebsite(event.target.value)} placeholder="https://example.com" /></label>{props.error ? <div className="saas-alert error"><AlertCircle size={16} /><p>{props.error}</p></div> : null}<button className="saas-btn primary saas-full-btn" type="submit" disabled={props.busy}>{props.busy ? <LoaderCircle className="saas-spin" size={16} /> : null} Create workspace <ArrowRight size={16} /></button></form>
    <button className="saas-text-btn" onClick={props.onSignOut}>Sign out of {props.user.email || 'account'} <LogOut size={14} /></button><p className="saas-auth-footnote"><ShieldCheck size={14} /> Demo metrics are not copied into your workspace.</p>
  </section></div>;
}

function Kpi({ title, value, note, source, icon: Icon }: { title: string; value: string; note: string; source: string; icon: LucideIcon }) {
  return <section className="saas-card saas-kpi"><div className="saas-kpi-top"><span>{title}</span><i><Icon size={18} /></i></div><div className="saas-kpi-value">{value}</div><p>{note}</p><div className="saas-kpi-source"><span className="saas-source-dot" /> {source}</div></section>;
}
function CardHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return <div className="saas-card-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{badge ? <span className="saas-table-badge">{badge}</span> : null}</div>;
}
function EmptyState({ icon: Icon, title, body, actionLabel, onAction }: { icon?: LucideIcon; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="saas-empty">{Icon ? <span className="saas-empty-icon"><Icon size={22} /></span> : null}<h3>{title}</h3><p>{body}</p>{actionLabel && onAction ? <button className="saas-btn secondary" onClick={onAction}>{actionLabel} <ArrowRight size={14} /></button> : null}</div>;
}
function ReadinessRow({ title, status, detail }: { title: string; status: string; detail: string }) {
  return <div className="saas-readiness-row"><span className={'saas-readiness-mark ' + (status === 'Data available' || status === 'Connected' || status === 'Authenticated' ? 'ok' : '')}>{status === 'Connected' || status === 'Data available' || status === 'Authenticated' ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}</span><div><b>{title}</b><small>{detail}</small></div><span className={'saas-status ' + (status === 'Connected' || status === 'Data available' || status === 'Authenticated' ? 'connected' : 'disconnected')}>{status}</span></div>;
}
function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="saas-info-line"><span>{label}</span><b>{value}</b></div>;
}
function SalesTable({ rows, currency }: { rows: Order[]; currency: string }) {
  return <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Order</th><th>Date</th><th>Product / service</th><th>Status</th><th>Source</th><th className="num">Revenue</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.order_id}</b><small>{row.record_type}</small></td><td>{formatDate(row.order_date)}</td><td>{row.product_or_service || 'Not specified'}</td><td><span className={'saas-status ' + (row.status === 'completed' ? 'connected' : 'disconnected')}>{statusLabel(row.status)}</span></td><td>{row.source_channel || providerName(row.source_provider)}</td><td className="num">{row.currency === currency ? money(Number(row.amount), currency) : money(Number(row.amount), row.currency)}</td></tr>)}</tbody></table></div>;
}
function MetricRows({ rows }: { rows: Metric[] | LocalMetric[] }) {
  return <div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Date</th><th>Metric</th><th>Value</th><th>Provider</th><th>Fetched</th></tr></thead><tbody>{rows.slice(0, 30).map(row => <tr key={row.id}><td>{formatDate(row.metric_date)}</td><td>{statusLabel(row.metric_type)}</td><td>{number(Number(row.metric_value))}</td><td>{providerName(row.provider)}</td><td>{formatDateTime(row.fetched_at)}</td></tr>)}</tbody></table></div>;
}
function ActivityChart({ orders, leads, currency }: { orders: Order[]; leads: Lead[]; currency: string }) {
  const days = Array.from({ length: 7 }, (_, index) => offsetDate(6 - index));
  const rows = days.map(date => ({
    date, label: new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
    revenue: orders.filter(order => order.order_date === date && order.status === 'completed').reduce((sum, order) => sum + Number(order.amount), 0),
    orders: orders.filter(order => order.order_date === date && order.status === 'completed').length,
    leads: leads.filter(lead => lead.lead_date === date).length,
  }));
  const max = Math.max(1, ...rows.map(row => row.revenue), ...rows.map(row => row.orders * 1000), ...rows.map(row => row.leads * 500));
  return <div className="saas-activity-chart"><div className="saas-chart-legend"><span><i className="revenue" /> Revenue ({currency})</span><span><i className="leads" /> Enquiries</span></div><div className="saas-chart-bars">{rows.map(row => <div key={row.date} className="saas-chart-column"><div className="saas-bar-pair"><span title={'Revenue: ' + money(row.revenue, currency)} className="saas-bar-revenue" style={{ height: Math.max(2, row.revenue / max * 115) + 'px' }} /><span title={'Enquiries: ' + row.leads} className="saas-bar-lead" style={{ height: Math.max(2, (row.leads * 500) / max * 115) + 'px' }} /></div><small>{row.label}</small></div>)}</div><p className="saas-footnote">Shows recorded sales and leads in the last seven calendar days. The bar heights are relative for display; visits are never converted into revenue.</p></div>;
}

function DatabaseSetupScreen({ error, onRetry, onSignOut }: { error: string; onRetry: () => void; onSignOut: () => void }) {
  return <div className="saas-auth-shell"><section className="saas-auth-card"><span className="saas-brand-mark"><Activity size={20} /></span><div className="saas-eyebrow">DATABASE SETUP</div><h1>Workspace setup is blocked</h1><p>LocalPulse could not read workspace membership. To avoid accidentally creating duplicate workspaces, it has paused onboarding until the database access issue is resolved.</p><div className="saas-alert error"><AlertCircle size={18} /><p>{error}</p></div><ol><li>Confirm the SQL migrations were applied to the intended Supabase project.</li><li>Confirm the URL and publishable key refer to that same project.</li><li>Check Auth is enabled and Row Level Security policies are active.</li></ol><div className="saas-form-actions"><button className="saas-btn secondary" onClick={onSignOut}>Sign out</button><button className="saas-btn primary" onClick={onRetry}><RefreshCw size={15} /> Retry connection</button></div></section></div>;
}

function PasswordUpdateScreen({ client, onSuccess, onSignOut }: { client: NonNullable<typeof supabase>; onSuccess: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setErrorMessage('');
    if (password.length < 8) { setErrorMessage('Use at least 8 characters for the new password.'); return; }
    if (password !== confirmPassword) { setErrorMessage('The two passwords do not match.'); return; }
    setBusy(true);
    const result = await client.auth.updateUser({ password });
    setBusy(false);
    if (result.error) setErrorMessage(result.error.message);
    else onSuccess();
  };
  return <div className="saas-auth-shell"><section className="saas-auth-card"><span className="saas-brand-mark"><ShieldCheck size={20} /></span><div className="saas-eyebrow">ACCOUNT SECURITY</div><h1>Choose a new password</h1><p>Set a new password for your LocalPulse account. The update is sent directly to Supabase Auth.</p><form className="saas-auth-form" onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>{errorMessage ? <div className="saas-alert error"><AlertCircle size={16} /><p>{errorMessage}</p></div> : null}<button className="saas-btn primary saas-full-btn" type="submit" disabled={busy}>{busy ? <LoaderCircle className="saas-spin" size={16} /> : null} Update password <ArrowRight size={15} /></button></form><button className="saas-text-btn" onClick={onSignOut}>Cancel and sign out <LogOut size={14} /></button></section></div>;
}
