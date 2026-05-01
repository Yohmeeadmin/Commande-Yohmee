/**
 * Green API — envoi de messages WhatsApp
 * https://green-api.com/docs/api/sending/SendMessage/
 *
 * Variables d'environnement requises :
 *   GREEN_API_INSTANCE_ID   → ex: 1234567890
 *   GREEN_API_TOKEN         → ex: abc123...
 */

const INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const TOKEN = process.env.GREEN_API_TOKEN;

/**
 * Envoie un message WhatsApp à un numéro de téléphone.
 * @param phone  Numéro international sans espaces (ex: "+33612345678" ou "0612345678")
 * @param message Texte du message
 * @returns true si envoyé, false si désactivé ou erreur
 */
export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!INSTANCE_ID || !TOKEN) return false; // désactivé si pas configuré

  // Normaliser en format international (Maroc par défaut si 0X...)
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  // Green API attend "212XXXXXXXXX@c.us" (sans le +)
  const chatId = `${normalized.replace(/^\+/, '')}@c.us`;

  try {
    // Le serveur Green API se déduit des 4 premiers chiffres de l'instance ID
    // ex: 7107606756 → https://7107.api.greenapi.com
    const server = INSTANCE_ID.slice(0, 4);
    const url = `https://${server}.api.greenapi.com/waInstance${INSTANCE_ID}/sendMessage/${TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // Déjà en format international (commence par indicatif connu)
  if (phone.startsWith('+')) return phone;

  // Numéro marocain local : 06/07 → +212 6/7
  if (digits.startsWith('0') && digits.length === 10) {
    return `+212${digits.slice(1)}`;
  }

  // Numéro déjà sans 0 mais 9 chiffres (212XXXXXXXXX ou 6XXXXXXXX)
  if (digits.length === 9) return `+212${digits}`;
  if (digits.length === 12 && digits.startsWith('212')) return `+${digits}`;

  // Fallback : on renvoie tel quel avec +
  return `+${digits}`;
}
