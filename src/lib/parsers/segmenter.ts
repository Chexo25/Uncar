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
 * Maximum allowed time gaps for likely invalid transitions between modes.
 */
const MAX_GAP_THRESHOLDS: Record<string, number> = {
    'bike->car': 60,
    'car->bike': 60,
    'bike->bus_tram': 60,
    'bus_tram->bike': 60,
    'walk->bike': 0,
    'bike->walk': 0,

    'bus_tram->train': 120,
    'train->bus_tram': 120,
    'train->car': 120,
    'car->train': 120,
    'bus_tram->car': 120,
    'car->bus_tram': 120
};

function getMaxGapThreshold(modeA: TransportMode, modeB: TransportMode): number | null {
    const key = `${modeA}->${modeB}`;
    return MAX_GAP_THRESHOLDS[key] ?? null;
}

/**
 * Merges contiguous segments only when the gap is negligible.
 */
export function mergeContiguousSameMode(segments: Segment[]): Segment[] {
    if (segments.length <= 1) return segments;

    const merged: Segment[] = [{ ...segments[0], points: [...segments[0].points] }];

    for (let i = 1; i < segments.length; i++) {
        const current = segments[i];
        const prev = merged[merged.length - 1];

        const gap = (current.startTime.getTime() - prev.endTime.getTime()) / 1000;

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
 * Merges consecutive segments when their transition gap is too short.
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
                const gapSeconds = (current.startTime.getTime() - prev.endTime.getTime()) / 1000;
                const maxAllowedGap = getMaxGapThreshold(prev.mode, current.mode);
                if (maxAllowedGap !== null && gapSeconds <= maxAllowedGap) {
                    shouldAbsorb = true;
                }
            }

            if (shouldAbsorb && prev) {
                changed = true;

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

    const isStationary = (index: number): boolean => {
        const current = combined[index].pt;
        const t = current.time.getTime();
        let first = index;
        while (first > 0 && t - combined[first].pt.time.getTime() < 60_000) first--;
        const origin = combined[first].pt;
        const elapsed = (t - origin.time.getTime()) / 1000;
        if (elapsed < 60 || elapsed > 600) return false;
        return haversineDistance(origin.lat, origin.lon, current.lat, current.lon) / elapsed < 0.35;
    };

    const initialSegments: Segment[] = [];
    const STATIONARY_SPLIT_SECONDS = 300;
    let currentPoints: GPSPoint[] = [combined[0].pt];
    let currentConfidences: number[] = [combined[0].conf];
    let currentKey: string = keyOf(combined[0]);
    let currentMode: TransportMode = combined[0].label;
    let segmentId = 1;
    let stationaryPoints: typeof combined = [];
    let stationarySince: number | null = null;

    const flush = () => {
        if (currentKey !== 'still' && currentPoints.length > 1) {
            initialSegments.push(createSegment(segmentId++, currentPoints, currentMode, currentConfidences));
        }
    };

    for (let i = 1; i < combined.length; i++) {
        const item = combined[i];
        const prevItem = combined[i - 1];
        const timeGap = (item.pt.time.getTime() - prevItem.pt.time.getTime()) / 1000;
        const stationary = isStationary(i);

        if (stationary) {
            stationaryPoints.push(item);
            stationarySince ??= prevItem.pt.time.getTime();
            continue;
        }

        if (stationaryPoints.length > 0) {
            const stationaryDuration = stationarySince
                ? (item.pt.time.getTime() - stationarySince) / 1000
                : 0;
            const splitAfterStop = stationaryDuration >= STATIONARY_SPLIT_SECONDS;

            if (splitAfterStop) {
                flush();
                currentPoints = [];
                currentConfidences = [];
                currentKey = 'still';
            } else {
                currentPoints.push(...stationaryPoints.map((entry) => entry.pt));
                currentConfidences.push(...stationaryPoints.map((entry) => entry.conf));
            }

            stationaryPoints = [];
            stationarySince = null;
        }

        const key = keyOf(item);
        const stalled = timeGap > 180 && (item.pt.distance || 0) / timeGap < 0.8;

        if (key !== currentKey || stalled) {
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

    if (stationaryPoints.length > 0) {
        const lastTime = combined[combined.length - 1].pt.time.getTime();
        const stationaryDuration = stationarySince
            ? (lastTime - stationarySince) / 1000
            : 0;

        if (stationaryDuration < STATIONARY_SPLIT_SECONDS) {
            currentPoints.push(...stationaryPoints.map((entry) => entry.pt));
            currentConfidences.push(...stationaryPoints.map((entry) => entry.conf));
        }
    }

    flush();

    const step1 = mergeContiguousSameMode(initialSegments);
    const step2 = mergeShortSegments(step1);
    
    return step2
    .filter((seg) => {
        const maxRadius = getMaxRadius(seg.points);
        const tortuosity = seg.distanceMeters / Math.max(2 * maxRadius, 1);
        const avgKmH = seg.avgSpeed * 3.6;

        if (maxRadius < 40) return false;
        if (tortuosity > 5 && maxRadius < 200) return false;
        
        if (seg.mode === 'walk' && seg.durationSeconds < 120) return false;
        if (seg.mode === 'walk' && avgKmH < 3.0) return false;
        if (seg.mode === 'walk' && maxRadius < 90) return false;
        return seg.durationSeconds >= 30;
        
    })
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
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