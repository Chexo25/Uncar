import type { GPSPoint, Segment, TransportMode } from '$lib/types/gpx';

/**
 * Form segments from a list of GPS points and their corresponding transport mode labels.
 * A new segment is created when the transport mode changes or when a large time gap (> 120s) is detected between consecutive points.
 * @param points Array of GPS points.
 * @param labels Array of transport mode labels corresponding to each GPS point.
 * @returns An array of segments, each containing a list of GPS points and the associated transport mode.
 */
export function buildSegments(
	points: GPSPoint[],
	labels: TransportMode[]
): Segment[] {
	if (points.length === 0 || points.length !== labels.length) return [];

	const segments: Segment[] = [];
	let currentPoints: GPSPoint[] = [points[0]];
	let currentMode: TransportMode = labels[0];
	let segmentId = 1;

	for (let i = 1; i < points.length; i++) {
		const pt = points[i];
		const mode = labels[i];
		const prevPt = points[i - 1];

		const timeGap = (pt.time.getTime() - prevPt.time.getTime()) / 1000;

		//On change de segment si le mode change ou si une grande pause est détectée (> 120s)
		if (mode !== currentMode || timeGap > 120) {
			if (currentPoints.length > 0) {
				segments.push(createSegment(segmentId++, currentPoints, currentMode));
			}
			currentPoints = [pt];
			currentMode = mode;
		} else {
			currentPoints.push(pt);
		}
	}

	if (currentPoints.length > 0) {
		segments.push(createSegment(segmentId, currentPoints, currentMode));
	}

	return segments;
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
	confidences: number[]
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