// ─── Edit everything in this file to match your trip ─────────────────────────

export const PLAYERS: string[] = [
  'Player 1A', 'Player 2A', 'Player 3A', 'Player 4A', 'Player 5A', 'Player 6A',
  'Player 1B', 'Player 2B', 'Player 3B', 'Player 4B', 'Player 5B', 'Player 6B',
];

export const TEAM_A: string[] = ['Player 1A', 'Player 2A', 'Player 3A', 'Player 4A', 'Player 5A', 'Player 6A'];
export const TEAM_B: string[] = ['Player 1B', 'Player 2B', 'Player 3B', 'Player 4B', 'Player 5B', 'Player 6B'];
export const TEAM_A_NAME = 'Team A';
export const TEAM_B_NAME = 'Team B';

export const ROUNDS: Array<{
  id: string;
  label: string;
  course: string;
  par: number;
  slope: number;     // course slope rating (for handicap calc)
  rating: number;    // course rating (for handicap calc)
}> = [
  { id: 'round1', label: 'Round 1', course: 'TBD', par: 72, slope: 113, rating: 72.0 },
  { id: 'round2', label: 'Round 2', course: 'TBD', par: 72, slope: 113, rating: 72.0 },
  { id: 'round3', label: 'Round 3', course: 'TBD', par: 72, slope: 113, rating: 72.0 },
];

// Pairings per round: one player from each team per pair.
// Order matters — first player is assumed to be from Team A, second from Team B.
// Leave empty arrays if pairings haven't been set yet.
export const ROUND_PAIRINGS: Record<string, Array<{ playerA: string; playerB: string }>> = {
  round1: [],
  round2: [],
  round3: [],
};

// Par and stroke index (1 = hardest hole for handicap allocation, 18 = easiest) for each hole.
// Replace with the actual values from the course scorecard.
export const HOLE_INFO: Array<{ par: number; strokeIndex: number }> = [
  { par: 4, strokeIndex: 3 },   // hole 1
  { par: 5, strokeIndex: 15 },  // hole 2
  { par: 3, strokeIndex: 11 },  // hole 3
  { par: 4, strokeIndex: 7 },   // hole 4
  { par: 4, strokeIndex: 1 },   // hole 5
  { par: 4, strokeIndex: 9 },   // hole 6
  { par: 3, strokeIndex: 17 },  // hole 7
  { par: 5, strokeIndex: 13 },  // hole 8
  { par: 4, strokeIndex: 5 },   // hole 9
  { par: 4, strokeIndex: 4 },   // hole 10
  { par: 4, strokeIndex: 10 },  // hole 11
  { par: 5, strokeIndex: 16 },  // hole 12
  { par: 3, strokeIndex: 12 },  // hole 13
  { par: 4, strokeIndex: 6 },   // hole 14
  { par: 4, strokeIndex: 2 },   // hole 15
  { par: 3, strokeIndex: 18 },  // hole 16
  { par: 5, strokeIndex: 14 },  // hole 17
  { par: 4, strokeIndex: 8 },   // hole 18
];

// GHIN API token — register your app at https://www.ghin.com/api to get one.
// Leave empty to use manual handicap entry only.
export const GHIN_API_TOKEN = '';
