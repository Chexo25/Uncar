import type {GPSPoint, Segment} from '../types/gpx';

export interface SegmentMetrics {
    avgSpeed: number; //in km/h
    maxSpeed: number; //in km/h
    p95Speed: number; //in km/h
    avgAcceleration: number; //in m/s²
    maxAcceleration: number; //in m/s²
    avgBearingChange: number; //in degrees per point
}

/**
 * Calculates the bearing in degrees between two GPS points (found on internet)
 * @param pt1 The first GPS point.
 * @param pt2 The second GPS point.
 * @returns The bearing in degrees from the first point to the second point.
 */
export function calculateBearing(pt1: GPSPoint, pt2: GPSPoint): number {
    const rad = Math.PI / 180;
    const lat1 = pt1.lat * rad;
    const lat2 = pt2.lat * rad;
    const deltaLon = (pt2.lon - pt1.lon) * rad;

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    const bearing = Math.atan2(y, x) / rad; // Convert back to degrees

    return (bearing + 360) % 360; // Normalize to [0, 360)
}