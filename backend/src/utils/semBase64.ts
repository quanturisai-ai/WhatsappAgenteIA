/** Item 5: cópia de um objeto para log em que data URLs viram "data:<mime>;base64,<N bytes>" (sem foto de cliente no log). */
export function semBase64(valor: any): any {
  if (valor === undefined) return undefined;
  return JSON.parse(JSON.stringify(valor), (_k, v) => {
    if (typeof v !== 'string') return v;
    const i = v.startsWith('data:') ? v.indexOf(';base64,') : -1;
    if (i >= 0) return `${v.slice(0, i)};base64,<${Math.round((v.length - i - 8) * 0.75)} bytes>`;
    return semBase64NoTexto(v);
  });
}

/** Base64 no meio de um texto (ex.: provedor ecoando o corpo no erro): "base64,<N bytes>"; trecho longo solto: "<base64 N chars>". */
export function semBase64NoTexto(texto: string): string {
  return texto
    .replace(/base64,[A-Za-z0-9+/=]{16,}/g, (m) => `base64,<${Math.round((m.length - 7) * 0.75)} bytes>`)
    .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, (m) => `<base64 ${m.length} chars>`);
}
