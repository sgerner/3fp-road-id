CREATE VIEW v_volunteer_event_hosts_with_profiles AS
SELECT
  veh.event_id,
  veh.user_id,
  veh.created_at,
  p.email,
  p.full_name
FROM
  volunteer_event_hosts veh
JOIN
  profiles p ON veh.user_id = p.user_id;;
