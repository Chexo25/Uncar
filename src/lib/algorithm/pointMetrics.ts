import type {GPSPoint} from '../types/gpx';
import {calculateBearing} from './physicMetrics';

export interface PointFeatures {
    localAvgSpeed: number; //in km/h
    localMaxSpeed: number; //in km/h
    localMaxAcceleration: number; //in m/s²
    localAvgBearingChange: number; //in degrees per point
}

/**
 * Calculation of local features around each point with a sliding window approach
 * @param points Array of GPS points to calculate features for.
 * @param windowSize Size of the sliding window (must be an odd number).
 * @returns A new array of PointFeatures corresponding to each GPS point.
 */
export function computePointFeatures(points: GPSPoint[], windowSize: number = 3): PointFeatures[] {
    return points.map((pt, i) => {
        const start = Math.max(0, i - windowSize);
        const end = Math.min(points.length - 1, i + windowSize);
        const windowPoints = points.slice(start, end + 1);

        //local speeds
        const speeds = windowPoints.map(p => (p.calculatedSpeed || 0) * 3.6); //in km/h
        const localAvgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        const localMaxSpeed = Math.max(...speeds);

        //local accelerations and bearing changes
        const accelerations: number[] = [];
        const bearingChanges: number[] = [];
        let prevBearing: number | null = null;

        for (let j = start; j <= end; j++) {
            if (j > start) {
                const p1 = points[j - 1];
                const p2 = points[j];
                const dt = (p2.time.getTime() - p1.time.getTime()) / 1000;

                if (dt > 0) {
                    const dv = (p2.calculatedSpeed || 0) - (p1.calculatedSpeed || 0);
                    accelerations.push(Math.abs(dv / dt)); //in m/s²
                }

                const b = calculateBearing(p1, p2);
                if (prevBearing !== null){
                    let diff = Math.abs(b - prevBearing);
                    if (diff > 180) diff = 360 - diff; //normalize to [0, 180]
                    bearingChanges.push(diff);
                }
                prevBearing = b;
            }
        }

        return {
            localAvgSpeed,
            localMaxSpeed,
            localMaxAcceleration: accelerations.length ? Math.max(...accelerations) : 0,
            localAvgBearingChange: bearingChanges.length ? bearingChanges.reduce((a, b) => a + b, 0) / bearingChanges.length : 0
        };
    });
}