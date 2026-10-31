# A.20 Auditorías internas · Silver Industrial

App de auditorías internas ISO 9001:2015 (PR.04 / formulario A.20) sobre Neon.
Desarrollado por Mgter. Diego Ortiz — Líder de Mejora Continua | Consultor ISO

- **Programa por año**: los 13 procesos (7 del auditor interno y 6 de la auditora externa).
- **Checklist por proceso** con cláusula ISO, resultado (C / OM / HA / NC / N/A) y evidencia. Cada ítem se guarda por separado; sin señal queda en cola en el dispositivo y se envía al volver la conexión.
- **Seguimiento** de los hallazgos de años anteriores (cerrado y eficaz / abierto / no eficaz).
- **Emitir**: fija los hallazgos del informe y descarga el A.20 en Word con el formato vigente de tres bloques.
- **Vínculo con NC**: cada hallazgo emitido lleva el N° de NC/OM de la app de No Conformidades.
- **Tablero histórico**: hallazgos por año y proceso, eficacia del seguimiento y hallazgos abiertos (entrada para 9.2.2 a y 9.3).

Archivos: `index.html`, `app.js`, `styles.css`, `config.js` (URL del Worker), `template.js` (plantilla A.20 Rev.2).
Backend: repo `A20-Auditorias-Silver-API` (Cloudflare Worker `a20-auditorias-silver-api`).
