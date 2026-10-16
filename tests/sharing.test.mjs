import test from "node:test";
import assert from "node:assert/strict";
import { resultInvitation, shareInvitation, GAME_URL } from "../app/sharing.js";
const result = {
  trackName: "Yard Loop",
  mode: "daily",
  elapsedMs: 193456,
  laps: 3,
  classification: [{ id: "player" }],
};
test("daily invitation retains its original date in text and playable URL", () => {
  const value = resultInvitation(result, {
    date: "2026-10-16",
    slug: "yard-loop",
  });
  assert.equal(value.url, GAME_URL + "#daily=2026-10-16");
  assert.match(value.complete, /2026-10-16 UTC/);
  assert.match(value.complete, /03:13.456/);
});
test("league invitation reports position without inventing global rank", () => {
  const value = resultInvitation(
    {
      ...result,
      mode: "league",
      classification: [{ id: "rival" }, { id: "player" }],
    },
    { slug: "yard-loop" },
  );
  assert.match(value.text, /2 of 2 racers/);
  assert.equal(value.url, GAME_URL + "#track=yard-loop");
  assert.doesNotMatch(value.text, /global|world rank/i);
});
test("failed native sharing falls through to clipboard; failed clipboard preserves complete invitation", async () => {
  const value = resultInvitation(result, { date: "2026-10-16" });
  let copied, manual;
  assert.equal(
    await shareInvitation(value, {
      navigator: {
        share: async () => {
          throw Error("denied");
        },
        clipboard: {
          writeText: async (x) => {
            copied = x;
          },
        },
      },
    }),
    "copied",
  );
  assert.equal(copied, value.complete);
  assert.equal(
    await shareInvitation(value, {
      navigator: {
        clipboard: {
          writeText: async () => {
            throw Error("denied");
          },
        },
      },
      manual: (x) => {
        manual = x;
      },
    }),
    "manual",
  );
  assert.equal(manual, value.complete);
});
test("cancel does not mutate a result, retry sharing or open a fallback", async () => {
  const value = resultInvitation(result);
  let fallback = false;
  assert.equal(
    await shareInvitation(value, {
      navigator: {
        share: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      },
      manual: () => {
        fallback = true;
      },
    }),
    "cancelled",
  );
  assert.equal(fallback, false);
});
