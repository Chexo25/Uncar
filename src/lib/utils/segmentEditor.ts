export type TransportMode = 'walk' | 'bike' | 'car' | 'bus_tram' | 'train';

export interface GpsPoint {
	lat: number;
	lon: number;
	timestamp?: string;
}

export interface TripSegment {
	id: string;
	mode: TransportMode;
	startTime: string; // ISO string (ex: "2026-11-18T08:15:00.000Z")
	endTime: string;   // ISO string (ex: "2026-11-18T08:32:00.000Z")
	distance: number;  // en mètres
	points: GpsPoint[];
	isManual?: boolean;
}

/**
 * 1. Modifie le mode de transport d'un segment donné
 */
export function updateSegmentMode(
	segments: TripSegment[],
	segmentId: string,
	newMode: TransportMode
): TripSegment[] {
	return segments.map((seg) =>
		seg.id === segmentId
			? { ...seg, mode: newMode, isManual: true }
			: seg
	);
}

/**
 * 2. Fusionne le segment à l'index `index` avec le segment suivant (`index + 1`)
 */
export function mergeAdjacentSegments(
	segments: TripSegment[],
	index: number
): TripSegment[] {
	if (index < 0 || index >= segments.length - 1) {
		return segments;
	}

	const first = segments[index];
	const second = segments[index + 1];

	// On garde le mode du segment ayant la plus grande distance par défaut
	const dominantMode = first.distance >= second.distance ? first.mode : second.mode;

	const mergedSegment: TripSegment = {
		id: first.id,
		mode: dominantMode,
		startTime: first.startTime, // Heure de départ du 1er
		endTime: second.endTime,    // Heure d'arrivée du 2nd
		distance: first.distance + second.distance,
		points: [...first.points, ...second.points],
		isManual: true
	};

	return [
		...segments.slice(0, index),
		mergedSegment,
		...segments.slice(index + 2)
	];
}

/**
 * Helper d'affichage : calcule la durée lisible entre startTime et endTime
 */
export function formatSegmentDuration(startTime: string, endTime: string): string {
	const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
	const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
	
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	
	return hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;
}