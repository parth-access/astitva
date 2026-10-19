-- Custom migration. The app assumes exactly one settings row (id = 1).
INSERT INTO "store_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
