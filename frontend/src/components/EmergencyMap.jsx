import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ALERT_STATUS, ALERT_TYPES, CAMPUS_CENTER } from '../lib/constants'
import { formatDateTime } from '../lib/format'

// Inline SVG pins avoid Leaflet's default marker images, which break under Vite bundling.
function pinIcon(alert, selected) {
  const color = ALERT_TYPES[alert.alert_type]?.color || '#bc2f36'
  const size = selected ? 44 : 34
  const pulse = alert.status === 'active'
    ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:.35" class="sos-ring"></span>`
    : ''
  const faded = alert.status === 'resolved' ? 'opacity:.45;' : ''
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
    html: `<div style="position:relative;width:${size}px;height:${size}px;${faded}">${pulse}
      <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="position:relative;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">
        <path fill="${color}" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Z"/>
        <circle cx="12" cy="9" r="2.6" fill="#fff"/>
      </svg></div>`,
  })
}

/** Pans the map to the selected alert. */
function FlyTo({ id, lat, lng }) {
  const map = useMap()
  // Keyed on the id only, so live status updates don't keep re-centring the map.
  useEffect(() => {
    if (id) map.flyTo([lat, lng], Math.max(map.getZoom(), 18), { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, map])
  return null
}

export default function EmergencyMap({ alerts, selectedId, onSelect, className = 'h-[420px]' }) {
  const selected = useMemo(() => alerts.find((a) => a.id === selectedId) || null, [alerts, selectedId])

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 ${className}`}>
      <MapContainer center={CAMPUS_CENTER} zoom={16} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles-dark"
          maxZoom={19}
        />
        <CircleMarker center={CAMPUS_CENTER} radius={6} pathOptions={{ color: '#18354f', fillColor: '#18354f', fillOpacity: 0.8 }}>
          <Popup>University of Haripur (campus centre)</Popup>
        </CircleMarker>
        {alerts.map((a) => (
          <Marker
            key={a.id}
            position={[a.latitude, a.longitude]}
            icon={pinIcon(a, a.id === selectedId)}
            zIndexOffset={a.status === 'active' ? 1000 : a.id === selectedId ? 500 : 0}
            eventHandlers={{ click: () => onSelect?.(a.id) }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{ALERT_TYPES[a.alert_type].label} · {ALERT_STATUS[a.status].label}</p>
                <p>{a.user.full_name} ({a.user.reg_no})</p>
                <p className="text-xs opacity-80">{a.user.department}</p>
                {a.location_note && <p className="text-xs">{a.location_note}</p>}
                <p className="text-xs opacity-70">{formatDateTime(a.created_at)}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        <FlyTo id={selected?.id} lat={selected?.latitude} lng={selected?.longitude} />
      </MapContainer>
    </div>
  )
}
