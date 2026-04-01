CREATE TABLE IF NOT EXISTS user_emails (
  user_id uuid PRIMARY KEY,
  email text NOT NULL
);

ALTER TABLE user_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_emails_insert ON user_emails;
CREATE POLICY user_emails_insert ON user_emails
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_emails_update ON user_emails;
CREATE POLICY user_emails_update ON user_emails
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_emails_select_anon ON user_emails;
DROP POLICY IF EXISTS user_emails_select_auth ON user_emails;
CREATE POLICY user_emails_select_anon ON user_emails
FOR SELECT TO anon
USING (true);
CREATE POLICY user_emails_select_auth ON user_emails
FOR SELECT TO authenticated
USING (true);
;
