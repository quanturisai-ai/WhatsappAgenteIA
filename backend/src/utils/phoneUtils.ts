/**
 * Utilitários para normalização de números de telefone
 * 
 * Normaliza números para o formato: 55 + DDD + número (12 dígitos)
 * Remove o 9 quando presente e adiciona código do país 55 se necessário
 */

/**
 * Normaliza um número de telefone para o formato padrão: 55 + DDD + número (12 dígitos)
 * 
 * @param phoneNumber - Número de telefone em qualquer formato
 * @returns Número normalizado no formato 55 + DDD + número (12 dígitos)
 * 
 * @example
 * normalizePhoneNumber("(62) 98170-7783") // "556281707783" (remove o 9)
 * normalizePhoneNumber("5562996707477") // "556296707477" (remove o 9)
 * normalizePhoneNumber("6281707783") // "556281707783"
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  // Remove caracteres não numéricos
  let normalizedNumber = phoneNumber.replace(/\D/g, '');
  
  if (!normalizedNumber) {
    return '';
  }

  // Se o número tem 11 dígitos (DDD + 9 + número), remover o 9 (terceiro dígito)
  if (normalizedNumber.length === 11 && !normalizedNumber.startsWith('55')) {
    // Formato: DDD (2) + 9 (1) + número (8) = 11 dígitos
    // Remover o 9 (índice 2)
    normalizedNumber = normalizedNumber.slice(0, 2) + normalizedNumber.slice(3);
  } else if (normalizedNumber.length === 13 && normalizedNumber.startsWith('55')) {
    // Formato: 55 (2) + DDD (2) + 9 (1) + número (8) = 13 dígitos
    // Remover o 9 (índice 4)
    normalizedNumber = normalizedNumber.slice(0, 4) + normalizedNumber.slice(5);
  }
  
  // Adicionar 55 no início se não começar com 55
  if (!normalizedNumber.startsWith('55')) {
    normalizedNumber = '55' + normalizedNumber;
  }

  return normalizedNumber;
}

