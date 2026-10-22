"""
Extrai o dump diario do sac-renato (sac-AAAAMMDD-HHMMSS.dump, formato custom do
pg_dump) para o JSON que o importador le.

Uso, num ambiente Python isolado (o dump e dado de terceiros, entao use -I):
    python -m venv venv-dump && venv-dump/bin/pip install pgdumplib
    venv-dump/bin/python -I extrair-dump.py <arquivo.dump> <saida.json>

O JSON de saida tem dado de cliente: nao o coloque no repositorio.
Depois:
    npm run importar -w @sac-aisa/importacao -- <saida.json> --produtos <catalogo> --simular
"""

import collections
import json
import re
import sys

import pgdumplib


def tabela(dump, nome):
    entrada = next(
        e
        for e in dump.entries
        if e.desc == "TABLE DATA" and e.namespace == "public" and e.tag == nome
    )
    colunas = [
        c.strip().strip('"')
        for c in re.search(r"\((.*)\)", entrada.copy_stmt, re.S).group(1).split(",")
    ]
    return [dict(zip(colunas, linha)) for linha in dump.table_data("public", nome)]


def booleano(v):
    # O dump entrega tudo como texto: 't' e 'f'.
    return v in ("t", True)


def numero(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def texto(v):
    return "" if v is None else str(v)


def main(caminho_dump, caminho_saida):
    dump = pgdumplib.load(caminho_dump)

    reclamacoes = []
    for r in tabela(dump, "reclamacoes"):
        x = dict(r)
        x["reg"] = int(r["reg"])
        for c in ("freteEnvio", "freteRetorno", "valorPeca", "estorno", "desconto", "guia"):
            x[c] = numero(r[c])
        x["causaManual"] = booleano(r["causaManual"])
        x["rascunho"] = booleano(r["rascunho"])
        for c in ("dataAcao", "dataRecebimento", "causaId", "setorRespManual", "peca", "devolucao"):
            if x.get(c) is None:
                x[c] = ""
        reclamacoes.append(x)

    causas_extras = [
        {
            "reclamacaoId": e["reclamacaoId"],
            "causaId": e["causaId"],
            "primaria": booleano(e["primaria"]),
            "ordem": int(e["ordem"]),
        }
        for e in tabela(dump, "reclamacao_causas")
    ]
    vendas = [
        {
            "sku": texto(v["sku"]).strip().upper(),
            "descricao": texto(v["descricao"]),
            "data": texto(v["data"])[:10],
            "quantidade": int(float(v["qtde"])),
        }
        for v in tabela(dump, "vendas_dia")
    ]
    usuarios = [
        {
            "login": u["login"],
            "nome": u["nome"],
            "perfil": u["perfil"],
            "ativo": booleano(u["ativo"]),
            "telefone": u["telefone"] or "",
        }
        for u in tabela(dump, "usuarios")  # hash e salt ficam de fora de proposito
    ]
    fotos = len(tabela(dump, "reclamacao_fotos"))

    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(
            {
                "regs": reclamacoes,
                "causasExtras": causas_extras,
                "vendas": vendas,
                "usuarios": usuarios,
                "fotos": fotos,
            },
            f,
            ensure_ascii=False,
        )

    # So contagens no terminal, nunca dado de cliente.
    contar = collections.Counter
    print(f"reclamacoes: {len(reclamacoes)}")
    print(f"causas gravadas: {len(causas_extras)}")
    print(f"vendas: {len(vendas)}")
    print(f"usuarios: {len(usuarios)}")
    print(f"fotos (so contagem): {fotos}")
    print("canais:", dict(contar(r["canal"].strip().upper() for r in reclamacoes)))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
