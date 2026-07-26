import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AppraisalCycle, AppraisalCycleStatus } from '../entities/AppraisalCycle';
import { Appraisal, AppraisalSourceType, AppraisalStatus } from '../entities/Appraisal';
import { AppraisalScore } from '../entities/AppraisalScore';
import { AppraisalCriterion } from '../entities/AppraisalCriterion';
import { Teacher } from '../entities/Teacher';
import { Student } from '../entities/Student';
import { Parent } from '../entities/Parent';
import { ParentStudent } from '../entities/ParentStudent';
import { Class } from '../entities/Class';
import { TeacherClass } from '../entities/TeacherClass';
import { User, UserRole } from '../entities/User';
import { isFullAccessRole } from '../constants/userRoles';

export const DEFAULT_SOURCE_WEIGHTS: Record<AppraisalSourceType, number> = {
  [AppraisalSourceType.SELF]: 20,
  [AppraisalSourceType.SUPERVISOR]: 40,
  [AppraisalSourceType.PEER]: 20,
  [AppraisalSourceType.STUDENT]: 10,
  [AppraisalSourceType.PARENT]: 10,
};

export function resolveSourceWeights(
  cycle: AppraisalCycle | null | undefined
): Record<AppraisalSourceType, number> {
  const w = cycle?.sourceWeights || {};
  return {
    [AppraisalSourceType.SELF]: Number(w.self ?? DEFAULT_SOURCE_WEIGHTS.self),
    [AppraisalSourceType.SUPERVISOR]: Number(w.supervisor ?? DEFAULT_SOURCE_WEIGHTS.supervisor),
    [AppraisalSourceType.PEER]: Number(w.peer ?? DEFAULT_SOURCE_WEIGHTS.peer),
    [AppraisalSourceType.STUDENT]: Number(w.student ?? DEFAULT_SOURCE_WEIGHTS.student),
    [AppraisalSourceType.PARENT]: Number(w.parent ?? DEFAULT_SOURCE_WEIGHTS.parent),
  };
}

export function computeOverallFromScores(
  scores: Array<{ score: number | string; criterion?: { weight?: number | string } | null; weight?: number }>
): number | null {
  if (!scores?.length) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (const s of scores) {
    const score = Number(s.score);
    if (!Number.isFinite(score)) continue;
    const weight = Number(s.criterion?.weight ?? s.weight ?? 1) || 1;
    weighted += score * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return null;
  return Math.round((weighted / totalWeight) * 100) / 100;
}

export function computeCompositeScore(
  bySource: Partial<Record<AppraisalSourceType, number | null>>,
  weights: Record<AppraisalSourceType, number>
): { composite: number | null; appliedWeights: Record<string, number>; breakdown: Record<string, number | null> } {
  let sum = 0;
  let weightSum = 0;
  const applied: Record<string, number> = {};
  const breakdown: Record<string, number | null> = {};

  for (const source of Object.values(AppraisalSourceType)) {
    const score = bySource[source];
    const w = Number(weights[source] || 0);
    breakdown[source] = score == null || !Number.isFinite(Number(score)) ? null : Number(score);
    if (breakdown[source] == null || w <= 0) continue;
    sum += Number(score) * w;
    weightSum += w;
    applied[source] = w;
  }

  return {
    composite: weightSum > 0 ? Math.round((sum / weightSum) * 100) / 100 : null,
    appliedWeights: applied,
    breakdown,
  };
}

export function isAppraisalAdmin(user: User): boolean {
  return (
    isFullAccessRole(user.role) ||
    user.role === UserRole.ADMIN ||
    user.role === UserRole.DIRECTOR ||
    user.role === UserRole.HEADMASTER ||
    user.role === UserRole.DEPUTY_HEADMASTER
  );
}

export function isSupervisorRole(user: User): boolean {
  return isAppraisalAdmin(user);
}

export async function getTeacherForUser(user: User): Promise<Teacher | null> {
  if (user.teacher?.id) return user.teacher;
  if (!user.id) return null;
  return AppDataSource.getRepository(Teacher).findOne({ where: { userId: user.id } });
}

/** Class IDs a parent or student is connected to (linked children / own class). */
async function getPortalClassIds(user: User): Promise<string[]> {
  const studentRepo = AppDataSource.getRepository(Student);

  if (user.role === UserRole.STUDENT || user.student) {
    const student =
      user.student || (await studentRepo.findOne({ where: { userId: user.id } }));
    return student?.classId ? [student.classId] : [];
  }

  const parent =
    user.parent || (await AppDataSource.getRepository(Parent).findOne({ where: { userId: user.id } }));
  if (!parent) return [];

  const links = await AppDataSource.getRepository(ParentStudent).find({
    where: { parentId: parent.id },
    select: ['studentId'],
  });
  const studentIds = links.map((l) => l.studentId);

  const owned = await studentRepo.find({ where: { parentId: parent.id }, select: ['id', 'classId'] });
  const linked = studentIds.length
    ? await studentRepo.find({ where: { id: In(studentIds) }, select: ['id', 'classId'] })
    : [];

  const classIds = [...owned, ...linked]
    .map((s) => s.classId)
    .filter((id): id is string => !!id);
  return [...new Set(classIds)];
}

/**
 * Teachers a parent/student may give feedback on — those attached to their
 * linked children's classes (class teachers + allocated subject teachers).
 */
export async function getAllowedFeedbackTeacherIds(user: User): Promise<string[]> {
  const classIds = await getPortalClassIds(user);
  if (!classIds.length) return [];

  const classes = await AppDataSource.getRepository(Class).find({
    where: { id: In(classIds) },
    relations: ['teachers'],
  });

  const teacherIds = new Set<string>();
  for (const cls of classes) {
    if (cls.classTeacher1Id) teacherIds.add(cls.classTeacher1Id);
    if (cls.classTeacher2Id) teacherIds.add(cls.classTeacher2Id);
    for (const t of cls.teachers || []) {
      if (t?.id) teacherIds.add(t.id);
    }
  }

  const allocations = await AppDataSource.getRepository(TeacherClass).find({
    where: { classId: In(classIds) },
    select: ['teacherId'],
  });
  for (const a of allocations) {
    if (a.teacherId) teacherIds.add(a.teacherId);
  }

  return [...teacherIds];
}

/** Parents and students are limited to teachers linked to their own classes. */
export function isPortalFeedbackUser(user: User): boolean {
  return (
    user.role === UserRole.PARENT ||
    user.role === UserRole.STUDENT ||
    !!user.parent ||
    !!user.student
  );
}

export async function buildTeacherCycleSummary(teacherId: string, cycleId: string) {
  const cycleRepo = AppDataSource.getRepository(AppraisalCycle);
  const appraisalRepo = AppDataSource.getRepository(Appraisal);

  const cycle = await cycleRepo.findOne({ where: { id: cycleId } });
  if (!cycle) return null;

  const appraisals = await appraisalRepo.find({
    where: { teacherId, cycleId },
    relations: ['scores', 'scores.criterion', 'evaluator'],
    order: { updatedAt: 'DESC' },
  });

  const bySource: Partial<Record<AppraisalSourceType, number | null>> = {};
  const appraisalsBySource: Partial<Record<AppraisalSourceType, Appraisal[]>> = {};

  for (const a of appraisals) {
    if (!appraisalsBySource[a.sourceType]) appraisalsBySource[a.sourceType] = [];
    appraisalsBySource[a.sourceType]!.push(a);
  }

  for (const source of Object.values(AppraisalSourceType)) {
    const list = (appraisalsBySource[source] || []).filter(
      (a) =>
        a.status === AppraisalStatus.SUBMITTED ||
        a.status === AppraisalStatus.REVIEWED ||
        a.status === AppraisalStatus.FINALIZED
    );
    if (!list.length) {
      bySource[source] = null;
      continue;
    }
    // Average multiple peer/student/parent submissions for that source
    const scores = list
      .map((a) => (a.overallScore != null ? Number(a.overallScore) : computeOverallFromScores(a.scores || [])))
      .filter((n): n is number => n != null && Number.isFinite(n));
    bySource[source] = scores.length
      ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 100) / 100
      : null;
  }

  const weights = resolveSourceWeights(cycle);
  const composite = computeCompositeScore(bySource, weights);

  return {
    teacherId,
    cycleId,
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      sourceWeights: weights,
    },
    bySource: composite.breakdown,
    compositeScore: composite.composite,
    appliedWeights: composite.appliedWeights,
    appraisals,
  };
}

export async function ensureActiveCycle(cycleId: string): Promise<AppraisalCycle> {
  const cycle = await AppDataSource.getRepository(AppraisalCycle).findOne({ where: { id: cycleId } });
  if (!cycle) {
    const err: any = new Error('Appraisal cycle not found');
    err.status = 404;
    throw err;
  }
  if (cycle.status === AppraisalCycleStatus.CLOSED) {
    const err: any = new Error('This appraisal cycle is closed');
    err.status = 400;
    throw err;
  }
  return cycle;
}

export function recalculateAppraisalOverall(appraisal: Appraisal): number | null {
  const overall = computeOverallFromScores(appraisal.scores || []);
  appraisal.overallScore = overall;
  return overall;
}

export async function replaceScores(
  appraisalId: string,
  items: Array<{ criterionId: string; score: number; comment?: string | null }>
): Promise<AppraisalScore[]> {
  const scoreRepo = AppDataSource.getRepository(AppraisalScore);
  const criterionRepo = AppDataSource.getRepository(AppraisalCriterion);

  await scoreRepo.delete({ appraisalId });

  const criteria = await criterionRepo.find({ where: { isActive: true } });
  const byId = new Map(criteria.map((c) => [c.id, c]));

  const created: AppraisalScore[] = [];
  for (const item of items) {
    const criterion = byId.get(item.criterionId);
    if (!criterion) continue;
    const min = Number(criterion.scaleMin);
    const max = Number(criterion.scaleMax);
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < min || score > max) {
      const err: any = new Error(`Score for "${criterion.name}" must be between ${min} and ${max}`);
      err.status = 400;
      throw err;
    }
    const row = scoreRepo.create({
      appraisalId,
      criterionId: criterion.id,
      score,
      comment: item.comment?.trim() || null,
    });
    created.push(await scoreRepo.save(row));
  }
  return created;
}
