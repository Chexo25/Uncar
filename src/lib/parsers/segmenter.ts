import type {GPSPoint, Segment} from '../types/gpx';

//configuration of the immobility detection
const MIN_SPEED = 0.3 //in m/s, below 1 km/h, the user is considered immobile
const MIN_STOP_DURATION = 45 //in seconds, if the user is immobile for more than 45 seconds, it's the end of the segment
const MAX_TIME_GAP = 120 //in seconds, in case the user pauses the GPS
const MIN_SEGMENT_DISTANCE = 30; //in meters, minimal distance for a segment to be considered valid
const MIN_AVG_SPEED = 0.1; //in m/s, minimal average speed for a segment to be considered valid


/**
 * function to segment the GPS points into segments based on speed and time gaps
 * @param points 
 */
export function segmentPoints(points: GPSPoint[]): Segment[] {
    if (points.length === 0) return [];

    const segments: Segment[] = [];
    let currentPoints: GPSPoint[] = [points[0]];
    let currentId = 1;
    let immobileStartTime: Date | null = null;

    for (let i = 1; i < points.length; i++) {
        const prevPt = points[i - 1];
        const currPt = points[i];

        const timeGap = (currPt.time.getTime() - prevPt.time.getTime()) / 1000; //in seconds
        const speed = currPt.calculatedSpeed || 0; //in m/s

        //manual pause
        if (timeGap > MAX_TIME_GAP) {
            if (currentPoints.length > 0) {
                segments.push(buildSegment(currentId++, currentPoints));
            }
            currentPoints = [currPt];
            immobileStartTime = null;
            continue;
        }

        //immobility detection, low speed
        if (speed < MIN_SPEED) {
            if (!immobileStartTime) {
                immobileStartTime = currPt.time;
            } else {
                const stopDuration = (currPt.time.getTime() - immobileStartTime.getTime()) / 1000; //in seconds

                if (stopDuration >= MIN_STOP_DURATION) {
                    if (currentPoints.length > 0) {
                        segments.push(buildSegment(currentId++, currentPoints));
                    }
                    currentPoints = [currPt];
                    immobileStartTime = null;
                    continue;
                }
            }
        } else {
            immobileStartTime = null; //reset immobile start time if speed is above threshold
        }

        currentPoints.push(currPt);
    }
    
    //push the last segment if any points are left
    if (currentPoints.length > 0) {
        segments.push(buildSegment(currentId++, currentPoints));
    }

    return filterAndMergeSegments(segments);
}

/**
 * helper function to build a segment from a list of GPS points
 * @param id 
 * @param points
 * @returns 
 */
function buildSegment(id: number, points: GPSPoint[]): Segment {
    const startTime = points[0].time;
    const endTime = points[points.length - 1].time;
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const distanceMeters = points.reduce((acc, pt) => acc + (pt.distance || 0), 0); //sum of distances between points
    const avgSpeed = durationSeconds > 0 ? distanceMeters / durationSeconds : 0;

    return {
        id,
        points,
        startTime,
        endTime,
        distanceMeters,
        durationSeconds,
        avgSpeed
    };
}

/**
 * Filter the segments to remove those that are too short or too slow and reindex the IDs
 * @param rawSegments 
 * @returns
 */
function filterAndMergeSegments(rawSegments: Segment[]): Segment[] {
	//we ignore segments that are too short (less than MIN_SEGMENT_DISTANCE meters) or too slow (less than MIN_AVG_SPEED m/s)
    const validSegments = rawSegments.filter((seg) => {
            //segment with no moving
            const hasMovement = seg.distanceMeters >= MIN_SEGMENT_DISTANCE;
            
            //segment with negligible speed
            const hasSpeed = seg.avgSpeed >= MIN_AVG_SPEED;

            return hasMovement && hasSpeed;
        });

	//reindex the segments to have consecutive IDs starting from 1
	return validSegments.map((seg, idx) => ({
		...seg,
		id: idx + 1
	}));
}