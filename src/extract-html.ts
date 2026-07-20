import * as cheerio from "cheerio";

export interface RawContact {
  fullName: string;
  exactJobTitle: string;
  department: string;
  email: string | null;
  directPhone: string | null;
  rawPhone: string | null;
  sourceUrl: string;
  evidenceText: string;
}

// Email regex - conservative, handles obfuscation
const EMAIL_PATTERNS = [
  /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
  /([a-zA-Z0-9._%+\-]+)\s*[\[\(]at[\]\)]\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  /([a-zA-Z0-9._%+\-]+)\s*@\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
];

const PHONE_PATTERN = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}(\s*(ext|x|extension)\.?\s*\d+)?/gi;

// Negative patterns to filter bad contacts
const NEGATIVE_EMPLOYMENT_PHRASES = [
  /\bformer\b/i, /\bretired\b/i, /\bresigned\b/i, /\bdeparted\b/i,
  /\bpreviously served\b/i, /\binterim until\b/i, /\bsuccessor\b/i,
  /\bno longer\b/i,
];

// Target title patterns for quick identification
const TARGET_TITLE_PATTERN = /special events?|event (coordinator|manager|director)|parks?.*(recreation|director)|recreation director|economic development|city manager|assistant city manager|tourism|visitors? bureau|CVB|public (affairs|information)|communications? director|community (development|engagement)|cultural affairs|downtown development|main street director|festival coordinator|public information officer/i;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}

function extractEmail(text: string): string | null {
  // Try direct email first
  const direct = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (direct) return direct[0].toLowerCase();

  // Try obfuscated formats
  const obfuscated = text.match(/([a-zA-Z0-9._%+\-]+)\s*[\[\(]at[\]\)]\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (obfuscated) return `${obfuscated[1]}@${obfuscated[2]}`.toLowerCase();

  return null;
}

function hasNegativePhrase(text: string): boolean {
  return NEGATIVE_EMPLOYMENT_PHRASES.some((p) => p.test(text));
}

export function extractContactsFromHtml(html: string, sourceUrl: string): RawContact[] {
  const $ = cheerio.load(html);
  const contacts: RawContact[] = [];

  // Strategy 1: Staff card / contact card patterns
  const cardSelectors = [
    ".staff-card", ".contact-card", ".team-member", ".employee",
    ".staff-member", ".person-card", ".directory-item", ".contact-item",
    "[class*='staff']", "[class*='contact']", "[class*='team']", "[class*='director']",
    ".card", ".panel", "article",
  ];

  for (const selector of cardSelectors) {
    $(selector).each((_, el) => {
      const text = $(el).text().trim();
      if (!text || text.length < 20) return;
      if (hasNegativePhrase(text)) return;

      // Check if it contains a relevant title
      if (!TARGET_TITLE_PATTERN.test(text)) return;

      const email = extractEmail($(el).find("a[href^='mailto:']").attr("href") || text);
      const phoneMatch = text.match(PHONE_PATTERN);

      // Try to extract name - look for headings first
      const nameEl = $(el).find("h1,h2,h3,h4,h5,strong,b,.name,[class*='name']").first();
      const name = nameEl.text().trim() || "";

      // Find title
      const titleEl = $(el).find(".title,.position,.role,[class*='title'],[class*='position']").first();
      let title = titleEl.text().trim();

      // If no explicit title element, try to extract from text around name
      if (!title && TARGET_TITLE_PATTERN.test(text)) {
        const titleMatch = text.match(TARGET_TITLE_PATTERN);
        if (titleMatch) title = titleMatch[0];
      }

      if (name && title && (email || phoneMatch)) {
        contacts.push({
          fullName: name,
          exactJobTitle: title,
          department: "",
          email,
          directPhone: phoneMatch ? normalizePhone(phoneMatch[0]) : null,
          rawPhone: phoneMatch ? phoneMatch[0] : null,
          sourceUrl,
          evidenceText: text.substring(0, 300),
        });
      }
    });
  }

  // Strategy 2: Table rows (common in gov staff directories)
  $("table tr").each((_, row) => {
    const cells = $(row).find("td,th").toArray();
    if (cells.length < 2) return;

    const cellTexts = cells.map((c) => $(c).text().trim());
    const rowText = cellTexts.join(" ");

    if (!TARGET_TITLE_PATTERN.test(rowText)) return;
    if (hasNegativePhrase(rowText)) return;

    const emailInRow = extractEmail($(row).find("a[href^='mailto:']").attr("href") || rowText);
    const phoneMatch = rowText.match(PHONE_PATTERN);

    // Heuristic: first cell is often name, second is title
    if (cellTexts[0] && cellTexts[1]) {
      contacts.push({
        fullName: cellTexts[0],
        exactJobTitle: cellTexts[1],
        department: cellTexts[2] || "",
        email: emailInRow,
        directPhone: phoneMatch ? normalizePhone(phoneMatch[0]) : null,
        rawPhone: phoneMatch ? phoneMatch[0] : null,
        sourceUrl,
        evidenceText: rowText.substring(0, 300),
      });
    }
  });

  // Strategy 3: Definition lists (dt/dd pairs)
  $("dl").each((_, dl) => {
    const text = $(dl).text();
    if (!TARGET_TITLE_PATTERN.test(text)) return;
    if (hasNegativePhrase(text)) return;

    const terms = $(dl).find("dt").toArray();
    const defs = $(dl).find("dd").toArray();

    let name = "", title = "", email: string | null = null, phone: string | null = null;

    terms.forEach((term, i) => {
      const termText = $(term).text().toLowerCase().trim();
      const defText = $(defs[i])?.text().trim() || "";

      if (termText.includes("name")) name = defText;
      else if (termText.includes("title") || termText.includes("position")) title = defText;
      else if (termText.includes("email")) email = extractEmail(defText);
      else if (termText.includes("phone") || termText.includes("contact")) {
        const m = defText.match(PHONE_PATTERN);
        phone = m ? normalizePhone(m[0]) : null;
      }
    });

    if (name && title) {
      contacts.push({
        fullName: name,
        exactJobTitle: title,
        department: "",
        email,
        directPhone: phone,
        rawPhone: phone,
        sourceUrl,
        evidenceText: text.substring(0, 300),
      });
    }
  });

  // Strategy 4: Heading + adjacent text pattern (common on small city sites)
  $("h1,h2,h3,h4").each((_, heading) => {
    const headingText = $(heading).text().trim();
    if (!TARGET_TITLE_PATTERN.test(headingText)) return;

    // Look at next siblings for contact info
    const sibling = $(heading).next();
    const sibText = sibling.text().trim();

    if (hasNegativePhrase(sibText)) return;

    const email = extractEmail(sibling.find("a[href^='mailto:']").attr("href") || sibText);
    const phoneMatch = sibText.match(PHONE_PATTERN);

    if (email || phoneMatch) {
      // Name might be in the heading or previous sibling
      const prevText = $(heading).prev().text().trim();
      const name = prevText.match(/^[A-Z][a-z]+ [A-Z][a-z]+/) ? prevText : "";

      contacts.push({
        fullName: name,
        exactJobTitle: headingText,
        department: "",
        email: email || null,
        directPhone: phoneMatch ? normalizePhone(phoneMatch[0]) : null,
        rawPhone: phoneMatch ? phoneMatch[0] : null,
        sourceUrl,
        evidenceText: `${headingText} ${sibText}`.substring(0, 300),
      });
    }
  });

  // Strategy 5: mailto links with surrounding context
  $("a[href^='mailto:']").each((_, link) => {
    const href = $(link).attr("href") || "";
    const email = href.replace("mailto:", "").split("?")[0].toLowerCase();

    if (!email.includes("@")) return;
    if (/noreply|donotreply|webmaster|info@|admin@/.test(email)) return;

    // Get surrounding context
    const parent = $(link).closest("p,li,div,td").first();
    const context = parent.text().trim();

    if (!TARGET_TITLE_PATTERN.test(context)) return;
    if (hasNegativePhrase(context)) return;

    const titleMatch = context.match(TARGET_TITLE_PATTERN);
    const phoneMatch = context.match(PHONE_PATTERN);
    const nameMatch = context.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);

    contacts.push({
      fullName: nameMatch?.[1] || $(link).text().trim() || "",
      exactJobTitle: titleMatch?.[0] || "",
      department: "",
      email,
      directPhone: phoneMatch ? normalizePhone(phoneMatch[0]) : null,
      rawPhone: phoneMatch ? phoneMatch[0] : null,
      sourceUrl,
      evidenceText: context.substring(0, 300),
    });
  });

  // Deduplicate by email within this page
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = c.email || `${c.fullName}|${c.exactJobTitle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
