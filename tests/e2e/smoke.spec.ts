import { expect, test } from "@playwright/test";

// Runs without a database: public pages, route protection and responsive layout.

test("landing page renders brand and CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kuis interaktif");
  await expect(page.getByRole("link", { name: "Mulai sekarang" })).toBeVisible();
});

test("protected routes redirect to login with return path", async ({ page }) => {
  await page.goto("/teacher/quizzes");
  await expect(page).toHaveURL(/\/login\?next=%2Fteacher%2Fquizzes/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("every role area is protected", async ({ request }) => {
  for (const path of ["/admin", "/school", "/teacher", "/student", "/attempt/00000000-0000-0000-0000-000000000000", "/api/reports/00000000-0000-0000-0000-000000000000?format=csv"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([302, 307, 308, 401]).toContain(res.status());
  }
});

test("auth pages are reachable", async ({ page }) => {
  for (const [path, heading] of [["/login", "Selamat datang"], ["/register", "Buat akun"], ["/forgot-password", "Lupa password"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).last()).toContainText(heading);
  }
});

test("register form validates on the server", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nama lengkap").fill("A");
  await page.getByLabel("Email").fill("bukan-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Ulangi password").fill("short");
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("no horizontal overflow on public pages", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
