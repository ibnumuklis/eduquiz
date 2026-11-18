import { describe, expect, it } from "vitest";
import { segmentByLanguage } from "@/components/quiz/read-aloud";
import { hasMath } from "@/components/quiz/math-text";

describe("segmentByLanguage", () => {
  it("reads English sentences with an English voice inside Indonesian text", () => {
    const parts = segmentByLanguage("Bacalah teks berikut. The cat is sleeping on the sofa. Apa yang dilakukan kucing?", "id-ID");
    expect(parts.map((p) => p.tag)).toEqual(["id-ID", "en-US", "id-ID"]);
  });
  it("keeps the quiz language when it is not Indonesian", () => {
    expect(segmentByLanguage("Hello there. Apa kabar?", "en-GB").every((p) => p.tag === "en-GB")).toBe(true);
  });
});

describe("hasMath", () => {
  it("detects inline and block math", () => {
    expect(hasMath("Hitung $x^2 + 1$")).toBe(true);
    expect(hasMath("$$\\frac{a}{b}$$")).toBe(true);
  });
  it("ignores plain prices", () => {
    expect(hasMath("Harga $ 5 dan $ 10")).toBe(false);
    expect(hasMath(null)).toBe(false);
  });
});

import { liveRevealText, liveSpeechText } from "@/components/live/use-live";
import { planSpeech } from "@/lib/tts/plan";

describe("live read-aloud text", () => {
  const q = {
    id: "q", type: "multiple_choice", prompt: "Ibu kota Sulawesi Selatan adalah", image_path: null, points: 1,
    options: [{ id: "a", label: "Makassar", is_correct: true }, { id: "b", label: "Gowa", is_correct: false }],
    explanation: "Makassar adalah ibu kota provinsi.",
  };
  it("reads the prompt then each letter, a short pause, and the choice", () => {
    expect(planSpeech(liveSpeechText(q), "id-ID")).toEqual([
      { tag: "id-ID", text: "Ibu kota Sulawesi Selatan adalah." }, { tag: "", text: "", pause: 700 },
      { tag: "id-ID", text: "A" }, { tag: "", text: "", pause: 450 }, { tag: "id-ID", text: "Makassar" }, { tag: "", text: "", pause: 750 },
      { tag: "id-ID", text: "B" }, { tag: "", text: "", pause: 450 }, { tag: "id-ID", text: "Gowa" },
    ]);
  });
  it("reads the correct answer and explanation after reveal", () => {
    expect(liveRevealText(q, "id-ID")).toBe("Jawaban yang benar: Makassar. Makassar adalah ibu kota provinsi.");
    expect(liveRevealText({ ...q, type: "poll", explanation: null }, "en-US")).toBe("");
  });
});
