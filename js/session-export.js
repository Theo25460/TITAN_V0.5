(function () {
  "use strict";
  const escapeCell = (value) => {
    let text = String(value ?? "");
    if (/^(?:\s*[=+@\-]|[\t\r\n])/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const guest = () => String(window.state?.user?.id || "").startsWith("guest_");
  const label = (sport) => window.SPORTS_CONFIG?.[sport]?.label || sport;
  /* V1.6.3: the rows of the view shown (journal or archives, filters applied), each with its state and its canonical reference, the
     same columns as the Android export (js/core/history-ledger.js). A refused entry is never exported here: it has its own copy
     (« Exporter une copie », V1.6.1). */
  function csv(logs) {
    const L = window.TitanLedger;
    return (
      "﻿" +
      [L.CSV_HEAD, ...L.csvRows(logs, "all", { guest: guest(), label })]
        .map((row) => row.map(escapeCell).join(";"))
        .join("\r\n")
    );
  }
  window.titanExportSessionsCSV = function (
    logs = window.state?.history || [],
  ) {
    const url = URL.createObjectURL(
      new Blob([csv(logs)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "titan-journal-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document
    .getElementById("export-journal-csv")
    ?.addEventListener("click", () => window.titanExportSessionsCSV());
  if (typeof module !== "undefined") module.exports = { csv, escapeCell };
})();
