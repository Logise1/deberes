// Cloudflare Worker for AI Homework Helper
// This worker manages a queue system: uploads are queued, and processing happens via /work endpoint

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

        // Add to queue endpoint
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

                // Step 1: Upload image to GreenHost
                const imageUrl = await uploadToGreenHost(imageBlob);

                // Step 2: Save to queue in Firebase
                const queueItem = await addToQueue({
                    subject: subject,
                    page: parseInt(page),
                    imageUrl: imageUrl,
                    providedBy: userName,
                    queuedAt: new Date().toISOString(),
                    status: 'pending'
                });

                // Return immediately
                return new Response(JSON.stringify({
                    status: 'queued',
                    message: 'Image added to processing queue',
                    queueId: queueItem.name
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

        // Process one item from queue endpoint
        if (url.pathname === '/work' && request.method === 'GET') {
            try {
                // Get a random item from queue
                const queueItem = await getRandomQueueItem();

                if (!queueItem) {
                    return new Response(JSON.stringify({
                        status: 'idle',
                        message: 'No items in queue'
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // Process the item
                const result = await processQueueItem(queueItem);

                // Delete from queue
                await deleteFromQueue(queueItem.id);

                return new Response(JSON.stringify({
                    status: 'completed',
                    message: 'Item processed and removed from queue',
                    processed: {
                        subject: queueItem.data.subject,
                        page: queueItem.data.page,
                        providedBy: queueItem.data.providedBy
                    }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });

            } catch (error) {
                return new Response(JSON.stringify({
                    status: 'error',
                    error: error.message
                }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }
};

// Add item to queue in Firebase
async function addToQueue(queueData) {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/queue?key=${FIREBASE_CONFIG.apiKey}`;

    const firestoreDoc = {
        fields: {
            subject: { stringValue: queueData.subject },
            page: { integerValue: queueData.page.toString() },
            imageUrl: { stringValue: queueData.imageUrl },
            providedBy: { stringValue: queueData.providedBy },
            queuedAt: { timestampValue: queueData.queuedAt },
            status: { stringValue: queueData.status }
        }
    };

    const res = await fetch(firestoreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firestoreDoc)
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Failed to add to queue: ${error}`);
    }

    return await res.json();
}

// Get all queue items
async function getAllQueueItems() {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/queue?key=${FIREBASE_CONFIG.apiKey}`;

    const res = await fetch(firestoreUrl);

    if (!res.ok) {
        throw new Error('Failed to fetch queue');
    }

    const data = await res.json();

    if (!data.documents || data.documents.length === 0) {
        return [];
    }

    return data.documents.map(doc => ({
        id: doc.name,
        data: {
            subject: doc.fields.subject?.stringValue,
            page: parseInt(doc.fields.page?.integerValue),
            imageUrl: doc.fields.imageUrl?.stringValue,
            providedBy: doc.fields.providedBy?.stringValue,
            queuedAt: doc.fields.queuedAt?.timestampValue,
            status: doc.fields.status?.stringValue
        }
    }));
}

// Get a random item from queue
async function getRandomQueueItem() {
    const items = await getAllQueueItems();

    if (items.length === 0) {
        return null;
    }

    // Return random item
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
}

// Process a queue item
async function processQueueItem(queueItem) {
    const data = queueItem.data;

    try {
        // Step 1: Extract text with Pixtral
        const transcription = await extractTextWithPixtral(data.imageUrl);

        // Step 2: Solve with Mistral Large
        const aiJson = await solveWithMistral(transcription);

        let aiData;
        try {
            aiData = JSON.parse(aiJson);
            aiData = normalizeExerciseData(aiData);
        } catch (e) {
            aiData = { exercises: [] };
        }

        // Step 3: Save to pages collection in Firebase
        await saveToFirebase({
            subject: data.subject,
            page: data.page,
            imageUrl: data.imageUrl,
            solution: aiData.exercises || aiData,
            providedBy: data.providedBy,
            timestamp: new Date().toISOString()
        });

        console.log(`Successfully processed page ${data.page} for ${data.subject}`);
        return { success: true };
    } catch (error) {
        console.error('Processing error:', error);
        throw error;
    }
}

// Delete item from queue
async function deleteFromQueue(documentPath) {
    const deleteUrl = `https://firestore.googleapis.com/v1/${documentPath}?key=${FIREBASE_CONFIG.apiKey}`;

    const res = await fetch(deleteUrl, {
        method: 'DELETE'
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Failed to delete from queue: ${error}`);
    }

    return true;
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
