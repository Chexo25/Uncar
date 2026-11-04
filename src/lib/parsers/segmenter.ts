// src/lib/parsers/segmenter.ts

import type { GPSPoint, Segment, TransportMode } from '$lib/types/gpx';
import { haversineDistance } from '$lib/parsers/gpxParser';

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
 * Matrice des seuils MAXIMAL d'écart (gap en secondes) entre la fin d'un segment et le début du suivant.
 * Si (début_B - fin_A) <= seuil, la transition est jugée trop immédiate/impossible et les deux segments fusionnent.
 */
const MAX_GAP_THRESHOLDS: Record<string, number> = {
    'bike->car': 60,
    'car->bike': 60,
    'bike->bus': 60,
    'bus->bike': 60,
    'walk->bike': 20,
    'bike->walk': 20,

    'bus->train': 120,
    'train->bus': 120,
    'train->car': 120,
    'car->train': 120,
    'bus->car': 120,
    'car->bus': 120
};

function getMaxGapThreshold(modeA: TransportMode, modeB: TransportMode): number | null {
    const key = `${modeA}->${modeB}`;
    return MAX_GAP_THRESHOLDS[key] ?? null;
}

/**
 * Ne fusionne deux segments de MÊME MODE QUE SI l'écart temporel est nul/quasi-nul (pause < 30s).
 * Préserve les pauses réelles (ex: 5 minutes de pause gardent 2 segments vélo séparés).
 */
export function mergeContiguousSameMode(segments: Segment[]): Segment[] {
    if (segments.length <= 1) return segments;

    const merged: Segment[] = [{ ...segments[0], points: [...segments[0].points] }];

    for (let i = 1; i < segments.length; i++) {
        const current = segments[i];
        const prev = merged[merged.length - 1];

        // Écart temporel réel entre la fin de A et le début de B
        const gap = (current.startTime.getTime() - prev.endTime.getTime()) / 1000;

        // On ne fusionne le même mode QUE si le temps mort entre les deux est négligeable (< 30s)
        if (prev.mode === current.mode && gap <= 180) {
            prev.points = [...prev.points, ...current.points];
            prev.endTime = current.endTime;
            prev.durationSeconds = (prev.endTime.getTime() - prev.startTime.getTime()) / 1000;
            prev.distanceMeters += current.distanceMeters;
            prev.avgSpeed = prev.durationSeconds > 0 ? prev.distanceMeters / prev.durationSeconds : 0;
            prev.confidence = Math.round((prev.confidence + current.confidence) / 2);
        } else {
            merged.push({ ...current, points: [...current.points] });
        }
    }

    return merged;
}

/**
 * Fusionne les segments consécutifs si le TEMPS DE TRANSITION (gap) entre eux est trop faible.
 */
export function mergeShortSegments(rawSegments: Segment[]): Segment[] {
    let segments = mergeContiguousSameMode(rawSegments);
    if (segments.length <= 1) return segments;

    let changed = true;
    let iteration = 0;

    while (changed && iteration < 10) {
        changed = false;
        iteration++;
        const nextList: Segment[] = [];

        let i = 0;
        while (i < segments.length) {
            const current = segments[i];
            const prev = nextList.length > 0 ? nextList[nextList.length - 1] : null;

            let shouldAbsorb = false;

            if (prev && current.mode !== prev.mode) {
                // Temps mort exact (en secondes) entre la fin de 'prev' et le début de 'current'
                const gapSeconds = (current.startTime.getTime() - prev.endTime.getTime()) / 1000;
                const maxAllowedGap = getMaxGapThreshold(prev.mode, current.mode);
                const next = i < segments.length - 1 ? segments[i + 1] : null;

                // Règle du sandwich : si 'prev' et 'next' sont du MÊME mode (ex: Vélo) et entourant 'current' (Bus)
                if (prev && next && prev.mode === next.mode && current.mode !== prev.mode) {
                    if (current.durationSeconds < 420) { // Absorbe les bruits jusqu'à 7 min
                        shouldAbsorb = true;
                    }
                }
                // Si le gap entre la fin de prev et le début de current est INFERIEUR ou EGAL au seuil
                // (ex: 2 secondes <= 60 secondes pour Bus->Vélo), la transition est invalide -> fusion !
                if (maxAllowedGap !== null && gapSeconds <= maxAllowedGap) {
                    shouldAbsorb = true;
                }
            }

            if (shouldAbsorb && prev) {
                changed = true;

                // Choix du mode final : on conserve le mode du segment le plus long en durée
                // Si l'un des deux est 'walk' mais que la vitesse globale dépasse 6 km/h, privilégier l'autre mode
                let targetMode = prev.durationSeconds >= current.durationSeconds ? prev.mode : current.mode;
                if ((prev.mode === 'walk' || current.mode === 'walk') && (prev.avgSpeed * 3.6 > 6 || current.avgSpeed * 3.6 > 6)) {
                    targetMode = prev.mode === 'walk' ? current.mode : prev.mode;
                }
                prev.mode = targetMode;
                prev.points = [...prev.points, ...current.points];
                prev.endTime = current.endTime;
                prev.durationSeconds = (prev.endTime.getTime() - prev.startTime.getTime()) / 1000;
                prev.distanceMeters += current.distanceMeters;
                prev.avgSpeed = prev.durationSeconds > 0 ? prev.distanceMeters / prev.durationSeconds : 0;
                prev.confidence = Math.max(40, Math.round(prev.confidence * 0.8 + current.confidence * 0.2));

                i++;
            } else {
                nextList.push({ ...current, points: [...current.points] });
                i++;
            }
        }

        segments = mergeContiguousSameMode(nextList);
    }

    return segments;
}

export function buildSegments(
    points: GPSPoint[],
    labels: TransportMode[],
    confidences: number[] = []
): Segment[] {
    if (points.length === 0 || points.length !== labels.length) return [];

    const combined = points.map((pt, idx) => ({
        pt,
        label: labels[idx],
        conf: confidences[idx] ?? 50
    })).sort((a, b) => a.pt.time.getTime() - b.pt.time.getTime());

    const STILL_CONF = 10;
    const keyOf = (c: { label: TransportMode; conf: number }) =>
        c.conf <= STILL_CONF ? 'still' : c.label;

    const initialSegments: Segment[] = [];
    let currentPoints: GPSPoint[] = [combined[0].pt];
    let currentConfidences: number[] = [combined[0].conf];
    let currentKey: string = keyOf(combined[0]);
    let currentMode: TransportMode = combined[0].label;
    let segmentId = 1;

    const flush = () => {
        if (currentKey !== 'still' && currentPoints.length > 1) {
            initialSegments.push(createSegment(segmentId++, currentPoints, currentMode, currentConfidences));
        }
    };

    for (let i = 1; i < combined.length; i++) {
        const item = combined[i];
        const prevItem = combined[i - 1];
        const timeGap = (item.pt.time.getTime() - prevItem.pt.time.getTime()) / 1000;
        const key = keyOf(item);
        const stalled = timeGap > 60 && (item.pt.distance || 0) / timeGap < 0.8;

        if (key !== currentKey || timeGap > 60 || stalled) {
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

    // 1. On regroupe uniquement les segments contigus sans pause
    const step1 = mergeContiguousSameMode(initialSegments);

    // 2. On fusionne les transitions dont le gap entre fin(A) et début(B) est <= au seuil
    const step2 = mergeShortSegments(step1);

    return step2
    .filter((seg) => {
        const maxRadius = getMaxRadius(seg.points);
        const tortuosity = seg.distanceMeters / Math.max(2 * maxRadius, 1);
        const avgKmH = seg.avgSpeed * 3.6;

        if (maxRadius < 60) return false;
        if (tortuosity > 5 && maxRadius < 200) return false;
        
        // Règle demandée : aucun segment de marche sous 5 minutes (300 secondes)
        if (seg.mode === 'walk' && seg.durationSeconds < 300) return false;
        if (seg.mode === 'walk' && avgKmH < 2.0) return false;
        
        
        return seg.durationSeconds >= 15;
    })
        .map((seg, idx) => ({ ...seg, id: idx + 1 }));
}

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

    const avgConfidence = confidences.length
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 50;

    return {
        id,
        mode,
        confidence: avgConfidence,
        points: [...points],
        startTime,
        endTime,
        distanceMeters,
        durationSeconds,
        avgSpeed
    };
}