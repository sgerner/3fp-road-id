-- The application action verifies the submitter, checks selected opportunities
-- and applies abuse controls before submitting through service_role.
drop policy if exists get_involved_interest_submissions_insert
  on public.get_involved_interest_submissions;

revoke insert on table public.get_involved_interest_submissions
  from public, anon, authenticated;

-- Feedback uses the same server boundary for body limits and rate limits.
drop policy if exists learn_article_feedback_events_insert_public
  on public.learn_article_feedback_events;

revoke insert on table public.learn_article_feedback_events
  from public, anon, authenticated;
