<script lang="ts">
    import {parseGPX} from '$lib/parsers/gpxParser';
	import {buildSegments} from '$lib/parsers/segmenter';
    import type { GPSPoint, Segment } from '$lib/types';
	import type { TransportMode } from '$lib/types/gpx';

	import {Button} from '$lib/components/ui/button';
	import {Card, CardContent, CardHeader, CardTitle, CardDescription} from '$lib/components/ui/card';
	import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '$lib/components/ui/table';
	import {Badge} from '$lib/components/ui/badge';
    
    //reactive state variables
    let points = $state<GPSPoint[]>([]);
	let segments = $state<Segment[]>([]);
    let fileName = $state<string>('');
    let error = $state<string>('');

    //File import
    function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		const reader = new FileReader(); //web API to read files

		//function called when the file is read
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (content) {
				const parsedPoints = parseGPX(content);
				points = parsedPoints;
				segments = segmentPoints(parsedPoints); //segment generation
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

    //File reader and parser
    function processFile(file: File) {
        if (!file.name.endsWith('.gpx')) {
            error = 'Le fichier doit être au format GPX.';
            return;
        }
        error = '';
        fileName = file.name;

        //navigator API to read the file as text
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                try {
                    points = parseGPX(content);
                } catch (err) {
                    console.error(err);
                    error = 'Erreur lors de l\'analyse du fichier GPX.';
                }
            }
        };

        reader.readAsText(file);
    }

	//Format the transport mode for display purposes
	function formatMode(mode: TransportMode): { label: string; emoji: string } {
		switch (mode) {
			case 'WALK':
				return { label: 'Marche', emoji: '🚶' };
			case 'BICYCLE':
				return { label: 'Vélo', emoji: '🚲' };
			case 'BUS_TRAM':
				return { label: 'Bus / Tram', emoji: '🚌' };
			case 'TRAIN':
				return { label: 'Train', emoji: '🚆' };
			case 'CAR':
				return { label: 'Voiture', emoji: '🚗' };
			default:
				return { label: 'Inconnu', emoji: '❓' };
		}
	}

	//Colors of the confidence badge based on the confidence value
	function getConfidenceBadgeClass(confidence: number): string {
		if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-300';
		if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
		return 'bg-red-100 text-red-800 border-red-300';
	}
    
    //derived reactives values
    let totalDistanceMeters = $derived(
        points.reduce((acc,p) => acc + (p.distance || 0), 0)
    );

    let durationSeconds = $derived(
        points.length > 1 
            ? (points[points.length - 1].time.getTime() - points[0].time.getTime()) / 1000
            : 0
    );

    let maxSpeed = $derived(
        points.length > 0
            ? Math.max(...points.map((p) => (p.speed ?? p.calculatedSpeed ?? 0) * 3.6)) // convert m/s to km/h
            : 0
    );
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
				onclick={() => document.getElementById('fileInput')?.click()}
			>
				Importer un fichier GPX
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

	<!-- Tableau des Segments Détectés -->
	{#if segments.length > 0}
		<Card class="mt-6">
			<CardHeader>
				<CardTitle>Segments détectés ({segments.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="max-h-[300px] overflow-y-auto border rounded-md">
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

									<TableCell>{seg.startTime.toLocaleTimeString()}</TableCell>
									<TableCell>{seg.endTime.toLocaleTimeString()}</TableCell>
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

	<!-- Statistiques et Tableau des points -->
	{#if points.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Nombre de points</CardDescription>
					<CardTitle class="text-2xl">{points.length}</CardTitle>
				</CardHeader>
			</Card>

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
						{Math.floor(durationSeconds / 60)}m {Math.round(durationSeconds % 60)}s
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

		<Card>
			<CardHeader>
				<CardTitle class="text-lg">Aperçu des 10 premiers points</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="max-h-[400px] overflow-y-auto border rounded-md">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Horodatage</TableHead>
								<TableHead>Latitude / Longitude</TableHead>
								<TableHead class="text-right">Distance (m)</TableHead>
								<TableHead class="text-right">Vitesse calc. (km/h)</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each points as pt}
								<TableRow>
									<TableCell>{pt.time.toLocaleTimeString()}</TableCell>
									<TableCell class="font-mono text-xs">{pt.lat.toFixed(5)}, {pt.lon.toFixed(5)}</TableCell>
									<TableCell class="text-right">{(pt.distance || 0).toFixed(1)}</TableCell>
									<TableCell class="text-right">{((pt.calculatedSpeed || 0) * 3.6).toFixed(1)}</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	{/if}
</main>