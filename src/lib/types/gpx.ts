export interface GPSPoint {
    lat: number;
    lon: number;
    time: Date;
    speed?: number;
    distance?: number;
    calculatedSpeed?: number;
}

export type TransportMode = 'walk'|'bike'|'car'|'bus'|'tram'|'train';

export interface Segment {
    id: number;
    mode?: TransportMode;
    points: GPSPoint[];
    startTime: Date;
    endTime: Date;
    distanceMeters: number;
    durationSeconds: number;
    avgSpeed: number
}