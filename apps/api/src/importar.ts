/**
 * Ponto de entrada da importação dentro da imagem da API.
 * O entrypoint o executa na subida quando IMPORT_BACKUP aponta para um arquivo.
 * A lógica fica em packages/importacao; aqui só entra no pacote gerado pelo esbuild.
 */
import "../../../packages/importacao/src/cli";
