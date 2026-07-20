import { RawContact } from "./extract-html";
import { normalizeRole, getContactCategory, roleRanking, NormalizedRole } from "./normalize-title";
import { isOfficialDomain, getUrlPriority } from "./search";
import { CityInput } from "./search";

export interface ScoredContact {
  // City info
  city: string;
  state: string;
  stateCode: string;
  population?: number;

  // Contact info
  fullName: string;
  exactJobTitle: string;
  normalizedRole: NormalizedRole | null;
  contactCategory: string;
  department: string;
  email: string | null;
  emailType: "published" | "inferred" | null;
  directPhone: string | null;
  rawPhone: string | null;

  // Source
  sourceUrl: string;
  sourceDomain: string;
  sourceType: string;
  evidenceText: string;

  // Scoring
  confidenceScore: number;
  confidenceLevel: "high" | "medium" | "low";
  isCurrent: boolean;
  reviewStatus: "approved" | "needs_review" | "rejected";
  lastVerifiedAt: string;
}

function getDomainType(url: string): string {
  if (url.includes(".gov")) return "city_government";
  if (url.includes("tourism") || url.includes("visit")) return "tourism_org";
  if (url.includes("parks")) return "parks_department";
  if (url.includes("economic") || url.includes("development")) return "economic_dev";
  return "official_site";
}

export function scoreContact(
  raw: RawContact,
  city: CityInput,
  isPdf = false
): ScoredContact {
  let score = 0;

  // Domain scoring
  const isOfficial = isOfficialDomain(raw.sourceUrl, city);
  if (isOfficial) score += 40;

  // Contact method scoring
  if (raw.email) score += 20;
  if (raw.directPhone) score += 15;

  // Title scoring
  const role = normalizeRole(raw.exactJobTitle);
  if (role && role !== "other_relevant") {
    score += 10; // exact match
  } else if (raw.exactJobTitle) {
    score += 5; // related title
  }

  // URL priority bonus
  const priority = getUrlPriority(raw.sourceUrl);
  if (priority === "high") score += 5;

  // PDF penalty
  if (isPdf) score -= 20;

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  const confidenceLevel: "high" | "medium" | "low" =
    score >= 80 ? "high" : score >= 60 ? "medium" : "low";

  const category = role ? getContactCategory(role) : "event_operations";

  return {
    city: city.city,
    state: city.state,
    stateCode: city.stateCode,
    population: city.population,
    fullName: raw.fullName,
    exactJobTitle: raw.exactJobTitle,
    normalizedRole: role,
    contactCategory: category,
    department: raw.department,
    email: raw.email,
    emailType: raw.email ? "published" : null,
    directPhone: raw.directPhone,
    rawPhone: raw.rawPhone,
    sourceUrl: raw.sourceUrl,
    sourceDomain: new URL(raw.sourceUrl).hostname,
    sourceType: getDomainType(raw.sourceUrl),
    evidenceText: raw.evidenceText,
    confidenceScore: score,
    confidenceLevel,
    isCurrent: true,
    reviewStatus: score >= 60 ? "approved" : "needs_review",
    lastVerifiedAt: new Date().toISOString(),
  };
}

export function deduplicateContacts(contacts: ScoredContact[]): ScoredContact[] {
  const byEmail = new Map<string, ScoredContact>();
  const byName = new Map<string, ScoredContact>();

  for (const contact of contacts) {
    if (contact.email) {
      const key = `${contact.city}|${contact.stateCode}|${contact.email}`.toLowerCase();
      const existing = byEmail.get(key);
      if (!existing || contact.confidenceScore > existing.confidenceScore) {
        byEmail.set(key, contact);
      }
    } else {
      const key = `${contact.city}|${contact.stateCode}|${contact.fullName}|${contact.normalizedRole}`.toLowerCase();
      const existing = byName.get(key);
      if (!existing || contact.confidenceScore > existing.confidenceScore) {
        byName.set(key, contact);
      }
    }
  }

  return [...byEmail.values(), ...byName.values()];
}

export function selectBestContacts(
  contacts: ScoredContact[],
  min: number,
  max: number
): ScoredContact[] {
  // Filter to approved contacts only
  const qualified = contacts.filter((c) => c.confidenceLevel !== "low" && c.fullName);

  // Sort by role ranking then confidence
  qualified.sort((a, b) => {
    const rankA = a.normalizedRole ? (roleRanking[a.normalizedRole] || 99) : 99;
    const rankB = b.normalizedRole ? (roleRanking[b.normalizedRole] || 99) : 99;
    if (rankA !== rankB) return rankA - rankB;
    return b.confidenceScore - a.confidenceScore;
  });

  // Ensure category diversity - try to get one from each category
  const categories = new Set<string>();
  const selected: ScoredContact[] = [];
  const remainder: ScoredContact[] = [];

  for (const c of qualified) {
    if (!categories.has(c.contactCategory) && selected.length < 3) {
      selected.push(c);
      categories.add(c.contactCategory);
    } else {
      remainder.push(c);
    }
  }

  // Fill up to max with remaining contacts
  for (const c of remainder) {
    if (selected.length >= max) break;
    selected.push(c);
  }

  return selected.slice(0, max);
}
