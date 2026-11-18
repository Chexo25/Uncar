import type { TransportMode } from '../types/gpx';

/**
 * Apply a filter of majoritary vote on the transport mode labels of the GPS points to smooth out noise and outliers.
 * @param rawLabels Array of transport mode labels to be filtered.
 * @param windowSize Size of the filter window (must be an odd number).
 * @returns A new array of transport mode labels with smoothed values.
 */
export function applyLabelSmoother(rawLabels: TransportMode[], windowSize: number = 9): TransportMode[] {
    if (rawLabels.length < windowSize) return rawLabels;

    const half = Math.floor(windowSize / 2);
    const smoothed: TransportMode[] = [];

    for (let i = 0; i < rawLabels.length; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(rawLabels.length - 1, i + half);
        const window = rawLabels.slice(start, end + 1);

        const counts = new Map<TransportMode, number>();
        for (const label of window) {
            counts.set(label, (counts.get(label) || 0) + 1);
        }

        let majorityMode = rawLabels[i];
        let maxCount = 0;
        counts.forEach((count, mode) => {
            if (count > maxCount) {
                maxCount = count;
                majorityMode = mode;
            }
        });

        const walkCount = counts.get('walk') || 0;
        if (walkCount / window.length >= 0.35 && rawLabels[i] === 'walk') {
            smoothed.push('walk');
            continue;
        }

        const previousMode = smoothed.length > 0 ? smoothed[smoothed.length - 1] : rawLabels[0];
        if (previousMode === 'car' && majorityMode === 'bus_tram') {
            const tcCount = counts.get('bus_tram') || 0;
            if (tcCount / window.length < 0.7) {
                majorityMode = 'car';
            }
        }

        smoothed.push(majorityMode);
    }

    return smoothed;
}
