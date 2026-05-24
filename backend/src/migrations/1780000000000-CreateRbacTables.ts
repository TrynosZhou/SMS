import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRbacTables1780000000000 implements MigrationInterface {
  name = 'CreateRbacTables1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "description" text,
        "isSystem" boolean NOT NULL DEFAULT false,
        "legacyRoleKey" character varying(64),
        "permissions" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_rbac_roles_name" UNIQUE ("name"),
        CONSTRAINT "UQ_rbac_roles_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_rbac_roles" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_rbac_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "roleId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_rbac_roles_user_role" UNIQUE ("userId", "roleId"),
        CONSTRAINT "PK_user_rbac_roles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_rbac_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_rbac_roles_role" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_rbac_roles_userId" ON "user_rbac_roles" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_rbac_roles_roleId" ON "user_rbac_roles" ("roleId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_rbac_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_roles"`);
  }
}
