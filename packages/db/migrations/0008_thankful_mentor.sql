CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"before_data" jsonb,
	"after_data" jsonb,
	"reason" text,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_logs_actor_role_check" CHECK ("admin_audit_logs"."actor_role" in ('support', 'admin')),
	CONSTRAINT "admin_audit_logs_reason_length_check" CHECK ("admin_audit_logs"."reason" is null or char_length("admin_audit_logs"."reason") <= 500),
	CONSTRAINT "admin_audit_logs_user_agent_length_check" CHECK ("admin_audit_logs"."user_agent" is null or char_length("admin_audit_logs"."user_agent") <= 500)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_cost_limit_micros" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_created_idx" ON "admin_audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_created_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_status_created_idx" ON "projects" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "runs_status_created_idx" ON "runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_created_by_created_idx" ON "runs" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'support', 'admin'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_check" CHECK ("users"."plan" in ('free', 'pro', 'business'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cost_limit_check" CHECK ("users"."monthly_cost_limit_micros" is null or "users"."monthly_cost_limit_micros" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_state_check" CHECK (("users"."status" = 'suspended' and "users"."suspended_at" is not null) or ("users"."status" = 'active' and "users"."suspended_at" is null));