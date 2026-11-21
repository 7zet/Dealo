import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

/** A fresh phone per run: registration needs an account without a business. */
/** A random number on its own +99895 prefix, so parallel specs (which use +99890) never collide. */
function freshPhone() {
  return `+99895${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
}

/** Fills the inline phone sign-in step (development shows the code on the page). */
async function verifyPhone(page, phone) {
  await page.getByLabel(/Phone number/).fill(phone.slice(4));
  await page.getByRole('button', { name: /Send code/ }).click();
  const hint = page.getByText(/Test mode code: \d{6}/);
  await expect(hint).toBeVisible();
  await page.getByLabel(/Verification code/).fill((await hint.textContent()).match(/\d{6}/)[0]);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
}

test('signed-out visitor registers a business through phone sign-in and lands in the workspace', async ({
  page,
}) => {
  const phone = freshPhone();
  const suffix = phone.slice(-7);
  const displayName = `Register E2E ${suffix}`;
  const visited = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });

  // Step 1: the landing CTA leads to registration, which asks for the phone first.
  await page.goto('/en/merchant');
  await page
    .getByRole('main')
    .getByRole('link', { name: /List your business/ })
    .click();
  await expect(page).toHaveURL(/\/en\/merchant\/register$/);
  await expect(page.getByRole('heading', { name: /Sign in with your phone number/ })).toBeVisible();
  await verifyPhone(page, phone);

  // Step 2: back on the same page, now signed in, with the business form.
  const form = page.getByRole('main');
  await expect(form.getByLabel('Legal name')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/merchant\/register$/);

  // Inline validation: an empty submit marks the fields instead of reaching the API.
  await page.getByRole('button', { name: /Register and send for review/ }).click();
  await expect(page.getByText('The taxpayer number must have 9 digits.')).toBeVisible();
  await expect(form.getByLabel('Legal name')).toHaveAttribute('aria-invalid', 'true');

  await form.getByLabel('Public name').fill(displayName);
  await form.getByLabel('Category').selectOption({ index: 1 });
  await form.getByLabel('Legal name').fill(`${displayName} MChJ`);
  await form.getByLabel(/Taxpayer number/).fill(`5${suffix}1`.slice(0, 9));
  await form.getByLabel(/Responsible person/).fill('Alisher Usmonov');
  await form.getByLabel('Bank MFO').fill('00014');
  await form.getByLabel(/Bank account/).fill(`2020800090010${suffix}`.slice(0, 20));
  await form.getByLabel('City').selectOption({ index: 1 });
  await expect(form.getByLabel('Phone', { exact: true })).toHaveValue(phone);
  await form.getByLabel('Address').fill('Amir Temur 1');
  await form.getByLabel(/accept the platform offer/).check();
  await page.getByRole('button', { name: /Register and send for review/ }).click();

  // Step 3: the workspace opens on the verification page with the draft business.
  await expect(page).toHaveURL(/\/en\/merchant\/review$/);
  await expect(page.getByRole('heading', { name: 'Business status' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/has not been sent yet/);
  await expect(page.getByRole('main').getByText(displayName).first()).toBeVisible();

  // The data is persisted: the business page shows it, and the API reports the owner membership.
  await page.goto('/en/merchant/business');
  await expect(page.getByText(`${displayName} MChJ`)).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Public name')).toHaveValue(displayName);
  const me = await page.evaluate(async () => (await fetch('/api/bff/me')).json());
  expect(me.memberships).toEqual([
    expect.objectContaining({
      merchant_name: displayName,
      role: 'merchant_owner',
      review_status: 'draft',
    }),
  ]);

  // Opening registration again goes back to the workspace instead of an empty form.
  await page.goto('/en/merchant/register');
  await expect(page).toHaveURL(/\/en\/merchant\/review$/);

  expect(visited.filter((path) => /^\/(uz|ru|en)\/(uz|ru|en)(\/|$)/.test(path))).toEqual([]);
});

test('sign-in from a protected page returns to it with a single locale prefix', async ({
  page,
}) => {
  await page.goto('/en/account/profile');
  await expect(page).toHaveURL(/\/en\/login\?next=/);
  // The return path is stored without the locale; the locale-aware router adds it once.
  expect(new URL(page.url()).searchParams.get('next')).toBe('/account/profile');
  await verifyPhone(page, freshPhone());
  await expect(page).toHaveURL(/\/en\/account\/profile$/);
});

test('the API refuses registration for a signed-out caller', async () => {
  const response = await fetch(`${API}/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(401);
});
