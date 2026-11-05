export interface OtpLocation {
	name?: string;
	lat: number;
	lon: number;
}

export interface Leg {
	mode: string; // "WALK", "BUS", "TRAM"
	duration: number; // en secondes
	distance: number; // en mètres
	startTime: number;
	endTime: number;
	from: OtpLocation;
	to: OtpLocation;
	routeShortName?: string; // ex: "A", "2"
	legGeometry: {
		points: string; // Polyline encodée
	};
}

export interface Itinerary {
	duration: number;
	startTime: number;
	endTime: number;
	walkDistance: number;
	legs: Leg[];
}

export interface OtpPlanResponse {
	plan?: {
		from: OtpLocation;
		to: OtpLocation;
		itineraries: Itinerary[];
	};
	error?: {
		id: number;
		msg: string;
	};
}