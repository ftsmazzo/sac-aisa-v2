export {
  type ConsultaLista,
  type Escopo,
  filtroDeEscopo,
  filtroDeTreino,
  filtroPorId,
  montarFiltro,
} from "./filtros";
export {
  formatWhatsapp,
  normSku,
  normTxt,
  phoneMatch,
  resolverPeriodo,
  setorFuzzyMatch,
} from "./periodo";
export {
  afinidadeLexical,
  buscarChunks,
  type ChunkBusca,
  cosseno,
  fatiarTexto,
  type TrechoConhecimento,
} from "./rag";
export {
  GESTOR_TOOL_DEFS,
  GestorTools,
  type GestorToolsOpcoes,
  usuarioGestorDe,
} from "./tools";
export type { GestorToolDef } from "./types";
