import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherAppraisalTables1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appraisal_cycles_status_enum" AS ENUM ('draft', 'active', 'closed');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appraisals_sourcetype_enum" AS ENUM ('self', 'supervisor', 'peer', 'student', 'parent');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appraisals_status_enum" AS ENUM ('pending', 'submitted', 'reviewed', 'finalized');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appraisal_goals_status_enum" AS ENUM ('open', 'in-progress', 'achieved', 'missed');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_cycles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "status" "appraisal_cycles_status_enum" NOT NULL DEFAULT 'draft',
        "sourceWeights" jsonb,
        "createdById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_cycles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appraisal_cycles_createdBy" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_criteria" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(160) NOT NULL,
        "description" text,
        "weight" numeric(8,2) NOT NULL DEFAULT 1,
        "scaleMin" int NOT NULL DEFAULT 1,
        "scaleMax" int NOT NULL DEFAULT 5,
        "sortOrder" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_criteria" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appraisal_criteria_isActive" ON "appraisal_criteria" ("isActive")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "teacherId" uuid NOT NULL,
        "cycleId" uuid NOT NULL,
        "evaluatorId" uuid,
        "sourceType" "appraisals_sourcetype_enum" NOT NULL,
        "status" "appraisals_status_enum" NOT NULL DEFAULT 'pending',
        "overallScore" numeric(8,2),
        "comments" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appraisals_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appraisals_cycle" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appraisals_evaluator" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_appraisals_teacher_cycle_source_evaluator"
       ON "appraisals" ("teacherId", "cycleId", "sourceType", COALESCE("evaluatorId", '00000000-0000-0000-0000-000000000000'))`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appraisals_teacher_cycle" ON "appraisals" ("teacherId", "cycleId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appraisals_cycle_source" ON "appraisals" ("cycleId", "sourceType")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_scores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "appraisalId" uuid NOT NULL,
        "criterionId" uuid NOT NULL,
        "score" numeric(8,2) NOT NULL,
        "comment" text,
        CONSTRAINT "PK_appraisal_scores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_appraisal_scores_appraisal_criterion" UNIQUE ("appraisalId", "criterionId"),
        CONSTRAINT "FK_appraisal_scores_appraisal" FOREIGN KEY ("appraisalId") REFERENCES "appraisals"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appraisal_scores_criterion" FOREIGN KEY ("criterionId") REFERENCES "appraisal_criteria"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appraisal_scores_appraisal" ON "appraisal_scores" ("appraisalId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_goals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "teacherId" uuid NOT NULL,
        "cycleId" uuid NOT NULL,
        "description" text NOT NULL,
        "status" "appraisal_goals_status_enum" NOT NULL DEFAULT 'open',
        "followUpCycleId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_goals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appraisal_goals_teacher" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appraisal_goals_cycle" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appraisal_goals_followUp" FOREIGN KEY ("followUpCycleId") REFERENCES "appraisal_cycles"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_appraisal_goals_teacher_cycle" ON "appraisal_goals" ("teacherId", "cycleId")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appraisal_peer_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cycleId" uuid NOT NULL,
        "evaluatorTeacherId" uuid NOT NULL,
        "targetTeacherId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appraisal_peer_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_peer_cycle_evaluator_target" UNIQUE ("cycleId", "evaluatorTeacherId", "targetTeacherId"),
        CONSTRAINT "FK_peer_cycle" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_peer_evaluator" FOREIGN KEY ("evaluatorTeacherId") REFERENCES "teachers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_peer_target" FOREIGN KEY ("targetTeacherId") REFERENCES "teachers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_peer_cycle_evaluator" ON "appraisal_peer_assignments" ("cycleId", "evaluatorTeacherId")`
    );

    // Seed a starter criteria set if empty
    await queryRunner.query(`
      INSERT INTO "appraisal_criteria" ("name", "description", "weight", "scaleMin", "scaleMax", "sortOrder", "isActive")
      SELECT * FROM (VALUES
        ('Instructional delivery', 'Clarity, pacing, and engagement in lessons', 2, 1, 5, 1, true),
        ('Classroom management', 'Order, routines, and positive learning climate', 2, 1, 5, 2, true),
        ('Assessment & feedback', 'Fair assessment and timely constructive feedback', 1.5, 1, 5, 3, true),
        ('Professionalism', 'Punctuality, collaboration, and professional conduct', 1.5, 1, 5, 4, true),
        ('Learner support', 'Support for diverse learner needs', 1.5, 1, 5, 5, true),
        ('Record keeping', 'Accurate and up-to-date academic records', 1, 1, 5, 6, true)
      ) AS v(name, description, weight, scaleMin, scaleMax, sortOrder, isActive)
      WHERE NOT EXISTS (SELECT 1 FROM "appraisal_criteria" LIMIT 1)
    `);

    // Seed a sample active cycle covering the current calendar year if none exists
    await queryRunner.query(`
      INSERT INTO "appraisal_cycles" ("name", "startDate", "endDate", "status", "sourceWeights")
      SELECT
        CONCAT(EXTRACT(YEAR FROM CURRENT_DATE)::text, ' Annual Appraisal'),
        DATE_TRUNC('year', CURRENT_DATE)::date,
        (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::date,
        'active'::"appraisal_cycles_status_enum",
        '{"self":20,"supervisor":40,"peer":20,"student":10,"parent":10}'::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM "appraisal_cycles" LIMIT 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_peer_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_goals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_scores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_criteria"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appraisal_cycles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appraisal_goals_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appraisals_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appraisals_sourcetype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appraisal_cycles_status_enum"`);
  }
}
