export function wasSingleJobExported(result) {
  return Number(result?.exported) === 1;
}
