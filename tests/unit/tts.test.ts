import { describe, expect, it } from "vitest";
import { looksIndonesian, normalizeEn, normalizeId, planSpeech } from "@/lib/tts/plan";

const tags = (p: { tag: string }[]) => p.map((x) => x.tag);

describe("planSpeech", () => {
  it("reads Indonesian names and school names with the Indonesian voice inside English", () => {
    const p = planSpeech("Budi goes to SMA Negeri 1 Makassar at 07.30 every day.", "id-ID");
    expect(p).toEqual([
      { tag: "id-ID", text: "Budi" },
      { tag: "en-US", text: "goes to" },
      { tag: "id-ID", text: "S M A Negeri 1 Makassar" },
      { tag: "en-US", text: "at 7:30 every day." },
    ]);
  });
  it("can keep everything in one English voice", () => {
    const p = planSpeech("Budi goes to school at 07.00.", "id-ID", { idNames: false });
    expect(p).toEqual([{ tag: "en-US", text: "Budi goes to school at 7 o'clock." }]);
  });
  it("forces a single language when asked", () => {
    expect(tags(planSpeech("Bacalah teks berikut. My name is Rina.", "id-ID", { mode: "id" }))).toEqual(["id-ID"]);
    expect(planSpeech("Bacalah teks berikut. My name is Rina.", "id-ID", { mode: "en", idNames: false })).toEqual([
      { tag: "en-US", text: "Bacalah teks berikut. My name is Rina." },
    ]);
  });
  it("detects English sentences inside Indonesian questions", () => {
    expect(tags(planSpeech("Bacalah teks berikut. Indonesia became independent on 17/08/1945.", "id-ID")))
      .toEqual(["id-ID", "en-US"]);
  });
  it("applies the user's pronunciation dictionary", () => {
    const p = planSpeech("I study with Tompo.", "en-US", { dict: "Tompo = tom-po" });
    expect(p).toEqual([{ tag: "en-US", text: "I study with tom-po." }]);
  });
  it("keeps a.m. and times inside one sentence", () => {
    expect(planSpeech("She leaves at 6:15 a.m. every day.", "en-US", { idNames: false }))
      .toEqual([{ tag: "en-US", text: "She leaves at 6:15 AM every day." }]);
  });
});

describe("normalizers", () => {
  it("English: money, decimals, dates, afternoon times", () => {
    expect(normalizeEn("Rp 25.000 and 3,5 m")).toBe("25,000 rupiah and 3.5 m");
    expect(normalizeEn("on 17/08/1945")).toBe("on 17 August 1945");
    expect(normalizeEn("at 13.45")).toBe("at 1:45 PM");
    expect(normalizeEn("pi is 3.14")).toBe("pi is 3.14");
  });
  it("Indonesian: times, abbreviations, money", () => {
    expect(normalizeId("Upacara pukul 07.00 WIB di SMAN 3, Kec. Rappocini")).toBe("Upacara pukul 7 W I B di S M A Negeri 3, Kecamatan Rappocini");
    expect(normalizeId("masuk 07.15")).toBe("masuk pukul 7 lewat 15 menit");
    expect(normalizeId("harga Rp 5.000")).toBe("harga 5000 rupiah");
  });
  it("recognises Indonesian-looking proper nouns but not English ones", () => {
    for (const w of ["Budi", "Makassar", "Lestari", "Nyoman", "Soekarno", "SMAN"]) expect(looksIndonesian(w)).toBe(true);
    for (const w of ["Lisa", "America", "School", "the", "London", "Sunday"]) expect(looksIndonesian(w)).toBe(false);
  });
});
