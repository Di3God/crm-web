// ===== PULSO DEL DÍA (v1.401) =====
// Reemplaza los cortes anteriores: UN solo bloque por grupo y por corte.
//  · 9am  → buenos días + qué hacer hoy (por persona)
//  · 1pm  → pulso correctivo con semáforo de ritmo
//  · 6pm  → cierre del día con puntaje (0-100) y ranking
// B2C → grupo por defecto del bot · B2B → WA_GRUPO_B2B_JID.
// Metas fijas por GP configurables en app_config ('pulso_metas_b2c' / 'pulso_meta_b2b').
'use strict';

module.exports = function ({ db, enviarAlertaWA, peruFecha, construirRankingDia, consolidarLead, L, etapaKanbanB2B, slaEtapaB2B }) {
  const LIMA_OFF = -5 * 3600000;
  const hoyPeru = () => new Date(Date.now() + LIMA_OFF).toISOString().slice(0, 10);
  const peruDia = iso => new Date(new Date(iso).getTime() + LIMA_OFF).toISOString().slice(0, 10);
  const primerNom = n => String(n || '').trim().split(/\s+/)[0];
  const esDomingoPeru = () => new Date(Date.now() + LIMA_OFF).getUTCDay() === 0;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function selloFecha() { const d = new Date(Date.now() + LIMA_OFF); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; }

  // ---- Metas configurables ----
  const META_GP_DEF = { intentos: 15, calificados: 3, agendados: 2, reuniones: 1, cierres: 1 };
  const META_B2B_DEF = { gestiones: 10 };
  function getMetasB2C() {
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='pulso_metas_b2c'").get(); if (r && r.valor) return JSON.parse(r.valor); } catch (e) { }
    return {};
  }
  function metaDe(nombre) { const M = getMetasB2C(); return Object.assign({}, META_GP_DEF, M[nombre] || {}); }
  function getMetaB2B() {
    try { const r = db.prepare("SELECT valor FROM app_config WHERE clave='pulso_meta_b2b'").get(); if (r && r.valor) return Object.assign({}, META_B2B_DEF, JSON.parse(r.valor)); } catch (e) { }
    return META_B2B_DEF;
  }

  // ================= B2C =================
  function datosB2C() {
    const hoy = hoyPeru();
    const gestoras = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol='gestora'").all().map(g => g.nombre);
    const rk = {}; try { (construirRankingDia().ranking || []).forEach(r => { rk[r.asesor] = r; }); } catch (e) { }
    // Gestiones de hoy por asesor (para reuniones/cierres del día).
    const gHoy = db.prepare('SELECT asesor, resultado, fecha FROM gestiones').all().filter(g => peruDia(g.fecha) === hoy);
    // Leads vivos por asesor: vencidos, acciones de hoy, sin contactar, reuniones de hoy.
    const leads = db.prepare("SELECT * FROM leads WHERE COALESCE(archivado,0)=0 AND asesor IS NOT NULL AND asesor <> ''").all();
    const gTodas = {}; db.prepare('SELECT codigo, asesor, resultado, fecha FROM gestiones ORDER BY fecha').all()
      .forEach(x => { (gTodas[x.codigo] = gTodas[x.codigo] || []).push(x); });
    const ahora = new Date();
    const porGP = {};
    gestoras.forEach(n => { porGP[n] = { nombre: n, vivos: 0, vencidos: 0, paraHoy: 0, sinContacto: 0, reunionesHoy: 0, reuHechasHoy: 0, cierresHoy: 0 }; });
    leads.forEach(l => {
      const P = porGP[l.asesor]; if (!P) return;
      const gs = gTodas[l.codigo] || [];
      const cons = consolidarLead(l, gs);
      if (cons.etapa === 'Cerrado ganado' || cons.etapa === 'Cerrado perdido') return;
      P.vivos++;
      if (!gs.length) P.sinContacto++;
      if (cons.fechaProxAccion) {
        if (new Date(cons.fechaProxAccion) < ahora) P.vencidos++;
        else if (peruDia(cons.fechaProxAccion) === hoy) P.paraHoy++;
      }
      if (l.fechaReunion && peruDia(l.fechaReunion) === hoy) P.reunionesHoy++;
    });
    gHoy.forEach(g => {
      const P = porGP[g.asesor]; if (!P) return;
      if (g.resultado === 'Reunion efectiva') P.reuHechasHoy++;
      if (g.resultado === 'Venta ganada') P.cierresHoy++;
    });
    return gestoras.map(n => {
      const r = rk[n] || {};
      const P = porGP[n];
      const meta = metaDe(n);
      return {
        nombre: n, meta,
        intentos: r.intentos || 0, conectados: r.conectados || 0,
        calificados: r.calificados || 0, agendados: r.agendados || 0,
        verificadas: r.verificadas || 0,
        reuniones: P.reuHechasHoy, cierres: P.cierresHoy,
        vivos: P.vivos, vencidos: P.vencidos, paraHoy: P.paraHoy,
        sinContacto: P.sinContacto, reunionesHoy: P.reunionesHoy
      };
    });
  }

  // Puntaje del día 0-100: intentos 30 · llamadas verificadas 20 · vencidos 20 · producción 30.
  function puntajeDia(g) {
    const m = g.meta;
    const pInt = 30 * Math.min(1, g.intentos / Math.max(1, m.intentos));
    const pVer = 20 * Math.min(1, g.verificadas / Math.max(1, Math.round(m.intentos * 0.5)));
    const pVenc = 20 * (g.vencidos === 0 ? 1 : Math.max(0, 1 - g.vencidos / 5));
    const prod = g.calificados * 3 + g.agendados * 5 + g.reuniones * 7 + g.cierres * 15;
    const prodMeta = Math.max(1, m.calificados * 3 + m.agendados * 5 + m.reuniones * 7 + m.cierres * 15);
    const pProd = 30 * Math.min(1, prod / prodMeta);
    return Math.round(pInt + pVer + pVenc + pProd);
  }
  // Semáforo del corte 1pm por % de meta de intentos (al mediodía se espera ~60%).
  function semaforo1pm(g) {
    const pct = g.intentos / Math.max(1, g.meta.intentos);
    if (pct < 0.35 || g.vencidos >= 8) return '🔴';
    if (pct < 0.55 || g.vencidos >= 4) return '🟡';
    return '🟢';
  }

  function msgB2C(corte) {
    const gps = datosB2C();
    if (!gps.length) return null;
    const T = gps.reduce((a, g) => ({ int: a.int + g.intentos, mInt: a.mInt + g.meta.intentos, cal: a.cal + g.calificados, ag: a.ag + g.agendados, reu: a.reu + g.reuniones, cie: a.cie + g.cierres }), { int: 0, mInt: 0, cal: 0, ag: 0, reu: 0, cie: 0 });
    const P = [];
    if (corte === '9am') {
      P.push('🌅 *BUENOS DÍAS EQUIPO B2C* · ' + selloFecha(), '━━━━━━━━━━━━', 'Esto es lo que tiene el día:', '');
      gps.forEach(g => {
        P.push('👤 *' + primerNom(g.nombre) + '* — ' + g.vivos + ' leads vivos · meta hoy: ' + g.meta.intentos + ' intentos');
        const li = [];
        if (g.vencidos) li.push('⚠ ' + g.vencidos + ' vencido' + (g.vencidos === 1 ? '' : 's') + ' por atender');
        if (g.paraHoy) li.push('📅 ' + g.paraHoy + ' acción' + (g.paraHoy === 1 ? '' : 'es') + ' para hoy');
        if (g.reunionesHoy) li.push('🤝 ' + g.reunionesHoy + ' reunión' + (g.reunionesHoy === 1 ? '' : 'es') + ' agendada' + (g.reunionesHoy === 1 ? '' : 's'));
        if (g.sinContacto) li.push('🆕 ' + g.sinContacto + ' sin primer contacto');
        P.push('   ' + (li.length ? li.join(' · ') : '✅ sin pendientes críticos'));
      });
      P.push('', '💪 ¡A por el día!');
    } else if (corte === '1pm') {
      P.push('⏱ *PULSO DEL DÍA · 1PM* · B2C · ' + selloFecha(), '━━━━━━━━━━━━', 'Ritmo esperado al corte: ~60% de la meta', '');
      gps.forEach(g => {
        const sem = semaforo1pm(g);
        const pct = Math.round(g.intentos / Math.max(1, g.meta.intentos) * 100);
        P.push(sem + ' *' + primerNom(g.nombre) + '* — ' + g.intentos + '/' + g.meta.intentos + ' intentos (' + pct + '%) · 📞 ' + g.verificadas + ' verif.');
        const li = [];
        if (g.vencidos) li.push('⚠ ' + g.vencidos + ' vencidos');
        li.push(g.calificados + ' calif · ' + g.agendados + ' agend');
        P.push('   ' + li.join(' · '));
      });
      P.push('', '👥 *Equipo:* ' + T.int + '/' + T.mInt + ' intentos · ' + T.cal + ' calif · ' + T.ag + ' agend');
    } else { // 6pm
      const orden = gps.map(g => ({ g, pts: puntajeDia(g) })).sort((a, b) => b.pts - a.pts);
      P.push('🏁 *CIERRE DEL DÍA · 6PM* · B2C · ' + selloFecha(), '━━━━━━━━━━━━', '');
      const medalla = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
      orden.forEach(({ g, pts }, i) => {
        const sem = pts >= 70 ? '🟢' : pts >= 45 ? '🟡' : '🔴';
        P.push(medalla(i) + ' *' + primerNom(g.nombre) + '* — ' + pts + ' pts ' + sem);
        P.push('   Intentos ' + g.intentos + '/' + g.meta.intentos + ' · 📞 ' + g.verificadas + ' verif. · vencidos: ' + (g.vencidos === 0 ? '0 ✓' : g.vencidos + ' ⚠'));
        P.push('   Producción: ' + g.calificados + ' calif · ' + g.agendados + ' agend · ' + g.reuniones + ' reunión · ' + g.cierres + ' cierre' + (g.cierres === 1 ? '' : 's'));
      });
      P.push('', '👥 *EQUIPO HOY:* ' + T.int + '/' + T.mInt + ' intentos · ' + T.cal + ' calif · ' + T.ag + ' agend · ' + T.reu + ' reuniones · ' + T.cie + ' cierres');
    }
    return P.join('\n');
  }

  // ================= B2B =================
  function datosB2B() {
    const hoy = hoyPeru();
    const funcs = db.prepare("SELECT nombre FROM usuarios WHERE activo=1 AND rol IN ('asistente_creditos','funcionario_b2b','jefe_creditos')").all().map(u => u.nombre);
    const sols = db.prepare("SELECT * FROM b2b_solicitudes WHERE COALESCE(archivado,0)=0 AND estado <> 'No elegible'").all();
    const gHoy = db.prepare('SELECT * FROM b2b_gestiones').all().filter(g => peruDia(g.fecha) === hoy);
    const ultG = {}; db.prepare('SELECT codigoSolicitud, MAX(fecha) f FROM b2b_gestiones GROUP BY codigoSolicitud').all().forEach(r => { ultG[r.codigoSolicitud] = r.f; });
    const llHoy = db.prepare('SELECT codigoB2B, fecha FROM llamadas WHERE codigoB2B IS NOT NULL').all().filter(x => peruDia(x.fecha) === hoy);
    const avHoy = db.prepare("SELECT nombre, fecha FROM auditoria WHERE accion IN ('b2b_avanzar_etapa','b2b_kanban_mover','b2b_kanban_forzar')").all().filter(a => peruDia(a.fecha) === hoy);
    const porF = {};
    funcs.forEach(n => { porF[n] = { nombre: n, cartera: 0, slaVenc: 0, sinGestion5d: 0, gestHoy: 0, verifHoy: 0, avancesHoy: 0 }; });
    const ahora = Date.now();
    sols.forEach(s => {
      const F = porF[s.responsableActual]; if (!F) return;
      F.cartera++;
      try { const sla = slaEtapaB2B(etapaKanbanB2B(s), s.fechaEtapa); if (sla && sla.vencido) F.slaVenc++; } catch (e) { }
      const base = ultG[s.codigo] || s.fechaIngreso;
      if (base && (ahora - new Date(base).getTime()) > 5 * 86400000) F.sinGestion5d++;
    });
    gHoy.forEach(g => {
      const F = porF[g.responsable]; if (!F) return;
      F.gestHoy++;
      if (g.canal === 'Llamada') {
        const gt = new Date(g.fecha).getTime();
        if (llHoy.some(ll => ll.codigoB2B === g.codigoSolicitud && Math.abs(new Date(ll.fecha).getTime() - gt) <= 5 * 60000)) F.verifHoy++;
      }
    });
    avHoy.forEach(a => { const F = porF[a.nombre]; if (F) F.avancesHoy++; });
    return funcs.map(n => porF[n]).filter(f => f.cartera > 0 || f.gestHoy > 0);
  }

  function puntajeB2B(f, meta) {
    const pGest = 50 * Math.min(1, f.gestHoy / Math.max(1, meta.gestiones));
    const pVer = 20 * Math.min(1, f.verifHoy / Math.max(1, Math.round(meta.gestiones * 0.5)));
    const pSla = 15 * (f.slaVenc === 0 ? 1 : Math.max(0, 1 - f.slaVenc / 10));
    const pAv = 15 * Math.min(1, f.avancesHoy / 3);
    return Math.round(pGest + pVer + pSla + pAv);
  }

  function msgB2B(corte) {
    const fs = datosB2B();
    if (!fs.length) return null;
    const meta = getMetaB2B();
    const P = [];
    if (corte === '9am') {
      P.push('🌅 *BUENOS DÍAS EQUIPO B2B* · ' + selloFecha(), '━━━━━━━━━━━━', 'Esto es lo que tiene el día:', '');
      fs.forEach(f => {
        P.push('👤 *' + primerNom(f.nombre) + '* — ' + f.cartera + ' en cartera · meta hoy: ' + meta.gestiones + ' gestiones');
        const li = [];
        if (f.slaVenc) li.push('⚠ ' + f.slaVenc + ' con SLA vencido');
        if (f.sinGestion5d) li.push('🕐 ' + f.sinGestion5d + ' sin gestión +5d');
        P.push('   ' + (li.length ? li.join(' · ') : '✅ cartera al día'));
      });
      P.push('', '💪 ¡A por el día!');
    } else if (corte === '1pm') {
      P.push('⏱ *PULSO B2B · 1PM* · ' + selloFecha(), '━━━━━━━━━━━━', 'Ritmo esperado al corte: ~60% de la meta', '');
      fs.forEach(f => {
        const pct = f.gestHoy / Math.max(1, meta.gestiones);
        const sem = pct < 0.35 ? '🔴' : pct < 0.55 ? '🟡' : '🟢';
        P.push(sem + ' *' + primerNom(f.nombre) + '* — ' + f.gestHoy + '/' + meta.gestiones + ' gestiones · 📞 ' + f.verifHoy + ' verif.');
        const li = [];
        if (f.slaVenc) li.push('⚠ ' + f.slaVenc + ' SLA vencidos');
        if (f.avancesHoy) li.push('↗ ' + f.avancesHoy + ' avance' + (f.avancesHoy === 1 ? '' : 's'));
        if (li.length) P.push('   ' + li.join(' · '));
      });
    } else { // 6pm
      const orden = fs.map(f => ({ f, pts: puntajeB2B(f, meta) })).sort((a, b) => b.pts - a.pts);
      P.push('🏁 *CIERRE B2B · 6PM* · ' + selloFecha(), '━━━━━━━━━━━━', '');
      const medalla = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
      orden.forEach(({ f, pts }, i) => {
        const sem = pts >= 70 ? '🟢' : pts >= 45 ? '🟡' : '🔴';
        P.push(medalla(i) + ' *' + primerNom(f.nombre) + '* — ' + pts + ' pts ' + sem);
        P.push('   ' + f.gestHoy + '/' + meta.gestiones + ' gestiones · 📞 ' + f.verifHoy + ' verif. · ↗ ' + f.avancesHoy + ' avances · SLA venc: ' + (f.slaVenc === 0 ? '0 ✓' : f.slaVenc + ' ⚠'));
      });
    }
    return P.join('\n');
  }

  // ================= Envío y scheduler =================
  async function enviarPulso(corte) {
    const b2c = msgB2C(corte);
    if (b2c) await enviarAlertaWA(b2c); // grupo B2C por defecto del bot
    const b2b = msgB2B(corte);
    if (b2b) await enviarAlertaWA(b2b, process.env.WA_GRUPO_B2B_JID || undefined);
    return { b2c: !!b2c, b2b: !!b2b };
  }

  const CORTES = { '09:00': '9am', '13:00': '1pm', '18:00': '6pm' };
  function iniciarCortes() {
    setInterval(async () => {
      try {
        if (esDomingoPeru()) return;
        const now = new Date(Date.now() + LIMA_OFF);
        const corte = CORTES[now.toISOString().slice(11, 16)];
        if (!corte) return;
        const clave = 'pulso_' + corte + '_' + peruFecha(new Date().toISOString());
        if (db.prepare('SELECT valor FROM app_config WHERE clave=?').get(clave)) return;
        db.prepare('INSERT OR REPLACE INTO app_config (clave,valor) VALUES (?,?)').run(clave, new Date().toISOString());
        const r = await enviarPulso(corte);
        console.log('[PULSO] corte ' + corte + ' enviado', JSON.stringify(r));
      } catch (e) { console.error('[PULSO] corte falló:', e.message); }
    }, 60000);
  }

  return { msgB2C, msgB2B, enviarPulso, iniciarCortes, getMetasB2C, getMetaB2B, META_GP_DEF, META_B2B_DEF };
};
