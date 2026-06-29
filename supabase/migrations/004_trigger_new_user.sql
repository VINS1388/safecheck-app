-- ============================================================
-- SafeCheck — Trigger auto-insert profilo utente
-- Crea automaticamente una riga in public.utenti quando viene
-- creato un nuovo utente in auth.users.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.utenti (id, email, nome_completo, ruolo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo',
             SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(
      (NEW.raw_user_meta_data->>'ruolo')::ruolo_utente,
      'specialist'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
