# TaxiFlow

A focused, mobile-first taxi dispatch manager built with React, TypeScript, Mapbox, and Capacitor.

## The dispatch loop

TaxiFlow puts the live city map at the center of the experience. Review incoming passenger requests, compare pickup and destination details, assign the available driver, follow the active trip, and watch the fare land in today's revenue when the ride finishes.

The Fleet view shows each driver, vehicle, and shift status. Reports provide a compact view of trip volume, fares, and utilisation. The responsive interface works as a desktop dispatch console and a streamlined mobile app.

## Development

```bash
pnpm install
pnpm dev
```

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Android

```bash
pnpm android:prepare
pnpm android:open
```
