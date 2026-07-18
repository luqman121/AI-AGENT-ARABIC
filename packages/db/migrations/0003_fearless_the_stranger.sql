CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"preview_object_key" text NOT NULL,
	"download_object_key" text NOT NULL,
	"preview_media_type" text NOT NULL,
	"download_media_type" text NOT NULL,
	"preview_size_bytes" integer NOT NULL,
	"download_size_bytes" integer NOT NULL,
	"preview_checksum_sha256" text NOT NULL,
	"download_checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "artifacts_run_unique" UNIQUE("run_id"),
	CONSTRAINT "artifacts_preview_object_key_unique" UNIQUE("preview_object_key"),
	CONSTRAINT "artifacts_download_object_key_unique" UNIQUE("download_object_key"),
	CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind" = 'static_site'),
	CONSTRAINT "artifacts_size_check" CHECK ("artifacts"."preview_size_bytes" between 1 and 500000 and "artifacts"."download_size_bytes" between 1 and 2000000),
	CONSTRAINT "artifacts_checksum_check" CHECK ("artifacts"."preview_checksum_sha256" ~ '^[a-f0-9]{64}$' and "artifacts"."download_checksum_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "run_events" DROP CONSTRAINT "run_events_type_check";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "kind" text DEFAULT 'planning' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "sandbox_provider" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "sandbox_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "sandbox_duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_workspace_project_created_idx" ON "artifacts" USING btree ("workspace_id","project_id","created_at");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_parent_run_workspace_fk" FOREIGN KEY ("parent_run_id","workspace_id") REFERENCES "public"."runs"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_type_check" CHECK ("run_events"."type" in ('run.queued', 'run.started', 'run.step', 'agent.started', 'assistant.delta', 'assistant.completed', 'agent.refused', 'agent.limit_exceeded', 'artifact.generating', 'sandbox.created', 'sandbox.validated', 'artifact.uploading', 'artifact.ready', 'run.succeeded', 'run.failed', 'run.cancelled'));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_kind_check" CHECK ("runs"."kind" in ('planning', 'execution'));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_parent_kind_check" CHECK (("runs"."kind" = 'planning' and "runs"."parent_run_id" is null) or ("runs"."kind" = 'execution' and "runs"."parent_run_id" is not null));