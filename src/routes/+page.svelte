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
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
    
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

	onMount(async () => {
		try {
			const [filbleuStopsRes, remiStopsRes, filbleuShapesRes, remiShapesRes] = await Promise.all([
				fetch('/gtfs/filbleu/stops.txt'),
				fetch('/gtfs/remi/stops.txt'),
				fetch('/gtfs/filbleu/shapes.txt'),
				fetch('/gtfs/remi/shapes.txt')
			]);

			const [filbleuStopsTxt, remiStopsTxt, filbleuShapesTxt, remiShapesTxt] = await Promise.all([
				filbleuStopsRes.text(),
				remiStopsRes.text(),
				filbleuShapesRes.text(),
				remiShapesRes.text()
			]);

			const filbleuStops = parseGTFSStops(filbleuStopsTxt, 'filbleu');
			const remiStops = parseGTFSStops(remiStopsTxt, 'remi');
			gtfsStops = [...filbleuStops, ...remiStops];

			filbleuShapes = parseGTFSShapes(filbleuShapesTxt, 'filbleu');
			remiShapes = parseGTFSShapes(remiShapesTxt, 'remi');

			console.log(
				`GTFS chargé : ${gtfsStops.length} arrêts | ${filbleuShapes.size} lignes Filbleu | ${remiShapes.size} lignes Rémi.`
			);
		} catch (e) {
			console.error('Erreur lors du chargement des fichiers GTFS :', e);
		}
	});

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
                const parsedPoints = parseGPX(content);
                const worker = new GpxWorker();
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

	function formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}m ${s}s`;
	}

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
	const AVAILABLE_MODES = [
		{ value: 'walk', label: '🚶 Marche' },
		{ value: 'bike', label: '🚲 Vélo' },
		{ value: 'bus_tram', label: '🚌 Bus / Tram' },
		{ value: 'train', label: '🚆 Train' },
		{ value: 'car', label: '🚗 Voiture' }
	];

	function handleModeChange(segmentId: string | number, newMode: string) {
		segments = segments.map((seg) =>
			seg.id === segmentId
				? { ...seg, mode: newMode as Segment['mode'], confidence: 100 }
				: seg
		);
	}

	function handleMergeWithNext(index: number) {
		if (index < 0 || index >= segments.length - 1) return;

		const first = segments[index];
		const second = segments[index + 1];

		const newStartTime = new Date(first.startTime);
		const newEndTime = new Date(second.endTime);
		const newDistance = first.distanceMeters + second.distanceMeters;
		const newDuration = Math.max(1, (newEndTime.getTime() - newStartTime.getTime()) / 1000);
		const newAvgSpeed = newDistance / newDuration;
		const dominantMode = first.distanceMeters >= second.distanceMeters ? first.mode : second.mode;

		const merged: Segment = {
			...first,
			mode: dominantMode,
			confidence: 100,
			startTime: newStartTime,
			endTime: newEndTime,
			distanceMeters: newDistance,
			durationSeconds: newDuration,
			avgSpeed: newAvgSpeed,
			points: [...(first.points || []), ...(second.points || [])]
		};

		segments = [
			...segments.slice(0, index),
			merged,
			...segments.slice(index + 2)
		];
	}

	function handleMergeWithPrevious(index: number) {
		if (index <= 0) return;
		handleMergeWithNext(index - 1);
	}

	function handleDeleteSegment(segmentId: string | number) {
		segments = segments.filter((seg) => seg.id !== segmentId);
	}

	function exportToGeoJSON() {
		const geojson = {
			type: 'FeatureCollection',
			properties: {
				fileName,
				totalDistanceMeters,
				durationSeconds
			},
			features: segments.map((seg, idx) => ({
				type: 'Feature',
				properties: {
					segmentIndex: idx,
					id: seg.id,
					mode: seg.mode,
					startTime: new Date(seg.startTime).toISOString(),
					endTime: new Date(seg.endTime).toISOString(),
					distanceMeters: seg.distanceMeters,
					durationSeconds: seg.durationSeconds
				},
				geometry: {
					type: 'LineString',
					coordinates: (seg.points || []).map((p) => [p.lon, p.lat])
				}
			}))
		};

		const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${fileName.replace(/\.gpx$/i, '') || 'trajet'}_corrige.geojson`;
		a.click();
		URL.revokeObjectURL(url);
	}

</script>

<main class="max-w-6xl mx-auto p-6 space-y-6">
	<div class="w-full text-center py-4">
		<h1 class="text-3xl font-bold tracking-tight">Uncar</h1>
	</div>

	<Card>
		<CardContent class="p-6 flex flex-col items-center justify-center space-y-4">
			<input 
				type="file" 
				accept=".gpx" 
				onchange={handleFileUpload} 
				id="fileInput" 
				class="hidden" 
			/>
			
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

	{#if segments.length > 0}
		<Card class="mt-6">
			<CardHeader class="flex flex-row items-center justify-between">
				<CardTitle>Segments détectés ({segments.length})</CardTitle>
				<Button variant="outline" size="sm" onclick={exportToGeoJSON}>
					Exporter en GeoJSON
				</Button>
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
							{#each segments as seg, index (seg.id)}
								<TableRow>
									<TableCell class="font-medium whitespace-nowrap">
										<div class="flex items-center gap-1">
											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button {...props} variant="ghost" size="icon" class="h-7 w-7" title="Actions">
															⋮
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>

												<DropdownMenu.Content align="start" class="w-56">
													{#if index > 0}
														<DropdownMenu.Item onclick={() => handleMergeWithPrevious(index)}>
															↑ Fusionner avec le précédent
														</DropdownMenu.Item>
													{/if}

													{#if index < segments.length - 1}
														<DropdownMenu.Item onclick={() => handleMergeWithNext(index)}>
															↓ Fusionner avec le suivant
														</DropdownMenu.Item>
													{/if}

													{#if segments.length > 1}
														<DropdownMenu.Separator />
													{/if}

													<DropdownMenu.Item
														class="text-destructive focus:text-destructive"
														onclick={() => handleDeleteSegment(seg.id)}
													>
														Supprimer le segment
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>

											<span>#{seg.id}</span>
										</div>
									</TableCell>

									<TableCell>
										<Select.Root
											type="single"
											value={seg.mode}
											onValueChange={(v) => {
												if (v) handleModeChange(seg.id, v);
											}}
										>
											<Select.Trigger class="h-8 w-[145px]">
												{AVAILABLE_MODES.find((m) => m.value === seg.mode)?.label ?? seg.mode}
											</Select.Trigger>
											<Select.Content>
												{#each AVAILABLE_MODES as option}
													<Select.Item value={option.value} label={option.label}>
														{option.label}
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</TableCell>

									<TableCell class="text-center">
										<span
											class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full border {getConfidenceBadgeClass(
												seg.confidence
											)}"
										>
											{seg.confidence} %
										</span>
									</TableCell>

									<TableCell>{formatSegmentTime(new Date(seg.startTime))}</TableCell>
									<TableCell>{formatSegmentTime(new Date(seg.endTime))}</TableCell>
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