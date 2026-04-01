create index if not exists policies_category_idx on policies.policies(category);
create index if not exists priorities_policy_bucket_idx on policies.priorities(policy_id, bucket);

create or replace view policies.policy_popularity as
select
  p.id as policy_id,
  count(case when pr.bucket = 2 then 1 end) as immediate_count,
  count(case when pr.bucket = 1 then 1 end) as next_count,
  coalesce(count(case when pr.bucket = 2 then 1 end),0) * 2
  + coalesce(count(case when pr.bucket = 1 then 1 end),0) as popularity_score
from policies.policies p
left join policies.priorities pr on pr.policy_id = p.id
group by p.id;

create or replace view policies.policy_with_popularity as
select
  p.*,
  coalesce(pp.immediate_count,0) as immediate_count,
  coalesce(pp.next_count,0) as next_count,
  coalesce(pp.popularity_score,0) as popularity_score
from policies.policies p
left join policies.policy_popularity pp on pp.policy_id = p.id;;
