// Cloudflare Worker for AI Homework Helper
// This worker processes homework images: uploads, extracts text, solves exercises, and saves to Firebase

const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const GREENHOST_API_URL = "https://greenbase.arielcapdevila.com";

// Firebase configuration
const FIREBASE_CONFIG = {
    projectId: "calendar-1868c",
    apiKey: "AIzaSyDPEsl_dE1fzYkuxemJRvhDxpfvYZfgGZo"
};

export default {
    async fetch(request, env) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // Health check endpoint
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'OK' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Process image endpoint
        if (url.pathname === '/process' && request.method === 'POST') {
            try {
                const formData = await request.formData();
                const imageBlob = formData.get('image');
                const subject = formData.get('subject');
                const page = formData.get('page');
                const userName = formData.get('userName');

                if (!imageBlob || !subject || !page || !userName) {
                    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // Process in background (no await - fire and forget)
                processImageAsync(imageBlob, subject, page, userName);

                // Return immediately
                return new Response(JSON.stringify({
                    status: 'processing',
                    message: 'Image submitted for processing'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });

            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

async function processImageAsync(imageBlob, subject, page, userName) {
    try {
        // Step 1: Upload to GreenHost
        const imageUrl = await uploadToGreenHost(imageBlob);

        // Step 2: Extract text with Pixtral
        const transcription = await extractTextWithPixtral(imageUrl);

        // Step 3: Solve with Mistral Large
        const aiJson = await solveWithMistral(transcription);

        let aiData;
        try {
            aiData = JSON.parse(aiJson);
            aiData = normalizeExerciseData(aiData);
        } catch (e) {
            aiData = { exercises: [] };
        }

        // Step 4: Save to Firebase
        await saveToFirebase({
            subject: subject,
            page: parseInt(page),
            imageUrl: imageUrl,
            solution: aiData.exercises || aiData,
            providedBy: userName,
            timestamp: new Date().toISOString()
        });

        console.log(`Successfully processed page ${page} for ${subject}`);
    } catch (error) {
        console.error('Processing error:', error);
    }
}

async function uploadToGreenHost(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'scan.jpg');
    const res = await fetch(`${GREENHOST_API_URL}/upload`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return `${GREENHOST_API_URL}/file/${data.id}`;
}

async function extractTextWithPixtral(imageUrl) {
    const prompt = "Transcribe TODO el texto de los ejercicios. Solo texto.";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
            model: "pixtral-12b-latest",
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: imageUrl }
                ]
            }],
            temperature: 0.1
        })
    });
    if (!res.ok) throw new Error("Pixtral failed");
    const data = await res.json();
    return data.choices[0].message.content;
}

async function solveWithMistral(transcription) {
    const prompt = `Eres un profesor experto. Resuelve TODOS los ejercicios de esta página de deberes.

TEXTO DE LA PÁGINA:
---
${transcription}
---

INSTRUCCIONES IMPORTANTES:
1. Identifica TODOS los ejercicios
2. Resuelve cada ejercicio completamente
3. Devuelve SOLAMENTE un objeto JSON válido
4. NO incluyas ningún texto adicional, comentarios ni explicaciones fuera del JSON

FORMATO JSON OBLIGATORIO (USA EXACTAMENTE ESTOS NOMBRES DE CAMPOS):
{
  "exercises": [
    {
      "exercise": "NÚMERO_DEL_EJERCICIO",
      "question": "ENUNCIADO_DEL_EJERCICIO",
      "solution": "SOLUCIÓN_COMPLETA"
    }
  ]
}

REGLAS ESTRICTAS:
- El campo DEBE llamarse "exercise" (singular, no "exercises")
- El campo DEBE llamarse "question" (singular, no "questions")
- El campo DEBE llamarse "solution" (singular, no "solutions")
- "exercise" es el número o identificador (ej: "1", "1.1", "2a")
- "question" es el enunciado completo del ejercicio
- "solution" es la respuesta o solución completa

EJEMPLO VÁLIDO:
{
  "exercises": [
    {
      "exercise": "1",
      "question": "Calcula 5 + 3",
      "solution": "8"
    },
    {
      "exercise": "2",
      "question": "¿Cuál es la capital de Francia?",
      "solution": "París"
    }
  ]
}

Ahora resuelve los ejercicios y devuelve SOLAMENTE el JSON con el formato exacto especificado arriba.`;

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.3
        })
    });
    if (!res.ok) throw new Error("Mistral failed");
    const data = await res.json();
    return data.choices[0].message.content;
}

function normalizeExerciseData(data) {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data.exercises)) {
        data.exercises = data.exercises.map(item => ({
            exercise: item.exercise || item.exercises || item.number || item.id || '',
            question: item.question || item.questions || item.enunciado || item.prompt || '',
            solution: item.solution || item.solutions || item.answer || item.respuesta || ''
        }));
    }

    return data;
}

async function saveToFirebase(pageData) {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/pages?key=${FIREBASE_CONFIG.apiKey}`;

    // Convert to Firestore format
    const firestoreDoc = {
        fields: {
            subject: { stringValue: pageData.subject },
            page: { integerValue: pageData.page.toString() },
            imageUrl: { stringValue: pageData.imageUrl },
            solution: { stringValue: JSON.stringify(pageData.solution) },
            providedBy: { stringValue: pageData.providedBy },
            timestamp: { timestampValue: pageData.timestamp }
        }
    };

    const res = await fetch(firestoreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firestoreDoc)
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Firebase save failed: ${error}`);
    }

    return await res.json();
}
