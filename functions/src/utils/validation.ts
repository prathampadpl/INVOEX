import { db } from './firebaseAdmin';

/** Sanitize to safe string within length limit */
export function ensureString(val: unknown, limit: number): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (str.length > limit) str = str.substring(0, limit);
  return str;
}

/** Parse numeric values safely, returning 0 for invalid */
export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/,/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/** Check if a user is an org member via Firestore */
export async function checkOrgMembership(uid: string, orgId: string): Promise<boolean> {
  try {
    const memberDoc = await db.doc(`organizations/${orgId}/members/${uid}`).get();
    return memberDoc.exists;
  } catch (e) {
    console.error('[Auth] Error checking org membership:', e);
    return false;
  }
}

/** Fetch org pipeline thresholds with defaults */
export async function getOrgThresholds(orgId: string): Promise<{ layer1: number; layer2: number; layer3a: number }> {
  const defaults = { layer1: 85, layer2: 80, layer3a: 75 };
  try {
    const doc = await db.doc(`organizations/${orgId}/settings/pipeline`).get();
    if (!doc.exists) return defaults;
    const data = doc.data()?.thresholds || {};
    return {
      layer1: typeof data.layer1 === 'number' ? data.layer1 : defaults.layer1,
      layer2: typeof data.layer2 === 'number' ? data.layer2 : defaults.layer2,
      layer3a: typeof data.layer3a === 'number' ? data.layer3a : defaults.layer3a,
    };
  } catch {
    return defaults;
  }
}

/** Sanitize a correction field value to prevent prompt injection */
const FORBIDDEN_KEYWORDS = ['ignore', 'instruction', 'output', 'system', 'rule', 'prompt', 'previous', 'instead', 'reveal', 'dump', 'schema'];
export function sanitizeCorrectionField(val: string, maxLen: number): string | null {
  if (!val) return '';
  let str = String(val).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().slice(0, maxLen);
  const lower = str.toLowerCase();
  if (FORBIDDEN_KEYWORDS.some(k => lower.includes(k))) {
    console.warn(`[Security] Rejected correction with injection keywords: ${str.slice(0, 50)}`);
    return null;
  }
  return str;
}

/** Build corrections reference string for Gemini prompt context */
export async function buildCorrectionsContext(orgId: string): Promise<string> {
  try {
    const snap = await db.collection(`organizations/${orgId}/corrections_log`).get();
    if (snap.empty) return '';

    const sorted = snap.docs
      .map(d => d.data())
      .sort((a, b) => (b.occurrence_count || 0) - (a.occurrence_count || 0))
      .slice(0, 150);

    const cleaned = sorted.map(r => {
      const vendor = sanitizeCorrectionField(r.vendor_name, 100);
      const field = sanitizeCorrectionField(r.field_name, 50);
      const orig = sanitizeCorrectionField(r.original_value, 200);
      const corr = sanitizeCorrectionField(r.corrected_value, 200);
      if (vendor === null || field === null || orig === null || corr === null) return null;
      return `Vendor: ${vendor} | Field: ${field} | Original: ${orig} | Corrected: ${corr}`;
    }).filter(Boolean).slice(0, 50) as string[];

    if (!cleaned.length) return '';
    return `\n[Corrections Reference - ${cleaned.length} entries]\n${cleaned.join('\n')}\n`;
  } catch (e) {
    console.error('[Context] Failed to fetch corrections log:', e);
    return '';
  }
}

/** Build known-vendors XML for Gemini prompt context */
export async function buildVendorsContext(orgId: string): Promise<string> {
  try {
    const snap = await db.collection(`organizations/${orgId}/invoices`)
      .where('status', '==', 'Approved')
      .orderBy('uploadedAt', 'desc')
      .limit(300)
      .get();

    const vendorMap = new Map<string, string>();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.vendorName && d.vendorGSTIN) {
        const cleanName = String(d.vendorName).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().slice(0, 100);
        const cleanGstin = String(d.vendorGSTIN).replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().slice(0, 20);
        vendorMap.set(cleanName, cleanGstin);
      }
    });

    if (!vendorMap.size) return '';
    const entries = Array.from(vendorMap.entries())
      .map(([name, gstin]) => `<vendor name="${name}" gstin="${gstin}" />`);
    return `\n<known_vendors_reference>\n<vendors>\n${entries.join('\n')}\n</vendors>\n</known_vendors_reference>\n`;
  } catch (e) {
    console.error('[Context] Failed to fetch known vendors:', e);
    return '';
  }
}
