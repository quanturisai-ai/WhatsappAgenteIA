/**
 * Utilitários para CPF.
 * A tabela vm_lav_vouchers (e outras) passou a armazenar CPF com separadores (xxx.xxx.xxx-xx).
 * Para comparações consistentes, sempre normalize para apenas dígitos antes de comparar.
 */

/**
 * Retorna apenas os 11 dígitos do CPF (remove pontos, traços e espaços).
 * Útil para comparação entre valores que podem estar formatados ou não.
 * @returns string com 11 dígitos ou null se inválido/vazio
 */
export function normalizeCpfToDigits(cpf: string | null | undefined): string | null {
  if (cpf == null || typeof cpf !== 'string') return null;
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? digits : digits.length > 0 ? digits : null;
}

/**
 * Formata CPF com separadores (xxx.xxx.xxx-xx).
 * Entrada: 11 dígitos ou string com dígitos. Saída: "177.129.698-41" ou null se inválido.
 */
export function formatCpfWithSeparators(cpf: string | null | undefined): string | null {
  const digits = normalizeCpfToDigits(cpf);
  if (!digits || digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Fragmento SQL para normalizar coluna CPF no MySQL (remove . - e espaços).
 * Uso: WHERE ${normalizeCpfColumnSql('cliente_cpf')} = ?
 * e passar o parâmetro já normalizado com normalizeCpfToDigits().
 */
export function normalizeCpfColumnSql(columnName: string): string {
  return `REPLACE(REPLACE(REPLACE(COALESCE(${columnName}, ''), '.', ''), '-', ''), ' ', '')`;
}
