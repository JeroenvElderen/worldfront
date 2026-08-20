import { cityServices } from '../../data/services'
import type { Company, Division, ServiceContract, ServiceType, TransportHub } from '../../models/game'
import { levelForReputation } from '../../services/companyProgression'

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

interface ServicesPanelProps {
  company: Company
  divisions: Division[]
  contracts: ServiceContract[]
  hub: TransportHub
  onClose: () => void
  onEstablish: (service: ServiceType) => void
  onUpgradeHub: () => void
  onAcceptContract: (contractId: string) => void
}

export function ServicesPanel({ company, divisions, contracts, hub, onClose, onEstablish, onUpgradeHub, onAcceptContract }: ServicesPanelProps) {
  const companyLevel = levelForReputation(company.reputation)
  const activeContracts = contracts.filter((contract) => contract.status === 'active')
  const weeklyIncome = activeContracts.reduce((total, contract) => total + contract.weeklyIncome, 0)
  const nextHubCost = hub.level * 10_000

  return <section className="section-sheet services-sheet game-panel">
    <div className="sheet-handle" /><button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
    <small>CITY OPERATIONS</small>
    <div className="services-heading"><div><h2>Build your service network</h2><p>Choose where to invest and grow beyond taxis.</p></div><span>{divisions.length + 1}<small>DIVISIONS</small></span></div>

    <div className="hub-card">
      <div className="hub-icon">⌂</div><div><small>TRANSPORT HUB · LEVEL {hub.level}</small><strong>{hub.level === 1 ? 'Local Depot' : hub.level < 4 ? 'City Operations Hub' : 'Metropolitan Hub'}</strong><p>Supports service divisions up to level {hub.level}.</p></div>
      {hub.level < 4 && <button disabled={company.cash < nextHubCost} onClick={onUpgradeHub}>Upgrade<br /><b>{money.format(nextHubCost)}</b></button>}
    </div>

    <div className="services-section-title"><b>DIVISIONS</b><span>{cityServices.filter((service) => divisions.some((division) => division.type === service.id)).length} / {cityServices.length} established</span></div>
    <div className="service-grid">{cityServices.map((service) => {
      const division = divisions.find((candidate) => candidate.type === service.id)
      const levelLocked = companyLevel < service.requiredLevel || hub.level < service.requiredLevel
      return <article className={`service-card ${division ? 'established' : ''}`} key={service.id} style={{ '--service-accent': service.accent } as React.CSSProperties}>
        <div className="service-icon">{service.icon}</div><div className="service-copy"><div><strong>{service.name}</strong>{division && <span className="live-pill">ACTIVE</span>}</div><p>{service.description}</p><small>⌖ {service.demand}</small></div>
        {!division && <button disabled={levelLocked || company.cash < service.cost} onClick={() => onEstablish(service.id)}>{levelLocked ? `Level ${service.requiredLevel} hub` : money.format(service.cost)}</button>}
        {division && <b className="division-level">LV {division.level}</b>}
      </article>
    })}</div>

    <div className="services-section-title contract-title"><b>CONTRACTS</b><span>{money.format(weeklyIncome)} / week secured</span></div>
    <div className="contract-list">{contracts.map((contract) => {
      const service = cityServices.find((item) => item.id === contract.service)
      const unlocked = divisions.some((division) => division.type === contract.service)
      return <article className={`contract-card ${contract.status}`} key={contract.id}>
        <span>{service?.icon ?? '◆'}</span><div><small>{contract.client.toUpperCase()}</small><strong>{contract.title}</strong><p>{contract.requiredVehicles} vehicles reserved · {money.format(contract.weeklyIncome)}/week</p></div>
        <button disabled={!unlocked || contract.status === 'active'} onClick={() => onAcceptContract(contract.id)}>{contract.status === 'active' ? '✓ Active' : unlocked ? 'Accept' : 'Locked'}</button>
      </article>
    })}</div>
  </section>
}
