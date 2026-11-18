export interface OtpLocation {
	name?: string;
	lat: number;
	lon: number;
}

export interface Leg {
	mode: string;
	duration: number;
	distance: number;
	startTime: number;
	endTime: number;
	from: OtpLocation;
	to: OtpLocation;
	routeShortName?: string;
	legGeometry: {
		points: string;
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