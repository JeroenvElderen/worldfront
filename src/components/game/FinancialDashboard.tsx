import { useMemo, useState } from 'react'
import type { FinancialTransaction, Vehicle } from '../../models/game'
import { vehicleMarketValue } from '../../services/vehicleEconomics'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const periods = { day: 24 * 60 * 60 * 1_000, week: 7 * 24 * 60 * 60 * 1_000, all: Number.POSITIVE_INFINITY }

export function FinancialDashboard({ cash, debt, transactions, vehicles, onClose }: { cash: number; debt: number; transactions: FinancialTransaction[]; vehicles: Vehicle[]; onClose: () => void }) {
  const [period, setPeriod] = useState<keyof typeof periods>('week')
  const filtered = useMemo(() => transactions
    .filter((entry) => Date.now() - new Date(entry.occurredAt).getTime() <= periods[period])
    .slice().reverse(), [period, transactions])
  const income = filtered.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)
  const expenses = filtered.reduce((sum, entry) => sum + Math.max(0, -entry.amount), 0)
  const operatingEntries = filtered.filter((entry) => entry.category !== 'loans' && entry.category !== 'vehicles')
  const operatingIncome = operatingEntries.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0)
  const operatingExpenses = operatingEntries.reduce((sum, entry) => sum + Math.max(0, -entry.amount), 0)
  const categories = Object.entries(filtered.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.category] = (totals[entry.category] ?? 0) + entry.amount
    return totals
  }, {})).sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
  const maxCategory = Math.max(1, ...categories.map(([, amount]) => Math.abs(amount)))
  const fleetValue = vehicles.reduce((sum, vehicle) => sum + vehicleMarketValue(vehicle), 0)

  return <section className="section-sheet finance-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>FINANCIALS</small><h2>Income & expenses</h2>
    <div className="period-tabs">{(Object.keys(periods) as Array<keyof typeof periods>).map((option) => <button className={period === option ? 'active' : ''} onClick={() => setPeriod(option)} key={option}>{option === 'day' ? '24 hours' : option === 'week' ? '7 days' : 'All time'}</button>)}</div>
    <div className="finance-kpis">
      <div><small>INCOME</small><b className="positive">{money.format(income)}</b></div>
      <div><small>EXPENSES</small><b className="negative">{money.format(expenses)}</b></div>
      <div><small>NET CASH FLOW</small><b className={income - expenses >= 0 ? 'positive' : 'negative'}>{money.format(income - expenses)}</b></div>
      <div><small>OPERATING PROFIT</small><b className={operatingIncome - operatingExpenses >= 0 ? 'positive' : 'negative'}>{money.format(operatingIncome - operatingExpenses)}</b></div>
    </div>
    <div className="balance-strip"><span><small>CASH</small><b>{money.format(cash)}</b></span><span><small>FLEET VALUE</small><b>{money.format(fleetValue)}</b></span><span><small>DEBT</small><b>{money.format(debt)}</b></span><span><small>NET WORTH</small><b>{money.format(cash + fleetValue - debt)}</b></span></div>
    <h3>Breakdown</h3>
    <div className="category-breakdown">{categories.length ? categories.map(([category, amount]) => <div key={category}><span>{category}</span><i><em style={{ width: `${Math.abs(amount) / maxCategory * 100}%` }} /></i><b className={amount >= 0 ? 'positive' : 'negative'}>{money.format(amount)}</b></div>) : <p>No transactions in this period yet.</p>}</div>
    <h3>Recent transactions</h3>
    <div className="transaction-list">{filtered.length ? filtered.slice(0, 40).map((entry) => <div key={entry.id}><span><b>{entry.description}</b><small>{new Date(entry.occurredAt).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.category}</small></span><strong className={entry.amount >= 0 ? 'positive' : 'negative'}>{entry.amount >= 0 ? '+' : ''}{money.format(entry.amount)}</strong></div>) : <p>Complete a job or make a purchase to begin your ledger.</p>}</div>
  </section>
}
