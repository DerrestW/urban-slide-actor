export interface CityInput {
  city: string;
  state: string;
  stateCode: string;
  population?: number;
}

export function buildSearchQueries(city: CityInput): string[] {
  const { city: cityName, state, stateCode } = city;
  const cityState = `"${cityName}" "${state}"`;
  const cityStateShort = `"${cityName}" "${stateCode}"`;

  // Guess common city domain patterns
  const citySlug = cityName.toLowerCase().replace(/\s+/g, "");
  const possibleDomains = [
    `cityof${citySlug}.com`,
    `cityof${citySlug}.gov`,
    `${citySlug}.gov`,
    `${citySlug}${stateCode.toLowerCase()}.gov`,
    `www.${citySlug}.gov`,
    `city${citySlug}.gov`,
  ];

  const queries: string[] = [
    // Role-based searches
    `${cityState} "special events" director coordinator contact`,
    `${cityState} "parks and recreation director"`,
    `${cityState} "economic development director"`,
    `${cityState} "city manager" email contact`,
    `${cityState} "tourism director"`,
    `${cityState} "community development director"`,
    `${cityState} "public information officer"`,
    `${cityState} "event coordinator" city email`,
    `${cityState} "communications director"`,
    `${cityState} "CVB director" OR "visitors bureau" director`,

    // Directory-based searches
    `${cityState} city staff directory`,
    `${cityState} city hall staff contact`,

    // Site-specific searches for likely domains
    ...possibleDomains.slice(0, 3).map((d) => `site:${d} staff directory contact`),
    ...possibleDomains.slice(0, 2).map((d) => `site:${d} parks recreation`),
    ...possibleDomains.slice(0, 2).map((d) => `site:${d} special events`),

    // PDF searches
    `${cityState} city staff directory filetype:pdf`,
    `${cityState} "parks and recreation" staff filetype:pdf`,
  ];

  return [...new Set(queries)]; // deduplicate
}

// URL quality filter
export const HIGH_PRIORITY_URL_KEYWORDS = [
  "staff", "directory", "contact", "department", "leadership",
  "administration", "parks", "recreation", "events", "special-events",
  "tourism", "visitor", "economic-development", "community-development",
  "communications", "public-information", "city-manager", "cultural-affairs",
  "downtown", "main-street", "about", "team", "personnel",
];

export const LOW_PRIORITY_URL_KEYWORDS = [
  "calendar", "news", "minutes", "agenda", "archive",
  "ordinance", "bid", "procurement", "jobs", "employment",
  "police", "fire", "utilities", "court", "tax", "permit",
];

export const REJECTED_DOMAINS = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com",
  "tiktok.com", "indeed.com", "glassdoor.com", "yelp.com",
  "yellowpages.com", "whitepages.com", "spokeo.com", "beenverified.com",
  "fastpeoplesearch.com", "truepeoplesearch.com", "radaris.com",
  "peoplefinders.com", "zabasearch.com",
];

export function isRejectedDomain(url: string): boolean {
  return REJECTED_DOMAINS.some((d) => url.includes(d));
}

export function getUrlPriority(url: string): "high" | "medium" | "low" {
  const lowerUrl = url.toLowerCase();
  if (HIGH_PRIORITY_URL_KEYWORDS.some((k) => lowerUrl.includes(k))) return "high";
  if (LOW_PRIORITY_URL_KEYWORDS.some((k) => lowerUrl.includes(k))) return "low";
  return "medium";
}

export function isOfficialDomain(url: string, city: CityInput): boolean {
  const lowerUrl = url.toLowerCase();
  const citySlug = city.city.toLowerCase().replace(/\s+/g, "");

  if (lowerUrl.includes(".gov")) return true;
  if (lowerUrl.includes(citySlug)) return true;
  if (lowerUrl.includes("cityof" + citySlug)) return true;
  if (lowerUrl.includes("visitortourism") || lowerUrl.includes("tourism")) return true;
  if (lowerUrl.includes("parks") && lowerUrl.includes("recreation")) return true;

  return false;
}
