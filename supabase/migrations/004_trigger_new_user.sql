-- ============================================================
-- SafeCheck — Trigger auto-insert profilo utente
-- Crea automaticamente una riga in public.utenti quando viene
-- creato un nuovo utente in auth.users.
--
-- Nota: SECURITY DEFINER + SET search_path = '' (best practice
-- Supabase). Tutti i riferimenti sono schema-qualificati, incluso
-- il tipo public.ruolo_utente, altrimenti il ruolo supabase_auth_admin
-- non risolverebbe il tipo durante l'INSERT in auth.users e il
-- trigger fallirebbe ("Database error creating new user").
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.utenti (id, email, nome_completo, ruolo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo',
             SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(
      (NEW.raw_user_meta_data->>'ruolo')::public.ruolo_utente,
      'specialist'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
