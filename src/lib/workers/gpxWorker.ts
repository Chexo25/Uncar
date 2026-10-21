import { computePointFeatures } from '$lib/algorithm/pointMetrics';
import { classifyPointFeatures } from '$lib/algorithm/classifier';
import { applyLabelSmoother } from '$lib/algorithm/labelSmoother';
import { buildSegments } from '$lib/parsers/segmenter';
import { getNearbyGTFSType, filterShapesInBBox, matchPointsWithShapesFast } from '$lib/algorithm/gtfsMatcher';
import type { GTFSStop, GTFSShape } from '$lib/types/gtfs';
import type { TransportMode } from '$lib/types/gpx';

interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
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

        const filbleuMatches = matchPointsWithShapesFast(sampledPoints, activeFilbleuShapes, 3, 15);
        const remiMatches = matchPointsWithShapesFast(sampledPoints, activeRemiShapes, 3, 15);

        const sampledResults = sampledFeatures.map((f, idx) => {
            const point = sampledPoints[idx];
            const speed = f.localMaxSpeed;

            let nearbyType = null;
            if (speed > 8 && speed <= 40) {
                nearbyType = getNearbyGTFSType(point, gtfsStops, 20);
            }

            let shapeType = null;
            if (filbleuMatches[idx]) shapeType = 'bus';
            if (remiMatches[idx]) shapeType = 'train';

            return classifyPointFeatures(f, nearbyType, shapeType);
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

        const segments = buildSegments(parsedPoints, rawLabels, rawConfidences);

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