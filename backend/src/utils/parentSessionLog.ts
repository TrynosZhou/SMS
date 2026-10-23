import { AppDataSource } from '../config/database';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { Student } from '../entities/Student';
import { UserSessionLog } from '../entities/UserSessionLog';

type SessionUserLite = {
  id: string;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
};

function personName(...parts: Array<string | null | undefined>): string {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join(' ').trim();
}

let parentColumnsEnsured = false;

export async function ensureParentSessionLogColumns(): Promise<void> {
  if (parentColumnsEnsured) return;
  try {
    const table = AppDataSource.getMetadata(UserSessionLog).tableName;
    await AppDataSource.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "displayName" character varying(160)`
    );
    await AppDataSource.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "linkedChildren" text`
    );
  } catch (error: any) {
    console.warn('[UserSessionLog] Could not ensure parent columns:', error?.message || error);
  } finally {
    parentColumnsEnsured = true;
  }
}

function studentLabel(student: { firstName?: string; lastName?: string; studentNumber?: string }): string {
  const name = personName(student.firstName, student.lastName);
  const number = String(student.studentNumber || '').trim();
  if (name && number) return `${name} (${number})`;
  return name || number || 'Unknown student';
}

export function isParentRole(role: string | null | undefined): boolean {
  return String(role || '').toLowerCase() === 'parent';
}

export async function resolveParentLoginSnapshot(user: SessionUserLite): Promise<{
  displayName: string | null;
  linkedChildren: string | null;
}> {
  await ensureParentSessionLogColumns();
  const fallbackName =
    personName(user.firstName, user.lastName) || user.username || user.email || null;

  if (!isParentRole(user.role)) {
    return { displayName: fallbackName, linkedChildren: null };
  }

  const parent = await AppDataSource.getRepository(Parent).findOne({
    where: { userId: user.id },
  });

  const displayName =
    (parent ? personName(parent.firstName, parent.lastName) : '') || fallbackName;

  const labels = new Map<string, string>();
  if (parent?.id) {
    const links = await AppDataSource.getRepository(ParentStudent).find({
      where: { parentId: parent.id },
      relations: ['student'],
    });
    for (const link of links) {
      if (link.student?.id) {
        labels.set(link.student.id, studentLabel(link.student));
      }
    }

    const directChildren = await AppDataSource.getRepository(Student).find({
      where: { parentId: parent.id },
    });
    for (const student of directChildren) {
      if (student.id && !labels.has(student.id)) {
        labels.set(student.id, studentLabel(student));
      }
    }
  }

  return {
    displayName,
    linkedChildren: labels.size ? Array.from(labels.values()).join(', ') : 'No linked children',
  };
}

export async function enrichParentSessionRows(rows: UserSessionLog[]): Promise<UserSessionLog[]> {
  const parentRows = rows.filter((row) => isParentRole(row.role));
  if (!parentRows.length) return rows;

  const missingIds = Array.from(
    new Set(
      parentRows
        .filter((row) => !row.displayName || !row.linkedChildren)
        .map((row) => row.userId)
        .filter(Boolean)
    )
  );

  if (!missingIds.length) return rows;

  const snapshots = new Map<string, { displayName: string | null; linkedChildren: string | null }>();
  await Promise.all(
    missingIds.map(async (userId) => {
      snapshots.set(userId, await resolveParentLoginSnapshot({ id: userId, role: 'parent' }));
    })
  );

  for (const row of parentRows) {
    const snap = snapshots.get(row.userId);
    if (!snap) continue;
    if (!row.displayName) row.displayName = snap.displayName;
    if (!row.linkedChildren) row.linkedChildren = snap.linkedChildren;
  }

  return rows;
}
