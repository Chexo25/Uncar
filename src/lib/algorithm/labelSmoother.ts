import type { TransportMode } from '../types/gpx';

/**
 * Apply a filter of majoritary vote on the transport mode labels of the GPS points to smooth out noise and outliers.
 * @param rawLabels Array of transport mode labels to be filtered.
 * @param windowSize Size of the filter window (must be an odd number).
 * @returns A new array of transport mode labels with smoothed values.
 */
export function applyLabelSmoother(rawLabels: TransportMode[], windowSize: number = 9): TransportMode[] {
    if (rawLabels.length < windowSize) return rawLabels; //Not enough points to apply the filter

    const half = Math.floor(windowSize / 2);
    const smoothed: TransportMode[] = [];

    //definition of the function to get the majority label in a window
    for (let i = 0; i < rawLabels.length; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(rawLabels.length - 1, i + half);
        const window = rawLabels.slice(start, end + 1);

        //count the occurrences of each label in the window
        const counts = new Map<TransportMode, number>();
        for (const label of window) {
            counts.set(label, (counts.get(label) || 0) + 1);
        }

        //get the label with the maximum count
        let majorityMode = rawLabels[i];
        let maxCount = 0;
        counts.forEach((count, mode) => {
            if (count > maxCount) {
                maxCount = count;
                majorityMode = mode;
            }
        });

        // Inertie voiture : si le mode précédent était "car" et qu'on hésite avec bus/tram
        const previousMode = smoothed.length > 0 ? smoothed[smoothed.length - 1] : rawLabels[0];
        if (previousMode === 'car' && (majorityMode === 'bus' || majorityMode === 'tram')) {
            const tcCount = (counts.get('bus') || 0) + (counts.get('tram') || 0);
            // Si le bus/tram ne représente pas au moins 70% de la fenêtre, on reste en voiture
            if (tcCount / window.length < 0.7) {
                majorityMode = 'car';
            }
        }

        smoothed.push(majorityMode);
    }

    return smoothed;
}
