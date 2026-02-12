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
        'Matemáticas', 'Física y Química', 'Lengua', 'Geografía',
        'TIC', 'ATE', 'EPVA', 'Project', 'Inglés',
        'Educación Física', 'Tecnología y Digitalización', 'Otros'
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
const progressBar = document.getElementById('progress-bar'); // NEW
const canvas = document.getElementById('camera-canvas');

const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const GREENHOST_API_URL = "https://greenbase.arielcapdevila.com";

// --- Initialization ---

function init() {
    renderSubjects();
    setupEventListeners();
    populateSubjectSelect();
}

function setupEventListeners() {
    backBtn.addEventListener('click', () => {
        if (state.currentView === 'view-result') {
            navigateTo('view-pages', state.selectedSubject);
        } else if (state.currentView === 'view-pages') {
            navigateTo('view-subjects');
        }
    });

    fabAdd.addEventListener('click', () => {
        if (state.selectedSubject) {
            selectSubject.value = state.selectedSubject;
        }
        inputPage.value = ''; // Reset
        showModal(modalSelect);
    });

    btnCancelSelect.addEventListener('click', () => hideModal(modalSelect));

    btnConfirmSelect.addEventListener('click', () => {
        const subject = selectSubject.value;
        const page = inputPage.value;
        if (!subject) {
            alert("Por favor selecciona asignatura");
            return;
        }
        if (!page) {
            alert("Por favor introduce el número de página");
            return;
        }
        hideModal(modalSelect);
        startCameraFlow(subject, page);
    });

    btnCloseCamera.addEventListener('click', stopCamera);
    btnCapture.addEventListener('click', handleCapture);
}

// --- Navigation & Rendering (Same as before) ---
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
        'Matemáticas': '📐', 'Física y Química': '🧪', 'Lengua': '📚',
        'Geografía': '🌍', 'TIC': '💻', 'ATE': '🧩', 'EPVA': '🎨',
        'Project': '🚀', 'Inglés': '🇬🇧', 'Educación Física': '⚽',
        'Tecnología y Digitalización': '🤖', 'Otros': '📦'
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

function loadPages(subject) {
    pageListEl.innerHTML = '<div class="spinner" style="border-color: var(--primary-color); border-top-color: transparent; margin: 2rem auto;"></div>';
    if (state.unsubscribePages) state.unsubscribePages();

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
        resultContent.innerHTML = `<div class="exercise-card"><p>Error al procesar la respuesta de la IA.</p></div>`;
    }

    let html = `
        <div class="result-header">
            <img src="${pageData.imageUrl}" style="width:100%; border-radius: var(--radius); margin-bottom: 1rem;" alt="Foto de la página">
            <h3>Soluciones</h3>
        </div>
    `;

    if (solution.exercises) solution = solution.exercises;

    if (Array.isArray(solution)) {
        const renderValue = (val) => {
            if (val === null || val === undefined) return '';
            if (Array.isArray(val)) {
                return `<ul style="padding-left:1.2rem; margin:0.5rem 0;">
                    ${val.map(v => `<li>${renderValue(v)}</li>`).join('')}
                </ul>`;
            }
            if (typeof val === 'object') {
                return `<div style="margin-left: 0.5rem;">
                    ${Object.entries(val).map(([k, v]) => `<div><strong>${k}:</strong> ${renderValue(v)}</div>`).join('')}
                </div>`;
            }
            return val;
        };

        solution.forEach((item, index) => {
            html += `
                <div class="exercise-card">
                    <div class="exercise-header" style="margin-bottom:0.5rem;">
                        <span style="font-weight:700; color:var(--primary-color); margin-right: 0.5rem;">${item.exercise || (index + 1)}.</span>
                        <span style="font-weight:600;">${item.question || ''}</span>
                    </div>
                    <div class="exercise-body" style="color:var(--text-muted);">
                        ${renderValue(item.solution || item.answer)}
                    </div>
                </div>
            `;
        });
    } else {
        html += `<pre>${JSON.stringify(solution, null, 2)}</pre>`;
    }
    resultContent.innerHTML = html;
}

// --- Camera & Overlay ---

function showModal(modal) {
    modal.classList.add('visible');
    requestAnimationFrame(() => modal.style.opacity = '1');
}

function hideModal(modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.classList.remove('visible'), 300);
}

function startCameraFlow(subject, page) {
    state.pendingUpload = { subject, page };
    overlayCamera.classList.remove('hidden');

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } }
        })
            .then(stream => {
                state.cameraStream = stream;
                videoEl.srcObject = stream;
            })
            .catch(err => {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => {
                        state.cameraStream = stream;
                        videoEl.srcObject = stream;
                    });
            });
    } else {
        alert("Sin acceso a cámara");
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
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    stopCamera();

    // Show Progress Overlay
    overlayProcessing.classList.remove('hidden');
    processingText.textContent = "Analizando (20s)...";
    progressBar.style.width = '0%';

    canvas.toBlob(blob => {
        if (blob) processImage(blob);
    }, 'image/jpeg', 0.85);
}

// --- Processing with 20s Timer ---

async function processImage(imageBlob) {
    const startTime = Date.now();
    const DURATION = 20000; // 20 seconds target
    let progressInterval;

    try {
        // Start Progress Bar Animation
        let progress = 0;
        const step = 100 / (DURATION / 100); // Update every 100ms
        progressInterval = setInterval(() => {
            progress = Math.min(progress + step, 98); // Cap at 98 until done
            progressBar.style.width = `${progress}%`;
        }, 100);

        // --- Actual Work (Parallel) ---
        // We run the API calls. We do NOT await them immediately to block the timer check.
        // But actually, simpler: Promise.all([apiCalls, timer])

        const apiWork = async () => {
            // 1. Upload
            const imageUrl = await uploadToGreenHost(imageBlob);

            // 2. Pixtral Text
            const transcription = await extractTextWithPixtral(imageUrl);

            // 3. Mistral Solve (No page detection)
            const aiJson = await solveWithMistral(transcription);

            let aiData;
            try { aiData = JSON.parse(aiJson); } catch (e) { aiData = { exercises: [] }; }

            return { imageUrl, aiData };
        };

        const timerWork = new Promise(resolve => setTimeout(resolve, DURATION));

        // Race minimum duration: wait for BOTH works to finish
        // If API is fast, timerWork holds it back.
        // If API is slow, we wait for API.
        const [result] = await Promise.all([apiWork(), timerWork]);

        // Done
        clearInterval(progressInterval);
        progressBar.style.width = '100%';

        // Save
        const { imageUrl, aiData } = result;
        const pageData = {
            subject: state.pendingUpload.subject,
            page: parseInt(state.pendingUpload.page),
            imageUrl: imageUrl,
            solution: aiData.exercises || aiData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('pages').add(pageData);

        // Small delay to see 100%
        setTimeout(() => {
            overlayProcessing.classList.add('hidden');
            navigateTo('view-result', pageData);
        }, 500);

    } catch (error) {
        clearInterval(progressInterval);
        console.error(error);
        alert("Error: " + error.message);
        overlayProcessing.classList.add('hidden');
    }
}

async function uploadToGreenHost(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'scan.jpg');
    const res = await fetch(`${GREENHOST_API_URL}/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return `${GREENHOST_API_URL}/file/${(await res.json()).id}`;
}

async function extractTextWithPixtral(imageUrl) {
    const prompt = "Transcribe TODO el texto de los ejercicios. Solo texto.";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "pixtral-12b-latest",
            messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: imageUrl }] }],
            temperature: 0.1
        })
    });
    if (!res.ok) throw new Error("Pixtral failed");
    return (await res.json()).choices[0].message.content;
}

async function solveWithMistral(transcription) {
    const prompt = `
        Eres un profesor. Resuelve estos ejercicios escolares:
        ---
        ${transcription}
        ---
        Formato JSON:
        {
          "exercises": [
            { "exercise": "1", "question": "...", "solution": "..." }
          ]
        }
    `;
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });
    if (!res.ok) throw new Error("Mistral failed");
    return (await res.json()).choices[0].message.content;
}

document.addEventListener('DOMContentLoaded', init);
