// =============================================================
// META ADS INSIGHTS — jala el gasto por campaña de la Graph API y lo cachea.
// Requiere en Railway: META_ACCESS_TOKEN (System User, larga duración) y META_AD_ACCOUNT_ID (act_...).
// El cruce con leads del CRM se hace por NOMBRE de campaña (campana), que ambas landings envían.
// Caché en app_config para no golpear la API en cada carga (refresco por TTL o botón manual).
// =============================================================
module.exports = function ({ db }) {
  const GRAPH = 'https://graph.facebook.com/v21.0';
  const TTL_MS = (Number(process.env.META_CACHE_TTL_MIN) || 180) * 60000; // 3h por defecto
  const token = () => process.env.META_ACCESS_TOKEN || null;
  const cuenta = () => process.env.META_AD_ACCOUNT_ID || null;

  const getCfg = k => { try { const r = db.prepare('SELECT valor FROM app_config WHERE clave=?').get(k); return r ? r.valor : null; } catch (e) { return null; } };
  const setCfg = (k, v) => { try { db.prepare('INSERT INTO app_config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor').run(k, String(v)); } catch (e) { } };

  function configurado() { return !!(token() && cuenta()); }

  // Llama a /insights level=campaign para el rango dado. Devuelve [{campaña, spend, impressions, clicks}].
  async function fetchInsights(desde, hasta) {
    if (!configurado()) throw new Error('Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en el entorno');
    const acc = cuenta().startsWith('act_') ? cuenta() : 'act_' + cuenta();
    const params = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_name,campaign_id,spend,impressions,clicks',
      time_range: JSON.stringify({ since: desde, until: hasta }),
      limit: '500',
      access_token: token()
    });
    let url = GRAPH + '/' + acc + '/insights?' + params.toString();
    const filas = [];
    let guard = 0;
    while (url && guard++ < 20) {
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error('Meta API: ' + (j.error.message || 'error') + (j.error.code ? ' (código ' + j.error.code + ')' : ''));
      (j.data || []).forEach(d => filas.push({
        campana: d.campaign_name || '(sin nombre)',
        campaignId: d.campaign_id || null,
        spend: Number(d.spend) || 0,
        impresiones: Number(d.impressions) || 0,
        clicks: Number(d.clicks) || 0
      }));
      url = (j.paging && j.paging.next) ? j.paging.next : null;
    }
    return filas;
  }

  // Devuelve los insights del rango, usando caché si es fresca (salvo force=true).
  async function insights(desde, hasta, force) {
    const clave = 'meta_cache_v3_' + desde + '_' + hasta;
    if (!force) {
      const raw = getCfg(clave);
      if (raw) {
        try { const c = JSON.parse(raw); if (Date.now() - c.ts < TTL_MS) return { ...c, cacheHit: true }; } catch (e) { }
      }
    }
    const filas = await fetchInsights(desde, hasta);
    const payload = { ts: Date.now(), desde, hasta, filas };
    setCfg(clave, JSON.stringify(payload));
    return { ...payload, cacheHit: false };
  }

  // Fetch a nivel ANUNCIO: trae jerarquía completa + gasto + leads que Meta reporta (actions).
  async function fetchInsightsAd(desde, hasta) {
    if (!configurado()) throw new Error('Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID en el entorno');
    const acc = cuenta().startsWith('act_') ? cuenta() : 'act_' + cuenta();
    const params = new URLSearchParams({
      level: 'ad',
      fields: 'campaign_name,adset_name,ad_name,ad_id,spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since: desde, until: hasta }),
      limit: '500',
      access_token: token()
    });
    let url = GRAPH + '/' + acc + '/insights?' + params.toString();
    const filas = [];
    let guard = 0;
    while (url && guard++ < 30) {
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error('Meta API: ' + (j.error.message || 'error') + (j.error.code ? ' (código ' + j.error.code + ')' : ''));
      (j.data || []).forEach(d => {
        // Meta reporta el mismo lead en varios action_type superpuestos (lead, onsite_conversion.lead_grouped,
        // leadgen_grouped, fb_pixel_lead...). Sumarlos todos infla. Tomamos UN solo tipo canónico por prioridad.
        let metaLeads = 0, metaForm = 0, metaPixel = 0;
        if (d.actions && d.actions.length) {
          const byType = {};
          d.actions.forEach(a => { byType[a.action_type] = Number(a.value) || 0; });
          // Dos conteos SEPARADOS (validados con datos reales de la cuenta):
          //  · FORM  = formularios nativos llenados (onsite_conversion.lead_grouped / leadgen_grouped).
          //  · PIXEL = leads que el píxel del sitio reporta (offsite_conversion.fb_pixel_lead) — landing.
          // NO se suman: el form nativo también dispara el píxel en la página de gracias (duplicaría).
          // metaLeads = el mayor de los dos (el conteo real de la vía dominante de ese anuncio).
          const PRIOR_FORM = ['onsite_conversion.lead_grouped', 'leadgen_grouped', 'leadgen.other'];
          const tf = PRIOR_FORM.find(t => byType[t] != null);
          metaForm = tf ? byType[tf] : 0;
          metaPixel = byType['offsite_conversion.fb_pixel_lead'] || 0;
          metaLeads = Math.max(metaForm, metaPixel);
        }
        filas.push({
          campana: d.campaign_name || '(sin campaña)',
          conjunto: d.adset_name || '(sin conjunto)',
          anuncio: d.ad_name || '(sin anuncio)',
          adId: d.ad_id || null,
          spend: Number(d.spend) || 0,
          impresiones: Number(d.impressions) || 0,
          clicks: Number(d.clicks) || 0,
          metaLeads, metaForm, metaPixel,
          _actionsRaw: d.actions || [] // crudo, para auditoría
        });
      });
      url = (j.paging && j.paging.next) ? j.paging.next : null;
    }
    return filas;
  }

  async function insightsAd(desde, hasta, force) {
    const clave = 'meta_cache_ad_v4_' + desde + '_' + hasta; // v2: invalida cachés previas al fix de action_types duplicados
    if (!force) {
      const raw = getCfg(clave);
      if (raw) { try { const c = JSON.parse(raw); if (Date.now() - c.ts < TTL_MS) return { ...c, cacheHit: true }; } catch (e) { } }
    }
    const filas = await fetchInsightsAd(desde, hasta);
    const payload = { ts: Date.now(), desde, hasta, filas };
    setCfg(clave, JSON.stringify(payload));
    return { ...payload, cacheHit: false };
  }

  // Imágenes referenciales de los anuncios (thumbnail del creative). Caché 24h.
  async function adImages(force) {
    const clave = 'meta_ad_images_v2';
    if (!force) {
      const raw = getCfg(clave);
      if (raw) { try { const c = JSON.parse(raw); if (Date.now() - c.ts < 24 * 3600000) return c.map; } catch (e) { } }
    }
    if (!configurado()) return {};
    const acc = cuenta().startsWith('act_') ? cuenta() : 'act_' + cuenta();
    let url = GRAPH + '/' + acc + '/ads?fields=name,effective_status,creative{thumbnail_url,image_url}&limit=500&access_token=' + encodeURIComponent(token());
    const map = {}; let guard = 0;
    try {
      while (url && guard++ < 20) {
        const r = await fetch(url); const j = await r.json();
        if (j.error) break;
        (j.data || []).forEach(a => {
          const k = String(a.name || '').trim().toLowerCase();
          if (!k) return;
          const img = a.creative && (a.creative.image_url || a.creative.thumbnail_url);
          if (!map[k]) map[k] = { img: img || null, status: a.effective_status || null };
          else if (a.effective_status === 'ACTIVE') map[k].status = 'ACTIVE'; // si algún ad homónimo está activo
        });
        url = (j.paging && j.paging.next) ? j.paging.next : null;
      }
      setCfg(clave, JSON.stringify({ ts: Date.now(), map }));
    } catch (e) { }
    return map;
  }

  // Gasto DIARIO por campaña (para series y CPL por día). time_increment=1.
  async function insightsDaily(desde, hasta, force) {
    const clave = 'meta_cache_daily_v1_' + desde + '_' + hasta;
    if (!force) { const raw = getCfg(clave); if (raw) { try { const c = JSON.parse(raw); if (Date.now() - c.ts < TTL_MS) return { ...c, cacheHit: true }; } catch (e) { } } }
    if (!configurado()) throw new Error('Faltan META_ACCESS_TOKEN o META_AD_ACCOUNT_ID');
    const acc = cuenta().startsWith('act_') ? cuenta() : 'act_' + cuenta();
    const params = new URLSearchParams({ level: 'campaign', fields: 'campaign_name,spend,date_start', time_range: JSON.stringify({ since: desde, until: hasta }), time_increment: '1', limit: '500', access_token: token() });
    let url = GRAPH + '/' + acc + '/insights?' + params.toString();
    const filas = []; let guard = 0;
    while (url && guard++ < 40) {
      const r = await fetch(url); const j = await r.json();
      if (j.error) throw new Error('Meta API: ' + (j.error.message || 'error'));
      (j.data || []).forEach(d => filas.push({ fecha: d.date_start, campana: d.campaign_name || '', spend: Number(d.spend) || 0 }));
      url = (j.paging && j.paging.next) ? j.paging.next : null;
    }
    const payload = { ts: Date.now(), desde, hasta, filas };
    setCfg(clave, JSON.stringify(payload));
    return { ...payload, cacheHit: false };
  }

  return { configurado, insights, fetchInsights, insightsAd, fetchInsightsAd, adImages, insightsDaily };
};
