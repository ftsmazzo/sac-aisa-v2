import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { fotoAceita } from "@sac-aisa/domain";
import type { Response } from "express";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { filtroPorId } from "./reclamacoes";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function pastaDasFotos(): string {
  return (
    process.env.FOTOS_DIR?.trim() || path.join(process.cwd(), "data", "fotos")
  );
}

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return {
    perfil: req.usuario.perfil,
    setores: req.usuario.setores,
    marcas: req.usuario.marcas,
    treino: req.usuario.modoTreino,
    id: req.usuario.id,
  };
}

function idDe(v: string) {
  if (!ID.test(v)) throw new NotFoundException("Reclamação não encontrada.");
  return v;
}

/** Caminho dentro da pasta de fotos, sem sair dela. */
export function arquivoDaFoto(caminho: string): string | null {
  if (caminho.includes("..") || path.isAbsolute(caminho)) return null;
  const raiz = path.resolve(pastaDasFotos());
  const cheio = path.resolve(raiz, caminho);
  if (cheio !== raiz && !cheio.startsWith(`${raiz}${path.sep}`)) return null;
  return cheio;
}

@Controller("reclamacoes")
export class ControladorFotos {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  private async existe(id: string, req: PedidoComUsuario) {
    const u = usuarioDe(req);
    const r = await this.prisma.reclamacao.findFirst({
      where: filtroPorId(id, u),
      select: { id: true },
    });
    if (!r) throw new NotFoundException("Reclamação não encontrada.");
    return u;
  }

  @Requer("reclamacoes.editar")
  @Post(":id/fotos")
  async enviar(
    @Param("id") bruto: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    const id = idDe(bruto);
    const u = await this.existe(id, req);
    const c =
      typeof corpo === "object" && corpo !== null
        ? (corpo as Record<string, unknown>)
        : {};
    const tipo = typeof c.tipo === "string" ? c.tipo : "";
    const nome = typeof c.nome === "string" ? c.nome.trim().slice(0, 180) : "";
    const conteudo = typeof c.conteudo === "string" ? c.conteudo : "";
    const base = conteudo.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(base, "base64");
    const erro = fotoAceita(tipo, bytes.length, bytes.subarray(0, 16));
    if (erro || !nome) {
      throw new BadRequestException(erro ?? "Dê um nome à foto.");
    }
    const ext = EXT[tipo] ?? "bin";
    const fotoId = randomBytes(12).toString("hex");
    const relativo = path.join(id, `${fotoId}.${ext}`);
    const destino = arquivoDaFoto(relativo);
    if (!destino)
      throw new BadRequestException("Não foi possível guardar a foto.");
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, bytes);
    const foto = await this.prisma.reclamacaoFoto.create({
      data: {
        id: fotoId,
        reclamacaoId: id,
        nome,
        caminho: relativo.split(path.sep).join("/"),
        kb: Math.max(1, Math.ceil(bytes.length / 1024)),
        criadoPorId: u.id,
      },
    });
    return { id: foto.id, nome: foto.nome };
  }

  @Requer("reclamacoes.ver")
  @Get(":id/fotos/:fotoId")
  async baixar(
    @Param("id") bruto: string,
    @Param("fotoId") fotoBruto: string,
    @Req() req: PedidoComUsuario,
    @Res() res: Response,
  ) {
    const id = idDe(bruto);
    if (!ID.test(fotoBruto))
      throw new NotFoundException("Foto não encontrada.");
    await this.existe(id, req);
    const foto = await this.prisma.reclamacaoFoto.findFirst({
      where: { id: fotoBruto, reclamacaoId: id },
    });
    if (!foto) throw new NotFoundException("Foto não encontrada.");
    if (foto.caminho.startsWith("https://")) {
      res.redirect(foto.caminho);
      return;
    }
    const arquivo = arquivoDaFoto(foto.caminho);
    if (!arquivo) throw new NotFoundException("Foto não encontrada.");
    const ext = path.extname(arquivo).slice(1);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    createReadStream(arquivo).pipe(res);
  }
}
