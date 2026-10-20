export type WorkspaceId = 'technova' | 'urban-bloom' | 'pixel-mobile';
export type RecordSource = 'Sample data' | 'Imported';

export interface Business {
  id: WorkspaceId;
  name: string;
  category: string;
  location: string;
  website: string;
  phone: string;
  address: string;
  serviceAreas: string[];
  currency: string;
  timezone: string;
  short: string;
  accent: string;
}
export interface SalesOrder {
  id: string;
  date: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  type: string;
  product: string;
  amount: number;
  channel: string;
  source: RecordSource;
  currency: string;
}
export interface Lead {
  id: string;
  date: string;
  name: string;
  interest: string;
  source: string;
  status: 'New' | 'Qualified' | 'Contacted' | 'Won' | 'Lost';
  demo: true;
}
export interface Keyword {
  id: string;
  keyword: string;
  intent: string;
  position: number;
  previousPosition: number;
  location: string;
  device: string;
  landingPage: string;
  clicks: number;
  impressions: number;
  updated: string;
  demo: true;
}
export interface DailyMetric {
  date: string;
  sessions: number;
  clicks: number;
  impressions: number;
  leads: number;
  revenue: number;
  orders: number;
}
export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
  responseStatus: 'Replied' | 'Needs reply';
  source: string;
  demo: true;
}
export interface SeoTask {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  category: string;
  done: boolean;
}

export const workspaces: Business[] = [
  {
    id: 'technova', name: 'TechNova Computers', category: 'Computer sales, laptop service & refurbished devices',
    location: 'Dharwad, Karnataka, India', website: 'technova.example.demo', phone: '+91 836 000 0142',
    address: 'Shop 12, Jubilee Circle, Dharwad, Karnataka 580001', serviceAreas: ['Dharwad', 'Hubballi', 'Navanagar'],
    currency: 'INR', timezone: 'Asia/Kolkata', short: 'TC', accent: 'indigo'
  },
  {
    id: 'urban-bloom', name: 'Urban Bloom Salon', category: 'Salon & personal care services',
    location: 'Hubballi, Karnataka, India', website: 'urbanbloom.example.demo', phone: '+91 836 000 0178',
    address: 'Demo workspace · Main Road, Hubballi, Karnataka', serviceAreas: ['Hubballi', 'Vidyanagar'],
    currency: 'INR', timezone: 'Asia/Kolkata', short: 'UB', accent: 'rose'
  },
  {
    id: 'pixel-mobile', name: 'Pixel Mobile Hub', category: 'Mobile phones, accessories & repairs',
    location: 'Dharwad, Karnataka, India', website: 'pixelmobile.example.demo', phone: '+91 836 000 0191',
    address: 'Demo workspace · Station Road, Dharwad, Karnataka', serviceAreas: ['Dharwad', 'Saptapur'],
    currency: 'INR', timezone: 'Asia/Kolkata', short: 'PM', accent: 'teal'
  }
];

const today = () => {
  const d = new Date(); d.setHours(12, 0, 0, 0); return d;
};
export const dayOffset = (offset: number): string => {
  const d = today(); d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const formatDate = (date: string, timezone = 'Asia/Kolkata'): string => {
  if (!date) return '—';
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone }).format(parsed);
};

const productsByWorkspace: Record<WorkspaceId, string[]> = {
  technova: ['Refurbished ThinkPad T480', 'Laptop keyboard replacement', 'USB-C docking station', 'SSD upgrade · 512 GB', 'Laptop cleaning & service', 'Refurbished Dell Latitude 5420', 'Wireless mouse & keyboard', 'Laptop display replacement', 'RAM upgrade · 16 GB', 'Laptop diagnostics'],
  'urban-bloom': ['Haircut & styling', 'Hair spa package', 'Bridal consultation', 'Colour & style session', 'Skin care facial', 'Haircut · premium', 'Keratin care package', 'Manicure & pedicure', 'Hair treatment', 'Beauty consultation'],
  'pixel-mobile': ['Android phone · demo', 'Screen guard & case', 'Mobile display repair', 'USB-C charger', 'Battery replacement', 'Refurbished smartphone', 'Bluetooth earbuds', 'Mobile diagnostics', 'Power bank · 20k mAh', 'Camera glass repair']
};
const factors: Record<WorkspaceId, number> = { technova: 1, 'urban-bloom': 0.52, 'pixel-mobile': 0.78 };
const productTypes: Record<WorkspaceId, string[]> = {
  technova: ['Refurbished device', 'Repair / service', 'Accessory', 'Upgrade', 'Repair / service', 'Refurbished device', 'Accessory', 'Repair / service', 'Upgrade', 'Repair / service'],
  'urban-bloom': ['Service booking', 'Service booking', 'Consultation', 'Service booking', 'Service booking', 'Service booking', 'Service package', 'Service booking', 'Service package', 'Consultation'],
  'pixel-mobile': ['Device sale', 'Accessory sale', 'Repair / service', 'Accessory sale', 'Repair / service', 'Refurbished device', 'Accessory sale', 'Repair / service', 'Accessory sale', 'Repair / service']
};
const amounts = [26999, 1800, 2499, 3200, 850, 31999, 1299, 6200, 2400, 700, 18499, 3900, 999, 5500, 1499, 28999, 2200, 7800];
const orderOffsets = [2, 5, 8, 12, 16, 20, 23, 26, 31, 39, 50, 61, 77, 84, 88];
const statusSeed: SalesOrder['status'][] = ['Completed', 'Completed', 'Pending', 'Completed', 'Completed', 'Completed', 'Cancelled', 'Completed', 'Completed', 'Completed', 'Pending', 'Completed', 'Completed', 'Completed', 'Completed'];
const channelSeed = ['Walk-in', 'Phone enquiry', 'Website form', 'Walk-in', 'Google profile', 'Referral', 'Walk-in', 'Website form', 'Walk-in', 'Google profile', 'Phone enquiry', 'Walk-in', 'Referral', 'Website form', 'Walk-in'];

function makeOrders(id: WorkspaceId): SalesOrder[] {
  const products = productsByWorkspace[id]; const factor = factors[id];
  return orderOffsets.map((offset, i) => ({
    id: `${id === 'technova' ? 'TN' : id === 'urban-bloom' ? 'UB' : 'PM'}-${String(1042 + i).padStart(4, '0')}`,
    date: dayOffset(offset), status: statusSeed[i], type: productTypes[id][i % productTypes[id].length], product: products[(i * 3) % products.length],
    amount: Math.round(amounts[i % amounts.length] * factor / 10) * 10,
    channel: channelSeed[i % channelSeed.length], source: 'Sample data', currency: 'INR'
  }));
}

const keywordsTech: Array<[string, string, number, number, string]> = [
  ['laptop repair Dharwad', 'Local service', 3, 5, '/laptop-repair'],
  ['refurbished laptops Dharwad', 'Transactional', 5, 8, '/refurbished-laptops'],
  ['computer shop Dharwad', 'Local / transactional', 4, 4, '/'],
  ['laptop service near me', 'Local service', 7, 9, '/laptop-repair'],
  ['used Dell laptop Hubballi', 'Transactional', 11, 14, '/refurbished-laptops'],
  ['SSD upgrade Dharwad', 'Local service', 6, 10, '/ssd-upgrade'],
  ['computer accessories Dharwad', 'Transactional', 9, 7, '/accessories'],
  ['laptop display replacement', 'Informational / service', 13, 16, '/laptop-repair']
];
const keywordsSalon: Array<[string, string, number, number, string]> = [
  ['salon in Hubballi', 'Local / transactional', 4, 6, '/'], ['hair salon Hubballi', 'Local service', 6, 8, '/hair'],
  ['bridal makeup Hubballi', 'Transactional', 8, 11, '/bridal'], ['hair spa near me', 'Local service', 9, 12, '/hair-spa'],
  ['best haircut Hubballi', 'Commercial', 5, 6, '/hair'], ['facial service Hubballi', 'Local service', 12, 14, '/skin-care'],
  ['salon open today', 'Local intent', 15, 18, '/'], ['keratin treatment Hubballi', 'Transactional', 10, 9, '/hair-treatments']
];
const keywordsMobile: Array<[string, string, number, number, string]> = [
  ['mobile shop Dharwad', 'Local / transactional', 3, 4, '/'], ['phone repair Dharwad', 'Local service', 5, 7, '/repairs'],
  ['mobile accessories Dharwad', 'Transactional', 6, 9, '/accessories'], ['refurbished phones Dharwad', 'Transactional', 10, 13, '/refurbished'],
  ['screen replacement near me', 'Local service', 8, 11, '/repairs'], ['phone battery replacement', 'Local service', 12, 13, '/repairs'],
  ['Android phones Dharwad', 'Transactional', 7, 6, '/phones'], ['mobile charger shop near me', 'Local intent', 16, 19, '/accessories']
];
const keywordSets: Record<WorkspaceId, typeof keywordsTech> = { technova: keywordsTech, 'urban-bloom': keywordsSalon, 'pixel-mobile': keywordsMobile };

function makeKeywords(id: WorkspaceId): Keyword[] {
  return keywordSets[id].map((k, i) => ({ id: `${id}-kw-${i + 1}`, keyword: k[0], intent: k[1], position: Number(k[2]), previousPosition: Number(k[3]),
    location: i % 3 === 0 ? 'Dharwad' : i % 3 === 1 ? workspaces.find(w => w.id === id)!.location.split(',')[0] : 'Karnataka', device: i % 2 ? 'Mobile' : 'Desktop',
    landingPage: `https://${workspaces.find(w => w.id === id)!.website}${k[4]}`, clicks: [24, 18, 15, 12, 9, 8, 6, 4][i], impressions: [380, 324, 302, 245, 219, 170, 149, 98][i], updated: 'Demo seed · no provider sync', demo: true }));
}

function makeDaily(id: WorkspaceId): DailyMetric[] {
  const factor = factors[id];
  return Array.from({ length: 90 }, (_, index) => {
    const offset = 89 - index;
    const wave = Math.sin(index * 0.43) * 8 + Math.cos(index * 0.16) * 4;
    const sessions = Math.max(15, Math.round((43 + wave + (index % 9) * 1.9) * factor));
    const clicks = Math.max(2, Math.round((8 + Math.sin(index * .28) * 3 + (index % 5) * .7) * factor));
    const impressions = Math.round(clicks * (12 + (index % 4) * 1.4));
    const leads = Math.max(0, Math.round((0.7 + Math.sin(index * .71) * .65 + (index % 13 === 0 ? 1 : 0)) * factor));
    const dayOrders = orderOffsets.filter(o => o === offset).length;
    return { date: dayOffset(offset), sessions, clicks, impressions, leads, revenue: 0, orders: dayOrders };
  });
}

function makeLeads(id: WorkspaceId): Lead[] {
  const interest = id === 'technova'
    ? ['Laptop repair quote', 'Refurbished laptop availability', 'SSD upgrade request', 'Business laptop enquiry', 'Laptop screen replacement', 'Bulk accessories enquiry', 'Device diagnostics', 'Refurbished laptop quote']
    : id === 'urban-bloom'
      ? ['Hair spa appointment', 'Bridal service enquiry', 'Haircut booking', 'Skin care consultation', 'Colour treatment enquiry', 'Weekend appointment', 'Keratin package', 'Service pricing enquiry']
      : ['Phone repair quote', 'Screen replacement enquiry', 'Refurbished phone availability', 'Accessory availability', 'Battery service request', 'Business device enquiry', 'Phone diagnostics', 'Charger availability'];
  const src = ['Website form', 'Phone call', 'Google profile · sample', 'Walk-in', 'Website form', 'Referral', 'Phone call', 'Google profile · sample'];
  const statuses: Lead['status'][] = ['Qualified', 'Contacted', 'New', 'Won', 'New', 'Qualified', 'Contacted', 'New'];
  return interest.map((item, i) => ({ id: `L-${id.slice(0, 2).toUpperCase()}-${String(i + 1).padStart(3, '0')}`, date: dayOffset([1, 3, 6, 10, 13, 17, 22, 28][i]), name: ['A. Kulkarni', 'R. Patil', 'S. Joshi', 'N. Naik', 'P. Shetty', 'K. Desai', 'M. Hegde', 'V. Rao'][i], interest: item, source: src[i], status: statuses[i], demo: true }));
}

function makeReviews(id: WorkspaceId): Review[] {
  const texts = id === 'technova'
    ? ['Helpful team and clear advice on the refurbished laptop options.', 'Got my laptop checked quickly. The repair estimate was easy to understand.', 'Good accessory selection. Would appreciate clearer service timelines.']
    : id === 'urban-bloom'
      ? ['Friendly staff and a relaxing appointment.', 'Loved the haircut and the stylist listened carefully.', 'Nice experience; weekend appointment slots filled up quickly.']
      : ['Helpful repair desk and a clear estimate.', 'Good selection of accessories at the store.', 'Quick service. Would like more refurbished phone choices.'];
  return texts.map((text, i) => ({ id: `RV-${id}-${i + 1}`, author: ['Ananya K.', 'Rahul P.', 'Meera S.'][i], rating: [5, 4, 3][i], date: dayOffset([2, 8, 15][i]), text, responseStatus: i === 0 ? 'Replied' : 'Needs reply', source: 'Google Business Profile · illustrative sample', demo: true }));
}

export function getDemoBundle(id: WorkspaceId) {
  const business = workspaces.find(w => w.id === id) ?? workspaces[0];
  const orders = makeOrders(id);
  const daily = makeDaily(id);
  const revenueByDate = new Map<string, number>();
  orders.filter(o => o.status === 'Completed').forEach(o => revenueByDate.set(o.date, (revenueByDate.get(o.date) ?? 0) + o.amount));
  daily.forEach(d => { d.revenue = revenueByDate.get(d.date) ?? 0; });
  const localActions = { calls: Math.round(18 * factors[id]), directions: Math.round(46 * factors[id]), websiteClicks: Math.round(62 * factors[id]), profileViews: Math.round(940 * factors[id]) };
  return { business, orders, daily, keywords: makeKeywords(id), leads: makeLeads(id), reviews: makeReviews(id), localActions,
    tasks: [
      { id: `${id}-task-1`, title: 'Review the top landing page', description: 'Check that your main service page answers the most common customer questions.', priority: 'High' as const, category: 'Website', done: false },
      { id: `${id}-task-2`, title: 'Add fresh product or service photos', description: 'Plan new photos for your business profile after connecting it.', priority: 'Medium' as const, category: 'Local SEO', done: false },
      { id: `${id}-task-3`, title: 'Write a useful FAQ section', description: 'Answer pricing, turnaround time and service-area questions.', priority: 'Medium' as const, category: 'Content', done: false },
      { id: `${id}-task-4`, title: 'Check business hours and contact details', description: 'Confirm the details shown on your website match your real-world business.', priority: 'High' as const, category: 'Profile', done: false },
      { id: `${id}-task-5`, title: 'Prepare a reply for recent feedback', description: 'Draft a personal response and post it directly in the review provider.', priority: 'Low' as const, category: 'Reviews', done: false },
      { id: `${id}-task-6`, title: 'Add internal links to service pages', description: 'Help visitors move from helpful articles to relevant service pages.', priority: 'Low' as const, category: 'Website', done: false },
    ]
  };
}

export const integrationCatalog = [
  { id: 'gsc', name: 'Google Search Console', short: 'GSC', description: 'Search clicks, impressions, CTR and average position.', state: 'Not connected', needs: 'Google OAuth consent + Search Console property access', scope: 'Read-only Search Console performance data', icon: 'search' },
  { id: 'ga4', name: 'Google Analytics 4', short: 'GA4', description: 'Website sessions, channels and eligible conversion events.', state: 'Not connected', needs: 'Google OAuth consent + GA4 property ID and viewer access', scope: 'Read-only Analytics reporting', icon: 'chart' },
  { id: 'gbp', name: 'Google Business Profile', short: 'GBP', description: 'Supported profile details and available interaction metrics.', state: 'Not connected', needs: 'Eligible Google Business Profile API project + OAuth access', scope: 'Only approved profile/insights permissions', icon: 'map' },
  { id: 'csv', name: 'Excel / CSV upload', short: 'CSV', description: 'Sales orders, leads and optional product/service records.', state: 'Available in demo', needs: 'Choose a local CSV or Excel file and map its columns', scope: 'User-selected file only; parsed in this browser demo', icon: 'file' },
  { id: 'sheets', name: 'Google Sheets', short: 'Sheets', description: 'Read-only sales or lead rows from an authorized spreadsheet.', state: 'Not connected', needs: 'OAuth or secure server-side integration + selected spreadsheet', scope: 'Prefer read-only access to selected spreadsheet', icon: 'sheet' },
  { id: 'pos', name: 'POS / CRM / order system', short: 'POS', description: 'Recorded orders, revenue and customer enquiries.', state: 'Not connected', needs: 'Supported API or an import from your current system', scope: 'Only required order and amount fields', icon: 'store' },
  { id: 'rank', name: 'Rank & review provider', short: 'Optional', description: 'May provide legitimate location-grid rankings or review sync.', state: 'Future setup', needs: 'Provider selection, credentials and terms review', scope: 'Only data permitted by the selected provider', icon: 'target' },
];
