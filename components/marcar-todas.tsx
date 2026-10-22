"use client";

/** Marca ou desmarca todas as caixas `name` do formulário `form`. */
export function MarcarTodas({ form, nome }: { form: string; nome: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todas desta página"
      onChange={(e) => {
        const caixas = document.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][form="${form}"][name="${nome}"]`,
        );
        for (const c of caixas) c.checked = e.currentTarget.checked;
      }}
    />
  );
}
