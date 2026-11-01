'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3002);
const DB_FILE = path.resolve(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'cammini.sqlite'));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Database SQLite non trovato: ${DB_FILE}`);
}

const db = new DatabaseSync(DB_FILE, { readOnly: true });

function parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    return typeof value === 'string' ? JSON.parse(value) : value;
}

function geometrySignature(value) {
    const coordinates = parseJson(value, []);
    return Array.isArray(coordinates) && coordinates.length > 0
        ? JSON.stringify(coordinates)
        : null;
}

function completeness(row) {
    const elevation = parseJson(row.elevation, []);
    const waypoints = parseJson(row.waypoints, []);
    return (Array.isArray(elevation) && elevation.length ? 2 : 0)
        + (Array.isArray(waypoints) && waypoints.length ? 1 : 0)
        + (row.name ? 1 : 0);
}

let routeRows;
let routeGeometryIndex;

function getRouteRows() {
    if (!routeRows) {
        routeRows = db.prepare(`
        SELECT id, name, distance, coordinates, elevation, waypoints, ascent, descent,
            min_ele, max_ele, created_at, start_lat, start_lng
        FROM routes
        ORDER BY created_at DESC
        `).all();
    }
    return routeRows;
}

function getRouteGeometryIndex() {
    if (routeGeometryIndex) return routeGeometryIndex;

    routeGeometryIndex = new Map();
    for (const route of getRouteRows()) {
        const signature = geometrySignature(route.coordinates);
        if (!signature) continue;
        const group = routeGeometryIndex.get(signature) || [];
        group.push(route);
        routeGeometryIndex.set(signature, group);
    }

    return routeGeometryIndex;
}

function getMatchingRoute(coordinates) {
    const signature = geometrySignature(coordinates);
    if (!signature) return null;
    const matches = getRouteGeometryIndex().get(signature) || [];
    return [...matches].sort((a, b) => completeness(b) - completeness(a))[0] || null;
}

function sendJson(res, status, value) {
    res.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
}

function listSavedItems() {
    const groups = new Map();
    const addToGroup = (row, type) => {
        const signature = geometrySignature(row.coordinates) || `${type}:${row.id}`;
        const group = groups.get(signature) || { tracks: [], routes: [] };
        group[type === 'track' ? 'tracks' : 'routes'].push(row);
        groups.set(signature, group);
    };

    const tracks = db.prepare(`
        SELECT id, name, coordinates, elevation, waypoints, created_at
        FROM tracks
        ORDER BY created_at DESC
    `).all();
    for (const track of tracks) addToGroup(track, 'track');
    for (const route of getRouteRows()) addToGroup(route, 'route');

    return [...groups.values()].map(({ tracks: matchingTracks, routes: matchingRoutes }) => {
        const track = [...matchingTracks].sort((a, b) => completeness(b) - completeness(a))[0];
        const route = [...matchingRoutes].sort((a, b) => completeness(b) - completeness(a))[0];
        const preferred = track || route;
        const coordinates = parseJson(preferred.coordinates, []);
        const latitude = coordinates[0]?.[0] ?? route?.start_lat ?? null;
        const longitude = coordinates[0]?.[1] ?? route?.start_lng ?? null;
        const createdAt = [...matchingTracks, ...matchingRoutes]
            .map((item) => item.created_at)
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

        return {
            id: preferred.id,
            name: preferred.name || (track ? 'Traccia senza nome' : 'Percorso senza nome'),
            type: track ? 'track' : 'route',
            distance: route?.distance ?? null,
            ascent: route?.ascent ?? null,
            descent: route?.descent ?? null,
            minElevation: route?.min_ele ?? null,
            maxElevation: route?.max_ele ?? null,
            createdAt,
            latitude,
            longitude,
        };
    }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function getSavedItem(id) {
    const track = db.prepare(`
        SELECT id, name, coordinates, elevation, waypoints, created_at
        FROM tracks
        WHERE id = ?
    `).get(id);

    if (track) {
        const route = getMatchingRoute(track.coordinates);
        const trackElevation = parseJson(track.elevation, []);
        const routeElevation = parseJson(route?.elevation, []);
        const trackWaypoints = parseJson(track.waypoints, []);
        const routeWaypoints = parseJson(route?.waypoints, []);
        return {
            id: track.id,
            name: track.name || 'Traccia senza nome',
            type: 'track',
            coordinates: parseJson(track.coordinates, []),
            elevation: trackElevation.length >= routeElevation.length ? trackElevation : routeElevation,
            waypoints: trackWaypoints.length >= routeWaypoints.length ? trackWaypoints : routeWaypoints,
            createdAt: track.created_at,
            distance: route?.distance ?? null,
            ascent: route?.ascent ?? null,
            descent: route?.descent ?? null,
            minElevation: route?.min_ele ?? null,
            maxElevation: route?.max_ele ?? null,
        };
    }

    const route = db.prepare(`
        SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance,
            coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, created_at
        FROM routes
        WHERE id = ?
    `).get(id);

    if (!route) return null;
    return {
        id: route.id,
        name: route.name || 'Percorso senza nome',
        type: 'route',
        startLat: route.start_lat,
        startLng: route.start_lng,
        endLat: route.end_lat,
        endLng: route.end_lng,
        distance: route.distance,
        coordinates: parseJson(route.coordinates, []),
        elevation: parseJson(route.elevation, []),
        waypoints: parseJson(route.waypoints, []),
        ascent: route.ascent,
        descent: route.descent,
        minElevation: route.min_ele,
        maxElevation: route.max_ele,
        createdAt: route.created_at,
    };
}

function serveStatic(req, res, pathname) {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
        sendJson(res, 503, { error: 'Interfaccia non compilata. Esegui npm run build.' });
        return;
    }

    let requestedPath;
    try {
        requestedPath = decodeURIComponent(pathname);
    } catch {
        sendJson(res, 400, { error: 'Percorso non valido.' });
        return;
    }

    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
    const filePath = path.resolve(DIST_DIR, relativePath);
    if (filePath !== DIST_DIR && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
        sendJson(res, 403, { error: 'Percorso non consentito.' });
        return;
    }

    const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(DIST_DIR, 'index.html');

    res.writeHead(200, {
        'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Content-Type': MIME_TYPES[path.extname(target)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(target).pipe(res);
}

const server = http.createServer((req, res) => {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
        sendJson(res, 400, { error: 'Richiesta non valida.' });
        return;
    }

    try {
        if (req.method === 'GET' && pathname === '/api/health') {
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === 'GET' && pathname === '/api/saved') {
            sendJson(res, 200, listSavedItems());
            return;
        }

        const detailMatch = pathname.match(/^\/api\/saved\/([^/]+)$/);
        if (req.method === 'GET' && detailMatch) {
            const item = getSavedItem(detailMatch[1]);
            sendJson(res, item ? 200 : 404, item || { error: 'Itinerario non trovato.' });
            return;
        }

        if (pathname.startsWith('/api/')) {
            sendJson(res, 404, { error: 'Risorsa API non trovata.' });
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { error: 'Metodo non consentito.' });
            return;
        }
        serveStatic(req, res, pathname);
    } catch (error) {
        console.error('Errore nella richiesta:', error);
        sendJson(res, 500, { error: 'Impossibile leggere i dati richiesti.' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cammini mobile disponibile sulla porta ${PORT}`);
});

function shutdown() {
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
