/** Item 5: cópia de um objeto para log em que data URLs viram "data:<mime>;base64,<N bytes>" (sem foto de cliente no log). */
export function semBase64(valor: any): any {
  if (valor === undefined) return undefined;
  return JSON.parse(JSON.stringify(valor), (_k, v) => {
    if (typeof v !== 'string' || !v.startsWith('data:')) return v;
    const i = v.indexOf(';base64,');
    if (i < 0) return v;
    return `${v.slice(0, i)};base64,<${Math.round((v.length - i - 8) * 0.75)} bytes>`;
  });
}
