import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type JsonRecord = Record<string, unknown>;
type DisplayScore = { label: string; value: number | null };
type DisplayMetric = { label: string; value: string; status?: string };
type DisplayOpportunity = { title: string; details: string; savings: string };
type AuditDisplay = {
  scores?: DisplayScore[];
  metrics?: DisplayMetric[];
  opportunities?: DisplayOpportunity[];
  note?: string;
};
type AuditError = Error & { status?: number; code?: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function json(req: Request, body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 450) : "Website audit failed. Please retry.";
}
function auditError(message: string, status = 502, code?: string): AuditError {
  const error = new Error(message) as AuditError;
  error.status = status;
  error.code = code;
  return error;
}
function validPublicUrl(raw: string): URL {
  let candidate = raw.trim();
  if (!candidate) throw auditError("Add the business website in Settings before running an audit.", 400, "website_required");
  if (!/^https?:\/\//i.test(candidate)) candidate = "https://" + candidate;
  let url: URL;
  try { url = new URL(candidate); } catch { throw auditError("The saved business website is not a valid URL.", 400, "invalid_url"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw auditError("The business website must be a public HTTP or HTTPS URL.", 400, "invalid_url");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") ||
    host === "home.arpa" || host.endsWith(".home.arpa") || host.endsWith(".onion") ||
    host.includes(":")
  ) throw auditError("Only public, internet-reachable business websites can be audited.", 400, "non_public_url");
  const octets = host.split(".");
  if (octets.length === 4 && octets.every(part => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)) {
    const [a, b] = octets.map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))) {
      throw auditError("Private or reserved IP addresses cannot be audited.", 400, "non_public_url");
    }
  }
  url.hash = "";
  return url;
}
async function getUser(req: Request): Promise<{ id: string }> {
  if (!admin) throw auditError("Supabase server configuration is missing.", 503, "server_config_missing");
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw auditError("Sign in to run a website audit.", 401, "auth_required");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw auditError("Your session is invalid or expired. Sign in again.", 401, "invalid_session");
  return { id: data.user.id };
}
async function fetchJson(url: URL, init?: RequestInit, provider?: string): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw auditError("The audit provider could not be reached. Check its availability and try again.", 502, "provider_unreachable");
  }
  let body: unknown = {};
  try { body = await response.json(); } catch { /* A non-JSON response is handled below. */ }
  if (!response.ok) {
    if (provider === "chrome_ux_report" && response.status === 404) {
      throw auditError("CrUX has no eligible real-user data for this URL/origin and device yet.", 200, "crux_no_record");
    }
    if (response.status === 429) throw auditError("The provider rate limit was reached. Please retry later.", 429, "provider_rate_limited");
    if (response.status === 403 || response.status === 401) {
      throw auditError("Google rejected this API request. Check that the required API is enabled and the server-side API key is valid.", 403, "provider_access_denied");
    }
    if (provider === "pagespeed_insights" && response.status === 400) {
      throw auditError("PageSpeed could not audit this URL. Confirm the public site is reachable, then retry.", 400, "pagespeed_invalid_url");
    }
    throw auditError("The provider returned an error (" + response.status + "). Please retry later.", 502, "provider_error");
  }
  if (!isRecord(body)) throw auditError("The provider returned an unexpected response.", 502, "invalid_provider_response");
  return body;
}
function score(lighthouseCategories: JsonRecord, key: string, label: string): DisplayScore {
  const category = isRecord(lighthouseCategories[key]) ? lighthouseCategories[key] as JsonRecord : {};
  const raw = numberValue(category.score);
  return { label, value: raw === null ? null : Math.round(raw * 100) };
}
async function runPageSpeed(target: URL, strategy: "mobile" | "desktop"): Promise<AuditDisplay> {
  const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", target.toString());
  endpoint.searchParams.set("strategy", strategy.toUpperCase());
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) endpoint.searchParams.append("category", category);
  const key = Deno.env.get("PAGESPEED_INSIGHTS_API_KEY")?.trim();
  if (key) endpoint.searchParams.set("key", key);
  const data = await fetchJson(endpoint, undefined, "pagespeed_insights");
  const lighthouse = isRecord(data.lighthouseResult) ? data.lighthouseResult : {};
  const categories = isRecord(lighthouse.categories) ? lighthouse.categories : {};
  const audits = isRecord(lighthouse.audits) ? lighthouse.audits : {};
  const scores = [
    score(categories, "performance", "Performance"),
    score(categories, "accessibility", "Accessibility"),
    score(categories, "best-practices", "Best practices"),
    score(categories, "seo", "SEO"),
  ];
  const auditDefinitions = [
    ["largest-contentful-paint", "Largest Contentful Paint"],
    ["first-contentful-paint", "First Contentful Paint"],
    ["cumulative-layout-shift", "Cumulative Layout Shift"],
    ["total-blocking-time", "Total Blocking Time"],
    ["speed-index", "Speed Index"],
  ];
  const metrics: DisplayMetric[] = auditDefinitions.flatMap(([id, label]) => {
    const item = isRecord(audits[id]) ? audits[id] as JsonRecord : {};
    const display = stringValue(item.displayValue);
    const value = display || (numberValue(item.numericValue) === null ? "" : String(item.numericValue));
    return value ? [{ label, value }] : [];
  });
  const opportunities = Object.entries(audits)
    .map(([id, raw]) => {
      if (!isRecord(raw)) return null;
      const title = stringValue(raw.title);
      const details = stringValue(raw.description).replace(/\s*Learn more\s*$/i, "").slice(0, 220);
      const detailsObj = isRecord(raw.details) ? raw.details : {};
      const savings = numberValue(detailsObj.overallSavingsMs);
      if (!title || numberValue(raw.score) === null || numberValue(raw.score) === 1 || savings === null || savings <= 0) return null;
      return { id, title, details, savingsMs: savings, savings: Math.round(savings) + " ms potential savings" };
    })
    .filter((x): x is { id: string; title: string; details: string; savingsMs: number; savings: string } => x !== null)
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 5)
    .map(({ title, details, savings }) => ({ title, details, savings }));
  return {
    scores,
    metrics,
    opportunities,
    note: "Lighthouse lab audit for " + strategy + ". These scores are not a substitute for real-user field data.",
  };
}
function cruxMetric(metrics: JsonRecord, key: string, label: string, unit: "ms" | "cls"): DisplayMetric | null {
  const metric = isRecord(metrics[key]) ? metrics[key] as JsonRecord : {};
  const percentiles = isRecord(metric.percentiles) ? metric.percentiles : {};
  const p75 = numberValue(percentiles.p75);
  if (p75 === null) return null;
  let value: string;
  let status: string;
  if (unit === "cls") {
    value = p75.toFixed(3);
    status = p75 <= 0.1 ? "good" : p75 <= 0.25 ? "needs improvement" : "poor";
  } else {
    value = p75 >= 1000 ? (p75 / 1000).toFixed(1) + " s" : Math.round(p75) + " ms";
    const good = key === "largest_contentful_paint" ? 2500 : 200;
    const poor = key === "largest_contentful_paint" ? 4000 : 500;
    status = p75 <= good ? "good" : p75 <= poor ? "needs improvement" : "poor";
  }
  return { label, value, status };
}
async function runCrux(target: URL, strategy: "mobile" | "desktop"): Promise<AuditDisplay> {
  const key = Deno.env.get("CRUX_API_KEY")?.trim();
  if (!key) throw auditError("Set the server-side CRUX_API_KEY secret in Supabase Edge Function secrets. Use a Google Cloud API key with the Chrome UX Report API enabled.", 400, "crux_key_missing");
  const endpoint = new URL("https://chromeuxreport.googleapis.com/v1/records:queryRecord");
  endpoint.searchParams.set("key", key);
  const data = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: target.origin,
      formFactor: strategy === "desktop" ? "DESKTOP" : "PHONE",
      metrics: ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"],
    }),
  }, "chrome_ux_report");
  const record = isRecord(data.record) ? data.record : {};
  const metrics = isRecord(record.metrics) ? record.metrics : {};
  const extracted = [
    cruxMetric(metrics, "largest_contentful_paint", "LCP (75th percentile)", "ms"),
    cruxMetric(metrics, "interaction_to_next_paint", "INP (75th percentile)", "ms"),
    cruxMetric(metrics, "cumulative_layout_shift", "CLS (75th percentile)", "cls"),
  ].filter((x): x is DisplayMetric => x !== null);
  if (!extracted.length) throw auditError("CrUX returned no supported metrics for this origin and device.", 200, "crux_no_metrics");
  return {
    metrics: extracted,
    note: "Aggregated real-user field data for " + target.origin + " (" + strategy + "). Values are 75th-percentile metrics over Google's collection period.",
  };
}
async function saveAudit(
  payload: { workspaceId: string; businessId: string; userId: string; provider: string; strategy: string; target: URL; result: AuditDisplay; runStatus: "completed" | "failed"; errorMessage: string | null },
): Promise<JsonRecord> {
  if (!admin) throw auditError("Supabase server configuration is missing.", 503, "server_config_missing");
  const { data, error } = await admin.from("website_performance_audits").insert({
    workspace_id: payload.workspaceId,
    business_id: payload.businessId,
    created_by: payload.userId,
    provider: payload.provider,
    strategy: payload.strategy,
    target_url: payload.target.toString(),
    run_status: payload.runStatus,
    result: payload.result,
    error_message: payload.errorMessage,
  }).select("*").single();
  if (error || !data) throw auditError("The audit ran, but its result could not be saved. Check the website-performance migration.", 500, "audit_save_failed");
  return data as JsonRecord;
}
async function run(req: Request, body: JsonRecord): Promise<Response> {
  if (!admin) return json(req, { error: "Supabase server configuration is missing." }, 503);
  let user: { id: string };
  try { user = await getUser(req); } catch (error) {
    const err = error as AuditError;
    return json(req, { error: safeMessage(error) }, err.status ?? 401);
  }
  const workspaceId = stringValue(body.workspaceId);
  const businessId = stringValue(body.businessId);
  const provider = stringValue(body.provider);
  const strategy: "mobile" | "desktop" = body.strategy === "desktop" ? "desktop" : "mobile";
  if (!workspaceId || !businessId) return json(req, { error: "Choose a workspace and business first." }, 400);
  if (!["pagespeed_insights", "chrome_ux_report"].includes(provider)) return json(req, { error: "Unsupported website audit provider." }, 400);

  const { data: membership, error: membershipError } = await admin.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership) return json(req, { error: "You do not have access to this workspace." }, 403);
  if (membership.role === "viewer") return json(req, { error: "Viewer access cannot start new provider audits." }, 403);

  const { data: business, error: businessError } = await admin.from("businesses")
    .select("id,workspace_id,name,website").eq("id", businessId).eq("workspace_id", workspaceId).maybeSingle();
  if (businessError || !business) return json(req, { error: "Choose a business in this workspace." }, 403);
  let target: URL;
  try { target = validPublicUrl(stringValue(business.website)); } catch (error) {
    const err = error as AuditError;
    return json(req, { error: safeMessage(error), code: err.code }, err.status ?? 400);
  }
  if (provider === "chrome_ux_report" && !Deno.env.get("CRUX_API_KEY")?.trim()) {
    return json(req, {
      setupRequired: true,
      error: "CrUX is not configured on the LocalPulse server yet.",
      missingSecrets: ["CRUX_API_KEY"],
      instructions: "Enable Chrome UX Report API in Google Cloud, create a server-side API key restricted to that API, then add CRUX_API_KEY in Supabase → Edge Functions → Secrets.",
    }, 200);
  }

  // Keep unauthenticated provider quotas from being consumed in a tight loop.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await admin.from("website_performance_audits")
    .select("id").eq("workspace_id", workspaceId).eq("business_id", businessId)
    .gte("created_at", hourAgo).limit(3);
  if (recentError) return json(req, { error: "Could not check audit rate limits. Verify the audit migration is applied." }, 500);
  if ((recent || []).length >= 3) return json(req, { error: "This business has reached the limit of 3 audits per hour. Try again later." }, 429);

  try {
    const result = provider === "pagespeed_insights"
      ? await runPageSpeed(target, strategy)
      : await runCrux(target, strategy);
    const audit = await saveAudit({
      workspaceId, businessId, userId: user.id, provider, strategy, target,
      result, runStatus: "completed", errorMessage: null,
    });
    return json(req, { success: true, audit });
  } catch (error) {
    const err = error as AuditError;
    if (err.code === "crux_key_missing") return json(req, { setupRequired: true, error: safeMessage(error), missingSecrets: ["CRUX_API_KEY"] }, 200);
    const message = safeMessage(error);
    try {
      const audit = await saveAudit({
        workspaceId, businessId, userId: user.id, provider, strategy, target,
        result: {}, runStatus: "failed", errorMessage: message,
      });
      return json(req, { success: false, error: message, audit }, 200);
    } catch {
      return json(req, { success: false, error: message }, err.status && err.status >= 400 ? err.status : 502);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json(req, { error: "Use POST for website audit actions." }, 405);
  let body: unknown;
  try { body = await req.json(); } catch { return json(req, { error: "Request body must be valid JSON." }, 400); }
  if (!isRecord(body) || body.action !== "run") return json(req, { error: "Use action: run." }, 400);
  return await run(req, body);
});
