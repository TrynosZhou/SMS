import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLicenseSystem1778000000000 implements MigrationInterface {
  name = 'CreateLicenseSystem1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "code" character varying(64),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schools" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_schools_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "features" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "featureKey" character varying(128) NOT NULL,
        "displayName" character varying(255) NOT NULL,
        "description" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_features" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_features_featureKey" UNIQUE ("featureKey")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "license_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tierName" character varying(32) NOT NULL,
        "displayName" character varying(64) NOT NULL,
        "description" text,
        CONSTRAINT "PK_license_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_license_tiers_tierName" UNIQUE ("tierName")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tier_features" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tierId" uuid NOT NULL,
        "featureId" uuid NOT NULL,
        "grantedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "grantedBy" uuid,
        CONSTRAINT "PK_tier_features" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tier_features_tier_feature" UNIQUE ("tierId", "featureId"),
        CONSTRAINT "FK_tier_features_tier" FOREIGN KEY ("tierId") REFERENCES "license_tiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tier_features_feature" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tier_features_grantedBy" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tier_features_tierId" ON "tier_features" ("tierId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tier_features_featureId" ON "tier_features" ("featureId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "licenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "schoolId" uuid NOT NULL,
        "tierId" uuid NOT NULL,
        "validFrom" date NOT NULL,
        "validUntil" date,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_licenses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_licenses_school" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_licenses_tier" FOREIGN KEY ("tierId") REFERENCES "license_tiers"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_licenses_school_active" ON "licenses" ("schoolId", "isActive")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "license_feature_audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "action" character varying(64) NOT NULL,
        "tierId" uuid,
        "featureId" uuid,
        "performedBy" uuid,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_license_feature_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "FK_license_audit_tier" FOREIGN KEY ("tierId") REFERENCES "license_tiers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_license_audit_feature" FOREIGN KEY ("featureId") REFERENCES "features"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_license_audit_user" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_license_audit_createdAt" ON "license_feature_audit_log" ("createdAt" DESC)`
    );

    // Tier definitions only — feature assignments are managed exclusively via admin panel.
    await queryRunner.query(`
      INSERT INTO "license_tiers" ("tierName", "displayName", "description")
      VALUES
        ('gold', 'Gold', 'Basic plan'),
        ('bronze', 'Bronze', 'Standard plan'),
        ('platinum', 'Platinum', 'Full access plan')
      ON CONFLICT ("tierName") DO NOTHING
    `);

    // Default school for single-tenant deployments (name from settings when available).
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

    // Active license for the default school (Platinum — preserves access during rollout).
    await queryRunner.query(`
      INSERT INTO "licenses" ("schoolId", "tierId", "validFrom", "validUntil", "isActive")
      SELECT s."id", t."id", CURRENT_DATE, NULL, true
      FROM "schools" s
      CROSS JOIN "license_tiers" t
      WHERE s."code" = 'default' AND t."tierName" = 'platinum'
        AND NOT EXISTS (SELECT 1 FROM "licenses" l WHERE l."schoolId" = s."id" AND l."isActive" = true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "license_feature_audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "licenses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tier_features"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "license_tiers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "features"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schools"`);
  }
}
