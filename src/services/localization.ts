import type { City } from '../models/game'

const countryCurrencies: Record<string, string> = {
  AE: 'AED', AR: 'ARS', AU: 'AUD', BR: 'BRL', CA: 'CAD', CH: 'CHF', CL: 'CLP',
  CN: 'CNY', CO: 'COP', CZ: 'CZK', DK: 'DKK', EG: 'EGP', GB: 'GBP', HK: 'HKD',
  HU: 'HUF', ID: 'IDR', IL: 'ILS', IN: 'INR', IS: 'ISK', JP: 'JPY', KR: 'KRW',
  MA: 'MAD', MX: 'MXN', MY: 'MYR', NG: 'NGN', NO: 'NOK', NZ: 'NZD', PE: 'PEN',
  PH: 'PHP', PL: 'PLN', RO: 'RON', RU: 'RUB', SA: 'SAR', SE: 'SEK', SG: 'SGD',
  TH: 'THB', TR: 'TRY', TW: 'TWD', UA: 'UAH', US: 'USD', VN: 'VND', ZA: 'ZAR',
}

const euroCountries = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'])

export const currencyForCountry = (countryCode?: string) => {
  const code = countryCode?.toUpperCase()
  if (!code) return 'USD'
  return euroCountries.has(code) ? 'EUR' : countryCurrencies[code] ?? 'USD'
}

export const localeForCountry = (countryCode?: string) => countryCode ? `en-${countryCode.toUpperCase()}` : 'en-US'

export const moneyFormatterForCity = (city?: City | null, minimumFractionDigits = 0) => new Intl.NumberFormat(
  localeForCountry(city?.countryCode),
  { style: 'currency', currency: currencyForCountry(city?.countryCode), minimumFractionDigits, maximumFractionDigits: minimumFractionDigits },
)
