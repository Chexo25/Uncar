import type { GPSPoint, Segment, TransportMode } from '$lib/types/gpx';
import { haversineDistance } from '$lib/parsers/gpxParser';
import { trimStationaryEnds, reclassifySegment, windowedSpeeds } from '$lib/algorithm/motion';

function getMaxRadius(points: GPSPoint[]): number {
    const first = points[0];
    let max = 0;
    for (const p of points) {
        const d = haversineDistance(first.lat, first.lon, p.lat, p.lon);
        if (d > max) max = d;
    }
    return max;
}

/**
 * Forme des segments à partir d'une liste de points GPS et de leurs labels.
 */
export function buildSegments(
    points: GPSPoint[],
    labels: TransportMode[],
    confidences: number[] = []
): Segment[] {
    if (points.length === 0 || points.length !== labels.length) return [];

    // 1. Découpage initial (Pass 1)
    // Combiner points, labels et confiances avant de trier chronologiquement
    const combined = points.map((pt, idx) => ({
        pt,
        label: labels[idx],
        conf: confidences[idx] ?? 50
    })).sort((a, b) => a.pt.time.getTime() - b.pt.time.getTime());

    const STILL_CONF = 10; // confiance donnée par le classifier aux points immobiles
    const keyOf = (c: { label: TransportMode; conf: number }) =>
        c.conf <= STILL_CONF ? 'still' : c.label;

    const initialSegments: Segment[] = [];
    let currentPoints: GPSPoint[] = [combined[0].pt];
    let currentConfidences: number[] = [combined[0].conf];
    let currentKey: string = keyOf(combined[0]);
    let currentMode: TransportMode = combined[0].label;
    let segmentId = 1;

    const flush = () => {
        // les points immobiles ne forment jamais de segment
        if (currentKey !== 'still' && currentPoints.length > 1) {
            initialSegments.push(createSegment(segmentId++, currentPoints, currentMode, currentConfidences));
        }
    };

    for (let i = 1; i < combined.length; i++) {
        const item = combined[i];
        const prevItem = combined[i - 1];
        const timeGap = (item.pt.time.getTime() - prevItem.pt.time.getTime()) / 1000;
        const key = keyOf(item);
        // Écart > 1 min avec quasi aucun déplacement = pause (pas un tunnel, où la position change)
        const stalled = timeGap > 60 && (item.pt.distance || 0) / timeGap < 0.8;

        if (key !== currentKey || timeGap > 300 || stalled) {
            flush();
            currentPoints = [item.pt];
            currentConfidences = [item.conf];
            currentKey = key;
            currentMode = item.label;
        } else {
            currentPoints.push(item.pt);
            currentConfidences.push(item.conf);
        }
    }
    flush();

    // 3. Fusion des segments de même mode (Pass 3 - Immutative)
    const mergedSegments: Segment[] = [];
    for (const seg of initialSegments) {
        if (mergedSegments.length === 0) {
            mergedSegments.push(seg);
        } else {
            const lastIndex = mergedSegments.length - 1;
            const last = mergedSegments[lastIndex];
            const timeGap = (seg.startTime.getTime() - last.endTime.getTime()) / 1000;
            const maxGap = last.mode === 'walk' ? 180 : last.mode === 'car' ? 240 : 120;

            if (last.mode === seg.mode && timeGap <= maxGap) {
                // Création d'un nouveau segment fusionné sans altérer 'last'
                const combinedPoints = [...last.points, ...seg.points];
                const newDuration = (seg.endTime.getTime() - last.startTime.getTime()) / 1000;
                const newDistance = last.distanceMeters + seg.distanceMeters;

                mergedSegments[lastIndex] = {
                    ...last,
                    points: combinedPoints,
                    endTime: seg.endTime,
                    distanceMeters: newDistance,
                    durationSeconds: newDuration,
                    avgSpeed: newDuration > 0 ? newDistance / newDuration : 0,
                    confidence: Math.round((last.confidence * last.points.length + seg.confidence * seg.points.length) / (last.points.length + seg.points.length))
                };
            } else {
                mergedSegments.push(seg);
            }
        }
    }

    // Rognage des débuts/fins immobiles
    const trimmed: Segment[] = [];
    for (const seg of mergedSegments) {
        const pts = trimStationaryEnds(seg.points);
        if (pts.length < 2) continue;
        trimmed.push(createSegment(0, pts, seg.mode, [seg.confidence]));
    }

    const isWheel = (s: Segment) => s.mode === 'bike' || s.mode === 'car';
    const p95Of = (s: Segment) => {
        const v = windowedSpeeds(s.points, 15).map((x) => x * 3.6).sort((a, b) => a - b);
        return v[Math.floor(v.length * 0.95)] ?? 0;
    };

    // On recolle les segments vélo/voiture voisins quand AUCUN des deux n'est clairement une voiture rapide
    const wheeled: Segment[] = [];
    for (const seg of trimmed) {
        const last = wheeled[wheeled.length - 1];
        const gap = last ? (seg.startTime.getTime() - last.endTime.getTime()) / 1000 : Infinity;

        if (last && isWheel(last) && isWheel(seg) && gap <= 120 && p95Of(last) < 45 && p95Of(seg) < 45) {
            const mode = last.durationSeconds >= seg.durationSeconds ? last.mode : seg.mode;
            wheeled[wheeled.length - 1] = createSegment(0, [...last.points, ...seg.points], mode, [last.confidence, seg.confidence]);
        } else {
            wheeled.push(seg);
        }
    }

    return smoothModeBlips(wheeled)
    .map((seg) => ({ ...seg, mode: reclassifySegment(seg) }))
        .filter((seg) => {
            const maxRadius = getMaxRadius(seg.points);
            const tortuosity = seg.distanceMeters / Math.max(2 * maxRadius, 1);
            const avgKmH = seg.avgSpeed * 3.6;

            if (maxRadius < 100) return false;                    // pas de vrai déplacement
            if (tortuosity > 4 && maxRadius < 300) return false;  // GPS qui gigote sur place
            if (seg.mode === 'walk' && avgKmH < 2.5) return false;
            if (seg.confidence < 50) return false;
            return seg.durationSeconds >= 60;
        })
        .map((seg, idx) => ({ ...seg, id: idx + 1 }));
}

/**
 * Crée un objet Segment immutable.
 */
export function createSegment(
    id: number,
    points: GPSPoint[],
    mode: TransportMode,
    confidences: number[] = []
): Segment {
    const startTime = points[0].time;
    const endTime = points[points.length - 1].time;
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const distanceMeters = points.slice(1).reduce((acc, p) => acc + (p.distance || 0), 0);    
    const avgSpeed = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;

    // Si un segment s'étale sur plus de 30 minutes mais avance à moins de 1.2 km/h,
    // ce n'est PAS un déplacement mais du téléphone immobile.
    let finalMode = mode;
    if (durationSeconds > 1800 && avgSpeed * 3.6 < 1.2) {
        finalMode = 'walk'; // Sera éliminé au filtrage final
    }

    const avgConfidence = confidences.length
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 50;

    return {
        id,
        mode: finalMode,
        confidence: avgConfidence,
        points: [...points],
        startTime,
        endTime,
        distanceMeters,
        durationSeconds,
        avgSpeed
    };
}

function mergeSameMode(segs: Segment[]): Segment[] {
    const out: Segment[] = [];
    for (const seg of segs) {
        const last = out[out.length - 1];
        if (last) {
            const gap = (seg.startTime.getTime() - last.endTime.getTime()) / 1000;
            const maxGap = last.mode === 'walk' ? 180 : last.mode === 'car' ? 360 : 120;
            if (last.mode === seg.mode && gap <= maxGap) {
                const nA = last.points.length;
                const nB = seg.points.length;
                const merged = createSegment(0, [...last.points, ...seg.points], last.mode);
                out[out.length - 1] = {
                    ...merged,
                    confidence: Math.round((last.confidence * nA + seg.confidence * nB) / (nA + nB))
                };
                continue;
            }
        }
        out.push(seg);
    }
    return out;
}

/** Corrige les petits segments au mauvais mode, puis recolle les voisins identiques. */
export function smoothModeBlips(segs: Segment[]): Segment[] {
    const gapSec = (a: Segment, b: Segment) => (b.startTime.getTime() - a.endTime.getTime()) / 1000;
    const out = mergeSameMode(segs).map((s) => ({ ...s }));

    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < out.length; i++) {
            const prev = out[i - 1];
            const cur = out[i];
            const next = out[i + 1];
            const prevOk = prev !== undefined && gapSec(prev, cur) <= 120;
            const nextOk = next !== undefined && gapSec(cur, next) <= 120;

            // 1. Segment court entouré de deux segments du même autre mode
            if (prevOk && nextOk && prev.mode === next.mode && cur.mode !== prev.mode) {
                const d = cur.durationSeconds;
                if (prev.mode === 'car' && ((cur.mode === 'bike' && d < 480) || (cur.mode === 'walk' && d < 180))) {
                    cur.mode = 'car';
                } else if (prev.mode === 'bike' && cur.mode === 'car' && d < 480) {
                    cur.mode = 'bike';
                }
                continue;
            }

            // 2. Vélo court collé à une voiture : début ou fin d'un trajet en voiture à faible vitesse
            const prevNear = prev !== undefined && gapSec(prev, cur) <= 300;
            const nextNear = next !== undefined && gapSec(cur, next) <= 300;
            if (
                cur.mode === 'bike' &&
                cur.durationSeconds < 420 &&
                cur.avgSpeed * 3.6 >= 10 &&
                ((prevNear && prev.mode === 'car') || (nextNear && next.mode === 'car'))
            ) {
                cur.mode = 'car';
            }
        }
    }

    return mergeSameMode(out);
}