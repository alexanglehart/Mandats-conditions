// Vercel Function: POST /api/extract-person

const ALLOWED_ORIGINS = new Set([
  'https://alexanglehart.github.io',
  'https://mandats-conditions.vercel.app'
]);

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    nickname: { type: 'string' },
    dob: { type: 'string' },
    priority: {
      type: 'string',
      enum: ['high', 'medium', 'low']
    },
    type: {
      type: 'string',
      enum: ['mandat', 'condition']
    },
    mandat: { type: 'string' },
    conditions: {
      type: 'array',
      items: { type: 'string' }
    },
    description: { type: 'string' },
    vehicles: {
      type: 'array',
      items: { type: 'string' }
    },
    addresses: {
      type: 'array',
      items: { type: 'string' }
    },
    info: { type: 'string' },
    uncertainFields: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: [
    'name',
    'nickname',
    'dob',
    'priority',
    'type',
    'mandat',
    'conditions',
    'description',
    'vehicles',
    'addresses',
    'info',
    'uncertainFields'
  ]
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://mandats-conditions.vercel.app';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Méthode non permise.'
    });
  }

  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY n’est pas configurée dans Vercel.'
    });
  }

  const image = req.body?.image;

  if (
    typeof image !== 'string' ||
    !image.startsWith('data:image/')
  ) {
    return res.status(400).json({
      error: 'Image manquante ou format invalide.'
    });
  }

  if (image.length > 4000000) {
    return res.status(413).json({
      error: 'Image trop volumineuse. Réduis la taille de la capture.'
    });
  }

  const prompt = `
Tu aides à transformer une capture d’écran fictive
d’un système d’information en brouillon de fiche personne.

EXTRACTION UNIQUEMENT :

- Lis uniquement ce qui est réellement visible dans l’image.
- N’invente jamais une donnée absente.
- Si un champ est illisible ou incertain, laisse-le vide
  et ajoute son nom dans uncertainFields.
- Respecte exactement l’orthographe, les chiffres et
  les informations visibles.
- Pour dob, utilise YYYY-MM-DD seulement si la date
  complète est clairement visible; sinon laisse vide.
- priority doit être high, medium ou low selon une
  priorité explicitement visible; sinon medium.
- type doit être mandat si un mandat est clairement
  indiqué, sinon condition si des conditions sont
  clairement indiquées; sinon mandat.
- conditions, vehicles et addresses sont des listes;
  une entrée par élément visible.
- Le résultat est un BROUILLON qui sera vérifié par
  l’utilisateur avant sauvegarde.
- Ne prends aucune décision policière et ne déduis
  aucun renseignement qui n’est pas affiché.
`;

  try {
    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
          store: false,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: prompt
                },
                {
                  type: 'input_image',
                  image_url: image,
                  detail: 'high'
                }
              ]
            }
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'person_record',
              strict: true,
              schema
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI error', data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          'Erreur OpenAI.'
      });
    }

    /*
      Correction importante :
      avec l’API REST Responses, le texte généré
      se trouve dans output[].content[].
    */

    const outputText = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(part => part.type === 'output_text')
      .map(part => part.text)
      .join('') || data.output_text || '';

    let person;

    try {
      person = JSON.parse(outputText);
    } catch (parseError) {
      console.error(
        'Réponse OpenAI inattendue:',
        data
      );

      return res.status(502).json({
        error:
          'La réponse de l’IA n’était pas un JSON valide.'
      });
    }

    return res.status(200).json({
      person
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        'Erreur lors de l’analyse de l’image.'
    });
  }
}
