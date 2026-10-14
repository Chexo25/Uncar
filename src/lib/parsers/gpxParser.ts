import type { GPSPoint } from '../types/gpx';
import { applyMedianFilter } from './cleaner';

/**
 * Haversine distance calculation between two GPS coordinates in meters
 * @param lat1 Latitude of the first point in degrees
 * @param lon1 Longitude of the first point in degrees
 * @param lat2 Latitude of the second point in degrees
 * @param lon2 Longitude of the second point in degrees
 * @returns Distance between the two points in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371000;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * calculates the distance and speed between consecutive GPS points in a GPX file
 * @param gpxContent
 * @returns 
 */
export function parseGPX(gpxContent: string): GPSPoint[] {
	//native XML parser in the browser
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');

	const points: GPSPoint[] = [];
	
	//recuperation of all <trkpt> elements in the GPX file
	const trkpts = xmlDoc.querySelectorAll('trkpt');

	for (let i = 0; i < trkpts.length; i++) {
		const pt = trkpts[i];
		const lat = parseFloat(pt.getAttribute('lat') || '0');
		const lon = parseFloat(pt.getAttribute('lon') || '0');

		//extraction of the <time> element
		const timeNode = pt.querySelector('time');
		if (!timeNode || !timeNode.textContent) continue; //skip this point if no time is found
		const currentTime = new Date(timeNode.textContent);

		const gpsPoint: GPSPoint = {
			lat,
			lon,
			time: currentTime
		};

		//extraction of the <speed> element, if present
		const speedNode = pt.querySelector('speed') || pt.querySelector('gpxtrx\\:speed');
		if (speedNode && speedNode.textContent) {
			const parsedSpeed = parseFloat(speedNode.textContent);
			if (!isNaN(parsedSpeed)) {
				gpsPoint.speed = parsedSpeed;
			}
		}

		//speed and distance calculation based on the previous point
		if (points.length > 0) {
			const prevPt = points[points.length - 1];
			const dist = haversineDistance(prevPt.lat, prevPt.lon, lat, lon);
			gpsPoint.distance = dist;

			const timeDiff = (currentTime.getTime() - prevPt.time.getTime()) / 1000;

			if (timeDiff > 0) {
				gpsPoint.calculatedSpeed = dist / timeDiff;
			} else {
				gpsPoint.calculatedSpeed = 0;
			}
		} else {
			gpsPoint.distance = 0;
			gpsPoint.calculatedSpeed = 0;
		}

		points.push(gpsPoint);
	}

	return applyMedianFilter(points, 5); //apply median filter with a window size of 5 to smooth the speed values
}