import { computePointFeatures } from '$lib/algorithm/pointMetrics';
import { classifyPointFeatures } from '$lib/algorithm/classifier';
import { applyLabelSmoother } from '$lib/algorithm/labelSmoother';
import { buildSegments, mergeShortSegments } from '$lib/parsers/segmenter';
import { getNearbyGTFSType, filterShapesInBBox, matchPointsWithShapesFast } from '$lib/algorithm/gtfsMatcher';
import type { GTFSStop, GTFSShape, GTFSMode } from '$lib/types/gtfs';
import type { TransportMode} from '$lib/types/gpx';

interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

// Fonction de conversion valeur numérique -> mode transport interne
function routeTypeToMode(routeType: number): GTFSMode {
    switch (routeType) {
        case 0: return 'tram';
        case 2: return 'train';
        case 3: 
        default: return 'bus';
    }
}

self.onmessage = (e: MessageEvent) => {
    const { parsedPoints: rawPoints, gtfsStops, filbleuShapes, remiShapes } = e.data;

    try {
        // Conversion rapide des dates
        const parsedPoints = rawPoints.map((p: any) => ({
            ...p,
            time: p.time instanceof Date ? p.time : new Date(p.time)
        }));

        const step = parsedPoints.length > 10000 ? 5 : 1;
        const sampledPoints = step > 1 ? parsedPoints.filter((_, idx: number) => idx % step === 0) : parsedPoints;
        const sampledFeatures = computePointFeatures(sampledPoints);
        //To test
        const t0 = new Date('2026-10-17T15:55:00Z').getTime(); // 17:55 locale
        const idx = sampledPoints.findIndex((p: any) => p.time.getTime() >= t0);
        console.log('features marche:', sampledFeatures.slice(idx, idx + 5));

        const lats = sampledPoints.map((p: any) => p.lat);
        const lons = sampledPoints.map((p: any) => p.lon);
        const margin = 0.01;
        const bbox = {
            minLat: Math.min(...lats) - margin,
            maxLat: Math.max(...lats) + margin,
            minLon: Math.min(...lons) - margin,
            maxLon: Math.max(...lons) + margin
        };

        const activeFilbleuShapes = filterShapesInBBox(filbleuShapes, bbox);
        const activeRemiShapes = filterShapesInBBox(remiShapes, bbox);

        // 1. matchPointsWithShapesFast doit retourner l'ID du shape matché ou le type
        const filbleuMatches = matchPointsWithShapesFast(sampledPoints, activeFilbleuShapes, 3, 15);
        const remiMatches = matchPointsWithShapesFast(sampledPoints, activeRemiShapes, 3, 15);

        const sampledResults = sampledFeatures.map((f, idx) => {
            const point = sampledPoints[idx];
            
            // 1. Recherche d'arrêts GTFS dans un rayon de 30m
            const nearbyStopType = getNearbyGTFSType(point, gtfsStops, 30);

            let shapeType: GTFSMode| null = null;

            const matchedFilbleu = filbleuMatches[idx];
            const matchedRemi = remiMatches[idx];

            if (matchedFilbleu) {
                // Exigence : pour Filbleu, il faut soit un arrêt proche, soit une vitesse caractérisant le TC
                // Si on est hors zone Filbleu (aucun arrêt GTFS proche sur l'ensemble du sous-segment), on ignore la shape
                shapeType = routeTypeToMode(matchedFilbleu.routeType ?? 3);
            } else if (matchedRemi) {
                shapeType = routeTypeToMode(matchedRemi.routeType ?? 2);
            }

            return classifyPointFeatures(f, nearbyStopType, shapeType);
        });
        const sampledLabels = sampledResults.map((r) => r.mode);
        const sampledConfidences = sampledResults.map((r) => r.confidence);

        const windowSize = step > 1 ? 7 : 15;
        const smoothedSampledLabels = applyLabelSmoother(sampledLabels, windowSize);

        const rawLabels: TransportMode[] = [];
        const rawConfidences: number[] = [];

        for (let i = 0; i < parsedPoints.length; i++) {
            const sampledIdx = Math.min(Math.floor(i / step), smoothedSampledLabels.length - 1);
            rawLabels.push(smoothedSampledLabels[sampledIdx]);
            rawConfidences.push(sampledConfidences[sampledIdx]);
        }

        const totalDistanceMeters = parsedPoints.reduce((acc: number, p: any) => acc + (p.distance || 0), 0);
        const durationSeconds = parsedPoints.length > 1 
            ? (parsedPoints[parsedPoints.length - 1].time.getTime() - parsedPoints[0].time.getTime()) / 1000
            : 0;
        const maxSpeed = parsedPoints.length > 0
            ? Math.max(...parsedPoints.map((p: any) => (p.speed ?? p.calculatedSpeed ?? 0) * 3.6))
            : 0;

        const rawSegments = buildSegments(parsedPoints, rawLabels, rawConfidences);

        const segments = mergeShortSegments(rawSegments);

        self.postMessage({
            success: true,
            segments,
            totalDistanceMeters,
            durationSeconds,
            maxSpeed
        });
    } catch (err) {
        console.error('Erreur détaillée dans le Worker :', err);
        self.postMessage({ success: false, error: String(err) });
    }
};