create or replace view policies.policy_with_popularity as
select
  p.*,
  coalesce(pp.immediate_count,0) as immediate_count,
  coalesce(pp.next_count,0) as next_count,
  coalesce(pp.popularity_score,0) as popularity_score
from policies.policies p
left join policies.policy_popularity pp on pp.policy_id = p.id;;
