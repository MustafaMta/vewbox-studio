ALTER TABLE "agent_runs" ADD COLUMN "parent_run_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "purpose" text;--> statement-breakpoint
CREATE INDEX "agent_runs_parent_idx" ON "agent_runs" USING btree ("parent_run_id");