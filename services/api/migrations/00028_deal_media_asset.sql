-- +goose Up
-- A deal photo now names the media library asset it came from. The API only accepts photos that
-- are ready, non-deleted assets of the deal's own merchant (or photos already on the deal), and
-- "is this asset used by a deal?" becomes a key lookup instead of a URL suffix match.
-- Photos that are not library assets (the seeded Unsplash images) keep a NULL asset.
ALTER TABLE deal_media ADD COLUMN media_asset_id uuid REFERENCES merchant_media_assets(id);
CREATE INDEX deal_media_media_asset_id_idx ON deal_media(media_asset_id) WHERE media_asset_id IS NOT NULL;

-- Link photos saved before this migration to the asset of the same merchant whose public URL they use.
UPDATE deal_media dm
SET media_asset_id = a.id
FROM deals d, merchant_media_assets a
WHERE d.id = dm.deal_id
  AND a.merchant_id = d.merchant_id
  AND dm.url LIKE '%/' || a.storage_key;

-- +goose Down
DROP INDEX deal_media_media_asset_id_idx;
ALTER TABLE deal_media DROP COLUMN media_asset_id;
