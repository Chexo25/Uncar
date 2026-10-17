import type { GPSPoint } from '$lib/types/gpx';
import type { GTFSStop, GTFSTransportType, GTFSShapePoint } from '$lib/types/gtfs';
import { haversineDistance } from '$lib/parsers/gpxParser.ts';

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

/**
 * Recherche un arrêt GTFS proche en utilisant la BoundingBox pour ne pas tout parcourir.
 */
export function getNearbyGTFSType(
    point: GPSPoint,
    stops: GTFSStop[],
    maxDistanceMeters: number = 20
): GTFSTransportType | null {
    const degThreshold = maxDistanceMeters * 0.000009;

    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        // Bounding box rapide par arrêt
        if (
            Math.abs(point.lat - stop.lat) > degThreshold ||
            Math.abs(point.lon - stop.lon) > degThreshold
        ) {
            continue;
        }

        if (haversineDistance(point.lat, point.lon, stop.lat, stop.lon) <= maxDistanceMeters) {
            return stop.type;
        }
    }
    return null;
}

/**
 * Distance minimale entre un point GPS et un segment [A, B]
 */
function distanceToSegment(p: GPSPoint, a: GTFSShapePoint, b: GTFSShapePoint): number {
    const x = p.lon, y = p.lat;
    const x1 = a.lon, y1 = a.lat;
    const x2 = b.lon, y2 = b.lat;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        return haversineDistance(p.lat, p.lon, a.lat, a.lon);
    }

    let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    return haversineDistance(p.lat, p.lon, y1 + t * dy, x1 + t * dx);
}

/**
 * Pré-filtre les lignes GTFS qui croisent la BoundingBox globale de la trace GPX
 */
export function filterShapesInBBox(
    shapesMap: Map<string, GTFSShape>,
    bbox: BoundingBox
): GTFSShape[] {
    const relevantShapes: GTFSShape[] = [];

    for (const shape of shapesMap.values()) {
        // Test de chevauchement BBox instantané (0 calcul géométrique)
        if (
            shape.bbox.maxLat >= bbox.minLat &&
            shape.bbox.minLat <= bbox.maxLat &&
            shape.bbox.maxLon >= bbox.minLon &&
            shape.bbox.minLon <= bbox.maxLon
        ) {
            relevantShapes.push(shape);
        }
    }

    return relevantShapes;
}

export function isPointOnGTFSShape(
    point: GPSPoint,
    relevantShapes: GTFSShape[],
    maxDistanceMeters: number = 15
): boolean {
    const degThreshold = maxDistanceMeters * 0.000009;

    for (let s = 0; s < relevantShapes.length; s++) {
        const shape = relevantShapes[s];

        // Rejet instantané de la ligne entière si le point est hors de sa BBox
        if (
            point.lat < shape.bbox.minLat - degThreshold ||
            point.lat > shape.bbox.maxLat + degThreshold ||
            point.lon < shape.bbox.minLon - degThreshold ||
            point.lon > shape.bbox.maxLon + degThreshold
        ) {
            continue;
        }

        const points = shape.points;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];

            if (
                point.lat < Math.min(a.lat, b.lat) - degThreshold ||
                point.lat > Math.max(a.lat, b.lat) + degThreshold ||
                point.lon < Math.min(a.lon, b.lon) - degThreshold ||
                point.lon > Math.max(a.lon, b.lon) + degThreshold
            ) {
                continue;
            }

            if (distanceToSegment(point, a, b) <= maxDistanceMeters) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Échantillonne le test sur la trace GPX pour accélérer l'exécution globale.
 */
export function matchPointsWithShapesFast(
    points: GPSPoint[],
    relevantShapes: GTFSShapePoint[][],
    step: number = 3,
    maxDistanceMeters: number = 15
): boolean[] {
    const results = new Array<boolean>(points.length).fill(false);

    for (let i = 0; i < points.length; i += step) {
        const isMatch = isPointOnGTFSShape(points[i], relevantShapes, maxDistanceMeters);
        const end = Math.min(points.length, i + step);
        for (let j = i; j < end; j++) {
            results[j] = isMatch;
        }
    }

    return results;
}