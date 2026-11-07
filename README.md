# Glico | Área profissional

Painel profissional em React + Vite para cadastro e autenticação de profissionais de saúde, com acompanhamento de pacientes, curva glicêmica, registros alimentares e orientações de medicamentos no Supabase.

## Configuração local

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto Supabase.
3. Execute `supabase/schema.sql` no SQL Editor do Supabase.
4. Em Authentication > Providers, habilite Phone e configure um provedor de SMS. Ative a confirmação de telefone; sem ela, o cadastro não exige o código SMS.
5. Em Authentication > URL Configuration, configure a URL local `http://localhost:5173` como Site URL e permita o redirecionamento de confirmação de e-mail para `http://localhost:5173/painel`.
6. Inicie com `npm run dev`.

O cadastro exige a confirmação do telefone por SMS antes de associar o e-mail à conta. Se a confirmação de e-mail estiver habilitada no Supabase, também será necessário confirmar o e-mail para entrar com ele. O profissional informa o registro da sua categoria (CRM para médicos, com a UF correspondente). Todos os perfis começam como `pending`; um administrador aprova ou recusa o registro pelo SQL Editor. Após a aprovação, o profissional pode cadastrar pacientes e registrar medições de glicemia, sua relação com refeições, observações da dieta e orientações de medicamentos. A curva e a tabela mostram os últimos 15 dias ou um dia selecionado.

## Segurança e escopo

O CPF é validado no formulário e novamente no trigger do banco, e é armazenado na tabela privada por RLS. Pacientes, medições, registros alimentares e medicamentos são isolados por profissional e exigem aprovação ativa. A chave `anon` é a única chave usada no frontend; nunca exponha uma chave `service_role` no cliente.

Os registros são inseridos pelo profissional com base nas informações que recebe do paciente. Esta versão não inclui contas, portal ou compartilhamento de dados diretamente com pacientes, nem alertas automáticos. Se tabelas existentes já tiverem sido criadas a partir de uma versão anterior do schema, aplique as novas definições no SQL Editor do Supabase antes de usar os módulos de acompanhamento.