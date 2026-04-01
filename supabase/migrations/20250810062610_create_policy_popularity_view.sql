create or replace view policies.policy_popularity as
select
  p.id as policy_id,
  count(case when pr.bucket = 2 then 1 end) as immediate_count,
  count(case when pr.bucket = 1 then 1 end) as next_count,
  coalesce(count(case when pr.bucket = 2 then 1 end),0) * 2
  + coalesce(count(case when pr.bucket = 1 then 1 end),0) as popularity_score
from policies.policies p
left join policies.priorities pr on pr.policy_id = p.id
group by p.id;;
