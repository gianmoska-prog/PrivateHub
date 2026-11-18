-- Older projects can automatically grant service_role broader table privileges.
revoke truncate, references, trigger on public.user_profiles from service_role;
