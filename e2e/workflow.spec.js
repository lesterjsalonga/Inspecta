import { test, expect } from '@playwright/test';

async function taskFromDemo(page, rule = 'CI-01', title = 'Investigate CI configuration') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo review' }).click();
  await expect(page.getByRole('heading', { name: 'fixture/checkout-kit' })).toBeVisible();
  await page.getByLabel('Select ' + rule + ' for investigation').check();
  await page.getByLabel('Task title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create review task' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function confirmedTask(page) {
  await taskFromDemo(page);
  await page
    .getByLabel('Decision rationale')
    .fill('The fixture requirement explicitly calls for tests in CI.');
  await page
    .getByLabel('Verification criteria', { exact: true })
    .fill('The CI workflow declares a direct npm test command.');
  await page.getByRole('button', { name: 'Confirm & await fix' }).click();
  await expect(page.getByRole('heading', { name: 'Prepare verification' })).toBeVisible();
  const response = await page.request.post('/api/demo', { data: { variant: 'after' } });
  const scan = await response.json();
  await page.reload();
  await page.getByLabel('Verification snapshot', { exact: true }).selectOption(scan.id);
  await page
    .getByLabel('Verification plan', { exact: true })
    .fill('Compare the captured workflow at the proposed-fix commit.');
  await page.getByRole('button', { name: 'Begin verification' }).click();
  await expect(page.getByRole('heading', { name: 'Record a verification attempt' })).toBeVisible();
}
async function fillProof(page) {
  await page
    .getByLabel('Observed result', { exact: true })
    .fill('A direct npm test run step is present.');
  await page
    .getByLabel('Verification evidence', { exact: true })
    .fill(
      'Captured .github/workflows/ci.yml at the proposed-fix commit, line 10. This verifies configuration only.',
    );
}
test('confirmed issue: investigation → decision → proposed fix → verified closure', async ({
  page,
}) => {
  await taskFromDemo(page);
  await page
    .getByLabel('Inspection / reproduction steps')
    .fill('Inspect the declared run steps in the captured workflow.');
  await page.getByLabel('Expected behavior', { exact: true }).fill('CI declares a test command.');
  await page
    .getByLabel('Observed behavior', { exact: true })
    .fill('Only installation and build commands are declared.');
  await page
    .getByLabel('Impact', { exact: true })
    .fill('The expected test entry point is not invoked directly.');
  await page.getByRole('button', { name: 'Save report' }).click();
  await page
    .getByLabel('Investigation note', { exact: true })
    .fill('Reviewed the fixture requirement and workflow source.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(
    page.getByText('Reviewed the fixture requirement and workflow source.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Decision rationale').fill('The documented fixture requirement is unmet.');
  await page
    .getByLabel('Verification criteria', { exact: true })
    .fill('The workflow declares npm test.');
  await page.getByRole('button', { name: 'Confirm & await fix' }).click();
  const response = await page.request.post('/api/demo', { data: { variant: 'after' } });
  const fixed = await response.json();
  await page.reload();
  await page.getByLabel('Verification snapshot', { exact: true }).selectOption(fixed.id);
  await page
    .getByLabel('Verification plan', { exact: true })
    .fill('Inspect the new workflow source and match the criterion.');
  await page.getByRole('button', { name: 'Begin verification' }).click();
  await fillProof(page);
  await page.getByLabel('I checked every verification criterion.').check();
  await page.getByRole('button', { name: 'Save verification & close' }).click();
  await expect(page.getByText('This investigation is closed.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Verification evidence', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Reviewed the fixture requirement and workflow source.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/verified-task.png', fullPage: true });
});
test('expected behavior can close without pretending a fix was verified; notes are escaped', async ({
  page,
}) => {
  await taskFromDemo(page, 'INSTALL-01', 'Review the setup pattern');
  const text = '<img src=x onerror="window.inspectaExecuted=true">';
  await page.getByLabel('Investigation note', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.inspectaExecuted)).toBeUndefined();
  await page.getByLabel('Decision', { exact: true }).selectOption('Expected behavior');
  await page
    .getByLabel('Decision rationale')
    .fill('This deliberately seeded fixture is accepted for the demonstration.');
  await page.getByRole('button', { name: 'Record decision & close' }).click();
  await expect(page.getByText('This investigation is closed.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Verification evidence', exact: true }),
  ).toHaveCount(0);
});
test('inconclusive verification stays open; a later failed attempt returns to awaiting fix', async ({
  page,
}) => {
  await confirmedTask(page);
  await fillProof(page);
  await page.getByLabel('Verification outcome', { exact: true }).selectOption('Inconclusive');
  await page.getByRole('button', { name: 'Save verification attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Record a verification attempt' })).toBeVisible();
  await expect(page.getByText('Verification inconclusive', { exact: true })).toBeVisible();
  await fillProof(page);
  await page.getByLabel('Verification outcome', { exact: true }).selectOption('Failed');
  await page.getByRole('button', { name: 'Save verification attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Prepare verification' })).toBeVisible();
  await expect(page.getByText('Verification failed', { exact: true })).toBeVisible();
});
test('related findings group into a single task and links replace duplicate creation controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo review' }).click();
  await expect(page).toHaveURL(/#\/scans\//);
  const source = page.url();
  await page.getByLabel('Select TEST-01 for investigation').check();
  await page.getByLabel('Select CI-01 for investigation').check();
  await page.getByLabel('Task title', { exact: true }).fill('Investigate test configuration gaps');
  await page.getByRole('button', { name: 'Create review task' }).click();
  await expect(page.locator('.task-finding')).toHaveCount(2);
  await page.goto(source);
  await expect(page.getByRole('link', { name: 'View linked review task' })).toHaveCount(2);
  await expect(page.getByLabel('Select CI-01 for investigation')).toHaveCount(0);
});
test('workspace renders on a phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Evidence before conclusions.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile-workspace.png', fullPage: true });
});
