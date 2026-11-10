import type { TransportMode } from '$lib/types/gpx';

export type GTFSMode = Extract<TransportMode, 'bus' | 'tram' | 'train'>;

export interface GTFSStop {
	id: string;
	name: string;
	lat: number;
	lon: number;
	type: GTFSMode; // 'bus', 'tram' or 'train'
	network: 'filbleu' | 'remi';
}

export interface GTFSShapePoint {
	shapeId: string;
	lat: number;
	lon: number;
	sequence: number;
}


export interface GTFSShape {
    id: string;
    points: GTFSShapePoint[];
    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    routeType?: number; // GTFS route_type: 0 = tram, 2 = train, 3 = bus
}