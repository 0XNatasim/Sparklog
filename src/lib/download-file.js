// Hands a file to the browser as a download (the same way every export of the app does it).
export function downloadFile(bytes, filename, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
