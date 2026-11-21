import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@grupon/i18n/messages/en';

import { initialDealDraft, stepProblem, type DealDraft } from './deal-wizard';
import { validHours } from './merchant-business';
import { ConfirmRemoveButton } from './merchant-confirm';
import { staffErrorKey } from './merchant-staff-actions';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const text = { uz: 'a', ru: 'b', en: 'c' };

function draft(patch: Partial<DealDraft>): DealDraft {
  return { ...initialDealDraft, ...patch };
}

describe('staffErrorKey', () => {
  it('names the real reason for each staff problem', () => {
    expect(staffErrorKey(404, 'user_not_found')).toBe('errorUserNotFound');
    expect(staffErrorKey(409, 'already_staff')).toBe('errorAlreadyStaff');
    expect(staffErrorKey(409, 'already_in_another_business')).toBe('errorOtherBusiness');
    expect(staffErrorKey(409, 'owner_protected')).toBe('errorOwnerProtected');
    expect(staffErrorKey(404, 'staff_not_found')).toBe('errorStaffNotFound');
    expect(staffErrorKey(403, 'forbidden')).toBe('errorForbidden');
    expect(staffErrorKey(500, 'internal_error')).toBe('errorGeneric');
  });
});

describe('validHours', () => {
  it('accepts real clock ranges only', () => {
    for (const ok of ['09:00-18:00', '18:00-02:00', '00:00-24:00'])
      expect(validHours(ok)).toBe(true);
    for (const bad of ['25:00-99:00', '09:00-24:30', '09:00-09:00', '9:00-18:00', ''])
      expect(validHours(bad)).toBe(false);
  });
});

describe('deal wizard steps', () => {
  it('asks for a missing slug before its format', () => {
    expect(stepProblem(0, draft({ slug: '' }))).toBe('slugRequired');
    expect(stepProblem(0, draft({ slug: 'Bad Slug' }))).toBe('invalidSlug');
  });

  it('starts with empty price fields and tells a missing price from a too-high one', () => {
    expect(initialDealDraft.options[0]?.originalPrice).toBe('');
    const option = { title: text, originalPrice: '', dealPrice: '', stock: '10' };
    expect(stepProblem(1, draft({ options: [option] }))).toBe('priceRequired');
    expect(
      stepProblem(1, draft({ options: [{ ...option, originalPrice: '0', dealPrice: '0' }] })),
    ).toBe('priceRequired');
    expect(
      stepProblem(1, draft({ options: [{ ...option, originalPrice: '100', dealPrice: '200' }] })),
    ).toBe('price');
    expect(
      stepProblem(
        1,
        draft({
          options: [{ ...option, originalPrice: '300000', dealPrice: '150000', stock: '' }],
        }),
      ),
    ).toBe('stockRequired');
    expect(
      stepProblem(
        1,
        draft({ options: [{ ...option, originalPrice: '300000', dealPrice: '150000' }] }),
      ),
    ).toBeNull();
  });
});

describe('ConfirmRemoveButton', () => {
  it('asks before it removes, and cancel keeps the item', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConfirmRemoveButton label="Remove" question="Remove this branch?" onConfirm={onConfirm} />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
