import { Actor, log } from "apify";
import { PlaywrightCrawler, RequestQueue } from "crawlee";
import { buildSearchQueries, isRejectedDomain, isOfficialDomain, getUrlPriority, CityInput } from "./search";
import { extractContactsFromHtml } from "./extract-html";
import { scoreContact, deduplicateContacts, selectBestContacts, ScoredContact } from "./confidence";

interface ActorInput {
  cities: CityInput[];
  minimumContactsPerCity?: number;
  maximumContactsPerCity?: number;
  crawlDepth?: number;
  maximumPagesPerDomain?: number;
  includePdfs?: boolean;
}

// Track contacts per city across requests
const cityContacts = new Map<string, ScoredContact[]>();

async function runGoogleSearch(query: string, apifyToken: string): Promise<string[]> {
  try {
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: query,
          maxPagesPerQuery: 2,
          resultsPerPage: 10,
          mobileResults: false,
        }),
      }
    );

    if (!startRes.ok) return [];
    const run = await startRes.json();
    const runId = run?.data?.id;
    if (!runId) return [];

    // Poll for completion
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
      const status = await statusRes.json();
      if (status?.data?.status === "SUCCEEDED") {
        const dataRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apifyToken}&limit=50`);
        const items = await dataRes.json();
        const urls: string[] = [];
        for (const item of items) {
          // Extract actual result URLs from organicResults
          for (const organic of (item.organicResults || [])) {
            const url = organic.url || organic.link;
            if (url && !isRejectedDomain(url)) urls.push(url);
          }
        }
        return urls;
      }
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status?.data?.status)) return [];
    }
  } catch (e) {
    log.error("Google search failed", { query, error: String(e) });
  }
  return [];
}

Actor.main(async () => {
  const input = (await Actor.getInput<ActorInput>()) ?? { cities: [] };
  const {
    cities = [],
    minimumContactsPerCity = 3,
    maximumContactsPerCity = 8,
    crawlDepth = 3,
    maximumPagesPerDomain = 75,
    includePdfs = true,
  } = input;

  if (!cities.length) {
    log.error("No cities provided in input");
    return;
  }

  const apifyToken = process.env.APIFY_TOKEN || "";
  log.info(`Starting Urban Slide contact scraper for ${cities.length} cities`);

  const citySummaries: any[] = [];

  for (const city of cities) {
    const cityKey = `${city.city}|${city.stateCode}`.toLowerCase();
    cityContacts.set(cityKey, []);

    log.info(`Processing ${city.city}, ${city.state}`);

    // Step 1: Generate search queries
    const queries = buildSearchQueries(city);

    // Step 2: Run Google searches to discover URLs
    const discoveredUrls = new Set<string>();

    // Always add likely city website URLs
    const citySlug = city.city.toLowerCase().replace(/\s+/g, "");
    const likelyUrls = [
      `https://www.${citySlug}.gov`,
      `https://www.cityof${citySlug}.com`,
      `https://www.${citySlug}${city.stateCode.toLowerCase()}.gov`,
      `https://www.${citySlug}.gov/departments`,
      `https://www.${citySlug}.gov/staff`,
      `https://www.${citySlug}.gov/parks`,
      `https://www.${citySlug}.gov/events`,
    ];
    likelyUrls.forEach((u) => discoveredUrls.add(u));

    // Run a subset of queries to control costs
    const queryBatch = queries.slice(0, 8);
    for (const query of queryBatch) {
      log.info(`Searching: ${query}`);
      const urls = await runGoogleSearch(query, apifyToken);
      urls.forEach((u) => {
        if (!isRejectedDomain(u) && isOfficialDomain(u, city)) {
          discoveredUrls.add(u);
        }
      });
      await new Promise((r) => setTimeout(r, 500)); // Rate limit
    }

    log.info(`Found ${discoveredUrls.size} URLs to crawl for ${city.city}`);

    // Step 3: Crawl discovered URLs with Playwright
    const queueName = `${city.city}-${city.stateCode}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    log.info(`Opening request queue: ${queueName}`);
    const requestQueue = await RequestQueue.open(queueName);

    for (const url of discoveredUrls) {
      await requestQueue.addRequest({
        url,
        userData: { city, depth: 0, priority: getUrlPriority(url) },
      });
    }

    let pagesCrawled = 0;

    const crawler = new PlaywrightCrawler({
      requestQueue,
      maxRequestsPerCrawl: maximumPagesPerDomain,
      maxConcurrency: 3,
      requestHandlerTimeoutSecs: 30,

      async requestHandler({ request, page, enqueueLinks }) {
        const { city: cityData, depth } = request.userData;
        pagesCrawled++;

        log.info(`Crawling [${pagesCrawled}]: ${request.url}`);

        // Get page content
        let html = "";
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
          html = await page.content();
        } catch {
          return;
        }

        // Extract contacts from this page
        const rawContacts = extractContactsFromHtml(html, request.url);
        log.info(`Found ${rawContacts.length} raw contacts on ${request.url}`);

        // Score and store contacts
        for (const raw of rawContacts) {
          if (!raw.fullName && !raw.email) continue;
          const scored = scoreContact(raw, cityData);
          const existing = cityContacts.get(cityKey) || [];
          cityContacts.set(cityKey, [...existing, scored]);
        }

        // Check if we have enough contacts
        const current = cityContacts.get(cityKey) || [];
        const qualified = deduplicateContacts(current).filter((c) => c.confidenceLevel !== "low");
        if (qualified.length >= maximumContactsPerCity) {
          log.info(`${city.city} has enough contacts (${qualified.length}), stopping crawl`);
          return;
        }

        // Enqueue relevant internal links if not too deep
        if (depth < crawlDepth) {
          await enqueueLinks({
            strategy: "same-domain",
            transformRequestFunction: (req) => {
              const priority = getUrlPriority(req.url);
              if (priority === "low") return false; // Skip low priority
              req.userData = { ...request.userData, depth: depth + 1 };
              return req;
            },
            regexps: [
              /staff|directory|contact|department|parks|recreation|events|tourism|economic|community|cultural|downtown|leadership|administration|personnel/i,
            ],
          });
        }
      },

      failedRequestHandler({ request, error }) {
        log.warning(`Failed: ${request.url} - ${String(error)}`);
      },
    });

    await crawler.run();

    // Step 4: Select best contacts for this city
    const allContacts = cityContacts.get(cityKey) || [];
    const deduplicated = deduplicateContacts(allContacts);
    const selected = selectBestContacts(deduplicated, minimumContactsPerCity, maximumContactsPerCity);

    log.info(`${city.city}: ${selected.length} qualified contacts from ${pagesCrawled} pages`);

    // Push to Apify dataset
    for (const contact of selected) {
      await Actor.pushData(contact);
    }

    // City summary
    citySummaries.push({
      city: city.city,
      state: city.state,
      status: selected.length >= minimumContactsPerCity ? "complete" : "partial",
      contactsFound: allContacts.length,
      qualifiedContacts: selected.length,
      publishedEmails: selected.filter((c) => c.email).length,
      directPhones: selected.filter((c) => c.directPhone).length,
      pagesCrawled,
      notes: selected.length < minimumContactsPerCity
        ? `Only ${selected.length} qualified contacts found. City site may limit public contact info.`
        : null,
    });

    log.info(`Completed ${city.city}: ${selected.length}/${minimumContactsPerCity} contacts`);
  }

  // Save city summaries
  await Actor.setValue("CITY_SUMMARIES", citySummaries);
  log.info("All cities complete. Summaries saved.");
});
