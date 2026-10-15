import type { TransportMode } from '$lib/types/gpx';
import type { PointFeatures } from './pointMetrics';
import type { Stop } from '$lib/types/gtfs';
//CODE A CHECKER POUR LINSTANT JE TESTE JUSTE
export interface ClassificationResult {
	mode: TransportMode;
	confidence: number; // 0 à 100
}

/**
 * Classifie un point/fenêtre et calcule un niveau de confiance
 */
export function classifyPointFeatures(
	features: PointFeatures,
	hasNearbyGTFSStop: boolean = false
): ClassificationResult {
	const avgSpeed = features.localAvgSpeed;
	const maxSpeed = features.localMaxSpeed;

	// 1. MARCHE (< 6 km/h)
	if (maxSpeed <= 6) {
		return { mode: 'walk', confidence: 90 };
	}

	// 2. TRANSPORTS EN COMMUN
	if (hasNearbyGTFSStop && maxSpeed > 15) {
		return { mode: 'bus', confidence: 85 };
	}

	// 3. VOITURE
	// En ville, dès qu'une pointe dépasse 22 km/h sur la fenêtre glissante, c'est de la voiture.
	if (maxSpeed > 20) {
		let confidence = 85;
		if (maxSpeed > 40) confidence = 95;
		return { mode: 'car', confidence };
	}

	// 4. VÉLO (Strictement entre 6 km/h et 22 km/h max)
	if (avgSpeed > 6 && maxSpeed <= 22) {
		return { mode: 'bike', confidence: 75 };
	}

	return { mode: 'car', confidence: 60 };
}