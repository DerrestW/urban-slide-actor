/**
 * Sanitizes a string for use as an Apify storage name.
 * Apify storage names (RequestQueue, Dataset, KeyValueStore) must:
 * - contain only a-z, 0-9, and hyphens
 * - hyphens only in the middle (no leading/trailing)
 * - no uppercase, spaces, pipes, underscores, commas, periods
 */
export function sanitizeApifyStorageName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')  // replace anything not a-z, 0-9, hyphen with hyphen
    .replace(/-+/g, '-')            // collapse multiple hyphens into one
    .replace(/^-+|-+$/g, '');       // strip leading/trailing hyphens

  if (!sanitized) {
    throw new Error(`Unable to generate a valid Apify storage name from: "${value}"`);
  }

  return sanitized;
}

// Tests (run with: npx ts-node src/utils.ts)
if (require.main === module) {
  const cases: [string, string][] = [
    ['Decatur|AL-123',    'decatur-al-123'],
    ['Rocky Mount, NC',  'rocky-mount-nc'],
    ['Wichita Falls_TX', 'wichita-falls-tx'],
    ['  --leading--  ',  'leading'],
    ['UPPERCASE City',   'uppercase-city'],
  ];

  let passed = 0;
  for (const [input, expected] of cases) {
    const result = sanitizeApifyStorageName(input);
    const ok = result === expected;
    console.log(`${ok ? '✓' : '✗'} sanitizeApifyStorageName(${JSON.stringify(input)}) => ${JSON.stringify(result)} ${ok ? '' : `(expected ${JSON.stringify(expected)})`}`);
    if (ok) passed++;
  }
  console.log(`\n${passed}/${cases.length} tests passed`);
  process.exit(passed === cases.length ? 0 : 1);
}
