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
          category: {
            type: 'string',
            enum: ['name', 'nickname', 'dob', 'priority', 'mandat', 'condition', 'vehicle', 'address', 'description', 'info']
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['label', 'value', 'category', 'confidence']
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

// Robustness for legacy screens where the vision model may return
// "NOM Mathieu" as the label instead of separating label/value.
const KNOWN_LABELS = [
  'NUMERO IMMATRICULATION', 'NO IMMATRICULATION', 'IMMATRICULATION',
  'NUMERO MANDAT', 'NUMÉRO MANDAT', 'NO MANDAT',
  'DATE DE NAISSANCE', 'DATE NAISSANCE', 'NOM DE FAMILLE', 'NOM COMPLET',
  'ADRESSE COMPLETE', 'MUNICIPALITE', 'MUNICIPALITÉ',
  'NO DOSSIER', 'NIVEAU DE PRIORITE', 'NIVEAU DE PRIORITÉ',
  'DROIT DE CIRCULER', 'STATUT DU VEHICULE', 'STATUT DU VÉHICULE',
  'COULEUR', 'MODELE', 'MODÈLE', 'MARQUE', 'ANNEE', 'ANNÉE',
  'PLAQUE', 'NIV', 'VIN', 'ADR', 'RUE', 'VILLE', 'CITY',
  'PRENOM', 'PRÉNOM', 'P1', 'NOM', 'DDN', 'SEXE', 'YEUX',
  'CONDITION', 'CONDITIONS', 'MANDAT', 'PRIORITE', 'PRIORITÉ',
  'SURNOM', 'ALIAS', 'NOTES', 'NOTE', 'DESCRIPTION', 'DESC', 'AU'
].sort((a, b) => b.length - a.length);

function splitJoinedField(rawLabel, rawValue) {
  const originalLabel = clean(rawLabel);
  const explicitValue = clean(rawValue);
  const normalized = normalizeLabel(originalLabel);

  if (explicitValue) {
    for (const known of KNOWN_LABELS) {
      if (normalized === known) return { label: known, value: explicitValue };
      if (normalized.startsWith(`${known} `) || normalized.startsWith(`${known}:`)) {
        return { label: known, value: explicitValue };
      }
    }
    return { label: normalized, value: explicitValue };
  }

  for (const known of KNOWN_LABELS) {
    if (normalized === known) return { label: known, value: '' };
    if (
      normalized.startsWith(`${known} `) ||
      normalized.startsWith(`${known}:`) ||
      normalized.startsWith(`${known}=`)
    ) {
      const extra = originalLabel.slice(known.length).replace(/^\s*[:=-]?\s*/, '');
      return { label: known, value: clean(extra) };
    }
  }

  return { label: normalized, value: '' };
}

function mapFields(fields) {
  const person = {
    name: '', nickname: '', dob: '', priority: '', type: '', mandat: '',
    conditions: [], description: '', vehicles: [], addresses: [], info: '', uncertainFields: []
  };

  const infoParts = [];
  const descriptionParts = [];
  const vehicleRecords = [];
  const addressRecords = [];
  let currentVehicle = [];
  let currentAddress = [];
  let explicitPriority = false;
  let explicitType = false;

  const finishVehicle = () => {
    if (currentVehicle.length) {
      addUnique(vehicleRecords, currentVehicle.join(' | '));
      currentVehicle = [];
    }
  };

  const finishAddress = () => {
    if (currentAddress.length) {
      addUnique(addressRecords, currentAddress.join(' '));
      currentAddress = [];
    }
  };

  for (const field of fields || []) {
    const parsed = splitJoinedField(field?.label, field?.value);
    const label = parsed.label;
    const value = clean(parsed.value);
    const confidence = field?.confidence || 'medium';
    const category = field?.category || 'info';

    if (!label || !value) continue;

    if (confidence !== 'high') addUnique(person.uncertainFields, field.label);

    // Exact visible labels have priority over AI category suggestions.
    if (['NOM', 'NOM DE FAMILLE', 'NOM COMPLET'].includes(label)) {
      if (!person.name) person.name = value;
      continue;
    }

    if (['PRENOM', 'PRÉNOM', 'P1'].includes(label)) {
      if (!person.name) person.name = value;
      else person.name = `${person.name} ${value}`.trim();
      continue;
    }

    if (['SURNOM', 'ALIAS', 'NOM USUEL'].includes(label)) {
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
        person.priority = 'high';
        explicitPriority = true;
      } else if (p.includes('BAS') || p.includes('LOW')) {
        person.priority = 'low';
        explicitPriority = true;
      } else if (p.includes('MOYEN') || p.includes('MEDIUM')) {
        person.priority = 'medium';
        explicitPriority = true;
      }
      continue;
    }

    // Vehicle fields.
    if (['MARQUE', 'MAKE'].includes(label)) {
      if (currentVehicle.length) finishVehicle();
      currentVehicle.push(`Marque: ${value}`);
      continue;
    }

    if (['MODELE', 'MODÈLE', 'MODEL'].includes(label)) {
      currentVehicle.push(`Modèle: ${value}`);
      continue;
    }

    if (['ANNEE', 'ANNÉE', 'YEAR', 'AU'].includes(label)) {
      currentVehicle.push(`Année: ${value}`);
      continue;
    }

    if (['COULEUR', 'COLOR'].includes(label)) {
      currentVehicle.push(`Couleur: ${value}`);
      continue;
    }

    if (['NIV', 'VIN', 'NO NIV', 'NO VIN'].includes(label)) {
      currentVehicle.push(`NIV: ${value}`);
      continue;
    }

    if (['PLAQUE', 'IMMATRICULATION', 'NO PLAQUE', 'NO IMMATRICULATION'].includes(label)) {
      currentVehicle.push(`Plaque: ${value}`);
      continue;
    }

    if (['DROIT DE CIRCULER'].includes(label)) {
      currentVehicle.push(`Droit de circuler: ${value}`);
      continue;
    }

    if (['STATUT DU VEHICULE', 'STATUT DU VÉHICULE'].includes(label)) {
      currentVehicle.push(`Statut du véhicule: ${value}`);
      continue;
    }

    if (['PERMIS'].includes(label)) {
      currentVehicle.push(`Permis: ${value}`);
      continue;
    }

    // Address fields are combined into a readable address.
    if (['ADR', 'ADRESSE', 'ADDRESS', 'ADRESSE COMPLETE'].includes(label)) {
      if (currentAddress.length) finishAddress();
      currentAddress.push(value);
      continue;
    }

    if (['RUE', 'STREET'].includes(label)) {
      currentAddress.push(value);
      continue;
    }

    if (['VILLE', 'MUNICIPALITE', 'MUNICIPALITÉ', 'CITY'].includes(label)) {
      currentAddress.push(value);
      continue;
    }

    if (['DESCRIPTION', 'DESC', 'NOTES', 'NOTE'].includes(label)) {
      descriptionParts.push(value);
      continue;
    }

    // Fallback only when the model explicitly classified the unknown field.
    if (category === 'vehicle') {
      currentVehicle.push(`${clean(field.label)}: ${value}`);
      continue;
    }

    if (category === 'address') {
      currentAddress.push(value);
      continue;
    }

    if (category === 'description') {
      descriptionParts.push(value);
      continue;
    }

    infoParts.push(`${clean(field.label)}: ${value}`);
  }

  finishVehicle();
  finishAddress();

  for (const v of vehicleRecords) addUnique(person.vehicles, v);
  for (const a of addressRecords) addUnique(person.addresses, a);

  if (descriptionParts.length) person.description = descriptionParts.join(' | ');
  if (infoParts.length) person.info = infoParts.join('\n');

  if (!explicitType) person.type = '';
  if (!explicitPriority) {
    person.priority = '';
  }

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
Tu es un moteur OCR/vision spécialisé dans la lecture de captures d'écran de systèmes d'information anciens.

OBJECTIF :
Lire la capture et préparer un brouillon de personne pour notre application.

RÈGLES :
- Lis uniquement ce qui est réellement visible. N'invente jamais une information.
- Chaque champ visible doit être retourné, même s'il n'est pas utilisé directement par l'application.
- Ne laisse jamais NOM, DDN, MARQUE, MODÈLE, AU, NIV ou ADR sans valeur si leur valeur est lisible sur l'image.
- Sépare TOUJOURS le libellé de sa valeur.
- Exemple : "NOM Mathieu" => label="NOM", value="Mathieu".
- Si plusieurs mots suivent un libellé, ils appartiennent à la valeur jusqu'au prochain libellé visible.
- Conserve exactement les lettres, chiffres et mots visibles.
- Pour une donnée difficile à lire, garde la meilleure transcription possible et utilise medium ou low.
- Utilise category pour indiquer où le champ devrait aller dans l'application, sans inventer sa valeur.

CATÉGORIES :
- name = nom/prénom de la personne. Inclut P1 lorsqu'il représente le prénom sur cet ancien système.
- nickname = surnom/alias.
- dob = date de naissance.
- vehicle = marque, modèle, année, couleur, NIV/VIN, plaque, droit de circuler, statut du véhicule, permis et autres données clairement liées au véhicule.
- address = adresse, rue, municipalité/ville et autres composantes clairement liées à l'adresse.
- mandat = seulement si le libellé indique réellement un mandat.
- condition = seulement si le libellé indique réellement une condition.
- priority = seulement si une priorité est explicitement affichée.
- description = description ou notes.
- info = autres renseignements visibles qui ne correspondent pas aux catégories ci-dessus.

EXEMPLES DE L'ÉCRAN :
- "MARQUE HYUNDAI" => MARQUE / HYUNDAI / vehicle
- "MODÈLE ELANTRA" => MODÈLE / ELANTRA / vehicle
- "AU 2016 Noir" => AU / 2016 Noir / vehicle
- "NIV 5NEDH4AE6GH743027" => NIV / 5NEDH4AE6GH743027 / vehicle
- "ADR 116..." => ADR / 116... / address
- "rue Grenier" => RUE / Grenier / address
- "NOM Mathieu" => NOM / Mathieu / name
- "P1 Marilou" ou "P1: Marilou" => P1 / Marilou / name
- "DDN 20030224" => DDN / 20030224 / dob

IMPORTANT :
- SEXE, YEUX et NO DOSSIER restent normalement dans info.
- STATUT DU VÉHICULE, DROIT DE CIRCULER et PERMIS sont des renseignements du véhicule et doivent aller dans vehicle.
- Ne transforme jamais ces champs en mandat, condition ou priorité.
- Ne crée jamais une adresse à partir d'une simple ville si l'écran ne permet pas de le confirmer.
- Si une ligne contient plusieurs champs, sépare-les logiquement : par exemple 'AU 2016 Noir' contient l'année 2016 et la couleur Noir, mais ne mélange pas ces données avec la marque ou le modèle.
- Les lignes inconnues restent dans info plutôt que d'être inventées ou supprimées.

Ne produis aucune explication. Retourne uniquement le JSON demandé.
`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
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
      return res.status(response.status).json({
        error: data?.error?.message || 'Erreur OpenAI.'
      });
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
      return res.status(502).json({
        error: 'La réponse de l’IA n’était pas un JSON valide.'
      });
    }

    return res.status(200).json({
      person: mapFields(extracted.fields)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Erreur lors de l’analyse de l’image.'
    });
  }
}
