import type { TransportMode } from '$lib/types/gpx';
import type { PointFeatures } from './pointMetrics';
import type { GTFSTransportType } from '$lib/types/gtfs';

export interface ClassificationResult {
	mode: TransportMode;
	confidence: number; //0 to 100
}

/**
 * Classify a point based on its features and the presence of nearby GTFS stops.
 * @param features The features of the point to classify.
 * @param nearbyType The transport type of the nearby GTFS stop, if any (default: null).
 * @param shapeType The transport type of the nearby GTFS shape, if any (default: null).
 * @returns The classification result containing the transport mode and confidence level.
 */
export function classifyPointFeatures(
    features: PointFeatures,
    nearbyType: GTFSTransportType | null = null,
    shapeType: GTFSTransportType | null = null
): ClassificationResult {
    const avgSpeed = features.localAvgSpeed;
    const maxSpeed = features.localMaxSpeed;
    const headingChange = features.localAvgBearingChange;

    const detectedTCMode = nearbyType || shapeType;

    // 0. IMMOBILE / PAUSE (Bruit GPS sans déplacement réel)
    if (avgSpeed < 1.2) {
        return { mode: 'walk', confidence: 10 }; // Très faible confiance pour ne pas polluer
    }

    //1. WALK (< 6 km/h)
    if (avgSpeed <= 7 && maxSpeed <= 15) {
        return { mode: 'walk', confidence: 85 };
    }

    //2. PUBLIC TRANSPORT WITH GTFS
    // Si on a à la fois l'arrêt ET la ligne, ou si nearbyType est présent
    if (nearbyType && avgSpeed > 8) {
        let confidence = 80;
        if (headingChange < 10) confidence += 10;
        if (shapeType && nearbyType === shapeType) confidence = 95;

        if (nearbyType === 'train' && avgSpeed > 25) return { mode: 'train', confidence };
        if (nearbyType === 'tram') return { mode: 'tram', confidence };
        if (nearbyType === 'bus') return { mode: 'bus', confidence };
    }

    // 3. VOITURE A FAIBLE VITESSE / TRAFIC DENSE
    if (avgSpeed > 30 && (features.localMaxAcceleration > 1.2 || headingChange < 5)) {
        return { mode: 'car', confidence: avgSpeed > 45 ? 95 : 85 };
    }

    // 4. Vélo ou voiture lente (vitesse moyenne basse, pas de pic de voiture)
    if (avgSpeed <= 30 && maxSpeed <= 45) {
        if (headingChange > 10 && features.localMaxAcceleration < 1.0) {
            return { mode: 'bike', confidence: 80 };
        }
        if (features.localMaxAcceleration > 1.5 && headingChange < 8) {
            return { mode: 'car', confidence: 75 };
        }
        return { mode: 'bike', confidence: 60 };
    }

    // 5. Voiture : pic élevé ET vitesse moyenne soutenue
    if (maxSpeed > 45 && avgSpeed > 25) {
        return { mode: 'car', confidence: maxSpeed > 60 ? 95 : 85 };
    }

    return { mode: 'bike', confidence: 60 };
}