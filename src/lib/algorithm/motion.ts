// Emplacement : src/lib/algorithm/motion.ts  (NOUVEAU FICHIER)
import { haversineDistance } from '$lib/parsers/gpxParser';
import type { GPSPoint, Segment, TransportMode } from '$lib/types/gpx';

// --- Seuils à calibrer sur tes traces (en km/h) ---
const CAR_MIN_P95 = 50;  // au-dessus : forcément voiture
const BIKE_MAX_P95 = 40; // en dessous : plutôt vélo

/**
 * Vitesse en m/s calculée comme le déplacement net sur une fenêtre de `windowSec` secondes
 * centrée sur chaque point. Beaucoup moins sensible au bruit GPS que la vitesse instantanée.
 */
export function windowedSpeeds(points: GPSPoint[], windowSec = 20): number[] {
    const n = points.length;
    const out = new Array<number>(n).fill(0);
    if (n < 2) return out;

    const times = points.map((p) => p.time.getTime());
    const half = (windowSec * 1000) / 2;
    let lo = 0;
    let hi = 0;

    for (let i = 0; i < n; i++) {
        const t = times[i];
        while (lo < i && times[lo] < t - half) lo++;
        if (hi < i) hi = i;
        while (hi < n - 1 && times[hi + 1] <= t + half) hi++;

        // Toujours au moins un voisin de chaque côté (utile si le GPX est peu échantillonné)
        const a = lo < i ? lo : Math.max(0, i - 1);
        const b = hi > i ? hi : Math.min(n - 1, i + 1);

        const dt = (times[b] - times[a]) / 1000;
        if (dt > 0) {
            out[i] = haversineDistance(points[a].lat, points[a].lon, points[b].lat, points[b].lon) / dt;
        }
    }
    return out;
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Corrige le mode d'un segment bike/car en regardant sa vitesse globale (percentile 95).
 * Les autres modes ne sont pas touchés.
 */
export function reclassifySegment(seg: Segment): TransportMode {
    if (seg.mode !== 'bike' && seg.mode !== 'car') return seg.mode;

    const kmh = windowedSpeeds(seg.points, 15)
        .map((x) => x * 3.6)
        .sort((a, b) => a - b);
    const p95 = percentile(kmh, 0.95);

    if (p95 >= CAR_MIN_P95) return 'car';
    if (p95 < BIKE_MAX_P95) return 'bike';
    return seg.mode; // zone ambiguë : on garde la décision point par point
}