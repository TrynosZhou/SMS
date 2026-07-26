import { Response } from 'express';
import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Teacher } from '../entities/Teacher';
import { AppraisalCycle, AppraisalCycleStatus } from '../entities/AppraisalCycle';
import { AppraisalCriterion } from '../entities/AppraisalCriterion';
import { Appraisal, AppraisalSourceType, AppraisalStatus } from '../entities/Appraisal';
import { AppraisalGoal, AppraisalGoalStatus } from '../entities/AppraisalGoal';
import { AppraisalPeerAssignment } from '../entities/AppraisalPeerAssignment';
import { Settings } from '../entities/Settings';
import {
  buildTeacherCycleSummary,
  ensureActiveCycle,
  getAllowedFeedbackTeacherIds,
  getTeacherForUser,
  isAppraisalAdmin,
  isPortalFeedbackUser,
  isSupervisorRole,
  recalculateAppraisalOverall,
  replaceScores,
  resolveSourceWeights,
} from '../services/appraisal.service';
import {
  createTeacherAppraisalPdf,
  createDepartmentAppraisalPdf,
} from '../utils/appraisalPdfGenerator';

function badRequest(res: Response, message: string) {
  return res.status(400).json({ message });
}

function forbid(res: Response, message = 'Forbidden') {
  return res.status(403).json({ message });
}

async function assertCanManageConfig(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return false;
  }
  if (!isAppraisalAdmin(req.user)) {
    forbid(res, 'Only school leadership can manage appraisal configuration');
    return false;
  }
  return true;
}

// ─── Cycles ─────────────────────────────────────────────────────────────

export const listCycles = async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AppraisalCycle);
    const status = String(req.query.status || '').trim();
    const qb = repo.createQueryBuilder('c').orderBy('c.startDate', 'DESC');
    if (status && Object.values(AppraisalCycleStatus).includes(status as AppraisalCycleStatus)) {
      qb.andWhere('c.status = :status', { status });
    }
    const data = await qb.getMany();
    return res.json({ data });
  } catch (err: any) {
    console.error('listCycles', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const createCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const { name, startDate, endDate, status, sourceWeights } = req.body || {};
    if (!name?.trim() || !startDate || !endDate) {
      return badRequest(res, 'name, startDate and endDate are required');
    }
    const repo = AppDataSource.getRepository(AppraisalCycle);
    const cycle = repo.create({
      name: String(name).trim(),
      startDate,
      endDate,
      status: Object.values(AppraisalCycleStatus).includes(status) ? status : AppraisalCycleStatus.DRAFT,
      sourceWeights: sourceWeights || null,
      createdById: req.user!.id,
    });
    const saved = await repo.save(cycle);
    return res.status(201).json(saved);
  } catch (err: any) {
    console.error('createCycle', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updateCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const repo = AppDataSource.getRepository(AppraisalCycle);
    const cycle = await repo.findOne({ where: { id: req.params.id } });
    if (!cycle) return res.status(404).json({ message: 'Cycle not found' });

    const { name, startDate, endDate, status, sourceWeights } = req.body || {};
    if (name != null) cycle.name = String(name).trim();
    if (startDate != null) cycle.startDate = startDate;
    if (endDate != null) cycle.endDate = endDate;
    if (status != null && Object.values(AppraisalCycleStatus).includes(status)) {
      cycle.status = status;
    }
    if (sourceWeights !== undefined) cycle.sourceWeights = sourceWeights;
    const saved = await repo.save(cycle);
    return res.json(saved);
  } catch (err: any) {
    console.error('updateCycle', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const deleteCycle = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const repo = AppDataSource.getRepository(AppraisalCycle);
    const cycle = await repo.findOne({ where: { id: req.params.id } });
    if (!cycle) return res.status(404).json({ message: 'Cycle not found' });
    if (cycle.status === AppraisalCycleStatus.ACTIVE) {
      return badRequest(res, 'Close the cycle before deleting it');
    }
    await repo.remove(cycle);
    return res.json({ message: 'Cycle deleted' });
  } catch (err: any) {
    console.error('deleteCycle', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Criteria ───────────────────────────────────────────────────────────

export const listCriteria = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await AppDataSource.getRepository(AppraisalCriterion).find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const createCriterion = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const { name, description, weight, scaleMin, scaleMax, sortOrder, isActive } = req.body || {};
    if (!name?.trim()) return badRequest(res, 'name is required');
    const repo = AppDataSource.getRepository(AppraisalCriterion);
    const row = repo.create({
      name: String(name).trim(),
      description: description?.trim() || null,
      weight: Number(weight ?? 1) || 1,
      scaleMin: Number(scaleMin ?? 1) || 1,
      scaleMax: Number(scaleMax ?? 5) || 5,
      sortOrder: Number(sortOrder ?? 0) || 0,
      isActive: isActive !== false,
    });
    return res.status(201).json(await repo.save(row));
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const updateCriterion = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const repo = AppDataSource.getRepository(AppraisalCriterion);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Criterion not found' });
    const { name, description, weight, scaleMin, scaleMax, sortOrder, isActive } = req.body || {};
    if (name != null) row.name = String(name).trim();
    if (description !== undefined) row.description = description?.trim() || null;
    if (weight != null) row.weight = Number(weight) || 1;
    if (scaleMin != null) row.scaleMin = Number(scaleMin) || 1;
    if (scaleMax != null) row.scaleMax = Number(scaleMax) || 5;
    if (sortOrder != null) row.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) row.isActive = !!isActive;
    return res.json(await repo.save(row));
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const deleteCriterion = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const repo = AppDataSource.getRepository(AppraisalCriterion);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Criterion not found' });
    row.isActive = false;
    await repo.save(row);
    return res.json({ message: 'Criterion deactivated' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Peer assignments ───────────────────────────────────────────────────

export const listPeerAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const cycleId = String(req.query.cycleId || '');
    if (!cycleId) return badRequest(res, 'cycleId is required');
    const data = await AppDataSource.getRepository(AppraisalPeerAssignment).find({
      where: { cycleId },
      relations: ['evaluatorTeacher', 'targetTeacher'],
      order: { createdAt: 'DESC' },
    });
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const createPeerAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const { cycleId, evaluatorTeacherId, targetTeacherId } = req.body || {};
    if (!cycleId || !evaluatorTeacherId || !targetTeacherId) {
      return badRequest(res, 'cycleId, evaluatorTeacherId and targetTeacherId are required');
    }
    if (evaluatorTeacherId === targetTeacherId) {
      return badRequest(res, 'A teacher cannot peer-review themselves');
    }
    await ensureActiveCycle(cycleId);
    const repo = AppDataSource.getRepository(AppraisalPeerAssignment);
    const existing = await repo.findOne({ where: { cycleId, evaluatorTeacherId, targetTeacherId } });
    if (existing) return res.json(existing);
    const row = repo.create({ cycleId, evaluatorTeacherId, targetTeacherId });
    return res.status(201).json(await repo.save(row));
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Server error' });
  }
};

export const deletePeerAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await assertCanManageConfig(req, res))) return;
    const repo = AppDataSource.getRepository(AppraisalPeerAssignment);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: 'Assignment not found' });
    await repo.remove(row);
    return res.json({ message: 'Assignment removed' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const myPeerTargets = async (req: AuthRequest, res: Response) => {
  try {
    const teacher = await getTeacherForUser(req.user!);
    if (!teacher) return forbid(res, 'Teacher profile required');
    const cycleId = String(req.query.cycleId || '');
    if (!cycleId) return badRequest(res, 'cycleId is required');
    const data = await AppDataSource.getRepository(AppraisalPeerAssignment).find({
      where: { cycleId, evaluatorTeacherId: teacher.id },
      relations: ['targetTeacher'],
    });
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Appraisals ─────────────────────────────────────────────────────────

async function assertCanUpsertAppraisal(
  req: AuthRequest,
  sourceType: AppraisalSourceType,
  teacherId: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const user = req.user!;
  if (sourceType === AppraisalSourceType.SELF) {
    const teacher = await getTeacherForUser(user);
    if (!teacher || teacher.id !== teacherId) {
      return { ok: false, status: 403, message: 'Teachers may only submit their own self-assessment' };
    }
    return { ok: true };
  }
  if (sourceType === AppraisalSourceType.SUPERVISOR) {
    if (!isSupervisorRole(user)) {
      return { ok: false, status: 403, message: 'Only school leadership can submit supervisor appraisals' };
    }
    return { ok: true };
  }
  if (sourceType === AppraisalSourceType.PEER) {
    const teacher = await getTeacherForUser(user);
    if (!teacher) return { ok: false, status: 403, message: 'Teacher profile required for peer review' };
    const cycleId = String(req.body?.cycleId || '');
    const assigned = await AppDataSource.getRepository(AppraisalPeerAssignment).findOne({
      where: { cycleId, evaluatorTeacherId: teacher.id, targetTeacherId: teacherId },
    });
    if (!assigned) {
      return { ok: false, status: 403, message: 'You are not assigned to peer-review this teacher' };
    }
    return { ok: true };
  }
  if (sourceType === AppraisalSourceType.STUDENT) {
    if (user.role !== UserRole.STUDENT && !user.student) {
      return { ok: false, status: 403, message: 'Student account required' };
    }
    const allowed = await getAllowedFeedbackTeacherIds(user);
    if (!allowed.includes(teacherId)) {
      return { ok: false, status: 403, message: 'You may only rate teachers assigned to your class' };
    }
    return { ok: true };
  }
  if (sourceType === AppraisalSourceType.PARENT) {
    if (user.role !== UserRole.PARENT && !user.parent) {
      return { ok: false, status: 403, message: 'Parent account required' };
    }
    const allowed = await getAllowedFeedbackTeacherIds(user);
    if (!allowed.includes(teacherId)) {
      return {
        ok: false,
        status: 403,
        message: "You may only rate teachers assigned to your child's class",
      };
    }
    return { ok: true };
  }
  return { ok: false, status: 400, message: 'Invalid source type' };
}

export const upsertAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const { teacherId, cycleId, sourceType, comments, scores, status } = req.body || {};
    if (!teacherId || !cycleId || !sourceType) {
      return badRequest(res, 'teacherId, cycleId and sourceType are required');
    }
    if (!Object.values(AppraisalSourceType).includes(sourceType)) {
      return badRequest(res, 'Invalid sourceType');
    }

    const access = await assertCanUpsertAppraisal(req, sourceType, teacherId);
    if (access.ok === false) {
      return res.status(access.status).json({ message: access.message });
    }

    await ensureActiveCycle(cycleId);
    const teacher = await AppDataSource.getRepository(Teacher).findOne({ where: { id: teacherId } });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    const appraisalRepo = AppDataSource.getRepository(Appraisal);
    let appraisal = await appraisalRepo.findOne({
      where: {
        teacherId,
        cycleId,
        sourceType,
        evaluatorId: req.user!.id,
      },
      relations: ['scores', 'scores.criterion'],
    });

    if (!appraisal) {
      appraisal = appraisalRepo.create({
        teacherId,
        cycleId,
        sourceType,
        evaluatorId: req.user!.id,
        status: AppraisalStatus.PENDING,
        comments: comments?.trim() || null,
      });
      appraisal = await appraisalRepo.save(appraisal);
    } else {
      if (comments !== undefined) appraisal.comments = comments?.trim() || null;
    }

    if (Array.isArray(scores) && scores.length) {
      const savedScores = await replaceScores(appraisal.id, scores);
      appraisal.scores = savedScores.map((s) => ({ ...s, criterion: undefined as any }));
      const withCriteria = await appraisalRepo.findOne({
        where: { id: appraisal.id },
        relations: ['scores', 'scores.criterion'],
      });
      if (withCriteria) {
        recalculateAppraisalOverall(withCriteria);
        appraisal.overallScore = withCriteria.overallScore;
        appraisal.scores = withCriteria.scores;
      }
    }

    if (status && Object.values(AppraisalStatus).includes(status)) {
      appraisal.status = status;
    } else if (Array.isArray(scores) && scores.length && appraisal.status === AppraisalStatus.PENDING) {
      appraisal.status = AppraisalStatus.SUBMITTED;
    }

    const saved = await appraisalRepo.save(appraisal);
    const full = await appraisalRepo.findOne({
      where: { id: saved.id },
      relations: ['scores', 'scores.criterion', 'teacher', 'cycle', 'evaluator'],
    });
    return res.json(full);
  } catch (err: any) {
    console.error('upsertAppraisal', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Server error' });
  }
};

export const listAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    const { cycleId, teacherId, sourceType, status } = req.query as Record<string, string>;
    const qb = AppDataSource.getRepository(Appraisal)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.teacher', 'teacher')
      .leftJoinAndSelect('a.cycle', 'cycle')
      .leftJoinAndSelect('a.evaluator', 'evaluator')
      .leftJoinAndSelect('a.scores', 'scores')
      .leftJoinAndSelect('scores.criterion', 'criterion')
      .orderBy('a.updatedAt', 'DESC');

    if (cycleId) qb.andWhere('a.cycleId = :cycleId', { cycleId });
    if (teacherId) qb.andWhere('a.teacherId = :teacherId', { teacherId });
    if (sourceType) qb.andWhere('a.sourceType = :sourceType', { sourceType });
    if (status) qb.andWhere('a.status = :status', { status });

    // Scope: teachers see own + assigned peer targets; parents/students see own submissions; leadership see all
    if (!isAppraisalAdmin(req.user!)) {
      if (req.user!.role === UserRole.TEACHER || req.user!.teacher) {
        const me = await getTeacherForUser(req.user!);
        if (!me) return forbid(res);
        qb.andWhere('(a.teacherId = :meId OR a.evaluatorId = :uid)', { meId: me.id, uid: req.user!.id });
      } else {
        qb.andWhere('a.evaluatorId = :uid', { uid: req.user!.id });
      }
    }

    const data = await qb.getMany();
    return res.json({ data });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getTeacherHistory = async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.params.teacherId;
    const user = req.user!;

    if (!isAppraisalAdmin(user)) {
      const me = await getTeacherForUser(user);
      if (!me || me.id !== teacherId) {
        return forbid(res, 'You can only view your own appraisal history');
      }
    }

    const cycles = await AppDataSource.getRepository(AppraisalCycle).find({
      order: { startDate: 'DESC' },
    });
    const summaries = [];
    for (const cycle of cycles) {
      const summary = await buildTeacherCycleSummary(teacherId, cycle.id);
      if (summary) summaries.push(summary);
    }

    const teacher = await AppDataSource.getRepository(Teacher).findOne({ where: { id: teacherId } });
    return res.json({ teacher, summaries });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getTeacherCycleSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { teacherId, cycleId } = req.params;
    if (!isAppraisalAdmin(req.user!)) {
      const me = await getTeacherForUser(req.user!);
      if (!me || me.id !== teacherId) return forbid(res);
    }
    const summary = await buildTeacherCycleSummary(teacherId, cycleId);
    if (!summary) return res.status(404).json({ message: 'Not found' });
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Goals ──────────────────────────────────────────────────────────────

export const listGoals = async (req: AuthRequest, res: Response) => {
  try {
    const { teacherId, cycleId } = req.query as Record<string, string>;
    const qb = AppDataSource.getRepository(AppraisalGoal)
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.cycle', 'cycle')
      .leftJoinAndSelect('g.followUpCycle', 'followUpCycle')
      .leftJoinAndSelect('g.teacher', 'teacher')
      .orderBy('g.updatedAt', 'DESC');
    if (teacherId) qb.andWhere('g.teacherId = :teacherId', { teacherId });
    if (cycleId) qb.andWhere('g.cycleId = :cycleId', { cycleId });

    if (!isAppraisalAdmin(req.user!)) {
      const me = await getTeacherForUser(req.user!);
      if (!me) return forbid(res);
      qb.andWhere('g.teacherId = :meId', { meId: me.id });
    }

    return res.json({ data: await qb.getMany() });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const upsertGoal = async (req: AuthRequest, res: Response) => {
  try {
    const { id, teacherId, cycleId, description, status, followUpCycleId } = req.body || {};
    if (!teacherId || !cycleId || !description?.trim()) {
      return badRequest(res, 'teacherId, cycleId and description are required');
    }

    if (!isAppraisalAdmin(req.user!)) {
      const me = await getTeacherForUser(req.user!);
      if (!me || me.id !== teacherId) return forbid(res, 'You can only manage your own goals');
    }

    const repo = AppDataSource.getRepository(AppraisalGoal);
    let goal = id ? await repo.findOne({ where: { id } }) : null;
    if (!goal) {
      goal = repo.create({
        teacherId,
        cycleId,
        description: String(description).trim(),
        status: Object.values(AppraisalGoalStatus).includes(status) ? status : AppraisalGoalStatus.OPEN,
        followUpCycleId: followUpCycleId || null,
      });
    } else {
      goal.description = String(description).trim();
      if (status && Object.values(AppraisalGoalStatus).includes(status)) goal.status = status;
      if (followUpCycleId !== undefined) goal.followUpCycleId = followUpCycleId || null;
    }
    return res.json(await repo.save(goal));
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const deleteGoal = async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(AppraisalGoal);
    const goal = await repo.findOne({ where: { id: req.params.id } });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    if (!isAppraisalAdmin(req.user!)) {
      const me = await getTeacherForUser(req.user!);
      if (!me || me.id !== goal.teacherId) return forbid(res);
    }
    await repo.remove(goal);
    return res.json({ message: 'Goal deleted' });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── Dashboard / aggregation ────────────────────────────────────────────

export const getDashboard = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAppraisalAdmin(req.user!)) return forbid(res);
    const cycleId = String(req.query.cycleId || '');
    const cycleRepo = AppDataSource.getRepository(AppraisalCycle);
    const cycle = cycleId
      ? await cycleRepo.findOne({ where: { id: cycleId } })
      : await cycleRepo.findOne({ where: { status: AppraisalCycleStatus.ACTIVE }, order: { startDate: 'DESC' } });

    const teachers = await AppDataSource.getRepository(Teacher).find({
      where: { isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    if (!cycle) {
      return res.json({ cycle: null, teachers: [], completion: [], aggregates: null });
    }

    const appraisals = await AppDataSource.getRepository(Appraisal).find({
      where: { cycleId: cycle.id },
    });

    const completion = teachers.map((t) => {
      const mine = appraisals.filter((a) => a.teacherId === t.id);
      const sources: Record<string, number> = {};
      for (const s of Object.values(AppraisalSourceType)) {
        sources[s] = mine.filter(
          (a) =>
            a.sourceType === s &&
            (a.status === AppraisalStatus.SUBMITTED ||
              a.status === AppraisalStatus.REVIEWED ||
              a.status === AppraisalStatus.FINALIZED)
        ).length;
      }
      return {
        teacherId: t.id,
        teacherName: `${t.firstName} ${t.lastName}`.trim(),
        teacherCode: t.teacherId,
        sources,
        hasSelf: sources.self > 0,
        hasSupervisor: sources.supervisor > 0,
      };
    });

    const byCriterion: Record<string, { name: string; avg: number; count: number }> = {};
    const withScores = await AppDataSource.getRepository(Appraisal).find({
      where: { cycleId: cycle.id },
      relations: ['scores', 'scores.criterion'],
    });
    for (const a of withScores) {
      if (![AppraisalStatus.SUBMITTED, AppraisalStatus.REVIEWED, AppraisalStatus.FINALIZED].includes(a.status)) {
        continue;
      }
      for (const s of a.scores || []) {
        const key = s.criterionId;
        if (!byCriterion[key]) {
          byCriterion[key] = { name: s.criterion?.name || 'Criterion', avg: 0, count: 0 };
        }
        byCriterion[key].avg += Number(s.score);
        byCriterion[key].count += 1;
      }
    }
    const criterionAverages = Object.entries(byCriterion).map(([id, v]) => ({
      criterionId: id,
      name: v.name,
      average: v.count ? Math.round((v.avg / v.count) * 100) / 100 : null,
      responses: v.count,
    }));

    const bySourceType: Record<string, { count: number; avg: number }> = {};
    for (const a of withScores) {
      if (a.overallScore == null) continue;
      if (![AppraisalStatus.SUBMITTED, AppraisalStatus.REVIEWED, AppraisalStatus.FINALIZED].includes(a.status)) {
        continue;
      }
      if (!bySourceType[a.sourceType]) bySourceType[a.sourceType] = { count: 0, avg: 0 };
      bySourceType[a.sourceType].avg += Number(a.overallScore);
      bySourceType[a.sourceType].count += 1;
    }
    const sourceAverages = Object.entries(bySourceType).map(([source, v]) => ({
      source,
      average: v.count ? Math.round((v.avg / v.count) * 100) / 100 : null,
      count: v.count,
    }));

    return res.json({
      cycle: { ...cycle, resolvedWeights: resolveSourceWeights(cycle) },
      teachers,
      completion,
      aggregates: { criterionAverages, sourceAverages },
    });
  } catch (err: any) {
    console.error('getDashboard', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const listTeachersForFeedback = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const where: any = { isActive: true };

    // Parents and students only see teachers attached to their own / their children's classes
    if (isPortalFeedbackUser(user) && !isAppraisalAdmin(user)) {
      const allowed = await getAllowedFeedbackTeacherIds(user);
      if (!allowed.length) return res.json({ data: [] });
      where.id = In(allowed);
    }

    const teachers = await AppDataSource.getRepository(Teacher).find({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
      select: ['id', 'firstName', 'lastName', 'teacherId'],
    });
    return res.json({ data: teachers });
  } catch (err: any) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PDF reports ────────────────────────────────────────────────────────

export const exportTeacherPdf = async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.params.teacherId;
    const cycleId = String(req.query.cycleId || '');
    if (!cycleId) return badRequest(res, 'cycleId is required');

    if (!isAppraisalAdmin(req.user!)) {
      const me = await getTeacherForUser(req.user!);
      if (!me || me.id !== teacherId) return forbid(res);
    }

    const summary = await buildTeacherCycleSummary(teacherId, cycleId);
    if (!summary) return res.status(404).json({ message: 'Not found' });
    const teacher = await AppDataSource.getRepository(Teacher).findOne({ where: { id: teacherId } });
    const settings = await AppDataSource.getRepository(Settings)
      .find({ take: 1, order: { createdAt: 'ASC' } })
      .then((r) => r[0] || null);

    const buffer = await createTeacherAppraisalPdf({ teacher, summary, settings });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="teacher_appraisal_${(teacher?.teacherId || teacherId).replace(/\s+/g, '_')}.pdf"`
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('exportTeacherPdf', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const exportDepartmentPdf = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAppraisalAdmin(req.user!)) return forbid(res);
    const cycleId = String(req.query.cycleId || '');
    if (!cycleId) return badRequest(res, 'cycleId is required');

    const cycle = await AppDataSource.getRepository(AppraisalCycle).findOne({ where: { id: cycleId } });
    if (!cycle) return res.status(404).json({ message: 'Cycle not found' });

    const teachers = await AppDataSource.getRepository(Teacher).find({
      where: { isActive: true },
      order: { lastName: 'ASC' },
    });
    const rows = [];
    for (const t of teachers) {
      const summary = await buildTeacherCycleSummary(t.id, cycleId);
      rows.push({
        teacher: t,
        compositeScore: summary?.compositeScore ?? null,
        bySource: summary?.bySource || {},
      });
    }

    const settings = await AppDataSource.getRepository(Settings)
      .find({ take: 1, order: { createdAt: 'ASC' } })
      .then((r) => r[0] || null);

    const buffer = await createDepartmentAppraisalPdf({ cycle, rows, settings });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="appraisal_summary_${cycle.name.replace(/\s+/g, '_')}.pdf"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('exportDepartmentPdf', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
