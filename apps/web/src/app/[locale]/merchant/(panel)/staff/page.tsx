import type { components } from '@dealo/api-client';
import { Check, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { MerchantStaffInvite, MerchantStaffRow } from '@/components/merchant-staff-actions';
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
  TableCard,
  Td,
  Th,
} from '@/components/merchant-ui';
import { accountGet, loadForVisitor } from '@/lib/account-api';
import { permissionDescriptionKeys } from '@/lib/merchant-access';
import { formatPhone } from '@/lib/profile';
import { requirePanelPermission } from '@/lib/merchant-session';

type StaffList = components['schemas']['StaffList'];

const ROLE_KEYS = {
  merchant_owner: 'roleOwner',
  merchant_manager: 'roleManager',
  merchant_cashier: 'roleCashier',
} as const;

/** Staff of the business. The owner sees invite and role controls; others see the list only. */
export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const access = await requirePanelPermission('workspace.view', '/merchant/staff');
  const [t, ui, profile] = await Promise.all([
    getTranslations('MerchantPanel'),
    getTranslations('MerchantUI'),
    getTranslations('Profile'),
  ]);
  const canManage = access.can('staff.manage');
  const list = await loadForVisitor(locale, '/merchant/staff', () =>
    accountGet<StaffList>('/merchant/staff'),
  );
  // What the signed-in member may do, exactly as the API reports it.
  const ownAccess = permissionDescriptionKeys(access.permissions ?? []);

  return (
    <>
      <PageHeader title={t('staffTitle')} description={ui('staffSubtitle')} />
      {canManage && <MerchantStaffInvite />}
      {list.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('staffEmpty')}
          text={canManage ? ui('staffEmptyHint') : undefined}
        />
      ) : (
        <TableCard minWidth={560}>
          <thead>
            <tr>
              <Th>{t('colName')}</Th>
              <Th>{t('colPhone')}</Th>
              <Th>{t('staffRole')}</Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((member) => (
              <tr key={member.id}>
                <Td className="font-medium">{member.user.name}</Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {formatPhone(member.user.phone) ?? '—'}
                </Td>
                <Td>
                  {member.role === 'merchant_owner' || !canManage ? (
                    <StatusBadge tone={member.role === 'merchant_owner' ? 'brand' : 'neutral'}>
                      {t(ROLE_KEYS[member.role])}
                    </StatusBadge>
                  ) : (
                    <MerchantStaffRow
                      assignmentId={member.id}
                      phone={member.user.phone ?? ''}
                      role={member.role}
                    />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      {ownAccess.length > 0 && (
        <Panel title={profile('permissionsTitle')} titleId="access-title">
          <ul className="grid gap-2 sm:grid-cols-2">
            {ownAccess.map((key) => (
              <li key={key} className="flex items-start gap-2 text-small text-ink">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-save" />
                {profile(`permission.${key}`)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {!canManage && <p className="text-small text-ink-muted">{t('staffOwnerOnly')}</p>}
    </>
  );
}
