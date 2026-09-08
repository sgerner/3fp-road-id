-- These SECURITY DEFINER PostGIS helpers are not part of the application's
-- client-facing API. Keep them available to trusted server roles only.
revoke all on function public.st_estimatedextent(text, text)
	from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text)
	from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text, boolean)
	from public, anon, authenticated;
