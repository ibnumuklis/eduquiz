import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end flow against a real Supabase project with seeded test accounts
 * (see scripts/seed-test-accounts.ts). Skipped unless E2E_FULL=1.
 *
 * Required env: E2E_TEACHER_EMAIL, E2E_STUDENT_EMAIL, E2E_PASSWORD
 * The student must be in a class the teacher teaches (the seed script does this).
 */
const enabled = process.env.E2E_FULL === "1";
test.describe.configure({ mode: "serial" });
test.skip(!enabled, "Set E2E_FULL=1 with seeded test accounts to run the full flow");

const password = process.env.E2E_PASSWORD ?? "";
const title = `E2E Kuis ${Date.now()}`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/(teacher|student|school|admin)/);
}

test("teacher creates, fills and publishes a quiz", async ({ page }) => {
  await login(page, process.env.E2E_TEACHER_EMAIL!);
  await page.goto("/teacher/quizzes/new");
  await page.getByLabel("Judul").fill(title);
  await page.getByLabel("Durasi pengerjaan (menit)").fill("10");
  await page.getByRole("button", { name: /Simpan & lanjut/ }).click();
  await page.waitForURL(/\/teacher\/quizzes\/[0-9a-f-]+\?created=1/);

  await page.getByRole("button", { name: "Tambah soal pertama" }).click();
  await page.getByLabel("Pertanyaan").fill("2 + 3 = ?");
  await page.getByLabel("Teks opsi 1").fill("5");
  await page.getByLabel("Teks opsi 2").fill("6");
  await page.getByLabel("Teks opsi 3").fill("7");
  await page.getByLabel("Teks opsi 4").fill("8");
  await page.getByRole("button", { name: "Tambah soal", exact: true }).click();
  await expect(page.getByText("2 + 3 = ?")).toBeVisible();

  await page.getByRole("link", { name: "Penugasan & Bagikan" }).click();
  await page.locator("label", { hasText: "siswa" }).first().click();
  await page.getByRole("button", { name: "Simpan penugasan" }).click();
  await expect(page.getByText("Penugasan kelas disimpan")).toBeVisible();

  await page.getByRole("button", { name: "Publikasikan" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Publikasikan" }).click();
  await expect(page.getByText(/Kuis dipublikasikan/)).toBeVisible();
});

test("student takes the quiz with autosave and refresh recovery", async ({ page }) => {
  await login(page, process.env.E2E_STUDENT_EMAIL!);
  await page.goto("/student/quizzes?tab=available");
  await page.locator("div", { hasText: title }).getByRole("link", { name: "Mulai kuis" }).first().click();
  await page.getByRole("button", { name: "Mulai kuis" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mulai sekarang" }).click();
  await page.waitForURL(/\/attempt\//);

  await page.getByRole("radio", { name: /5/ }).click();
  await expect(page.getByText("Tersimpan")).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("radio", { name: /5/ })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Kumpulkan jawaban" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ya, kumpulkan" }).click();
  await page.waitForURL(/\/student\/results\//);
  await expect(page.getByText("100")).toBeVisible();
});

test("teacher sees the submission in monitoring and can export", async ({ page }) => {
  await login(page, process.env.E2E_TEACHER_EMAIL!);
  await page.goto("/teacher/quizzes");
  await page.getByRole("link", { name: title }).click();
  await page.getByRole("link", { name: "Monitoring" }).click();
  await expect(page.getByText("Selesai").first()).toBeVisible();
  await page.getByRole("link", { name: "Laporan Nilai" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});
