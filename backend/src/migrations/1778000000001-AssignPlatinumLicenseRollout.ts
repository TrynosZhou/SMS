import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Non-destructive rollout: assign every school an active Platinum license and
 * grant standard feature keys to the Platinum tier (no ALTER on existing tables).
 */
export class AssignPlatinumLicenseRollout1778000000001 implements MigrationInterface {
  name = 'AssignPlatinumLicenseRollout1778000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const featureKeys: Array<[string, string]> = [
      ['fee_management', 'Fee Management'],
      ['student_management', 'Student Management'],
      ['teacher_management', 'Teacher Management'],
      ['class_management', 'Class Management'],
      ['subject_management', 'Subject Management'],
      ['exam_management', 'Exam Management'],
      ['attendance_management', 'Attendance Management'],
      ['settings_management', 'Settings Management'],
      ['inventory_management', 'Inventory Management'],
      ['timetable_management', 'Timetable Management'],
      ['elearning', 'E-Learning'],
      ['promotion_rules', 'Promotion Rules'],
      ['payroll_management', 'Payroll Management'],
      ['record_book', 'Record Book'],
      ['messaging', 'Messaging'],
      ['news_management', 'News Management'],
      ['audit_logs', 'Audit Logs']
    ];

    for (const [key, label] of featureKeys) {
      await queryRunner.query(
        `
        INSERT INTO "features" ("featureKey", "displayName", "isActive")
        VALUES ($1, $2, true)
        ON CONFLICT ("featureKey") DO NOTHING
        `,
        [key, label]
      );
    }

    await queryRunner.query(`
      INSERT INTO "schools" ("name", "code", "isActive")
      SELECT COALESCE(NULLIF(TRIM(s."schoolName"), ''), 'Default School'), 'default', true
      FROM "settings" s
      ORDER BY s."createdAt" DESC
      LIMIT 1
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "schools" ("name", "code", "isActive")
      SELECT 'Default School', 'default', true
      WHERE NOT EXISTS (SELECT 1 FROM "schools" WHERE "code" = 'default')
    `);

    await queryRunner.query(`
      INSERT INTO "licenses" ("schoolId", "tierId", "validFrom", "validUntil", "isActive")
      SELECT s."id", t."id", CURRENT_DATE, NULL, true
      FROM "schools" s
      CROSS JOIN "license_tiers" t
      WHERE t."tierName" = 'platinum'
        AND NOT EXISTS (
          SELECT 1 FROM "licenses" l
          WHERE l."schoolId" = s."id" AND l."isActive" = true
        )
    `);

    await queryRunner.query(`
      UPDATE "licenses" l
      SET "tierId" = t."id"
      FROM "license_tiers" t
      WHERE t."tierName" = 'platinum'
        AND l."isActive" = true
        AND l."tierId" <> t."id"
    `);

    await queryRunner.query(`
      INSERT INTO "tier_features" ("tierId", "featureId")
      SELECT t."id", f."id"
      FROM "license_tiers" t
      CROSS JOIN "features" f
      WHERE t."tierName" = 'platinum' AND f."isActive" = true
      ON CONFLICT ("tierId", "featureId") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "tier_features" tf
      USING "license_tiers" t
      WHERE tf."tierId" = t."id" AND t."tierName" = 'platinum'
    `);
  }
}
