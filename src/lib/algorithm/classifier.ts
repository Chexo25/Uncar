import type { TransportMode } from '$lib/types/gpx';
import type { PointFeatures } from './pointMetrics';
import type { GTFSMode } from '$lib/types/gtfs';

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
    nearbyType: GTFSMode | null = null,
    shapeType: GTFSMode | null = null
): ClassificationResult {
    const avgSpeed = features.localAvgSpeed;
    const maxSpeed = features.localMaxSpeed;
    const headingChange = features.localAvgBearingChange;

    const detectedTCMode = nearbyType || shapeType;

    // 0. IMMOBILE / PAUSE (Bruit GPS sans déplacement réel)
    if (avgSpeed < 1.2) {
        if (nearbyType === 'bus' || nearbyType === 'tram') {
            return { mode: nearbyType, confidence: 70 };
        }
        return { mode: 'walk', confidence: 10 }; // Très faible confiance pour ne pas polluer
    }

    //1. WALK (< 6 km/h)
    if (avgSpeed <= 7 && maxSpeed <= 10) {
        return { mode: 'walk', confidence: 85 };
    }

    //2. PUBLIC TRANSPORT WITH GTFS
    // Si on a à la fois l'arrêt ET la ligne, ou si nearbyType est présent
    if (shapeType) {
        // Si la vitesse dépasse 55 km/h sur du Filbleu (en ville), ce n'est PAS un bus Filbleu -> c'est une voiture !
        if (maxSpeed > 55 && shapeType === 'bus') {
            return { mode: 'car', confidence: 90 };
        }

        // Un vélo qui longe un axe GTFS sans s'arrêter aux arrêts reste un vélo
        if (shapeType === 'bus' && !nearbyType && avgSpeed <= 25) {
            return { mode: 'bike', confidence: 75 };
        }

        if (nearbyType === shapeType || (avgSpeed >= 25 && avgSpeed <= 55)) {
            return { mode: shapeType as any, confidence: nearbyType ? 90 : 75 };
        }
    
    }
    
    // 3. VOITURE FRANCHEMENT DÉTECTÉE (Pic de vitesse ou vitesse moyenne élevée)
    if (maxSpeed > 45 && avgSpeed > 25) {
        return { mode: 'car', confidence: maxSpeed > 60 ? 95 : 85 };
    }

    // 4. VOITURE EN VILLE / PARKING (Vitesse faible mais cap très stable)
    if (avgSpeed >= 12 && headingChange < 7) {
        return { mode: 'car', confidence: 75 };
    }

    // 5. VÉLO (Vitesse modérée avec variations de cap)
    if (avgSpeed <= 23 && maxSpeed <= 38) {
        return { mode: 'bike', confidence: 75 };
    }

    return { mode: 'bike', confidence: 60 };
}