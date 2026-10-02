ALTER TABLE "agent_runs" ADD COLUMN "agent_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "org_version" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "versions" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "name_ar" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "role_ar" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "description_ar" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "payload_routes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "responsibility_ar" text;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "planned_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "evidence" jsonb;