// ─────────────────────────────────────────────────────────────────────────────
// Ajuste puntual de fecha de asignación (marcha blanca).
//
// Regla: todo lead asignado HASTA el 22-jun-2026 23:59 (hora Perú)
//        pasa a fecha de asignación = 23-jun-2026 09:00 (hora Perú).
//
// Las fechas se guardan en ISO UTC. Perú = UTC-5, por lo tanto:
//   - 22-jun 23:59:59 Perú  =  2026-06-23T04:59:59Z   (límite, inclusive)
//   - 23-jun 09:00:00 Perú  =  2026-06-23T14:00:00Z   (nuevo valor)
//
// CÓMO CORRERLO en Railway (proyecto del CRM):
//   1. Sube este archivo con el resto del código (ya viene en el ZIP).
//   2. En Railway, abre una shell del servicio del CRM y ejecuta:
//        DB_PATH=/app/data/crm.db node fix-fecha-asignacion.js
//      (usa el mismo DB_PATH que tu servidor; si no lo sabes, mira tus Variables)
//   3. Primero corre en modo simulación (no escribe nada) para revisar:
//        DB_PATH=/app/data/crm.db node fix-fecha-asignacion.js --dry
//   4. Si la lista se ve bien, corre sin --dry para aplicar.
// ─────────────────────────────────────────────────────────────────────────────

const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || './data/crm.db';
const DRY = process.argv.includes('--dry');

const LIMITE_UTC = '2026-06-23T04:59:59.999Z'; // 22-jun 23:59:59 Perú
const NUEVA_UTC = '2026-06-23T14:00:00.000Z';  // 23-jun 09:00:00 Perú

const db = new DatabaseSync(DB_PATH);

// Candidatos: tienen fecha de asignación y es <= al límite, y aún no están en la nueva fecha
const candidatos = db.prepare(
  `SELECT codigo, nombre, asesor, fechaAsignacion
     FROM leads
    WHERE fechaAsignacion IS NOT NULL
      AND fechaAsignacion <> ''
      AND fechaAsignacion <= ?
    ORDER BY fechaAsignacion ASC`
).all(LIMITE_UTC);

console.log(`\nLeads que se moverán a 23-jun 09:00 Perú (${NUEVA_UTC}):`);
console.log('────────────────────────────────────────────────────────');
candidatos.forEach(l => {
  console.log(`  ${l.codigo}  ${(l.nombre || '').slice(0, 26).padEnd(26)}  ${(l.asesor || 'sin GP').padEnd(20)}  ${l.fechaAsignacion}`);
});
console.log('────────────────────────────────────────────────────────');
console.log(`Total: ${candidatos.length} lead(s).`);

if (DRY) {
  console.log('\n[SIMULACIÓN] No se modificó nada. Quita --dry para aplicar.\n');
  process.exit(0);
}

if (candidatos.length === 0) {
  console.log('\nNo hay leads para actualizar.\n');
  process.exit(0);
}

const upd = db.prepare(
  `UPDATE leads SET fechaAsignacion = ?
     WHERE fechaAsignacion IS NOT NULL AND fechaAsignacion <> '' AND fechaAsignacion <= ?`
);
const r = upd.run(NUEVA_UTC, LIMITE_UTC);
console.log(`\n✅ Actualizados ${r.changes} lead(s) a 23-jun 09:00 (Perú).\n`);
