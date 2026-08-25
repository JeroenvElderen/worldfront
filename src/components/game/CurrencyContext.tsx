import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { City } from '../../models/game'
import { currencyForCountry, localeForCountry } from '../../services/localization'

type CurrencyContextValue = { currency: string; currencySymbol: string; locale: string; money: Intl.NumberFormat }
const fallbackMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const CurrencyContext = createContext<CurrencyContextValue>({ currency: 'USD', currencySymbol: '$', locale: 'en-US', money: fallbackMoney })

export function CurrencyProvider({ city, children }: { city?: City | null; children: ReactNode }) {
  const value = useMemo(() => {
    const currency = currencyForCountry(city?.countryCode)
    const locale = localeForCountry(city?.countryCode)
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
    const currencySymbol = money.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency
    return { currency, currencySymbol, locale, money }
  }, [city?.countryCode])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

// The provider and its hook intentionally live together so consumers share the
// exact same context instance in both the web and Capacitor bundles.
// eslint-disable-next-line react-refresh/only-export-components
export const useCurrency = () => useContext(CurrencyContext)
