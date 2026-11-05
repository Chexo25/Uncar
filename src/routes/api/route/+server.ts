import { json } from '@sveltejs/kit';
import { calculateRoute } from '$lib/server/otp';

export async function POST({ request }) {
	try {
		const { fromLat, fromLon, toLat, toLon, mode } = await request.json();

		if (!fromLat || !fromLon || !toLat || !toLon) {
			return json({ error: 'Coordonnées de départ et d\'arrivée requises.' }, { status: 400 });
		}

		const data = await calculateRoute(fromLat, fromLon, toLat, toLon, mode || 'TRANSIT,WALK');
		return json(data);
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}
}