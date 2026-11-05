import type { OtpPlanResponse } from '$lib/types/otp';

const OTP_URL = 'http://localhost:8080/otp/routers/default/plan';

export async function calculateRoute(
	fromLat: number,
	fromLon: number,
	toLat: number,
	toLon: number,
	mode: string = 'TRANSIT,WALK'
): Promise<OtpPlanResponse> {
	const params = new URLSearchParams({
		fromPlace: `${fromLat},${fromLon}`,
		toPlace: `${toLat},${toLon}`,
		mode: mode,
		date: new Date().toISOString().split('T')[0],
		time: new Date().toTimeString().slice(0, 5),
		arriveBy: 'false'
	});

	const res = await fetch(`${OTP_URL}?${params.toString()}`, {
		headers: { Accept: 'application/json' }
	});

	if (!res.ok) {
		throw new Error(`Erreur serveur OTP (${res.status})`);
	}

	return await res.json();
}