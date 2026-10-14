import type {GPSPoint} from '../types/gpx';

/**
 * Apply a median filter to the speed values of the GPS points to smooth out noise and outliers.
 * @param points Array of GPS points to be filtered.
 * @param windowSize Size of the median filter window (must be an odd number).
 * @returns A new array of GPS points with smoothed speed values.
 */
export function applyMedianFilter(points: GPSPoint[], windowSize: number = 5): GPSPoint[] {
    if (points.length < windowSize) return points; // Not enough points to apply the filter

    const half = Math.floor(windowSize / 2);

    return points.map((pt,i) => {
        // For points on the edges, we can't apply the full window, so we just return the original point
        if (i < half || i >= points.length - half) {
            return pt;
        }

        //Extract the speeds around point i
        const windowSpeeds: number[] = [];
        for (let j = i - half; j <= i + half; j++) {
            windowSpeeds.push(points[j].calculatedSpeed || 0);
        }

        //Sort the speeds by croissant order
        windowSpeeds.sort((a, b) => a - b);

        //Get the median value
        const medianSpeed = windowSpeeds[half];

        //Return the updated point with smooth speed
        return {
            ...pt,
            calculatedSpeed: medianSpeed
        };
    });
}