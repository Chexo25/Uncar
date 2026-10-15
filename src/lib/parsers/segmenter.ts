import type { GPSPoint, Segment, TransportMode } from '$lib/types/gpx';
// CHECKER LE CODE POUR LINSTANT JE TEST
/**
 * Form segments from a list of GPS points and their corresponding transport mode labels.
 * A new segment is created when the transport mode changes or when a large time gap (> 120s) is detected between consecutive points.
 * @param points Array of GPS points.
 * @param labels Array of transport mode labels corresponding to each GPS point.
 * @returns An array of segments, each containing a list of GPS points and the associated transport mode.
 */
export function buildSegments(
    points: GPSPoint[],
    labels: TransportMode[],
    confidences: number[] = []
): Segment[] {
    if (points.length === 0 || points.length !== labels.length) return [];

    const segments: Segment[] = [];
    let currentPoints: GPSPoint[] = [points[0]];
    let currentConfidences: number[] = [confidences[0] ?? 50];
    let currentMode: TransportMode = labels[0];
    let segmentId = 1;

    // 1. Découpage initial par changement de mode ou pause > 120s
    for (let i = 1; i < points.length; i++) {
        const pt = points[i];
        const mode = labels[i];
        const conf = confidences[i] ?? 50;
        const prevPt = points[i - 1];

        const timeGap = (pt.time.getTime() - prevPt.time.getTime()) / 1000;

        if (mode !== currentMode || timeGap > 120) {
            if (currentPoints.length > 0) {
                segments.push(createSegment(segmentId++, currentPoints, currentMode, currentConfidences));
            }
            currentPoints = [pt];
            currentConfidences = [conf];
            currentMode = mode;
        } else {
            currentPoints.push(pt);
            currentConfidences.push(conf);
        }
    }

    if (currentPoints.length > 0) {
        segments.push(createSegment(segmentId, currentPoints, currentMode, currentConfidences));
    }

    // 2. Reclassifier les courts morceaux 'bike' isolés entre deux phases 'car'
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.mode === 'bike' && seg.durationSeconds < 300) {
            const prevIsCar = i > 0 && segments[i - 1].mode === 'car';
            const nextIsCar = i < segments.length - 1 && segments[i + 1].mode === 'car';
            if (prevIsCar || nextIsCar) {
                seg.mode = 'car';
            }
        }
    }

    // 3. Fusionner les segments consécutifs qui ont désormais le même mode
    const mergedSegments: Segment[] = [];
    for (const seg of segments) {
        if (mergedSegments.length === 0) {
            mergedSegments.push(seg);
        } else {
            const last = mergedSegments[mergedSegments.length - 1];
            const timeGap = (seg.startTime.getTime() - last.endTime.getTime()) / 1000;
            if (last.mode === seg.mode && timeGap <= 120) {
                last.points.push(...seg.points);
                last.endTime = seg.endTime;
                last.distanceMeters += seg.distanceMeters;
                last.durationSeconds = (last.endTime.getTime() - last.startTime.getTime()) / 1000;
                last.avgSpeed = last.durationSeconds > 0 ? last.distanceMeters / last.durationSeconds : 0;
            } else {
                mergedSegments.push(seg);
            }
        }
    }

    // 4. Filtrer les micro-segments parasites (< 10m ou < 10s)
    const validSegments = mergedSegments.filter(
        (seg) => seg.distanceMeters >= 10 && seg.durationSeconds >= 10
    );

    // 5. Réindexer et retourner la liste nettoyée
    return validSegments.map((seg, idx) => ({ ...seg, id: idx + 1 }));
}

/**
 * create a segment object from a list of GPS points and a transport mode
 * @param id 
 * @param points 
 * @param mode 
 * @param confidences
 * @returns 
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
	const distanceMeters = points.reduce((acc, p) => acc + (p.distance || 0), 0);
	const avgSpeed = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;

	// Calcul de la confiance moyenne sur le segment
	const avgConfidence = confidences.length
		? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
		: 50;

	return {
		id,
		mode,
		confidence: avgConfidence,
		points,
		startTime,
		endTime,
		distanceMeters,
		durationSeconds,
		avgSpeed
	};
}