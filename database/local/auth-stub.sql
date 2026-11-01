-- SOMENTE PARA DESENVOLVIMENTO/TESTES LOCAIS (PostgreSQL sem Supabase).
-- Simula a tabela auth.users do Supabase Auth para que as FKs de `usuarios` funcionem.
-- NÃO executar no Supabase.
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  encrypted_password text,
  created_at         timestamptz not null default now()
);
