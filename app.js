// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPEsl_dE1fzYkuxemJRvhDxpfvYZfgGZo",
    authDomain: "calendar-1868c.firebaseapp.com",
    projectId: "calendar-1868c",
    storageBucket: "calendar-1868c.firebasestorage.app",
    messagingSenderId: "872239833100",
    appId: "1:872239833100:web:b9059b5f589825f2950e29",
    measurementId: "G-RRR30MYKXW"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init error", e);
}

const db = firebase.firestore();

// Application State
const state = {
    currentView: 'view-subjects',
    selectedSubject: null,
    selectedPage: null,
    subjects: [
        'Matemáticas',
        'Física y Química',
        'Lengua',
        'Geografía',
        'TIC',
        'ATE',
        'EPVA',
        'Project',
        'Inglés',
        'Educación Física',
        'Tecnología y Digitalización',
        'Otros'
    ],
    cameraStream: null,
    unsubscribePages: null
};

// DOM Elements
const views = {
    subjects: document.getElementById('view-subjects'),
    pages: document.getElementById('view-pages'),
    result: document.getElementById('view-result')
};
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');
const subjectListEl = document.getElementById('subject-list');
const pageListEl = document.getElementById('page-list');
const resultContent = document.getElementById('result-content');
const fabAdd = document.getElementById('fab-add');
const modalSelect = document.getElementById('modal-select');
const selectSubject = document.getElementById('select-subject');
const inputPage = document.getElementById('input-page');
const btnConfirmSelect = document.getElementById('btn-confirm-select');
const btnCancelSelect = document.getElementById('btn-cancel-select');
const overlayCamera = document.getElementById('overlay-camera');
const videoEl = document.getElementById('camera-feed');
const btnCapture = document.getElementById('btn-capture');
const btnCloseCamera = document.getElementById('btn-close-camera');
const overlayProcessing = document.getElementById('overlay-processing');
const processingText = document.getElementById('processing-text');
const canvas = document.getElementById('camera-canvas');

// API Configuration
const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT"; // Note: Client-side exposure is risky in prod.
const GREENHOST_API_URL = "https://greenbase.arielcapdevila.com";

// --- Initialization ---

function init() {
    renderSubjects();
    setupEventListeners();
    populateSubjectSelect();
}

function setupEventListeners() {
    // Navigation
    backBtn.addEventListener('click', () => {
        if (state.currentView === 'view-result') {
            navigateTo('view-pages', state.selectedSubject);
        } else if (state.currentView === 'view-pages') {
            navigateTo('view-subjects');
        }
    });

    // FAB
    fabAdd.addEventListener('click', () => {
        // Pre-select current subject if in page view
        if (state.selectedSubject) {
            selectSubject.value = state.selectedSubject;
        }
        showModal(modalSelect);
    });

    // Modal Actions
    btnCancelSelect.addEventListener('click', () => hideModal(modalSelect));

    btnConfirmSelect.addEventListener('click', () => {
        const subject = selectSubject.value;
        const page = inputPage.value;
        if (subject && page) {
            hideModal(modalSelect);
            startCameraFlow(subject, page);
        } else {
            alert("Por favor selecciona asignatura y página");
        }
    });

    // Camera Actions
    btnCloseCamera.addEventListener('click', stopCamera);
    btnCapture.addEventListener('click', handleCapture);
}

// --- Navigation & Rendering ---

function navigateTo(viewId, param = null) {
    // Hide all views
    Object.values(views).forEach(el => el.classList.remove('active'));

    // Update State & View
    state.currentView = viewId;
    views[viewId.replace('view-', '')].classList.add('active');

    // Header Logic
    if (viewId === 'view-subjects') {
        headerTitle.textContent = "Asignaturas";
        backBtn.classList.add('hidden');
        fabAdd.classList.remove('hidden');
        state.selectedSubject = null;
    } else if (viewId === 'view-pages') {
        state.selectedSubject = param;
        headerTitle.textContent = param;
        backBtn.classList.remove('hidden');
        fabAdd.classList.remove('hidden');
        loadPages(param);
    } else if (viewId === 'view-result') {
        // Param is page object
        state.selectedPage = param;
        headerTitle.textContent = `Pág ${param.page}`;
        backBtn.classList.remove('hidden');
        fabAdd.classList.add('hidden'); // Hide add button on result view
        renderResult(param);
    }
}

function renderSubjects() {
    subjectListEl.innerHTML = '';
    state.subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        // Simple icon mapping just for visuals
        const icon = getSubjectIcon(sub);
        card.innerHTML = `<span class="subject-icon">${icon}</span><div class="subject-name">${sub}</div>`;
        card.onclick = () => navigateTo('view-pages', sub);
        subjectListEl.appendChild(card);
    });
}

function getSubjectIcon(subject) {
    const icons = {
        'Matemáticas': '📐',
        'Física y Química': '🧪',
        'Lengua': '📚',
        'Geografía': '🌍',
        'TIC': '💻',
        'ATE': '🧩',
        'EPVA': '🎨',
        'Project': '🚀',
        'Inglés': '🇬🇧',
        'Educación Física': '⚽',
        'Tecnología y Digitalización': '🤖',
        'Otros': '📦'
    };
    return icons[subject] || '📝';
}

function populateSubjectSelect() {
    selectSubject.innerHTML = '';
    state.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        selectSubject.appendChild(opt);
    });
}

// --- Firebase Data Fetching ---

function loadPages(subject) {
    pageListEl.innerHTML = '<div class="spinner" style="border-color: var(--primary-color); border-top-color: transparent; margin: 2rem auto;"></div>';

    // Detach previous listener if exists (store in state)
    if (state.unsubscribePages) {
        state.unsubscribePages();
    }

    state.unsubscribePages = db.collection('pages')
        .where('subject', '==', subject)
        .orderBy('timestamp', 'desc')
        .onSnapshot(snapshot => {
            pageListEl.innerHTML = '';
            if (snapshot.empty) {
                pageListEl.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No hay páginas escaneadas aún.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = 'page-item';
                item.innerHTML = `
                    <span class="page-number">Pág ${data.page}</span>
                    <span class="page-status">Ver solución ›</span>
                `;
                item.onclick = () => navigateTo('view-result', data);
                pageListEl.appendChild(item);
            });
        }, error => {
            console.error("Error watching pages: ", error);
            pageListEl.innerHTML = `<p style="color:var(--error)">Error al cargar páginas.</p>`;
        });
}

function renderResult(pageData) {
    // Parse JSON solution if string, or use directly
    let solution = [];
    try {
        if (typeof pageData.solution === 'string') {
            // Clean markdown json blocks if present
            const cleanJson = pageData.solution.replace(/```json/g, '').replace(/```/g, '').trim();
            solution = JSON.parse(cleanJson);
        } else {
            solution = pageData.solution;
        }
    } catch (e) {
        console.error("JSON Parse Error", e);
        resultContent.innerHTML = `<div class="exercise-card"><p>Error al procesar la respuesta de la IA. Visualiza la imagen original.</p></div>`;
    }

    let html = `
        <div class="result-header">
            <img src="${pageData.imageUrl}" style="width:100%; border-radius: var(--radius); margin-bottom: 1rem;" alt="Foto de la página">
            <h3>Soluciones</h3>
        </div>
    `;

    if (Array.isArray(solution)) {
        // Recursive function to render complex objects/arrays
        const renderValue = (val) => {
            if (val === null || val === undefined) return '';

            if (Array.isArray(val)) {
                return `<ul style="padding-left:1.2rem; margin:0.5rem 0; list-style-type: none;">
                    ${val.map(v => `<li>• ${renderValue(v)}</li>`).join('')}
                </ul>`;
            }

            if (typeof val === 'object') {
                // Flatten object to key: value
                return `<div style="margin-left: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
                    ${Object.entries(val).map(([k, v]) => `
                        <div><strong style="color:var(--secondary-color);">${k}:</strong> ${renderValue(v)}</div>
                    `).join('')}
                </div>`;
            }
            return val;
        };

        solution.forEach((item, index) => {
            const answer = item.solution || item.answer;
            const displayAnswer = renderValue(answer);

            html += `
                <div class="exercise-card">
                    <div class="exercise-title">
                        <span>${item.exercise || `Ejercicio ${index + 1}`}</span>
                    </div>
                    <div class="exercise-content">
                        <strong>Pregunta:</strong> ${item.question || 'N/A'}<br><br>
                        <strong>Respuesta:</strong> 
                        <div style="margin-top:0.5rem;">${displayAnswer || 'Ver imagen'}</div>
                    </div>
                </div>
            `;
        });
    } else {
        html += `<pre style="white-space: pre-wrap;">${JSON.stringify(solution, null, 2)}</pre>`;
    }

    resultContent.innerHTML = html;
}

// --- Camera & Flow ---

function showModal(modal) {
    modal.classList.add('visible'); // Flex display handled by class
    // Animation via CSS opacity
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
    });
}

function hideModal(modal) {
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.classList.remove('visible');
    }, 300);
}

function startCameraFlow(subject, page) {
    console.log(`Starting camera for ${subject} page ${page}`);
    state.pendingUpload = { subject, page };

    // Show Fullscreen Camera
    overlayCamera.classList.remove('hidden');

    // Init Camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
                width: { ideal: 4096 }, // Request 4K or highest
                height: { ideal: 2160 }
            }
        })
            .then(stream => {
                state.cameraStream = stream;
                videoEl.srcObject = stream;
            })
            .catch(err => {
                console.warn("Rear camera failed, trying default", err);
                // Fallback
                navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 4096 },
                        height: { ideal: 2160 }
                    }
                })
                    .then(stream => {
                        state.cameraStream = stream;
                        videoEl.srcObject = stream;
                    })
                    .catch(e => {
                        alert("No se pudo acceder a la cámara.");
                        stopCamera();
                    });
            });
    } else {
        alert("Tu navegador no soporta acceso a cámara.");
        stopCamera();
    }
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
    overlayCamera.classList.add('hidden');
}

async function handleCapture() {
    // Draw video frame to canvas
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, width, height);

    stopCamera(); // Stop processing stream

    // Show Processing
    overlayProcessing.classList.remove('hidden');
    processingText.textContent = "Procesando...";

    // Convert to Blob
    canvas.toBlob(blob => {
        if (blob) {
            processImage(blob);
        } else {
            alert("Error al capturar.");
            overlayProcessing.classList.add('hidden');
        }
    }, 'image/jpeg', 0.85);
}

// --- Processing Logic ---

async function processImage(imageBlob) {
    try {
        // 1. Upload to GreenHost
        processingText.textContent = "Subiendo imagen...";
        const imageUrl = await uploadToGreenHost(imageBlob);
        console.log("Uploaded Image URL:", imageUrl);

        // 2. Mistral AI Analysis
        processingText.textContent = "Analizando ejercicios...";
        const aiResult = await callMistralAI(imageUrl);
        console.log("AI Result:", aiResult);

        // 3. Save to Firestore
        processingText.textContent = "Guardando...";
        const pageData = {
            subject: state.pendingUpload.subject,
            page: parseInt(state.pendingUpload.page),
            imageUrl: imageUrl,
            solution: aiResult,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Add to Firestore
        await db.collection('pages').add(pageData);

        // Done
        overlayProcessing.classList.add('hidden');

        // Navigate to result
        // Need to pass the data object directly since we just created it
        // Add timestamp manual for immediate display
        navigateTo('view-result', pageData);

    } catch (error) {
        console.error("Processing Flow Error:", error);
        alert("Hubo un error: " + error.message);
        overlayProcessing.classList.add('hidden');
    }
}

async function uploadToGreenHost(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'page_scan.jpg');

    const response = await fetch(`${GREENHOST_API_URL}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Error subida: ${response.status} ${txt}`);
    }

    const data = await response.json();
    return `${GREENHOST_API_URL}/file/${data.id}`;
}

async function callMistralAI(imageUrl) {
    const prompt = `
        Analiza esta imagen de deberes escolares.
        Identifica cada ejercicio visible en la página.
        Resuelve cada ejercicio paso a paso de manera clara.
        IMPORTANTE: Devuelve la respuesta SOLAMENTE en formato JSON válido.
        El formato debe ser una lista de objetos: 
        [
            { "exercise": "Número o Título del ejercicio", "question": "Texto de la pregunta", "solution": "Resolución detallada" }
        ]
        No añadas texto antes ni después del JSON.
    `;

    const payload = {
        model: "pixtral-12b-latest",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: imageUrl }
                ]
            }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
    };

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error("Mistral API Error: " + (errorData.message || response.statusText));
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Start
document.addEventListener('DOMContentLoaded', init);
