function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[<>&'"]/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    })[char])
}

function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

function normalizeWaypoint(waypoint) {
  const latitude = Number(waypoint?.lat ?? waypoint?.latitude)
  const longitude = Number(waypoint?.lon ?? waypoint?.lng ?? waypoint?.longitude)
  if (!isValidCoordinate(latitude, longitude)) return null
  return {
    latitude,
    longitude,
    name: String(waypoint?.name || '').trim(),
  }
}

export function createGpxContent({ name, coordinates, elevation = [], waypoints = [] }) {
  const safeName = escapeXml(name || 'Cammino')
  const waypointXml = waypoints
    .map(normalizeWaypoint)
    .filter(Boolean)
    .map((waypoint, index) => {
      const waypointName = escapeXml(waypoint.name || `Tappa ${index + 1}`)
      return `  <wpt lat="${waypoint.latitude}" lon="${waypoint.longitude}">\n    <name>${waypointName}</name>\n  </wpt>`
    })
    .join('\n')
  const trackPoints = coordinates
    .map((point, index) => {
      if (!Array.isArray(point)
        || !isValidCoordinate(Number(point[0]), Number(point[1]))) return null
      const latitude = Number(point[0])
      const longitude = Number(point[1])
      const elevationValue = elevation?.[index]
      const ele = elevationValue === null || elevationValue === undefined || elevationValue === ''
        ? Number.NaN
        : Number(elevationValue)
      const elevationTag = Number.isFinite(ele) ? `<ele>${ele}</ele>` : ''
      return `      <trkpt lat="${latitude}" lon="${longitude}">${elevationTag}</trkpt>`
    })
    .filter(Boolean)
    .join('\n')
  const waypointsSection = waypointXml ? `\n${waypointXml}` : ''

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cammini" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
  </metadata>${waypointsSection}
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>
`
  return gpx.replace(/\r?\n/g, '\r\n')
}

export function createGpxFileName(name) {
  return `${String(name || 'cammino').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'cammino'}.gpx`
}
