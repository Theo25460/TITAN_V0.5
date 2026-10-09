-- Pin the private card serializer to built-ins, independently of the caller's search_path.
-- Keep its body, signature, invoker mode, volatility and existing grants unchanged.
-- No user row is rewritten. Rollback of this setting only: ALTER FUNCTION ... RESET search_path.
alter function private.titan_card_settings_json(public.titan_public_cards) set search_path = '';
