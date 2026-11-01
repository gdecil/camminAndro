import assert from 'node:assert/strict'
import test from 'node:test'
import { createGpxContent, createGpxFileName } from './gpx.js'

test('exports GPX 1.1 track and named waypoints with either stored coordinate shape', () => {
  const gpx = createGpxContent({
    name: 'Sentiero & rifugio',
    coordinates: [[45.1, 9.2], [45.2, 9.3]],
    elevation: [120, 240],
    waypoints: [
      { lat: '45.11', lng: '9.21', name: "Rifugio <dell'Alpe>" },
      { latitude: 45.22, longitude: 9.32, name: 'Passo' },
    ],
  })

  assert.match(gpx, /version="1\.1"/)
  assert.match(gpx, /<name>Sentiero &amp; rifugio<\/name>/)
  assert.match(gpx, /<wpt lat="45\.11" lon="9\.21">/)
  assert.match(gpx, /<name>Rifugio &lt;dell&apos;Alpe&gt;<\/name>/)
  assert.match(gpx, /<wpt lat="45\.22" lon="9\.32">/)
  assert.match(gpx, /<trkpt lat="45\.1" lon="9\.2"><ele>120<\/ele><\/trkpt>/)
  assert.ok(gpx.indexOf('<wpt ') < gpx.indexOf('<trk>'))
  assert.ok(gpx.includes('\r\n'))
  assert.doesNotMatch(gpx, /(?<!\r)\n/)
})

test('ignores malformed waypoints and coordinates and omits unavailable elevation', () => {
  const gpx = createGpxContent({
    name: 'Percorso',
    coordinates: [[46, 10], [91, 10], ['bad', 11]],
    elevation: [null, 100, 100],
    waypoints: [{ lat: 46, lon: 10, name: 'Tappa' }, { lat: 'no', lng: 11, name: 'Ignorata' }],
  })

  assert.equal((gpx.match(/<trkpt /g) || []).length, 1)
  assert.equal((gpx.match(/<wpt /g) || []).length, 1)
  assert.doesNotMatch(gpx, /<ele>/)
})

test('creates a safe GPX filename', () => {
  assert.equal(createGpxFileName('Rifugio / Cima'), 'Rifugio - Cima.gpx')
  assert.equal(createGpxFileName(''), 'cammino.gpx')
})
