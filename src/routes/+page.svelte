<script lang="ts">
	import { parseGPX } from '$lib/parsers/gpxParser';
    import type { Segment } from '$lib/types/gpx';
	import { onMount } from 'svelte';
	import { parseGTFSStops, parseGTFSShapes } from '$lib/parsers/gtfsParser';	
	import GpxWorker from '$lib/workers/gpxWorker?worker';
	import type { GTFSStop, GTFSShape } from '$lib/types/gtfs';

	import {Button} from '$lib/components/ui/button';
	import {Card, CardContent, CardHeader, CardTitle, CardDescription} from '$lib/components/ui/card';
	import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '$lib/components/ui/table';
    
    //reactive state variables
    let totalDistanceMeters = $state<number>(0);
    let durationSeconds = $state<number>(0);
    let maxSpeed = $state<number>(0);
	let segments = $state<Segment[]>([]);
    let fileName = $state<string>('');
    let error = $state<string>('');
	let gtfsStops = $state<GTFSStop[]>([]);
	let filbleuShapes = $state<Map<string, GTFSShape>>(new Map());
	let remiShapes = $state<Map<string, GTFSShape>>(new Map());
	let isAnalyzing = $state<boolean>(false);

	async function fetchText(url: string): Promise<string> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Erreur HTTP ${res.status} pour ${url}`);
		return res.text();
	}

	onMount(async () => {
		try {
			//recuperation of GTFS files for Filbleu and Rémi
			const [filbleuStopsRes, remiStopsRes, filbleuShapesRes, remiShapesRes] = await Promise.all([
				fetch('/gtfs/filbleu/stops.txt'),
				fetch('/gtfs/remi/stops.txt'),
				fetch('/gtfs/filbleu/shapes.txt'),
				fetch('/gtfs/remi/shapes.txt')
			]);

			//convert the responses to text
			const [filbleuStopsTxt, remiStopsTxt, filbleuShapesTxt, remiShapesTxt] = await Promise.all([
				filbleuStopsRes.text(),
				remiStopsRes.text(),
				filbleuShapesRes.text(),
				remiShapesRes.text()
			]);

			//stops parsing
			const filbleuStops = parseGTFSStops(filbleuStopsTxt, 'filbleu');
			const remiStops = parseGTFSStops(remiStopsTxt, 'remi');
			gtfsStops = [...filbleuStops, ...remiStops];

			//shapes parsing
			filbleuShapes = parseGTFSShapes(filbleuShapesTxt, 'filbleu');
			remiShapes = parseGTFSShapes(remiShapesTxt, 'remi');

			console.log(
				`GTFS chargé : ${gtfsStops.length} arrêts | ${filbleuShapes.size} lignes Filbleu | ${remiShapes.size} lignes Rémi.`
			);
		} catch (e) {
			console.error('Erreur lors du chargement des fichiers GTFS :', e);
		}
	});

	//File import
    function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        fileName = file.name;
        error = '';
        isAnalyzing = true;

        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (!content) {
                isAnalyzing = false;
                return;
            }

            try {
                // 1. Parsing GPX rapide sur le thread principal
                const parsedPoints = parseGPX(content);

                // 2. Instanciation du Worker
                const worker = new GpxWorker();

                // 3. Préparation des structures "Plain Objects" 100 % clonables pour postMessage
                const plainStops = gtfsStops.map((s) => ({
                    id: s.id,
                    name: s.name,
                    lat: s.lat,
                    lon: s.lon,
                    type: s.type
                }));

                const plainFilbleuShapes = Array.from(filbleuShapes.values()).map((s) => ({
                    id: s.id,
                    points: s.points.map((p) => ({ lat: p.lat, lon: p.lon })),
                    bbox: { ...s.bbox },
                    routeType: s.routeType
                }));

                const plainRemiShapes = Array.from(remiShapes.values()).map((s) => ({
                    id: s.id,
                    points: s.points.map((p) => ({ lat: p.lat, lon: p.lon })),
                    bbox: { ...s.bbox },
                    routeType: s.routeType
                }));

                const plainPoints = parsedPoints.map((p) => ({
                    lat: p.lat,
                    lon: p.lon,
                    time: p.time instanceof Date ? p.time.toISOString() : p.time,
                    speed: p.speed,
                    calculatedSpeed: p.calculatedSpeed,
                    distance: p.distance
                }));

                // 4. Écouteurs de messages et erreurs du Worker
                worker.onmessage = (msgEvent: MessageEvent) => {
                    isAnalyzing = false;
                    if (msgEvent.data.success) {
                        segments = msgEvent.data.segments;
                        totalDistanceMeters = msgEvent.data.totalDistanceMeters;
                        durationSeconds = msgEvent.data.durationSeconds;
                        maxSpeed = msgEvent.data.maxSpeed;
                    } else {
                        error = msgEvent.data.error;
                    }
                    worker.terminate();
                };

                worker.onerror = (err) => {
                    console.error("Erreur dans le Web Worker :", err);
                    error = "Erreur pendant l'analyse dans le Worker.";
                    isAnalyzing = false;
                    worker.terminate();
                };

                // 5. Envoi des données au Worker
                worker.postMessage({
                    parsedPoints: plainPoints,
                    gtfsStops: plainStops,
                    filbleuShapes: plainFilbleuShapes,
                    remiShapes: plainRemiShapes
                });

            } catch (err) {
                console.error("Erreur lors de la lecture du GPX :", err);
                error = "Impossible de lire le fichier GPX.";
                isAnalyzing = false;
            }
        };

        reader.readAsText(file);
    }

	//Utility function to format duration in seconds to a human-readable string
	function formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}m ${s}s`;
	}

	//Format the transport mode for display purposes
	function formatMode(mode: string): { label: string; emoji: string } {
		const m = mode.toLowerCase();
		switch (m) {
			case 'walk': return { label: 'Marche', emoji: '🚶' };
			case 'bike':
			case 'bicycle': return { label: 'Vélo', emoji: '🚲' };
			case 'bus':
			case 'bus_tram': return { label: 'Bus / Tram', emoji: '🚌' };
			case 'tram': return { label: 'Tramway', emoji: '🚊' };
			case 'train': return { label: 'Train', emoji: '🚆' };
			case 'car': return { label: 'Voiture', emoji: '🚗' };
			default: return { label: 'Inconnu', emoji: '❓' };
		}
	}

	//Colors of the confidence badge based on the confidence value
	function getConfidenceBadgeClass(confidence: number): string {
		if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300';
		if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
		return 'bg-red-100 text-red-800 border-red-300';
	}

	function formatSegmentTime(time: Date): string {
		return time.toLocaleString([], {
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

</script>

<main class="max-w-4xl mx-auto p-6 space-y-6">
	<!-- En-tête -->
	<div class="w-full text-center py-4">
		<h1 class="text-3xl font-bold tracking-tight">Uncar</h1>
	</div>

	<!-- Zone d'importation (Bouton simple) -->
	<Card>
		<CardContent class="p-6 flex flex-col items-center justify-center space-y-4">
			<!-- Balise HTML input masquée -->
			<input 
				type="file" 
				accept=".gpx" 
				onchange={handleFileUpload} 
				id="fileInput" 
				class="hidden" 
			/>
			
			<!-- Bouton shadcn qui déclenche le clic sur l'input masqué -->
			<Button 
				variant="default" 
				disabled={isAnalyzing}
				onclick={() => document.getElementById('fileInput')?.click()}
			>
				{#if isAnalyzing}
					Analyse en cours...
				{:else}
					Importer un fichier GPX
				{/if}
			</Button>

			{#if error}
				<p class="text-sm text-destructive font-medium">{error}</p>
			{/if}

			{#if fileName}
				<p class="text-sm text-muted-foreground">
					Fichier chargé : <span class="font-semibold text-foreground">{fileName}</span>
				</p>
			{/if}
		</CardContent>
	</Card>

	{#if segments.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Distance totale</CardDescription>
					<CardTitle class="text-2xl">{(totalDistanceMeters / 1000).toFixed(2)} km</CardTitle>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Durée</CardDescription>
					<CardTitle class="text-2xl">
						{Math.floor(durationSeconds / 3600)}h {Math.floor((durationSeconds % 3600) / 60)}m
					</CardTitle>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Vitesse max</CardDescription>
					<CardTitle class="text-2xl">{maxSpeed.toFixed(1)} km/h</CardTitle>
				</CardHeader>
			</Card>
		</div>
	{/if}

	<!-- Tableau des Segments Détectés -->
	{#if segments.length > 0}
		<Card class="mt-6">
			<CardHeader>
				<CardTitle>Segments détectés ({segments.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="border rounded-md">
					<Table>
						<TableHeader class="sticky top-0 bg-background z-10">
							<TableRow>
								<TableHead>Segment</TableHead>
								<TableHead>Mode de transport</TableHead>
								<TableHead class="text-center">Confiance</TableHead>
								<TableHead>Début</TableHead>
								<TableHead>Fin</TableHead>
								<TableHead class="text-right">Distance</TableHead>
								<TableHead class="text-right">Durée</TableHead>
								<TableHead class="text-right">Vitesse moy.</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each segments as seg (seg.id)}
								{@const modeInfo = formatMode(seg.mode)}
								<TableRow>
									<TableCell class="font-medium">#{seg.id}</TableCell>

									<!-- Mode de transport -->
									<TableCell>
										<span class="inline-flex items-center gap-1.5 font-semibold">
											<span>{modeInfo.emoji}</span>
											<span>{modeInfo.label}</span>
										</span>
									</TableCell>

									<!-- Confiance (%) -->
									<TableCell class="text-center">
										<span
											class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full border {getConfidenceBadgeClass(
												seg.confidence
											)}"
										>
											{seg.confidence} %
										</span>
									</TableCell>

									<TableCell>{formatSegmentTime(seg.startTime)}</TableCell>
									<TableCell>{formatSegmentTime(seg.endTime)}</TableCell>
									<TableCell class="text-right">{seg.distanceMeters.toFixed(1)} m</TableCell>
									<TableCell class="text-right">{formatDuration(seg.durationSeconds)}</TableCell>
									<TableCell class="text-right">{(seg.avgSpeed * 3.6).toFixed(1)} km/h</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	{/if}
</main>