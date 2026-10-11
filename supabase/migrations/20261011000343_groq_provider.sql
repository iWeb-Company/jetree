-- Groq uses the existing encrypted API credential and explicit selection flow.
alter type public.provider_name add value if not exists 'groq';
