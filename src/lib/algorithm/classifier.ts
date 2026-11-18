import type { TransportMode } from '$lib/types/gpx';
import type { PointFeatures } from './pointMetrics';
import type { GTFSMode } from '$lib/types/gtfs';

export interface ClassificationResult {
	mode: TransportMode;
	confidence: number;
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

    if (avgSpeed < 1.2) {
        return { mode: 'walk', confidence: 10 };
    }

    if (avgSpeed <= 7 && maxSpeed <= 10) {
        return { mode: 'walk', confidence: 85 };
    }

    // Matching stop and shape data confirms public transport before bike heuristics.
    if (shapeType && nearbyType === shapeType) {
        return { mode: shapeType, confidence: 90 };
    }

    if (avgSpeed <= 23 && maxSpeed <= 50) {
        return { mode: 'bike', confidence: 75 };
    }

    if (shapeType) {
        if (maxSpeed > 55 && shapeType === 'bus_tram') {
            return { mode: 'car', confidence: 90 };
        }

        if (avgSpeed >= 25 && avgSpeed <= 55) {
            return { mode: shapeType, confidence: 75 };
        }
    }

    if (avgSpeed >= 12 && maxSpeed > 38 && headingChange < 15) {
        return { mode: 'car', confidence: 75 };
    }

    if (maxSpeed > 45 && avgSpeed > 25) {
        return { mode: 'car', confidence: maxSpeed > 60 ? 95 : 85 };
    }

    return { mode: 'bike', confidence: 60 };
}