import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODEL = 'gemini-2.0-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function POST(req: NextRequest) {
  try {
    const { text, imageBase64, mimeType, articles, clients, aliases } = await req.json();

    if (!text && !imageBase64) {
      return NextResponse.json({ error: 'Texte ou image requis' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY manquant dans .env.local' }, { status: 500 });
    }

    const catalogText = (articles as { id: string; display_name: string; ref_name?: string }[])
      .map(a => `- id:"${a.id}" nom:"${a.display_name}"${a.ref_name ? ` (aussi appelé "${a.ref_name}")` : ''}`)
      .join('\n');

    const clientsText = (clients as { id: string; nom: string }[])
      .map(c => `- id:"${c.id}" nom:"${c.nom}"`)
      .join('\n');

    const aliasLines = Object.entries(aliases || {})
      .map(([k, v]) => `"${k}" → id:"${v}"`)
      .join('\n');

    const prompt = `Tu es un assistant pour une boulangerie. Analyse ce bon de commande et extrait les données structurées.

CATALOGUE DE PRODUITS:
${catalogText || '(aucun produit)'}

CLIENTS CONNUS:
${clientsText || '(aucun client)'}

${aliasLines ? `CORRESPONDANCES APPRISES (priorité maximale):\n${aliasLines}` : ''}

RÈGLES:
- Matching sémantique: "pain brioché" → burger bun, "tarte au citron" → tarte citron, etc.
- Utilise les correspondances apprises en priorité absolue
- confiance: 0.95+ si certain, 0.7-0.94 si probable, <0.7 si incertain
- Si article non trouvé: article_id null, confiance < 0.5
- Date: cherche toute mention de date → format YYYY-MM-DD (aujourd'hui: ${new Date().toISOString().split('T')[0]})
- Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans texte autour

Format:
{
  "client_id": "uuid ou null",
  "client_nom_detecte": "nom détecté",
  "date_livraison": "YYYY-MM-DD ou null",
  "lignes": [
    { "texte_original": "...", "article_id": "uuid ou null", "article_nom": "...", "quantite": 10, "confiance": 0.95 }
  ]
}

${text ? `BON DE COMMANDE:\n${text}` : "Analyse le bon de commande dans l'image."}`;

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } });
    }
    parts.push({ text: prompt });

    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    });

    // Retry automatique sur quota dépassé (max 3 tentatives, délai croissant)
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 2000));

      const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (response.status === 429) {
        const errData = await response.json();
        const retryMs = parseRetryDelay(errData);
        lastError = `Quota dépassé. Réessai dans ${Math.ceil(retryMs / 1000)}s…`;
        if (retryMs > 0 && retryMs < 10000) await new Promise(r => setTimeout(r, retryMs));
        continue;
      }

      if (!response.ok) {
        const err = await response.text();
        return NextResponse.json({ error: `Gemini API: ${err}` }, { status: 500 });
      }

      const data = await response.json();
      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: 'Réponse invalide', raw: rawContent }, { status: 500 });
      }

      return NextResponse.json(JSON.parse(jsonMatch[0]));
    }

    return NextResponse.json({ error: lastError || 'Quota Gemini dépassé — réessaie dans quelques secondes' }, { status: 429 });
  } catch (err: any) {
    console.error('[parse-order]', err);
    return NextResponse.json({ error: err?.message || 'Erreur inconnue' }, { status: 500 });
  }
}

function parseRetryDelay(errData: any): number {
  try {
    const detail = errData?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
    const delay = detail?.retryDelay || '0s';
    return parseFloat(delay) * 1000;
  } catch { return 2000; }
}
