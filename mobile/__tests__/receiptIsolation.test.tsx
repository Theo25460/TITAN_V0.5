import { act, renderHook } from "@testing-library/react-native";
import type { SubmitReceipt } from "../src/data/api";
import { rememberReceipt, useReceipt } from "../src/data/receipts";

test("same local event id in two accounts cannot expose the first account's server receipt", () => {
  const a = { xp: 42, level_after: 8 } as SubmitReceipt;
  const b = { xp: 3, level_after: 1 } as SubmitReceipt;
  const remember = rememberReceipt as unknown as (owner: string, event: string, r: SubmitReceipt) => void;
  const read = useReceipt as unknown as (owner: string, event: string) => SubmitReceipt | undefined;
  remember("receipt-owner-a", "same-event", a);
  const first = renderHook(() => read("receipt-owner-a", "same-event"));
  const second = renderHook(() => read("receipt-owner-b", "same-event"));
  expect(first.result.current).toEqual(a);
  expect(second.result.current).toBeUndefined();
  act(() => remember("receipt-owner-b", "same-event", b));
  expect(first.result.current).toEqual(a);
  expect(second.result.current).toEqual(b);
});
