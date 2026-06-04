import { HOLE_INFO } from '../config/gameConfig';

// Course Handicap = Handicap Index × (Slope / 113) + (Course Rating − Par)
// Result rounded to nearest integer per USGA rules.
export function courseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
): number {
  return Math.round(handicapIndex * (slope / 113) + (rating - par));
}

// Returns how many extra strokes `playerHandicap` receives vs `opponentHandicap` on a given hole.
// In match play, the lower handicap plays from scratch and the difference is distributed
// across holes by stroke index (SI). A player receives a stroke on a hole when their
// net handicap difference >= that hole's stroke index.
export function strokesReceivedOnHole(
  playerHandicap: number,
  opponentHandicap: number,
  holeIndex: number, // 0-based (hole 1 = index 0)
): number {
  const diff = playerHandicap - opponentHandicap;
  if (diff <= 0) return 0;

  const si = HOLE_INFO[holeIndex].strokeIndex;
  const fullStrokes = Math.floor(diff / 18);
  const remainder = diff % 18;

  // Player gets a stroke if the remainder covers this hole's stroke index
  return fullStrokes + (remainder >= si ? 1 : 0);
}

export type HoleResult = 'A' | 'B' | 'halved' | 'unplayed';

// Determines match play result for a single hole.
// Returns 'A' if playerA wins the hole, 'B' if playerB wins, 'halved' if tied.
// Returns 'unplayed' if either score is missing (0).
export function holeResult(
  grossA: number,
  grossB: number,
  courseHcpA: number,
  courseHcpB: number,
  holeIndex: number,
): HoleResult {
  if (!grossA || !grossB) return 'unplayed';

  const strokesA = strokesReceivedOnHole(courseHcpA, courseHcpB, holeIndex);
  const strokesB = strokesReceivedOnHole(courseHcpB, courseHcpA, holeIndex);
  const netA = grossA - strokesA;
  const netB = grossB - strokesB;

  if (netA < netB) return 'A';
  if (netB < netA) return 'B';
  return 'halved';
}

export type MatchStatus = {
  holesWonA: number;
  holesWonB: number;
  holesHalved: number;
  holesPlayed: number;
  // Positive = A leads by that many holes, negative = B leads, 0 = all square
  lead: number;
  // e.g. "A 2UP", "B 1UP", "All Square", "A wins 3&2", etc.
  label: string;
};

export function matchStatus(holeResults: HoleResult[]): MatchStatus {
  let holesWonA = 0;
  let holesWonB = 0;
  let holesHalved = 0;
  let holesPlayed = 0;

  for (const r of holeResults) {
    if (r === 'unplayed') continue;
    holesPlayed++;
    if (r === 'A') holesWonA++;
    else if (r === 'B') holesWonB++;
    else holesHalved++;
  }

  const lead = holesWonA - holesWonB;
  const holesRemaining = 18 - holesPlayed;
  let label: string;

  if (holesPlayed === 0) {
    label = 'Not started';
  } else if (holesRemaining === 0) {
    // Match complete
    if (lead === 0) label = 'Halved';
    else {
      const winner = lead > 0 ? 'A' : 'B';
      const margin = Math.abs(lead);
      if (margin > holesHalved + (lead > 0 ? holesWonB : holesWonA)) {
        // Match ended early (e.g. 3&2 means won with 3 holes up and 2 to play — but since we play all 18, just show margin)
        label = `${winner} wins +${margin}`;
      } else {
        label = `${winner} wins +${margin}`;
      }
    }
  } else if (lead === 0) {
    label = 'All Square';
  } else {
    const leader = lead > 0 ? 'A' : 'B';
    label = `${leader} ${Math.abs(lead)}UP`;
  }

  return { holesWonA, holesWonB, holesHalved, holesPlayed, lead, label };
}
