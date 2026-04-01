create index if not exists policies_category_idx on policies.policies(category);
create index if not exists priorities_policy_bucket_idx on policies.priorities(policy_id, bucket);;
