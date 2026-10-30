# Evolution API (WhatsApp) — sac-aisa-v2

## Qual versão

| Versão | Uso |
|---|---|
| **v2.3.7** (`evoapicloud/evolution-api:v2.3.7`) | **Escolhida.** Última estável. Contratos HTTP que o SAC já usa (`/message/sendText`, webhook `MESSAGES_UPSERT`). Melhor suporte a `@lid` / `remoteJidAlt` que a 2.2.x do Renato. |
| 2.4.0-rc1 / rc2 | **Não.** Pré-release; exige ativação de licença (`503 LICENSE_REQUIRED`); migration `RuntimeConfig`; manager novo. Só avaliar quando sair estável e a licença estiver ok. |
| `:latest` | **Não pinamos.** No Hub já avançou para a linha 2.4.0-rc. |

O código do agente gestor (`apps/api/src/whatsapp/`) foi escrito contra o contrato da 2.x estável: `POST /message/sendText/{instance}`, `POST /webhook/set/{instance}`, webhook com `remoteJid` / `remoteJidAlt` / `@lid`.

## Subir local

```bash
cp .env.evolution.example .env.evolution
# edite EVOLUTION_API_KEY

docker compose -f docker-compose.evolution.yml --env-file .env.evolution up -d
```

Manager/API: `http://localhost:8080`. Postgres Evolution na porta `5433`, Redis na `6380` (não colidem com o stack do SAC se usar 5432/6379).

## Ligar no SAC

Na tela de integrações (cartão Evolution) ou env da API:

- `EVOLUTION_API_URL=http://localhost:8080` (ou URL pública)
- `EVOLUTION_API_KEY=` a mesma do compose
- `EVOLUTION_INSTANCE=sac-aisa`
- `EVOLUTION_WEBHOOK_SECRET=` (obrigatório em produção)
- `PUBLIC_API_URL=` URL da API Nest

Depois: criar a instância `sac-aisa`, escanear o QR, e `POST /whatsapp/evolution/configure-webhook` (admin).
