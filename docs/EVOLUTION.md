# Evolution API (WhatsApp) — sac-aisa-v2

## Qual versão

| Versão | Uso |
|---|---|
| **v2.3.7** (`evoapicloud/evolution-api:v2.3.7`) | **Escolhida.** Última estável. Contratos HTTP que o SAC já usa (`/message/sendText`, webhook `MESSAGES_UPSERT`). Melhor suporte a `@lid` / `remoteJidAlt` que a 2.2.x do Renato. |
| 2.4.0-rc1 / rc2 | **Não.** Pré-release; exige ativação de licença (`503 LICENSE_REQUIRED`); migration `RuntimeConfig`; manager novo. Só avaliar quando sair estável e a licença estiver ok. |
| `:latest` | **Não pinamos.** No Hub já avançou para a linha 2.4.0-rc. |

O código do agente gestor (`apps/api/src/whatsapp/`) foi escrito contra o contrato da 2.x estável: `POST /message/sendText/{instance}`, `POST /webhook/set/{instance}`, webhook com `remoteJid` / `remoteJidAlt` / `@lid`.

## EasyPanel (produção — projeto `sac-aisa-v2`)

Serviços no mesmo projeto da API/web (VPS EasyPanel):

| Serviço | Papel |
|---|---|
| `evolution-api` | Imagem `evoapicloud/evolution-api:v2.3.7` |
| `evolution-api-db` | Postgres 16 só da Evolution |
| `evolution-api-redis` | Redis 7 só da Evolution |

URL pública: `https://sac-aisa-v2-evolution-api.kxryyk.easypanel.host`  
A chave `AUTHENTICATION_API_KEY` fica no env do serviço `evolution-api` no painel (não no Git).

## Subir local (opcional)

```bash
cp .env.evolution.example .env.evolution
# edite EVOLUTION_API_KEY

docker compose -f docker-compose.evolution.yml --env-file .env.evolution up -d
```

Manager/API: `http://localhost:8080`. Postgres Evolution na porta `5433`, Redis na `6380`.

## Ligar no SAC

Na tela de integrações (cartão Evolution) ou env da API:

- `EVOLUTION_API_URL=https://sac-aisa-v2-evolution-api.kxryyk.easypanel.host` (ou URL interna do swarm)
- `EVOLUTION_API_KEY=` a mesma `AUTHENTICATION_API_KEY` do serviço
- `EVOLUTION_INSTANCE=sac-aisa`
- `EVOLUTION_WEBHOOK_SECRET=` (obrigatório em produção)
- `PUBLIC_API_URL=` URL pública da API Nest

Depois: criar a instância `sac-aisa`, escanear o QR, e `POST /whatsapp/evolution/configure-webhook` (admin).
