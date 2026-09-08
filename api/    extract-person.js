// Vercel Function: POST /api/extract-person

const ALLOWED_ORIGINS = new Set([
  'https://alexanglehart.github.io',
  'https://mandats-conditions.vercel.app'
]);

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['label', 'value', 'confidence']
      }
    }
  },
  required: ['fields']
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://mandats-conditions.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeLabel(label) {
  return clean(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function normalizeDate(value) {
  const v = clean(value).replace(/[^0-9]/g, '');
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return clean(value);
}

function addUnique(list, value) {
  const v = clean(value);
  if (v && !list.some(x => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

function mapFields(fields) {
  const person = {
    name: '', nickname: '', dob: '', priority: 'medium', type: '', mandat: '',
    conditions: [], description: '', vehicles: [], addresses: [], info: '', uncertainFields: []
  };

  const infoParts = [];
  const descriptionParts = [];
  const vehicleParts = [];
  let explicitPriority = false;
  let explicitType = false;

  for (const field of fields || []) {
    const label = normalizeLabel(field?.label);
    const value = clean(field?.value);
    const confidence = field?.confidence || 'medium';
    if (!label || !value) continue;

    if (confidence !== 'high') addUnique(person.uncertainFields, field.label);

    if (['NOM', 'NOM DE FAMILLE', 'NOM COMPLET'].includes(label)) {
      if (!person.name) person.name = value;
      continue;
    }
    if (['PRENOM', 'PRÉNOM'].includes(label)) {
      if (!person.name) person.name = value;
      else person.name = `${person.name} ${value}`.trim();
      continue;
    }
    if (['SURNOM', 'ALIAS', 'SURNOM / ALIAS', 'NOM USUEL'].includes(label)) {
      person.nickname = value;
      continue;
    }
    if (['DDN', 'DATE DE NAISSANCE', 'DATE NAISSANCE', 'NAISSANCE'].includes(label)) {
      person.dob = normalizeDate(value);
      continue;
    }

    if (['MANDAT', 'NO MANDAT', 'NUMERO MANDAT', 'NUMÉRO MANDAT'].includes(label)) {
      person.mandat = value;
      person.type = 'mandat';
      explicitType = true;
      continue;
    }
    if (['CONDITION', 'CONDITIONS'].includes(label)) {
      addUnique(person.conditions, value);
      person.type = 'condition';
      explicitType = true;
      continue;
    }
    if (['PRIORITE', 'PRIORITÉ', 'NIVEAU DE PRIORITE', 'NIVEAU DE PRIORITÉ'].includes(label)) {
      const p = normalizeLabel(value);
      if (p.includes('HAUT') || p.includes('HIGH') || p.includes('URGENT')) {
        person.priority = 'high'; explicitPriority = true;
      } else if (p.includes('BAS') || p.includes('LOW')) {
        person.priority = 'low'; explicitPriority = true;
      } else if (p.includes('MOYEN') || p.includes('MEDIUM')) {
        person.priority = 'medium'; explicitPriority = true;
      }
      continue;
    }

    if (['MARQUE', 'MAKE'].includes(label)) { vehicleParts.push(`Marque: ${value}`); continue; }
    if (['MODELE', 'MODÈLE', 'MODEL'].includes(label)) { vehicleParts.push(`Modèle: ${value}`); continue; }
    if (['ANNEE', 'ANNÉE', 'YEAR'].includes(label)) { vehicleParts.push(`Année: ${value}`); continue; }
    if (['COULEUR', 'COLOR'].includes(label)) { vehicleParts.push(`Couleur: ${value}`); continue; }
    if (['NIV', 'VIN', 'NO NIV', 'NO VIN'].includes(label)) { vehicleParts.push(`NIV: ${value}`); continue; }
    if (['PLAQUE', 'IMMATRICULATION', 'NO PLAQUE', 'NO IMMATRICULATION'].includes(label)) { vehicleParts.push(`Plaque: ${value}`); continue; }

    if (['ADR', 'ADRESSE', 'ADDRESS', 'ADRESSE COMPLETE'].includes(label)) { addUnique(person.addresses, value); continue; }
    if (['RUE', 'STREET'].includes(label)) { addUnique(person.addresses, value); continue; }
    if (['VILLE', 'MUNICIPALITE', 'MUNICIPALITÉ', 'CITY'].includes(label)) { addUnique(person.addresses, value); continue; }

    if (['DESCRIPTION', 'DESC', 'NOTES', 'NOTE'].includes(label)) {
      descriptionParts.push(value);
      continue;
    }

    infoParts.push(`${clean(field.label)}: ${value}`);
  }

  if (vehicleParts.length) addUnique(person.vehicles, vehicleParts.join(' | '));
  if (descriptionParts.length) person.description = descriptionParts.join(' | ');
  if (infoParts.length) person.info = infoParts.join('\n');
  if (!explicitType) person.type = '';
  if (!explicitPriority) addUnique(person.uncertainFields, 'Priorité');

  return person;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  Object.entries(corsHeaders(origin)).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non permise.' });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY n’est pas configurée dans Vercel.' });

  const image = req.body?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Image manquante ou format invalide.' });
  }
  if (image.length > 4000000) {
    return res.status(413).json({ error: 'Image trop volumineuse. Réduis la taille de la capture.' });
  }

  const prompt = `
Tu es un moteur d'extraction OCR/vision pour une capture d'écran fictive provenant d'un ancien système d'information.

TON UNIQUE TÂCHE EST DE TRANSCRIRE LES CHAMPS VISIBLES.

RÈGLES ABSOLUES :
- Lis uniquement ce qui est réellement visible dans l'image.
- N'invente jamais une information.
- Ne déduis jamais la catégorie d'une donnée.
- Ne transforme pas une donnée en une autre donnée.
- Conserve exactement les chiffres, lettres et mots visibles.
- Pour chaque champ, retourne son LIBELLÉ visible et sa VALEUR visible.
- Une ligne du système = un objet fields lorsque possible.
- Si le libellé est visible mais la valeur est illisible, mets confidence à low.
- Si la valeur est parfaitement lisible, confidence = high.
- Si elle est partiellement lisible ou ambiguë, confidence = medium ou low.
- N'interprète pas le sexe, les yeux, le statut, le droit de circuler, le numéro de dossier, etc. : transcris simplement leur libellé et leur valeur.
- N'invente pas de mandat, de condition, de priorité ou d'adresse.
- Les champs inconnus sont importants : retourne-les quand même.

EXEMPLE :
Si l'écran affiche : MARQUE HYUNDAI
retourne label="MARQUE", value="HYUNDAI".
Si l'écran affiche : DDN 20030224
retourne label="DDN", value="20030224".
Si l'écran affiche : NIV 5NEDH4AE6GH743027
retourne label="NIV", value="5NEDH4AE6GH743027".

Ne produis aucune explication. Retourne uniquement le JSON demandé.
`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        store: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: image, detail: 'high' }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'screen_fields',
            strict: true,
            schema: extractionSchema
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error', data);
      return res.status(response.status).json({ error: data?.error?.message || 'Erreur OpenAI.' });
    }

    const outputText = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text')
      .map(part => part.text)
      .join('') || data.output_text || '';

    let extracted;
    try {
      extracted = JSON.parse(outputText);
    } catch (parseError) {
      console.error('Réponse OpenAI inattendue:', data);
      return res.status(502).json({ error: 'La réponse de l’IA n’était pas un JSON valide.' });
    }

    return res.status(200).json({ person: mapFields(extracted.fields) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de l’analyse de l’image.' });
  }
}
