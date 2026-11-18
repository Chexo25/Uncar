import type { GTFSStop, GTFSMode, GTFSShapePoint, GTFSShape } from '$lib/types/gtfs';

/**
 * Parse a file CSV GTFS stops and return an array of GTFSStop objects.
 * @param csvContent The content of the CSV file as a string.
 * @param network The transport network ('filbleu' or 'remi') to determine the type of stop.
 * @returns An array of GTFSStop objects.
 */
export function parseGTFSStops(csvContent: string, network: 'filbleu' | 'remi'): GTFSStop[] {
	const lines = csvContent.split('\n');
	if (lines.length < 2) return [];

	const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
	const latIdx = headers.indexOf('stop_lat');
	const lonIdx = headers.indexOf('stop_lon');
	const idIdx = headers.indexOf('stop_id');
	const nameIdx = headers.indexOf('stop_name');

	if (latIdx === -1 || lonIdx === -1) return [];

	const stops: GTFSStop[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
		const lat = parseFloat(cols[latIdx]);
		const lon = parseFloat(cols[lonIdx]);
        const stopName = cols[nameIdx] || '';
		const stopId = cols[idIdx] || '';

		if (!isNaN(lat) && !isNaN(lon)) {
			let type: GTFSMode = 'bus_tram';

			if (network === 'filbleu') {
				type = 'bus_tram';
			} else if (network === 'remi') {
				if (stopName.toLowerCase().includes('gare') || stopId.includes('SNCF')) {
					type = 'train';
				} else {
					type = 'bus_tram';
				}
			}

			stops.push({
				id: stopId || `stop_${i}`,
				name: stopName || 'Arrêt inconnu',
				lat,
				lon,
				type,
				network
			});
		}
	}

	return stops;
}

/**
 * Maps GTFS route identifiers to internal route types.
 * Filbleu routes use bus_tram; Remi distinguishes train from bus_tram.
 */
function getShapeRouteType(shapeId: string, network: 'filbleu' | 'remi'): number {
	const lowerId = shapeId.toLowerCase();
	
	if (network === 'filbleu') {
		return 3;
	} else if (network === 'remi') {
		if (lowerId.includes('sncf') || lowerId.includes('ter') || lowerId.includes('train')) {
			return 2; 
		}
		return 3;
	}
	
	return 3;
}

export function parseGTFSShapes(csvContent: string, network: 'filbleu' | 'remi' = 'filbleu'): Map<string, GTFSShape> {
    const lines = csvContent.split('\n');
    const rawShapesMap = new Map<string, GTFSShapePoint[]>();
    const shapesMap = new Map<string, GTFSShape>();
    
    if (lines.length < 2) return shapesMap;

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const idIdx = headers.indexOf('shape_id');
    const latIdx = headers.indexOf('shape_pt_lat');
    const lonIdx = headers.indexOf('shape_pt_lon');
    const seqIdx = headers.indexOf('shape_pt_sequence');

    if (idIdx === -1 || latIdx === -1 || lonIdx === -1) return shapesMap;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
        const lat = parseFloat(cols[latIdx]);
        const lon = parseFloat(cols[lonIdx]);
        const shapeId = cols[idIdx];
        const seq = parseInt(cols[seqIdx] || '0', 10);

        if (!isNaN(lat) && !isNaN(lon) && shapeId) {
            if (!rawShapesMap.has(shapeId)) {
                rawShapesMap.set(shapeId, []);
            }
            rawShapesMap.get(shapeId)!.push({ shapeId, lat, lon, sequence: seq });
        }
    }

    for (const [shapeId, points] of rawShapesMap.entries()) {
        points.sort((a, b) => a.sequence - b.sequence);

        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLon) minLon = p.lon;
            if (p.lon > maxLon) maxLon = p.lon;
        }

        shapesMap.set(shapeId, {
            id: shapeId,
            points,
            bbox: { minLat, maxLat, minLon, maxLon },
            routeType: getShapeRouteType(shapeId, network)
        });
    }

    return shapesMap;
}