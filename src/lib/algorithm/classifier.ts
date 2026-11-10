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

    // 0. IMMOBILE / PAUSE (Bruit GPS sans déplacement réel)
    if (avgSpeed < 1.2) {
        // Une proximité avec un arrêt ou une shape ne permet pas de distinguer
        // un passager arrêté d'un véhicule de transport en commun.
        return { mode: 'walk', confidence: 10 };
    }

    // WALK (< 6 km/h)
    if (avgSpeed <= 7 && maxSpeed <= 10) {
        return { mode: 'walk', confidence: 85 };
    }

    // Un arrêt du même type que la shape est une confirmation forte du TC.
    // Cette exception doit précéder le profil vélo : un bus peut rouler lentement
    // entre deux arrêts, alors qu'une simple shape ne suffit pas à l'identifier.
    if (shapeType && nearbyType === shapeType) {
        return { mode: shapeType, confidence: 90 };
    }

    // VÉLO : un cycliste peut suivre exactement une ligne de bus.
    // Ce profil doit donc être reconnu avant une shape GTFS seule.
    if (avgSpeed <= 23 && maxSpeed <= 50) {
        return { mode: 'bike', confidence: 75 };
    }

    // PUBLIC TRANSPORT WITH GTFS
    // Une shape seule n'est pas suffisante : un vélo peut suivre exactement
    // le même axe qu'un bus. Il faut un arrêt du même type ou une vitesse
    // incompatible avec le vélo pour confirmer le transport en commun.
    if (shapeType) {
        if (maxSpeed > 55 && shapeType === 'bus') {
            return { mode: 'car', confidence: 90 };
        }

        if (avgSpeed >= 25 && avgSpeed <= 55) {
            return { mode: shapeType, confidence: 75 };
        }
    }

    if (avgSpeed >= 12 && maxSpeed > 38 && headingChange < 15) {
        return { mode: 'car', confidence: 75 };
    }

    // 4. VOITURE FRANCHEMENT DÉTECTÉE (Pic de vitesse ou vitesse moyenne élevée)
    if (maxSpeed > 45 && avgSpeed > 25) {
        return { mode: 'car', confidence: maxSpeed > 60 ? 95 : 85 };
    }

    return { mode: 'bike', confidence: 60 };
}