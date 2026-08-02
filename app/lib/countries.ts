import countries from "world-countries";

/**
 * Country metadata (ISO 3166-1) from the `world-countries` dataset — no manual
 * code/coordinate tables to maintain. Provides alpha-2 code, numeric id,
 * representative coordinates, common name and flag emoji for any country.
 */
export interface CountryInfo {
  code: string;
  numeric: string;
  latlng: [number, number];
  name: string;
  flag: string;
}

const BY_CODE = new Map<string, CountryInfo>();

for (const c of countries) {
  if (!c.cca2 || !c.ccn3 || !c.latlng) continue;
  BY_CODE.set(c.cca2.toUpperCase(), {
    code: c.cca2,
    numeric: c.ccn3,
    latlng: [c.latlng[0], c.latlng[1]],
    name: c.name?.common ?? c.cca2,
    flag: c.flag ?? "",
  });
}

export function getCountry(code: string): CountryInfo | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}

export function getCountryCoords(code: string): [number, number] | undefined {
  return BY_CODE.get(code.trim().toUpperCase())?.latlng;
}

export function getCountryNumericId(code: string): string | undefined {
  return BY_CODE.get(code.trim().toUpperCase())?.numeric;
}
