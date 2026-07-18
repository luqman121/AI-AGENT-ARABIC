ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_messages_role_check";--> statement-breakpoint
ALTER TABLE "run_events" DROP CONSTRAINT "run_events_type_check";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "prompt_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "completion_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "provider_cost_micros" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "provider_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "model_config_key" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "assistant_message_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_id_workspace_unique" UNIQUE("id","workspace_id");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_assistant_message_workspace_fk" FOREIGN KEY ("assistant_message_id","workspace_id") REFERENCES "public"."conversation_messages"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_assistant_message_unique" ON "runs" USING btree ("assistant_message_id") WHERE "runs"."assistant_message_id" is not null;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_role_check" CHECK ("conversation_messages"."role" in ('user', 'assistant'));--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_type_check" CHECK ("run_events"."type" in ('run.queued', 'run.started', 'run.step', 'agent.started', 'assistant.delta', 'assistant.completed', 'agent.refused', 'agent.limit_exceeded', 'run.succeeded', 'run.failed', 'run.cancelled'));
