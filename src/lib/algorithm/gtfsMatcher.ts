import type { GPSPoint } from '$lib/types/gpx';
import type { GTFSStop, GTFSMode, GTFSShape } from '$lib/types/gtfs';
import { haversineDistance } from '$lib/parsers/gpxParser.ts';

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

/**
 * Finds a nearby GTFS stop.
 */
export function getNearbyGTFSType(
    point: GPSPoint,
    stops: GTFSStop[],
    maxDistanceMeters: number = 20
): GTFSMode | null {
    const degThreshold = maxDistanceMeters * 0.000009;

    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
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
 * Filters GTFS shapes intersecting the GPX bounding box.
 */
export function filterShapesInBBox(
    shapes: GTFSShape[] | Map<string, GTFSShape>,
    bbox: BoundingBox
): GTFSShape[] {
    const relevantShapes: GTFSShape[] = [];
    const shapeList = Array.isArray(shapes) ? shapes : shapes.values();

    for (const shape of shapeList) {
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

/**
 * Returns the first GTFS shape within maxDistanceMeters of a point.
 */
export function getMatchingGTFSShape(
    point: GPSPoint,
    shapes: GTFSShape[],
    maxDistanceMeters: number = 15
): GTFSShape | null {
    for (let s = 0; s < shapes.length; s++) {
        const shape = shapes[s];

        if (
            point.lat < shape.bbox.minLat - 0.0003 ||
            point.lat > shape.bbox.maxLat + 0.0003 ||
            point.lon < shape.bbox.minLon - 0.0003 ||
            point.lon > shape.bbox.maxLon + 0.0003
        ) {
            continue;
        }

        const shapePts = shape.points;
        for (let j = 0; j < shapePts.length; j += 3) {
            if (haversineDistance(point.lat, point.lon, shapePts[j].lat, shapePts[j].lon) <= maxDistanceMeters) {
                return shape;
            }
        }
    }

    return null;
}

/**
 * Samples GPX points to reduce shape matching cost.
 */
export function matchPointsWithShapesFast(
    points: GPSPoint[],
    relevantShapes: GTFSShape[],
    step: number = 5,
    maxDistanceMeters: number = 15
): (GTFSShape | null)[] {
    const results = new Array<GTFSShape | null>(points.length).fill(null);

    for (let i = 0; i < points.length; i += step) {
        const matchedShape = getMatchingGTFSShape(points[i], relevantShapes, maxDistanceMeters);
        const end = Math.min(points.length, i + step);
        for (let j = i; j < end; j++) {
            results[j] = matchedShape;
        }
    }

    return results;
}