import { GHIN_API_TOKEN } from '../config/gameConfig';

export type GHINGolfer = {
  ghinNumber: string;
  firstName: string;
  lastName: string;
  handicapIndex: number;
  lastRevised: string;
};

// Fetches a golfer's current handicap index from the GHIN API.
// Requires a GHIN_API_TOKEN set in gameConfig.ts.
// Throws if the API token is missing, the GHIN number isn't found, or the request fails.
export async function fetchHandicapFromGHIN(ghinNumber: string): Promise<GHINGolfer> {
  if (!GHIN_API_TOKEN) {
    throw new Error('No GHIN API token configured. Set GHIN_API_TOKEN in gameConfig.ts or enter the handicap index manually.');
  }

  const url = `https://api.ghin.com/api/v1/golfers/search.json?golfer_id=${encodeURIComponent(ghinNumber)}&per_page=1&page=1`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Token token="${GHIN_API_TOKEN}"`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GHIN API token is invalid or expired. Check GHIN_API_TOKEN in gameConfig.ts.');
    }
    throw new Error(`GHIN API error: ${response.status}`);
  }

  const json = await response.json() as {
    golfers: Array<{
      GolferID: number;
      FirstName: string;
      LastName: string;
      HiValue: number | null;
      RevDate: string;
    }>;
  };

  const golfer = json.golfers?.[0];
  if (!golfer) {
    throw new Error(`No golfer found with GHIN number ${ghinNumber}.`);
  }
  if (golfer.HiValue === null || golfer.HiValue === undefined) {
    throw new Error(`Golfer found but has no active handicap index.`);
  }

  return {
    ghinNumber,
    firstName: golfer.FirstName,
    lastName: golfer.LastName,
    handicapIndex: golfer.HiValue,
    lastRevised: golfer.RevDate,
  };
}
