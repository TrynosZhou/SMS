import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatbotTables1789000000000 implements MigrationInterface {
  name = 'CreateChatbotTables1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chatbot_faqs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question" character varying(500) NOT NULL,
        "answer" text NOT NULL,
        "keywords" text,
        "category" character varying(100) NOT NULL DEFAULT 'general',
        "audience" character varying(200) NOT NULL DEFAULT 'all',
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chatbot_faqs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_faqs_active_cat" ON "chatbot_faqs" ("isActive", "category")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_faqs_audience" ON "chatbot_faqs" ("audience")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chatbot_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid,
        "sessionId" character varying(100) NOT NULL,
        "userRole" character varying(50),
        "clientIp" character varying(64),
        "lastUserMessage" character varying(500),
        "messageCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chatbot_conversations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_conversations_user" ON "chatbot_conversations" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_conversations_session" ON "chatbot_conversations" ("sessionId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_conversations_created" ON "chatbot_conversations" ("createdAt")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chatbot_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversationId" uuid NOT NULL,
        "role" character varying(20) NOT NULL,
        "content" text NOT NULL,
        "fromCache" boolean NOT NULL DEFAULT false,
        "promptTokens" integer,
        "completionTokens" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chatbot_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chatbot_messages_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_messages_conv_created" ON "chatbot_messages" ("conversationId", "createdAt")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chatbot_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversationId" uuid,
        "userId" uuid,
        "userRole" character varying(50),
        "subject" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "contactEmail" character varying(255),
        "contactPhone" character varying(50),
        "status" character varying(30) NOT NULL DEFAULT 'open',
        "adminNotes" text,
        "resolvedByUserId" uuid,
        "resolvedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chatbot_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chatbot_tickets_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "chatbot_conversations"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_tickets_status_created" ON "chatbot_tickets" ("status", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_chatbot_tickets_user" ON "chatbot_tickets" ("userId")`
    );

    // Seed default FAQs (idempotent: only if table empty)
    const countRows = await queryRunner.query(`SELECT COUNT(*)::int AS c FROM "chatbot_faqs"`);
    const count = Number(countRows?.[0]?.c || 0);
    if (count === 0) {
      await queryRunner.query(`
        INSERT INTO "chatbot_faqs" ("question", "answer", "keywords", "category", "audience", "sortOrder") VALUES
        (
          'How do I apply for admission?',
          'On the login page, click "Apply for admission online" or open Admissions from your portal after signing in. Fill in the application form, upload required documents (birth certificate and recent report card), then submit. You can track status under Admissions → Application Status.',
          'admission apply enrol enroll application documents',
          'admissions',
          'all,public,applicant,parent',
          10
        ),
        (
          'What documents are required for admission?',
          'Typically you need: (1) birth certificate, (2) most recent school report card, and optionally an ID photo or medical form if requested. Files must be PDF or images (JPEG/PNG/WebP) under 5MB each.',
          'admission documents birth certificate report card upload',
          'admissions',
          'all,public,applicant,parent',
          20
        ),
        (
          'How do I check my fee balance or invoices?',
          'Parents: open Parent Portal → Invoice Statement. Students: open Student Portal → Invoice Statement. Staff with finance access use Balance Enquiry or Student Ledgers under Finance.',
          'fees invoice balance payment outstanding statement',
          'fees',
          'all,parent,student,accountant,admin',
          30
        ),
        (
          'How do I view report cards or results?',
          'Students: Student Portal → Report Card. Parents: Parent Portal → Results / Student Portal. Teachers and admins use Report Cards and Enter Marks under the Exams section (permissions required).',
          'report card results marks exams grades',
          'reports',
          'all,student,parent,teacher,admin',
          40
        ),
        (
          'How do I reset my password?',
          'On the login page, open Sign In and use Forgot Password. Choose your role (Parent, Teacher, or Student), verify identity with the details requested, then set a new password. After login you can also change your password under Manage Account / Change Password.',
          'password reset forgot login account',
          'account',
          'all,public,parent,student,teacher',
          50
        ),
        (
          'How do parents link to their children?',
          'After signing in as a parent, go to Link Students in the Parent Portal and follow the linking steps provided by the school (student ID / verification details as configured).',
          'parent link children students portal',
          'account',
          'parent,admin',
          60
        ),
        (
          'How do I contact the school or send a message?',
          'Parents can send messages from Parent Portal → Send Message and review Inbox/Outbox. Staff use the Messages section (Inbox, Incoming from Parents, Outgoing). For admissions follow-ups, use the Admissions portal or escalate via Helpdesk if needed.',
          'contact message inbox email support',
          'general',
          'all,parent,teacher,admin,accountant',
          70
        ),
        (
          'What can the helpdesk chatbot help with?',
          'I can answer FAQs about admissions, fees, report cards, passwords, and how to navigate this School Management System. I cannot share another student''s private records. If I cannot resolve your issue, ask to escalate to human support and a ticket will be created for administrators.',
          'help chatbot helpdesk support escalate ticket',
          'general',
          'all,public',
          5
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chatbot_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chatbot_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chatbot_conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chatbot_faqs"`);
  }
}
