// ==UserScript==
// @name         GPORTAL Offers Quality Dashboard Injector
// @namespace    gvistas
// @version      2.0.1
// @description  Inject custom analytics dashboard reading directly from WATable internal JS data
// @match        http://gvistas.com:4808/reports/offers_quality*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DASHBOARD_URL = 'https://flamma101.github.io/oq-dashboard/';

    // ── 1. Extract rows directly from WATable internal data ──────────────────
    function extractRows() {
        // Method 1: Read directly from WATable jQuery instance
        try {
            const tbl = $('#datatable').data('WATable');
            if (tbl && tbl.data && tbl.data.rows) {
                return parseRows(tbl.data.rows);
            }
        } catch (e) {}

        // Method 2: Parse Check({...}) from inline <script id="TbGenerateur">
        try {
            const scriptEl = document.querySelector('script#TbGenerateur');
            if (scriptEl) {
                const match = scriptEl.textContent.match(/Check\(\s*(\{[\s\S]*?\})\s*\)\s*;/);
                if (match) {
                    const json = JSON.parse(match[1]);
                    return parseRows(json.rows || []);
                }
            }
        } catch (e) {}

        return [];
    }

    // ── 2. Parse WATable fields into clean JSON ─────────────────────────────
    function parseRows(rows) {
        return rows.map((r, idx) => {
            const ratingMatch = String(r.Rating || '').match(/<span[^>]*display:none[^>]*>(\d+)<\/span>/);
            const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

            const cleanText = (str) => String(str || '').replace(/<[^>]*>/g, '').trim();

            // Extract ISP - check multiple possible field names and structures
            let isp = cleanText(r.Isp || r.isp || r.ISP || '');
            if (!isp && r.ISP) {
                isp = cleanText(String(r.ISP)).replace(/<[^>]*>/g, '').trim();
            }
            if (!isp) isp = 'N/A';

            // Extract SPONSOR - check multiple possible field names and structures
            let sponsor = cleanText(r.Sponsor || r.sponsor || r.SPONSOR || '');
            if (!sponsor && r.SPONSOR) {
                sponsor = cleanText(String(r.SPONSOR)).replace(/<[^>]*>/g, '').trim();
            }
            if (!sponsor) sponsor = 'N/A';

            // Log first row for debugging
            if (idx === 0) {
                console.log('[OQ Dashboard] Sample row keys:', Object.keys(r));
                console.log('[OQ Dashboard] Sample row data:', r);
                console.log('[OQ Dashboard] Parsed - ISP:', isp, 'SPONSOR:', sponsor);
            }

            return {
                name:      cleanText(r.offer_name || r.Offer || r.name),
                isp:       isp,
                sponsor:   sponsor,
                mailer:    cleanText(r.ownerId || r.Mailer || r.mailer || 'N/A'),
                delivered: parseInt(r.delivered || 0, 10) || 0,
                clicks:    parseInt(r.clicks || r.Clicks || 0, 10) || 0,
                rating:    rating
            };
        });
    }

    // ── 3. Modal Container & Controls ───────────────────────────────────────
    function createModal() {
        if (document.getElementById('gportal-dashboard-modal')) return;

        const modalHtml = `
            <div id="gportal-dashboard-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:999999; backdrop-filter:blur(4px);">
                <div style="position:absolute; top:15px; right:25px; z-index:1000000; display:flex; gap:10px;">
                    <button id="refresh-dash-btn" style="background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px;">🔄 Sync WATable Data</button>
                    <button id="close-dash-btn" style="background:#ef4444; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px;">✕ Close</button>
                </div>
                <iframe id="dash-iframe" src="${DASHBOARD_URL}" style="width:100%; height:100%; border:none;"></iframe>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('close-dash-btn').onclick = () => {
            document.getElementById('gportal-dashboard-modal').style.display = 'none';
        };

        document.getElementById('refresh-dash-btn').onclick = () => {
            sendDataToIframe();
        };
    }

    // ── 4. Post payload to GitHub Pages iframe ─────────────────────────────
    function sendDataToIframe() {
        const iframe = document.getElementById('dash-iframe');
        if (!iframe) return;

        const rows = extractRows();
        console.log(`[OQ Dashboard] Sending ${rows.length} rows to dashboard...`);
        console.log('[OQ Dashboard] Sample payload:', rows.slice(0, 2));

        iframe.contentWindow.postMessage({
            type: 'GPORTAL_API_DATA',
            payload: rows
        }, '*');
    }

    // ── 5. Inject Button ───────────────────────────────────────────────────
    function injectButton() {
        if (document.getElementById('oq-dashboard-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'oq-dashboard-btn';
        btn.textContent = '📊 Open Dashboard';
        Object.assign(btn.style, {
            position:     'fixed',
            bottom:       '20px',
            right:        '20px',
            zIndex:       '99999',
            background:   '#10b981',
            color:        '#fff',
            border:       'none',
            borderRadius: '8px',
            padding:      '10px 18px',
            fontSize:     '13px',
            fontWeight:   '600',
            cursor:       'pointer',
            boxShadow:    '0 4px 14px rgba(16,185,129,0.4)',
            fontFamily:   'Inter, sans-serif',
            transition:   'opacity 0.2s',
        });

        btn.addEventListener('click', () => {
            createModal();
            document.getElementById('gportal-dashboard-modal').style.display = 'block';
            setTimeout(sendDataToIframe, 400);
        });

        document.body.appendChild(btn);
    }

    // ── 6. Listeners ───────────────────────────────────────────────────────
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'REQUEST_GPORTAL_REFRESH') {
            sendDataToIframe();
        }
    });

    const observer = new MutationObserver(() => {
        if (document.querySelector('#datatable table, script#TbGenerateur')) {
            injectButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'complete') injectButton();
    else window.addEventListener('load', injectButton);
})();
