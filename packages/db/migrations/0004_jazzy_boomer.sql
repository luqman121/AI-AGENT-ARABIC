CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"kind" text DEFAULT 'file' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_name" text NOT NULL,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "message_attachments_id_workspace_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "message_attachments_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "message_attachments_kind_check" CHECK ("message_attachments"."kind" in ('file', 'voice')),
	CONSTRAINT "message_attachments_status_check" CHECK ("message_attachments"."status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "message_attachments_name_length_check" CHECK (char_length(btrim("message_attachments"."original_name")) between 1 and 255),
	CONSTRAINT "message_attachments_media_type_length_check" CHECK (char_length(btrim("message_attachments"."media_type")) between 1 and 127),
	CONSTRAINT "message_attachments_size_check" CHECK ("message_attachments"."size_bytes" between 1 and 10485760),
	CONSTRAINT "message_attachments_checksum_check" CHECK ("message_attachments"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "message_attachments_duration_check" CHECK ("message_attachments"."duration_ms" is null or "message_attachments"."duration_ms" between 0 and 600000),
	CONSTRAINT "message_attachments_state_check" CHECK (("message_attachments"."status" = 'ready' and "message_attachments"."ready_at" is not null) or ("message_attachments"."status" <> 'ready' and "message_attachments"."ready_at" is null))
);
--> statement-breakpoint
CREATE TABLE "run_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_tasks_run_position_unique" UNIQUE("run_id","position"),
	CONSTRAINT "run_tasks_run_key_unique" UNIQUE("run_id","key"),
	CONSTRAINT "run_tasks_position_check" CHECK ("run_tasks"."position" >= 0),
	CONSTRAINT "run_tasks_status_check" CHECK ("run_tasks"."status" in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "run_tasks_progress_check" CHECK ("run_tasks"."progress_percent" between 0 and 100),
	CONSTRAINT "run_tasks_label_length_check" CHECK (char_length(btrim("run_tasks"."label")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_run_unique";--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_kind_check";--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "title" text DEFAULT 'نتيجة المشروع' NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "file_name" text DEFAULT 'wakil-result.zip' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "client_message_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "output_kind" text DEFAULT 'static_site' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_project_workspace_fk" FOREIGN KEY ("project_id","workspace_id") REFERENCES "public"."projects"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_conversation_workspace_fk" FOREIGN KEY ("conversation_id","workspace_id") REFERENCES "public"."conversations"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_workspace_fk" FOREIGN KEY ("message_id","workspace_id") REFERENCES "public"."conversation_messages"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_tasks" ADD CONSTRAINT "run_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_tasks" ADD CONSTRAINT "run_tasks_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachments_workspace_project_created_idx" ON "message_attachments" USING btree ("workspace_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "message_attachments_workspace_message_idx" ON "message_attachments" USING btree ("workspace_id","message_id");--> statement-breakpoint
CREATE INDEX "run_tasks_workspace_run_position_idx" ON "run_tasks" USING btree ("workspace_id","run_id","position");--> statement-breakpoint
CREATE INDEX "artifacts_workspace_run_created_idx" ON "artifacts" USING btree ("workspace_id","run_id","created_at");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_workspace_client_unique" UNIQUE("workspace_id","client_message_id");--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_title_length_check" CHECK (char_length(btrim("artifacts"."title")) between 1 and 200);--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_file_name_length_check" CHECK (char_length(btrim("artifacts"."file_name")) between 1 and 255);--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind" in ('static_site', 'document', 'presentation', 'spreadsheet', 'image'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_output_kind_check" CHECK ("projects"."output_kind" in ('static_site', 'document', 'presentation', 'spreadsheet', 'image'));