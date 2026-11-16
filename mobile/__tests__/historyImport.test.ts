/* AUD-43: a Strava activities.csv becomes past sessions; nothing is guessed. */
import { chunk, parseCsv, parseStravaActivities, parseStravaDate } from "../src/lib/historyImport";

const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance';
const csv = [
  header,
  '101,"Mar 17, 2024, 1:47:45 PM",Sortie du dimanche,Run,"Belle sortie, avec ""côtes""\nsur deux lignes",3600,10.02,,,false,,,,,,3600,3300,10020.5',
  '102,"Apr 2, 2024, 7:05:00 AM",Vélo,Ride,,5400,42.5,,,false,,,,,,5400,5100,42500',
  '103,"Apr 3, 2024, 6:00:00 PM",Truc,Underwater Basket,,1800,0,,,false,,,,,,1800,1800,0',
  `104,"${new Date(Date.now() - 2 * 86400000).toUTCString().slice(5, 16)}",Récent,Run,,1800,5,,,false,,,,,,1800,1800,5000`,
  '105,"pas une date",Cassé,Run,,1800,5,,,false,,,,,,1800,1800,5000',
].join("\n");

test("RFC 4180: quotes, doubled quotes and line breaks inside fields", () => {
  const rows = parseCsv('a,"b ""c""",d\n"e\nf",g,h\n');
  expect(rows).toEqual([["a", 'b "c"', "d"], ["e\nf", "g", "h"]]);
});

test("Strava dates are read in UTC with AM/PM", () => {
  expect(parseStravaDate("Mar 17, 2024, 1:47:45 PM")!.toISOString()).toBe("2024-03-17T13:47:45.000Z");
  expect(parseStravaDate("Apr 2, 2024, 12:05:00 AM")!.toISOString()).toBe("2024-04-02T00:05:00.000Z");
  expect(parseStravaDate("n’importe quoi")).toBeNull();
});

test("known types become sessions with moving time and km; recent, unknown and broken rows are counted, not guessed", () => {
  const p = parseStravaActivities(csv);
  expect(p.items).toEqual([
    { id: "strava-101", sport: "running", startedAt: "2024-03-17T13:47:45.000Z", minutes: 55, km: 10.02 },
    { id: "strava-102", sport: "cycling", startedAt: "2024-04-02T07:05:00.000Z", minutes: 85, km: 42.5 },
  ]);
  expect([p.unknown, p.recent, p.invalid]).toEqual([1, 1, 1]);
});

test("a file that is not a Strava export is refused with a clear message", () => {
  expect(() => parseStravaActivities("a,b\n1,2")).toThrow(/activities\.csv/);
});

test("batches of 50", () => {
  expect(chunk(Array.from({ length: 120 }, (_, i) => i)).map((c) => c.length)).toEqual([50, 50, 20]);
});
