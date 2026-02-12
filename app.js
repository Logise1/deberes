/* COMPLETE CLEAN FILE */

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
    unsubscribePages: null,
    pendingUpload: { subject: null, page: null }
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
const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
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
        if (state.selectedSubject) {
            selectSubject.value = state.selectedSubject;
        }
        showModal(modalSelect);
    });

    // Modal Actions
    btnCancelSelect.addEventListener('click', () => hideModal(modalSelect));

    btnConfirmSelect.addEventListener('click', () => {
        const subject = selectSubject.value;
        const page = inputPage.value || '?';
        if (subject) {
            hideModal(modalSelect);
            startCameraFlow(subject, page);
        } else {
            alert("Por favor selecciona asignatura");
        }
    });

    // Camera Actions
    btnCloseCamera.addEventListener('click', stopCamera);
    btnCapture.addEventListener('click', handleCapture);
}

// --- Navigation & Rendering ---

function navigateTo(viewId, param = null) {
    Object.values(views).forEach(el => el.classList.remove('active'));

    state.currentView = viewId;
    views[viewId.replace('view-', '')].classList.add('active');

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
        state.selectedPage = param;
        headerTitle.textContent = `Pág ${param.page}`;
        backBtn.classList.remove('hidden');
        fabAdd.classList.add('hidden');
        renderResult(param);
    }
}

function renderSubjects() {
    subjectListEl.innerHTML = '';
    state.subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subject-card';
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
    let solution = [];
    try {
        if (typeof pageData.solution === 'string') {
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

    if (solution.exercises) {
        solution = solution.exercises;
    }

    if (Array.isArray(solution)) {
        const renderValue = (val) => {
            if (val === null || val === undefined) return '';

            if (Array.isArray(val)) {
                return `<ul style="padding-left:1.2rem; margin:0.5rem 0; list-style-type: none;">
                    ${val.map(v => `<li>• ${renderValue(v)}</li>`).join('')}
                </ul>`;
            }

            if (typeof val === 'object') {
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
                <div class="exercise-card" style="border-left: 4px solid var(--primary-color);">
                    <div class="exercise-header" style="margin-bottom:0.5rem;">
                        <span style="font-weight:700; color:var(--primary-color); font-size:1.1em; margin-right: 0.5rem;">${item.exercise || (index + 1)}.</span>
                        <span style="font-weight:600; color:var(--text-main);">${item.question || ''}</span>
                    </div>
                    <div class="exercise-body" style="color:var(--text-muted); padding-left: 1rem; font-family: monospace; font-size: 0.95em;">
                        ${displayAnswer || 'Ver imagen'}
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
    modal.classList.add('visible');
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

    overlayCamera.classList.remove('hidden');

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
                width: { ideal: 4096 },
                height: { ideal: 2160 }
            }
        })
            .then(stream => {
                state.cameraStream = stream;
                videoEl.srcObject = stream;
            })
            .catch(err => {
                console.warn("Rear camera failed, trying default", err);
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
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, width, height);

    stopCamera();

    overlayProcessing.classList.remove('hidden');
    processingText.textContent = "Procesando...";

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
        processingText.textContent = "Subiendo imagen...";
        const imageUrl = await uploadToGreenHost(imageBlob);
        console.log("Uploaded Image URL:", imageUrl);

        processingText.textContent = "Leyendo ejercicios...";
        const transcription = await extractTextWithPixtral(imageUrl);
        console.log("Transcription:", transcription);

        processingText.textContent = "Resolviendo deberes...";
        const aiResultJson = await solveWithMistral(transcription);

        let aiData;
        try {
            aiData = JSON.parse(aiResultJson);
        } catch (e) {
            console.error("Error parsing AI JSON", e);
            throw new Error("Error al procesar la respuesta de la IA");
        }

        overlayProcessing.classList.add('hidden');

        const detectedPage = aiData.page || state.pendingUpload.page;
        const confirmedPage = await confirmPageNumber(detectedPage);

        if (!confirmedPage) {
            return;
        }

        state.pendingUpload.page = parseInt(confirmedPage);
        processingText.textContent = "Guardando...";
        overlayProcessing.classList.remove('hidden');

        const pageData = {
            subject: state.pendingUpload.subject,
            page: parseInt(state.pendingUpload.page),
            imageUrl: imageUrl,
            solution: aiData.exercises || aiData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('pages').add(pageData);

        overlayProcessing.classList.add('hidden');
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

async function extractTextWithPixtral(imageUrl) {
    const prompt = `
        Transcribe ABSOLUTAMENTE TODO el texto de esta página de deberes.
        No resuelvas nada.
        Tu único objetivo es copiar fielmente cada palabra, número y enunciado que veas.
        Separa claramente los ejercicios.
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
        temperature: 0.1
    };

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Pixtral Error");
    const data = await response.json();
    return data.choices[0].message.content;
}

async function solveWithMistral(transcription) {
    const prompt = `
        Eres un profesor experto. Aquí tienes la transcripción de una hoja de deberes:
        ---
        ${transcription}
        ---
        
        Tu tarea es:
        1. Identificar el NÚMERO DE PÁGINA si aparece en el texto.
        2. Identificar TODOS los ejercicios.
        3. RESOLVERLOS todos correctamentes.
        
        IMPORTANTE: Devuelve la respuesta SOLAMENTE en formato JSON.
        Formato:
        {
          "page": "Número de página detectado (o null si no lo ves)",
          "exercises": [
            { 
              "exercise": "Número (ej: 3)", 
              "question": "Enunciado breve", 
              "solution": "Respuesta concisa." 
            }
          ]
        }
    `;

    const payload = {
        model: "mistral-large-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
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

    if (!response.ok) throw new Error("Mistral Logic Error");
    const data = await response.json();
    return data.choices[0].message.content;
}

// Confirm Page Modal Logic
function confirmPageNumber(detectedPage) {
    return new Promise((resolve) => {
        const modalConfirm = document.getElementById('modal-confirm-page');
        const modalEdit = document.getElementById('modal-edit-page');

        // Elementos dentro de los modales (añadidos en modal.html antes)
        const display = document.getElementById('confirm-page-display');
        const btnYesOriginal = document.getElementById('btn-page-yes');
        const btnNoOriginal = document.getElementById('btn-page-no');

        // Modal Edit elements
        const btnSaveOriginal = document.getElementById('btn-save-page');
        const inputCorrect = document.getElementById('input-correct-page');

        // Logic
        let currentGuess = (detectedPage && detectedPage !== '?' && detectedPage !== null) ? detectedPage : state.pendingUpload.page;
        if (currentGuess === '?' || !currentGuess) currentGuess = '--';

        display.textContent = currentGuess;
        inputCorrect.value = '';

        showModal(modalConfirm);

        // Replace buttons to clear previous listeners
        const btnYes = btnYesOriginal.cloneNode(true);
        const btnNo = btnNoOriginal.cloneNode(true);
        const btnSave = btnSaveOriginal.cloneNode(true);

        btnYesOriginal.parentNode.replaceChild(btnYes, btnYesOriginal);
        btnNoOriginal.parentNode.replaceChild(btnNo, btnNoOriginal);
        btnSaveOriginal.parentNode.replaceChild(btnSave, btnSaveOriginal);

        btnYes.onclick = () => {
            hideModal(modalConfirm);
            if (currentGuess === '--') {
                setTimeout(() => {
                    inputCorrect.value = '';
                    showModal(modalEdit);
                }, 300);
            } else {
                resolve(currentGuess);
            }
        };

        btnNo.onclick = () => {
            hideModal(modalConfirm);
            setTimeout(() => {
                inputCorrect.value = (currentGuess !== '--') ? currentGuess : '';
                showModal(modalEdit);
            }, 300);
        };

        btnSave.onclick = () => {
            const val = inputCorrect.value;
            if (val) {
                hideModal(modalEdit);
                resolve(val);
            } else {
                alert("Introduce un número");
            }
        };
    });
}

document.addEventListener('DOMContentLoaded', init);
