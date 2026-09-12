(function () {
  "use strict";
  const escapeCell = (value) => {
    let text = String(value ?? "");
    if (/^(?:\s*[=+@\-]|[\t\r\n])/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  function csv(logs) {
    const head = [
      "Date",
      "Sport",
      "Valeur",
      "Unité",
      "Durée (min)",
      "Ressenti (1–10)",
      "Note",
      "État",
    ];
    return (
      "\ufeff" +
      [
        head,
        ...logs.map((l) => [
          l.date,
          window.SPORTS_CONFIG?.[l.sport]?.label || l.sport,
          l.val,
          l.unit,
          window.TitanTraining.duration(l) ?? "",
          l.details?.bio?.rpe ?? "",
          l.details?.note || "",
          l.syncStatus === "confirmed" ? "Synchronisée" : "Sur cet appareil",
        ]),
      ]
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
