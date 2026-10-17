import type { TransportMode } from '$lib/types/gpx';
import type { PointFeatures } from './pointMetrics';
import type { GTFSTransportType, GTFSStop } from '$lib/types/gtfs';

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

    //1. WALK (< 6 km/h)
    if (maxSpeed <= 6) {
        return { mode: 'walk', confidence: 90 };
    }

    //2. PUBLIC TRANSPORT WITH GTFS
    // Si on a à la fois l'arrêt ET la ligne, ou si nearbyType est présent
    if (nearbyType && maxSpeed > 8) {
        let confidence = 80;
        if (headingChange < 10) confidence += 10;
        if (shapeType && nearbyType === shapeType) confidence = 95;

        if (nearbyType === 'train' && maxSpeed > 25) return { mode: 'train', confidence };
        if (nearbyType === 'tram') return { mode: 'tram', confidence };
        if (nearbyType === 'bus') return { mode: 'bus', confidence };
    }

    //3. TRAIN WITHOUT GTFS (high speed and very steady heading)
    if (maxSpeed > 80 && headingChange < 4) {
        return { mode: 'train', confidence: 80 };
    }

    //4. BIKE OR CAR (mixed speed range: 12-25 km/h)
    if (maxSpeed <= 25 && avgSpeed <= 20) {
        if (headingChange > 12) {
            return { mode: 'bike', confidence: 80 };
        }
        if (maxSpeed > 15 && headingChange < 8) {
            return { mode: 'car', confidence: 75 };
        }
        return { mode: 'bike', confidence: 65 };
    }

    //5. CAR (> 25 km/h or peak > 20 km/h with a steady path)
    if (maxSpeed > 20) {
        let confidence = 85;
        if (maxSpeed > 40) confidence = 95;
        return { mode: 'car', confidence };
    }

    return { mode: 'car', confidence: 60 };
}