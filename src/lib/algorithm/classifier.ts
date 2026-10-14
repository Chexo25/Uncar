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
	const speed = features.localAvgSpeedKmH;

	// 1. MARCHE (< 7.5 km/h)
	if (speed <= 7.5) {
		// Plus la sinuosité/changement de cap est fort, plus on est sûr que c'est de la marche
		const confidence = Math.min(95, Math.round(70 + features.localAvgBearingChange * 1.5));
		return { mode: 'WALK', confidence };
	}

	// 2. TRANSPORTS EN COMMUN (Bus / Tram / Train)
	if (hasNearbyGTFSStop && speed > 10) {
		return { mode: 'BUS_TRAM', confidence: 85 };
	}

	// 3. VÉLO (7.5 km/h à 28 km/h)
	if (speed > 7.5 && speed <= 28) {
		// Si la vitesse est typique du vélo (12-22 km/h) et qu'il y a des petits changements de cap
		let confidence = 75;
		if (speed >= 12 && speed <= 22) confidence += 15;
		if (features.localAvgBearingChange > 5) confidence += 5;
		return { mode: 'BICYCLE', confidence: Math.min(95, confidence) };
	}

	// 4. VOITURE / VÉHICULE RAPIDE (> 28 km/h sans arrêt GTFS)
	if (speed > 28) {
		let confidence = 80;
		if (speed > 50) confidence = 95; // Très haute confiance si vitesse > 50 km/h
		return { mode: 'CAR', confidence };
	}

	return { mode: 'UNKNOWN', confidence: 40 };
}