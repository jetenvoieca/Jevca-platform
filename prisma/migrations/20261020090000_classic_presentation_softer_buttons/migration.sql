-- Classic's buttons a little softer (2026-10-20, Craig's request): each
-- colour is changed only if it's still the original, so any colour
-- already chosen in the editor is kept.
UPDATE "PresentationTemplate" SET "settings" = jsonb_set("settings", '{colours,purchaseBackground}', '"#e48aa5"')
WHERE "id" = 'presentation_template_classic' AND "settings"->'colours'->>'purchaseBackground' = '#dc7090';
UPDATE "PresentationTemplate" SET "settings" = jsonb_set("settings", '{colours,instalmentsBackground}', '"#f7e1e8"')
WHERE "id" = 'presentation_template_classic' AND "settings"->'colours'->>'instalmentsBackground' = '#f3d3de';
UPDATE "PresentationTemplate" SET "settings" = jsonb_set("settings", '{colours,instalmentsText}', '"#d77d99"')
WHERE "id" = 'presentation_template_classic' AND "settings"->'colours'->>'instalmentsText' = '#dc7090';
UPDATE "PresentationTemplate" SET "settings" = jsonb_set("settings", '{colours,enquireBackground}', '"#3b3735"')
WHERE "id" = 'presentation_template_classic' AND "settings"->'colours'->>'enquireBackground' = '#1a1716';
