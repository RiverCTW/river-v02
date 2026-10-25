import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".river-user-chip")).toHaveText(username);
}

test("V021-AUTH: two tabs keep independent accounts and one logout does not affect the other", async ({ context, page }) => {
  const suffix = Date.now().toString(36);
  const adminLogin = await page.request.post("/api/auth/login", { data: { username: "admin", password: "river-admin" } });
  expect(adminLogin.status()).toBe(200);
  const adminToken = String((await adminLogin.json()).sessionToken);
  const users = [
    { username: `v021A-${suffix}`, password: "password-a" },
    { username: `v021B-${suffix}`, password: "password-b" },
  ];
  for (const user of users) {
    const created = await page.request.post("/api/admin/users", {
      headers: { authorization: `Bearer ${adminToken}` }, data: user,
    });
    expect(created.status()).toBe(201);
  }

  await login(page, users[0].username, users[0].password);
  const second = await context.newPage();
  await login(second, users[1].username, users[1].password);
  await expect(page.locator(".river-user-chip")).toHaveText(users[0].username);
  await expect(second.locator(".river-user-chip")).toHaveText(users[1].username);

  await page.reload();
  await second.reload();
  await expect(page.locator(".river-user-chip")).toHaveText(users[0].username);
  await expect(second.locator(".river-user-chip")).toHaveText(users[1].username);

  await second.getByRole("button", { name: "退出" }).click();
  await page.waitForTimeout(500);
  await expect(page.locator(".river-user-chip")).toHaveText(users[0].username);
  await page.reload();
  await expect(page.locator(".river-user-chip")).toHaveText(users[0].username);
});
