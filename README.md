# Urban Slide City Contact Scraper

Scrapes city government websites to find special events directors, parks directors, procurement managers, and tourism directors for Urban Slide event outreach.

## How it works

1. **Discovery** — Runs targeted Google searches to find city government staff pages
2. **Crawling** — Uses Playwright to visit and crawl those pages (handles JavaScript-rendered content)
3. **Extraction** — Pulls names, titles, emails, and phones from staff directories, tables, cards, and mailto links
4. **Scoring** — Assigns confidence scores based on domain authority, published contact info, and title relevance
5. **Selection** — Returns the best contacts across 3 functional categories per city

## Deploy to Apify

1. Go to [console.apify.com](https://console.apify.com)
2. Click **Actors** → **Create new**
3. Choose **"Link to GitHub repo"** and connect this repo
4. Click **Build** then **Run**

## Input format

```json
{
  "cities": [
    { "city": "Gadsden", "state": "Alabama", "stateCode": "AL" },
    { "city": "Hampton", "state": "Virginia", "stateCode": "VA" },
    { "city": "Austin", "state": "Texas", "stateCode": "TX" }
  ],
  "minimumContactsPerCity": 3,
  "maximumContactsPerCity": 8,
  "crawlDepth": 3,
  "maximumPagesPerDomain": 75,
  "includePdfs": true
}
```

## Output columns

| Column | Description |
|--------|-------------|
| city / state | Location |
| fullName | Person's name |
| exactJobTitle | Title as found on page |
| normalizedRole | Standardized role category |
| contactCategory | event_operations / budget_approval / promotion_attendance |
| email | Work email (published only, never guessed) |
| directPhone | Direct line |
| confidenceScore | 0–100 |
| confidenceLevel | high / medium / low |
| sourceUrl | Where we found them |
| evidenceText | Text surrounding the contact on the page |

## Recommended pilot cities

Start with 10–15 cities to calibrate:

**Texas:** Galveston, Lubbock, Corpus Christi, Beaumont, Waco, Midland, Tyler, Abilene, Laredo, Amarillo

**Alabama:** Gadsden, Huntsville, Montgomery, Tuscaloosa, Decatur, Florence, Dothan, Auburn, Hoover, Phenix City

**Virginia:** Hampton, Roanoke, Lynchburg, Chesapeake, Portsmouth, Suffolk, Harrisonburg, Fredericksburg, Charlottesville, Manassas

## Cost estimate

- ~$0.10 per Google search page
- ~$0.10–0.20 per Playwright page crawled
- Estimated: **$0.50–2.00 per city** depending on site complexity
- 50 cities ≈ $25–100 total

## Integration with cityactivations.com

After a run, download the dataset as CSV and upload it via the **Admin → City Prospects → Upload CSV** button. All contacts will import with verified emails, titles, and source URLs.
