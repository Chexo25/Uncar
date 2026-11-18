import type {GPSPoint} from '../types/gpx';

/**
 * Apply a median filter to the speed values of the GPS points to smooth out noise and outliers.
 * @param points Array of GPS points to be filtered.
 * @param windowSize Size of the median filter window (must be an odd number).
 * @returns A new array of GPS points with smoothed speed values.
 */
export function applyMedianFilter(points: GPSPoint[], windowSize: number = 5): GPSPoint[] {
    if (points.length < windowSize) return points;

    const half = Math.floor(windowSize / 2);

    return points.map((pt,i) => {
        if (i < half || i >= points.length - half) {
            return pt;
        }

        const windowSpeeds: number[] = [];
        for (let j = i - half; j <= i + half; j++) {
            windowSpeeds.push(points[j].calculatedSpeed || 0);
        }

        windowSpeeds.sort((a, b) => a - b);
        const medianSpeed = windowSpeeds[half];
        return {
            ...pt,
            calculatedSpeed: medianSpeed
        };
    });
}