CREATE OR REPLACE FUNCTION summary_tsv_refresh() RETURNS trigger AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS summary_tsv_refresh_trg ON "Summary";
CREATE TRIGGER summary_tsv_refresh_trg
BEFORE INSERT OR UPDATE OF text ON "Summary"
FOR EACH ROW EXECUTE FUNCTION summary_tsv_refresh();
