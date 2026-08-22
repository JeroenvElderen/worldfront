import { cities, getCity } from '../../data/cities'
import type { City, CityEconomy, Company, Hotel } from '../../models/game'
import { HOTEL_PURCHASE_COST, hotelOccupancy, hotelUpgradeCost, pendingHotelRevenue } from '../../services/hotelEconomy'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

interface Props { company: Company; activeCityId: string; customCities: City[]; hotels: Hotel[]; economies: CityEconomy[]; onBuy: () => void; onUpgrade: (id: string) => void; onCollect: (id: string) => void; onClose: () => void }

export function HotelDashboard({ company, activeCityId, customCities, hotels, economies, onBuy, onUpgrade, onCollect, onClose }: Props) {
  const city = getCity(activeCityId, customCities)
  const economy = economies.find((item) => item.cityId === activeCityId)
  const hotel = hotels.find((item) => item.cityId === activeCityId)
  const networkCities = [...customCities, ...cities].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index && economies.some((economyItem) => economyItem.cityId === item.id))
  if (!city || !economy) return null
  const pending = hotel ? pendingHotelRevenue(hotel, economy) : 0
  return <section className="section-sheet hotel-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>HOSPITALITY & CITY ECONOMY</small><h2>{city.name} properties</h2>
    <div className="economy-hero"><span>🏙️</span><div><small>LOCAL ECONOMY</small><strong>{economy.trend >= 0 ? 'Growing' : 'Cooling'} {economy.trend >= 0 ? '↗' : '↘'}</strong><p>{economy.population.toLocaleString()} residents · cost index {economy.costIndex}</p></div></div>
    <div className="economy-grid"><span><small>TOURISM</small><b>{economy.tourism}/100</b></span><span><small>BUSINESS</small><b>{economy.business}/100</b></span><span><small>PROSPERITY</small><b>{economy.prosperity}/100</b></span><span><small>GROWTH</small><b className={economy.trend >= 0 ? 'positive' : 'negative'}>{economy.trend > 0 ? '+' : ''}{economy.trend}%</b></span></div>
    <h3>Your hotel</h3>
    {hotel ? <article className="hotel-card"><header><span>🏨</span><div><strong>{hotel.name}</strong><small>Level {hotel.level} · {hotel.rooms} rooms · {hotelOccupancy(economy)}% occupancy</small></div></header><div className="hotel-income"><span><small>READY TO COLLECT</small><b>{money.format(pending)}</b></span><span><small>LIFETIME REVENUE</small><b>{money.format(hotel.lifetimeRevenue)}</b></span></div><div className="hotel-actions"><button disabled={pending < 1} onClick={() => onCollect(hotel.id)}>Collect room revenue</button><button disabled={hotel.level >= 5 || company.cash < hotelUpgradeCost(hotel)} onClick={() => onUpgrade(hotel.id)}>{hotel.level >= 5 ? 'Fully upgraded' : `Add ${20 + hotel.level * 10} rooms · ${money.format(hotelUpgradeCost(hotel))}`}</button></div></article> : <article className="hotel-opportunity"><span>🏨</span><div><strong>Open {city.name} Central Hotel</strong><small>30 rooms · income follows tourism, prosperity and local prices.</small></div><button disabled={company.level < 2 || company.cash < HOTEL_PURCHASE_COST} onClick={onBuy}>{company.level < 2 ? 'Unlocks at level 2' : `Buy · ${money.format(HOTEL_PURCHASE_COST)}`}</button></article>}
    <h3>City markets</h3><div className="city-market-list">{networkCities.map((market) => { const stats = economies.find((item) => item.cityId === market.id)!; return <div className={market.id === activeCityId ? 'active' : ''} key={market.id}><span><strong>{market.name}</strong><small>{stats.population.toLocaleString()} people</small></span><b>🧳 {stats.tourism}</b><b>💼 {stats.business}</b><em>{stats.trend >= 0 ? '↗' : '↘'} {Math.abs(stats.trend)}%</em></div> })}</div>
  </section>
}
