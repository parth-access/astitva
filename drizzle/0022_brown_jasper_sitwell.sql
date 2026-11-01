CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_created_idx" ON "email_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_idx" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_events_created_idx" ON "order_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_events_created_idx" ON "payment_events" USING btree ("created_at");