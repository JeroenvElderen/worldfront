import { Component, type ErrorInfo, type ReactNode } from 'react'

interface MapErrorBoundaryProps { children: ReactNode }
interface MapErrorBoundaryState { failed: boolean }

export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The game map could not be initialized.', error, info)
  }

  render() {
    if (this.state.failed) {
      return <div className="map-fallback" role="status">
        <div><span>MAP UNAVAILABLE</span><p>Your company is still running. Restart the app to try loading the map again.</p></div>
      </div>
    }
    return this.props.children
  }
}
