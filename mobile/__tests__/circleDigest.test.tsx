/* Social lot D on Android: « Dans ton cercle depuis ta dernière visite ». Behind screens.digest, asks the server with the QG's
   last-visit time, words the lines like the website, and shows nothing when nothing happened (a suggestion alone is not news). */
import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SocialDigestWords } from "../src/core/cordee";
import { CircleDigestCard } from "../src/screens/community/CircleDigestCard";

jest.setTimeout(20000);
const slow = { timeout: 5000 };
const mockRpc = jest.fn();
const mockLastVisit = jest.fn(async (_o: string): Promise<number | null> => Date.parse("2026-11-13T12:00:00Z"));
jest.mock("../src/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "t" } } }) }, rpc: (...a: unknown[]) => mockRpc(...a) } }));
jest.mock("../src/data/auth", () => ({ useOwner: () => "owner-a" }));
jest.mock("../src/lib/visit", () => ({ loadLastVisit: (o: string) => mockLastVisit(o) }));

const FULL = {
  since: "2026-11-13T12:00:00Z", requestsIn: 0, cheersReceived: 2, friendMoments: { count: 1, latest: [{ id: "m1", kind: "record", title: "Premier 10 km", at: "2026-11-19T10:00:00Z", author: "Léa" }] },
  friendsActive: [], cordees: [{ id: "k1", route: "aube", status: "summited", myStatus: "joined", percent: 100, camps: 4, total: 30, target: 30, mine: 9, earned: true, summitedSince: true }],
  duo: null, challengesEnded: [], memories: [], suggestion: null,
};
let state = { flag: true, digest: FULL as unknown };
beforeEach(() => {
  jest.clearAllMocks();
  state = { flag: true, digest: FULL };
  mockRpc.mockImplementation((name: string) => {
    const data = name === "titan_feature_flags_v1" ? { flags: { "screens.digest": state.flag } } : name === "titan_social_digest_v1" ? state.digest : null;
    const result = Promise.resolve({ data, error: null });
    return { setHeader: () => result };
  });
});
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CircleDigestCard owner="owner-a" online /></QueryClientProvider>);

test("the summit, the friends' Moment and the encouragements, from the last visit of the QG", async () => {
  show();
  expect(await screen.findByText("Sommet atteint : Les crêtes de l’Aube. Le titre « Brin de l’Aube » t’attend.", undefined, slow)).toBeTruthy();
  expect(screen.getByText("Léa a partagé 1 Moment, dont « Premier 10 km ».")).toBeTruthy();
  expect(screen.getByText("2 encouragements reçus sur tes Moments.")).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith("titan_social_digest_v1", { p_since: "2026-11-13T12:00:00.000Z" });
});

test("nothing happened, or the flag is closed: no card", async () => {
  state.digest = { ...FULL, cheersReceived: 0, friendMoments: { count: 0, latest: [] }, cordees: [], suggestion: { kind: "cordee", pace: "douce", activeDays28: 1, friends: 0 } };
  show();
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_social_digest_v1", expect.anything()), slow);
  expect(screen.queryByTestId("circle-digest")).toBeNull();
});

test("closed flag: the digest is not even asked", async () => {
  state.flag = false;
  show();
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("titan_feature_flags_v1", {}), slow);
  expect(mockRpc).not.toHaveBeenCalledWith("titan_social_digest_v1", expect.anything());
  expect(SocialDigestWords.lines(null)).toEqual([]);
});
