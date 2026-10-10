-- Reuse the owner-scoped vault, explicit default and execution ledger.
alter type public.provider_name add value if not exists 'freellmapi';
