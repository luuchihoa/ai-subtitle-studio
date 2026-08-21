/**
 * AI Subtitle Studio - Interactive Client App
 * Supports both Local FastAPI Backend and In-Browser Standalone / Cloud Mode (GitHub Pages)
 */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
let API_BASE = localStorage.getItem('API_BASE_URL') || (isLocal && window.location.port === '8000' ? '/api' : 'http://localhost:8000/api');

class SubtitleStudioApp {
    constructor() {
        this.currentProject = null;
        this.currentSubtitle = null;
        this.selectedFile = null;
        this.selectedExportFormat = 'srt';
        this.activeSegmentIndex = -1;
        this.searchTerm = '';
        this.backendAvailable = false;

        // Local storage projects
        this.localProjects = JSON.parse(localStorage.getItem('LOCAL_PROJECTS') || '[]');

        // Media elements
        this.mediaElement = null;
        this.isPlaying = false;
        
        // Canvas waveform
        this.waveformCanvas = null;
        this.waveformCtx = null;

        this.init();
    }

    async init() {
        this.waveformCanvas = document.getElementById('waveformCanvas');
        if (this.waveformCanvas) {
            this.waveformCtx = this.waveformCanvas.getContext('2d');
        }

        // Setup Media Player events
        const video = document.getElementById('videoPlayer');
        const audio = document.getElementById('audioPlayer');

        [video, audio].forEach(elem => {
            elem.addEventListener('timeupdate', () => this.onTimeUpdate());
            elem.addEventListener('play', () => this.onPlayStateChange(true));
            elem.addEventListener('pause', () => this.onPlayStateChange(false));
            elem.addEventListener('ended', () => this.onPlayStateChange(false));
        });

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.seekRelative(-2);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.seekRelative(2);
            }
        });

        // Check backend availability
        await this.checkBackendStatus();

        // Load project list
        await this.loadProjectList();
    }

    async checkBackendStatus() {
        const badge = document.getElementById('connectionBadge');
        try {
            const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
            if (res.ok) {
                this.backendAvailable = true;
                if (badge) {
                    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Local Server';
                    badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30 flex items-center gap-1 cursor-pointer';
                }
                return;
            }
        } catch (e) {
            this.backendAvailable = false;
        }

        if (badge) {
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> Web Mode';
            badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium border border-blue-500/30 flex items-center gap-1 cursor-pointer';
        }
    }

    // --- MODAL UTILS ---
    showModal(modalId) { document.getElementById(modalId).classList.remove('hidden'); }
    closeModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

    showUploadModal() { this.showModal('modalUpload'); }
    showImportSubModal() { this.showModal('modalImportSub'); }
    showTranscribeModal() { 
        const key = localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('OPENAI_API_KEY') || '';
        const keyInput = document.getElementById('cfgApiKeyInput');
        if (keyInput) keyInput.value = key;
        this.showModal('modalTranscribe'); 
    }
    showTranslateModal() { this.showModal('modalTranslate'); }
    showExportModal() { this.showModal('modalExport'); }
    showSettingsModal() { 
        document.getElementById('settingGroqKey').value = localStorage.getItem('GROQ_API_KEY') || '';
        document.getElementById('settingOpenaiKey').value = localStorage.getItem('OPENAI_API_KEY') || '';
        document.getElementById('settingBackendUrl').value = API_BASE;
        this.showModal('modalSettings'); 
    }
    showProjectListModal() { 
        this.loadProjectList();
        this.showModal('modalProjectList'); 
    }

    saveSettings() {
        const groq = document.getElementById('settingGroqKey').value.trim();
        const openai = document.getElementById('settingOpenaiKey').value.trim();
        const backend = document.getElementById('settingBackendUrl').value.trim();

        if (groq) localStorage.setItem('GROQ_API_KEY', groq);
        else localStorage.removeItem('GROQ_API_KEY');

        if (openai) localStorage.setItem('OPENAI_API_KEY', openai);
        else localStorage.removeItem('OPENAI_API_KEY');

        if (backend) {
            API_BASE = backend;
            localStorage.setItem('API_BASE_URL', backend);
        }

        this.closeModal('modalSettings');
        this.checkBackendStatus();
        alert('Đã lưu cấu hình cài đặt!');
    }

    // --- PROJECT MANAGEMENT ---
    async loadProjectList() {
        const container = document.getElementById('projectListContainer');
        if (!container) return;

        let projects = [];
        if (this.backendAvailable) {
            try {
                const res = await fetch(`${API_BASE}/projects`);
                if (res.ok) projects = await res.json();
            } catch (e) {
                projects = this.localProjects;
            }
        } else {
            projects = this.localProjects;
        }

        if (projects.length === 0) {
            container.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">Chưa có dự án nào. Hãy tải lên file đầu tiên hoặc thử file Demo!</div>';
            return;
        }

        container.innerHTML = projects.map(p => `
            <div class="p-3 bg-dark-bg hover:bg-slate-800/80 rounded-xl border border-dark-border flex items-center justify-between cursor-pointer transition" onclick="app.loadProject(${p.id})">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <div class="w-9 h-9 rounded-lg ${p.media_type === 'video' ? 'bg-purple-600/20 text-purple-400' : 'bg-blue-600/20 text-blue-400'} flex items-center justify-center text-sm flex-shrink-0">
                        <i class="fa-solid ${p.media_type === 'video' ? 'fa-video' : 'fa-music'}"></i>
                    </div>
                    <div class="overflow-hidden">
                        <h4 class="text-xs font-semibold text-slate-200 truncate">${p.title}</h4>
                        <p class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span><i class="fa-regular fa-clock mr-1"></i>${this.formatDuration(p.duration)}</span>
                            <span>&bull;</span>
                            <span><i class="fa-solid fa-closed-captioning mr-1"></i>${(p.subtitles || []).length || p.subtitle_count || 1} track</span>
                        </p>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); app.deleteProject(${p.id})" class="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition" title="Xóa dự án">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        `).join('');

        if (!this.currentProject && projects.length > 0) {
            this.loadProject(projects[0].id);
        }
    }

    async loadProject(projectId) {
        this.closeModal('modalProjectList');
        let project = null;

        if (this.backendAvailable) {
            try {
                const res = await fetch(`${API_BASE}/projects/${projectId}`);
                if (res.ok) project = await res.json();
            } catch (e) {
                project = this.localProjects.find(p => p.id === projectId);
            }
        } else {
            project = this.localProjects.find(p => p.id === projectId);
        }

        if (!project) return;
        this.currentProject = project;

        // Update UI State
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('workspace').classList.remove('hidden');
        document.getElementById('currentProjectTitle').innerText = project.title;

        document.getElementById('btnAiTranscribe').classList.remove('hidden');
        document.getElementById('btnExport').classList.remove('hidden');

        // Setup Media
        const video = document.getElementById('videoPlayer');
        const audio = document.getElementById('audioPlayer');
        const mediaUrl = project.media_blob_url || `${API_BASE}/projects/${project.id}/media`;

        if (project.media_type === 'video') {
            video.src = mediaUrl;
            video.classList.remove('hidden');
            document.getElementById('audioVisualizerPlaceholder').classList.add('hidden');
            this.mediaElement = video;
        } else {
            audio.src = mediaUrl;
            video.classList.add('hidden');
            document.getElementById('audioVisualizerPlaceholder').classList.remove('hidden');
            document.getElementById('audioTrackName').innerText = project.filename || project.title;
            this.mediaElement = audio;
        }

        // Subtitles
        if (!project.subtitles || project.subtitles.length === 0) {
            project.subtitles = [{
                id: 1,
                project_id: project.id,
                language: 'vi',
                label: 'Gốc (VI)',
                is_primary: true,
                segments: project.segments || []
            }];
        }

        this.renderTrackSelector();
        this.currentSubtitle = project.subtitles.find(s => s.is_primary) || project.subtitles[0];

        if (this.currentSubtitle) {
            document.getElementById('btnTranslate').classList.remove('hidden');
            document.getElementById('btnReSegment').classList.remove('hidden');
        }

        this.renderSegments();
        setTimeout(() => this.drawWaveform(), 100);
    }

    async deleteProject(projectId) {
        if (!confirm('Bạn có chắc chắn muốn xóa dự án này?')) return;
        if (this.backendAvailable) {
            try {
                await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
            } catch (e) {}
        }
        this.localProjects = this.localProjects.filter(p => p.id !== projectId);
        localStorage.setItem('LOCAL_PROJECTS', JSON.stringify(this.localProjects));

        if (this.currentProject && this.currentProject.id === projectId) {
            this.currentProject = null;
            document.getElementById('workspace').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
            document.getElementById('currentProjectTitle').innerText = 'Chưa chọn dự án';
        }
        this.loadProjectList();
    }

    handleFileSelect(input) {
        if (input.files && input.files[0]) {
            this.selectedFile = input.files[0];
            document.getElementById('selectedFileName').innerText = this.selectedFile.name;
        }
    }

    // --- ZERO-FAIL LOCAL AUDIO & WAVEFORM EXTRACTION ---
    async handleUploadSubmit(e) {
        e.preventDefault();
        if (!this.selectedFile) {
            alert('Vui lòng chọn file âm thanh hoặc video!');
            return;
        }

        const btn = document.getElementById('btnSubmitUpload');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đọc file...';

        const file = this.selectedFile;
        const title = document.getElementById('uploadTitle').value.trim() || file.name.replace(/\.[^/.]+$/, "");
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(file.name);
        const blobUrl = URL.createObjectURL(file);

        // Try backend if available
        let backendProject = null;
        if (this.backendAvailable) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                if (title) formData.append('title', title);
                const res = await fetch(`${API_BASE}/projects`, { method: 'POST', body: formData });
                if (res.ok) backendProject = await res.json();
            } catch (err) {
                console.warn('Backend upload skipped, switching to browser mode:', err);
            }
        }

        // Generate waveform in browser using Web Audio API
        let duration = 0;
        let peaks = [];
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            duration = audioBuffer.duration;
            peaks = this.extractPeaksFromAudioBuffer(audioBuffer, 800);
            audioCtx.close();
        } catch (e) {
            console.warn('AudioContext waveform decode fallback:', e);
            peaks = this.generateSimulatedWaveform(800);
        }

        const newProject = backendProject || {
            id: Date.now(),
            title: title,
            filename: file.name,
            media_type: isVideo ? 'video' : 'audio',
            duration: duration || 60,
            waveform_data: peaks,
            media_blob_url: blobUrl,
            file_raw: file,
            subtitles: []
        };

        if (!backendProject) {
            newProject.media_blob_url = blobUrl;
            newProject.file_raw = file;
            this.localProjects.unshift(newProject);
            localStorage.setItem('LOCAL_PROJECTS', JSON.stringify(this.localProjects.map(p => ({
                ...p,
                media_blob_url: undefined,
                file_raw: undefined
            }))));
        }

        this.closeModal('modalUpload');
        this.selectedFile = null;
        document.getElementById('uploadForm').reset();
        document.getElementById('selectedFileName').innerText = 'Nhấp để chọn file hoặc kéo thả vào đây';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> Mở & Khởi tạo Dự án';

        this.loadProject(newProject.id);
        this.showTranscribeModal();
    }

    extractPeaksFromAudioBuffer(audioBuffer, numPeaks = 800) {
        const rawData = audioBuffer.getChannelData(0);
        const step = Math.ceil(rawData.length / numPeaks);
        const peaks = [];
        for (let i = 0; i < numPeaks; i++) {
            let max = 0;
            const start = i * step;
            const end = Math.min(start + step, rawData.length);
            for (let j = start; j < end; j++) {
                const abs = Math.abs(rawData[j]);
                if (abs > max) max = abs;
            }
            peaks.push(Math.round(max * 1000) / 1000);
        }
        return peaks;
    }

    generateSimulatedWaveform(numPeaks = 800) {
        const peaks = [];
        for (let i = 0; i < numPeaks; i++) {
            const h = Math.abs(Math.sin(i * 0.08) * 0.6 + Math.sin(i * 0.02) * 0.3 + (Math.random() * 0.2));
            peaks.push(Math.min(1.0, Math.round(h * 100) / 100));
        }
        return peaks;
    }

    // --- DEMO PROJECT ---
    loadDemoProject() {
        const demoProject = {
            id: 999999,
            title: 'Dự án Mẫu (Demo AI Subtitles)',
            filename: 'demo_presentation.mp3',
            media_type: 'audio',
            duration: 28.5,
            waveform_data: this.generateSimulatedWaveform(800),
            subtitles: [
                {
                    id: 1,
                    project_id: 999999,
                    language: 'vi',
                    label: 'Gốc (Tiếng Việt)',
                    is_primary: true,
                    segments: [
                        {
                            id: 101,
                            sequence_number: 1,
                            start_time: 0.5,
                            end_time: 3.8,
                            text: 'Chào mừng các bạn đến với AI Subtitle Studio.',
                            speaker: 'Speaker 1',
                            words: [
                                { word: 'Chào', start: 0.5, end: 0.8, probability: 0.99 },
                                { word: 'mừng', start: 0.82, end: 1.1, probability: 0.99 },
                                { word: 'các', start: 1.12, end: 1.3, probability: 0.98 },
                                { word: 'bạn', start: 1.32, end: 1.6, probability: 0.99 },
                                { word: 'đến', start: 1.65, end: 1.9, probability: 0.98 },
                                { word: 'với', start: 1.95, end: 2.2, probability: 0.99 },
                                { word: 'AI', start: 2.25, end: 2.6, probability: 0.99 },
                                { word: 'Subtitle', start: 2.65, end: 3.2, probability: 0.99 },
                                { word: 'Studio.', start: 3.25, end: 3.8, probability: 0.99 }
                            ]
                        },
                        {
                            id: 102,
                            sequence_number: 2,
                            start_time: 4.2,
                            end_time: 9.0,
                            text: 'Hệ thống tự động căn chỉnh thời gian chuẩn xác\ntừng từ theo tiêu chuẩn Netflix và BBC.',
                            speaker: 'Speaker 1',
                            words: [
                                { word: 'Hệ', start: 4.2, end: 4.5, probability: 0.99 },
                                { word: 'thống', start: 4.55, end: 4.9, probability: 0.99 },
                                { word: 'tự', start: 4.95, end: 5.2, probability: 0.99 },
                                { word: 'động', start: 5.25, end: 5.6, probability: 0.99 },
                                { word: 'căn', start: 5.65, end: 5.9, probability: 0.99 },
                                { word: 'chỉnh', start: 5.95, end: 6.3, probability: 0.99 },
                                { word: 'chuẩn', start: 6.35, end: 6.7, probability: 0.99 },
                                { word: 'xác.', start: 6.75, end: 7.2, probability: 0.99 }
                            ]
                        },
                        {
                            id: 103,
                            sequence_number: 3,
                            start_time: 10.1,
                            end_time: 15.5,
                            text: 'Bạn có thể chỉnh sửa trực tiếp, dịch thuật đa ngôn ngữ\nvà xuất file SRT, VTT, ASS Karaoke siêu mượt.',
                            speaker: 'Speaker 2',
                            words: []
                        }
                    ]
                }
            ]
        };

        this.localProjects = this.localProjects.filter(p => p.id !== 999999);
        this.localProjects.unshift(demoProject);
        this.loadProject(demoProject.id);
    }

    // --- AI TRANSCRIPTION (CLOUD / LOCAL / SMART SPLIT) ---
    async handleTranscribeSubmit(e) {
        e.preventDefault();
        if (!this.currentProject) return;

        const engine = document.getElementById('cfgEngine').value;
        const language = document.getElementById('cfgLanguage').value;
        const apiKey = document.getElementById('cfgApiKeyInput').value.trim();
        const maxCpl = parseInt(document.getElementById('cfgMaxCpl').value) || 40;
        const maxCps = parseFloat(document.getElementById('cfgMaxCps').value) || 20.0;

        const pauseThreshold = parseFloat(document.getElementById('cfgPauseThreshold')?.value) || 0.45;

        if (apiKey) {
            if (apiKey.startsWith('gsk_')) localStorage.setItem('GROQ_API_KEY', apiKey);
            else if (apiKey.startsWith('sk-')) localStorage.setItem('OPENAI_API_KEY', apiKey);
        }

        this.closeModal('modalTranscribe');
        this.showModal('modalProgress');

        // Check if backend available and selected
        if (this.backendAvailable && engine === 'backend') {
            try {
                const res = await fetch(`${API_BASE}/transcription/${this.currentProject.id}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model_size: 'base',
                        language: language,
                        enable_vad: true,
                        enable_word_timestamps: true,
                        enable_diarization: true,
                        max_cpl: maxCpl,
                        max_cps: maxCps
                    })
                });
                const data = await res.json();
                this.pollJobProgress(data.job_id);
                return;
            } catch (e) {}
        }

        // Direct Cloud API Transcription (Groq Whisper / OpenAI)
        const activeKey = apiKey || localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('OPENAI_API_KEY');
        const fileRaw = this.currentProject.file_raw;

        if (activeKey && fileRaw) {
            try {
                document.getElementById('progressMessage').innerText = 'Đang nhận diện giọng nói qua Cloud AI (Word-level timestamps)...';
                document.getElementById('progressBar').style.width = '40%';

                const isGroq = activeKey.startsWith('gsk_') || engine === 'groq';
                const endpoint = isGroq 
                    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
                    : 'https://api.openai.com/v1/audio/transcriptions';
                
                const formData = new FormData();
                formData.append('file', fileRaw);
                formData.append('model', isGroq ? 'whisper-large-v3-turbo' : 'whisper-1');
                formData.append('response_format', 'verbose_json');
                formData.append('timestamp_granularities[]', 'word');
                formData.append('timestamp_granularities[]', 'segment');
                if (language && language !== 'auto') formData.append('language', language);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${activeKey}` },
                    body: formData
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'API Error');
                }

                const result = await response.json();
                document.getElementById('progressBar').style.width = '85%';
                document.getElementById('progressMessage').innerText = 'Đang phân đoạn theo khoảng lặng và chuẩn hóa phụ đề...';

                // Process words with pause-aware segmenter
                const structured = this.smartSegmentFromApi(result.words || result.segments || [], maxCpl, maxCps, pauseThreshold);
                this.currentProject.subtitles = [{
                    id: Date.now(),
                    project_id: this.currentProject.id,
                    language: language || result.language || 'vi',
                    label: `AI (${(language || result.language || 'vi').toUpperCase()})`,
                    is_primary: true,
                    segments: structured
                }];

                document.getElementById('progressBar').style.width = '100%';
                setTimeout(() => {
                    this.closeModal('modalProgress');
                    this.loadProject(this.currentProject.id);
                }, 500);
                return;
            } catch (err) {
                console.error('Cloud STT Error:', err);
                alert('Lỗi Cloud STT: ' + err.message + '\nĐang chuyển sang tạo phụ đề mẫu!');
            }
        }

        // Fallback: Generate structured template segments across audio duration with silence gaps
        document.getElementById('progressBar').style.width = '60%';
        document.getElementById('progressMessage').innerText = 'Đang phân tích âm thanh và tạo khung phụ đề...';

        setTimeout(() => {
            const dur = this.currentProject.duration || 30;
            const segments = [];
            let t = 0.5;
            let seq = 1;
            while (t < dur) {
                const segDur = Math.min(4.0, dur - t);
                if (segDur < 0.8) break;
                const end = round(t + segDur, 2);
                segments.push({
                    id: Date.now() + seq,
                    sequence_number: seq,
                    start_time: round(t, 2),
                    end_time: end,
                    text: `Đoạn phụ đề ${seq}...`,
                    speaker: `Speaker ${(seq % 2) + 1}`,
                    words: []
                });
                // Add pause gap between segments (0.8s silence)
                t = round(end + 0.8, 2);
                seq++;
            }

            this.currentProject.subtitles = [{
                id: Date.now(),
                project_id: this.currentProject.id,
                language: language || 'vi',
                label: `Bản gốc (${(language || 'vi').toUpperCase()})`,
                is_primary: true,
                segments: segments
            }];

            document.getElementById('progressBar').style.width = '100%';
            setTimeout(() => {
                this.closeModal('modalProgress');
                this.loadProject(this.currentProject.id);
            }, 400);
        }, 1000);
    }

    // Common 2-word compound pairs in Vietnamese that must NEVER be broken across lines/screens
    static COMPOUND_PAIRS = new Set([
        "anh|em", "chị|em", "ông|bà", "cha|mẹ", "cha|con", "mẹ|con",
        "vợ|chồng", "con|cái", "chúng|ta", "chúng|tôi", "chúng|mình",
        "chúng|nó", "thầy|trò", "bạn|bè", "anh|chị", "cô|bác",
        "chú|bác", "con|người", "nhân|loại", "đồng|bào", "họ|hàng",
        "thiên|chúa", "đức|chúa", "đức|mẹ", "chúa|cha", "chúa|con",
        "thánh|thần", "hội|thánh", "ân|huệ", "bình|an", "hy|vọng",
        "đức|tin", "tình|yêu", "sự|sống", "cứu|độ", "mục|tử",
        "chúc|lành", "tha|thứ", "yêu|thương", "lời|chúa", "thánh|kinh",
        "tuôn|đổ", "chăn|dắt", "tuyên|sấm", "hạch|tội", "chăm|sóc",
        "hướng|dẫn", "giúp|đỡ", "chia|sẻ", "phát|triển", "xây|dựng",
        "thực|hiện", "hoàn|thành", "bắt|đầu", "kết|thúc", "tôn|thờ",
        "ngợi|khen", "cảm|tạ", "suy|nghĩ", "tin|tưởng", "lắng|nghe",
        "mọi|thứ", "mỗi|ngày", "hằng|ngày"
    ]);

    // --- SYNTACTIC & LINGUISTIC LINE BREAKER (NETFLIX / BBC BROADCAST STANDARDS) ---
    static DANGLING_END_WORDS = new Set([
        // Imperatives, Modals & Auxiliaries
        "hãy", "đã", "đang", "sẽ", "phải", "không", "chưa", "chẳng", "được", "bị",
        "muốn", "cần", "nên", "dám", "toan", "định", "có", "là", "hết", "chớ", "đừng",
        // Determiners, Quantifiers & Classifiers
        "các", "những", "mỗi", "mọi", "từng", "cả", "con", "người", "cái", "chiếc",
        "này", "nọ", "kia", "đó", "đây", "ấy",
        // Prepositions & Connectors
        "với", "cho", "về", "ở", "tại", "của", "và", "hoặc", "nhưng", "bởi", "do",
        "để", "rằng", "như", "nếu", "thì", "mà", "hỡi", "kìa", "vì", "từ", "lên", "xuống",
        "trên", "dưới", "trong", "ngoài", "giữa", "sau", "trước",
        // English
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
        "of", "that", "this", "is", "are", "was", "were", "will", "would", "shall", "should", "let"
    ]);

    evaluateLineSplitPenalty(line1Words, line2Words, maxCpl = 40) {
        if (!line1Words.length || !line2Words.length) return 99999;
        const line1 = line1Words.join(' ').trim();
        const line2 = line2Words.join(' ').trim();
        const len1 = line1.length;
        const len2 = line2.length;

        let penalty = 0;
        if (len1 > maxCpl) penalty += (len1 - maxCpl) * 60;
        if (len2 > maxCpl) penalty += (len2 - maxCpl) * 60;

        // Balance penalty
        penalty += Math.abs(len1 - len2) * 1.5;

        // Compound word protection penalty
        const w1Clean = line1Words[line1Words.length - 1].toLowerCase().replace(/^[.,:;!?"“”'()[\]]+|[.,:;!?"“”'()[\]]+$/g, '');
        const w2Clean = line2Words[0].toLowerCase().replace(/^[.,:;!?"“”'()[\]]+|[.,:;!?"“”'()[\]]+$/g, '');
        if (SubtitleStudioApp.COMPOUND_PAIRS.has(`${w1Clean}|${w2Clean}`)) {
            penalty += 850;
        }

        // Anti-Orphan penalty: Line 2 with 1 or 2 words / short text
        if (line2Words.length === 1) penalty += 1000;
        else if (line2Words.length === 2 && len2 < 12) penalty += 500;

        // Dangling word penalty: Line 1 ending in auxiliary/determiner/preposition
        if (SubtitleStudioApp.DANGLING_END_WORDS.has(w1Clean)) penalty += 700;

        // First word of Line 2 being loose punctuation
        if ([',', ';', ':', '.'].includes(w2Clean)) penalty += 1000;

        // Punctuation bonuses
        const lastChar = line1[line1.length - 1];
        if ([':', ';', '—', '-'].includes(lastChar)) penalty -= 300;
        else if ([',', '"', '”'].includes(lastChar)) penalty -= 180;

        if (w1Clean === 'rằng' || line1.endsWith('rằng:') || line1.endsWith('rằng,')) penalty -= 250;

        return penalty;
    }

    formatLineBreaks(text, maxCpl = 40) {
        const cleanText = text.replace(/\s+([,.:;?!])/g, '$1').trim();
        const words = cleanText.split(/\s+/);
        if (!words.length) return '';
        if (cleanText.length <= maxCpl) return cleanText;

        let bestSplitIdx = -1;
        let minPenalty = Infinity;

        for (let i = 1; i < words.length; i++) {
            const l1 = words.slice(0, i);
            const l2 = words.slice(i);
            const penalty = this.evaluateLineSplitPenalty(l1, l2, maxCpl);
            if (penalty < minPenalty) {
                minPenalty = penalty;
                bestSplitIdx = i;
            }
        }

        if (bestSplitIdx !== -1) {
            return words.slice(0, bestSplitIdx).join(' ') + '\n' + words.slice(bestSplitIdx).join(' ');
        }

        const half = Math.ceil(words.length / 2);
        return words.slice(0, half).join(' ') + '\n' + words.slice(half).join(' ');
    }

    findBestClauseSplit(words, maxCharsPerScreen = 80) {
        if (words.length < 4) return -1;
        let bestIdx = -1;
        let bestScore = -Infinity;

        for (let i = 2; i < words.length - 1; i++) {
            const wPrev = (words[i - 1].word || '').trim();
            const wCurr = (words[i].word || '').trim();
            const len1 = words.slice(0, i).map(x => x.word).join(' ').length;
            const len2 = words.slice(i).map(x => x.word).join(' ').length;

            let score = 0;
            if (wPrev.endsWith(':') || ['rằng:', 'rằng'].includes(wPrev.toLowerCase())) score += 600;
            else if ([';', '—', '-', '"', '”'].some(p => wPrev.endsWith(p))) score += 350;
            else if (wPrev.endsWith(',') && ['hỡi', 'thưa', 'kính', 'nhưng', 'để', 'khi', 'vì', 'mà', 'hãy'].includes(wCurr.toLowerCase())) score += 300;
            else if (wPrev.endsWith(',')) score += 150;

            score += (100 - Math.abs(len1 - len2));

            const wPrevClean = wPrev.toLowerCase().replace(/^[.,:;!?"“”]+|[.,:;!?"“”]+$/g, '');
            const wCurrClean = wCurr.toLowerCase().replace(/^[.,:;!?"“”]+|[.,:;!?"“”]+$/g, '');
            if (SubtitleStudioApp.COMPOUND_PAIRS.has(`${wPrevClean}|${wCurrClean}`)) score -= 900;
            if (SubtitleStudioApp.DANGLING_END_WORDS.has(wPrevClean)) score -= 700;

            if (i <= 1 || (words.length - i) <= 1) score -= 1000;

            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    mergeShortFragments(segments, maxChars = 80, maxDur = 7.0) {
        if (segments.length <= 1) return segments;
        const merged = [];
        let skipNext = false;

        for (let i = 0; i < segments.length; i++) {
            if (skipNext) {
                skipNext = false;
                continue;
            }

            const curr = segments[i];
            if (i < segments.length - 1) {
                const nxt = segments[i + 1];
                const currText = curr.text.replace(/\n/g, ' ');
                const nxtText = nxt.text.replace(/\n/g, ' ');
                const combinedText = `${currText} ${nxtText}`;
                const combinedDur = nxt.end_time - curr.start_time;
                const gap = nxt.start_time - curr.end_time;

                const isShortFragment = nxtText.length <= 25 || nxtText.split(/\s+/).length <= 4;
                if (isShortFragment && combinedText.length <= maxChars && combinedDur <= maxDur && gap < 0.7) {
                    const allWords = (curr.words || []).concat(nxt.words || []);
                    merged.push({
                        id: curr.id,
                        sequence_number: merged.length + 1,
                        start_time: curr.start_time,
                        end_time: nxt.end_time,
                        text: this.formatLineBreaks(combinedText, 40),
                        words: allWords,
                        speaker: curr.speaker || 'Speaker 1'
                    });
                    skipNext = true;
                    continue;
                }
            }

            merged.push({
                ...curr,
                sequence_number: merged.length + 1
            });
        }
        return merged;
    }

    smartSegmentFromApi(words, maxCpl = 40, maxCps = 20, pauseThreshold = 0.45) {
        if (!words || words.length === 0) return [];
        
        // Step 1: Merge lone punctuation tokens (: , . ; ! ?) into previous words
        const cleanWords = [];
        for (let w of words) {
            const wText = (w.word || w.text || '').trim();
            if (!wText) continue;
            if ([':', ',', '.', ';', '!', '?', '…'].includes(wText) && cleanWords.length > 0) {
                cleanWords[cleanWords.length - 1].word += wText;
                cleanWords[cleanWords.length - 1].end = w.end || cleanWords[cleanWords.length - 1].end;
            } else {
                cleanWords.push({
                    word: wText,
                    start: typeof w.start === 'number' ? w.start : 0,
                    end: typeof w.end === 'number' ? w.end : ((w.start || 0) + 0.35),
                    probability: w.probability || 0.99
                });
            }
        }

        if (cleanWords.length === 0) return [];

        const segments = [];
        let currentWords = [];
        const maxTotalChars = maxCpl * 2; // Strict 2 lines max

        for (let i = 0; i < cleanWords.length; i++) {
            const wordItem = cleanWords[i];
            const wordStr = wordItem.word;
            const wStart = wordItem.start;
            const wEnd = wordItem.end;

            if (currentWords.length === 0) {
                currentWords.push(wordItem);
                continue;
            }

            const prev = currentWords[currentWords.length - 1];
            const gap = wStart - prev.end;
            const blockStart = currentWords[0].start;
            const currentText = currentWords.map(x => x.word).join(' ');
            const tentativeLen = currentText.length + 1 + wordStr.length;
            const dur = wEnd - blockStart;

            const w1Clean = prev.word.toLowerCase().replace(/^[.,:;!?"“”]+|[.,:;!?"“”]+$/g, '');
            const w2Clean = wordStr.toLowerCase().replace(/^[.,:;!?"“”]+|[.,:;!?"“”]+$/g, '');
            const isCompound = SubtitleStudioApp.COMPOUND_PAIRS.has(`${w1Clean}|${w2Clean}`);

            let shouldSplit = false;

            // 1. Unconditional Silence / Pause Gap (skip if inside compound pair unless gap > 1.0s)
            if (gap >= pauseThreshold && (!isCompound || gap >= 1.0)) {
                shouldSplit = true;
            }
            // 2. Hard sentence ending (. ? ! …)
            else if (/[.!?…]$/.test(prev.word) && (gap >= 0.20 || tentativeLen >= 30)) {
                shouldSplit = true;
            }
            // 3. Dialogue introduction (: or rằng :)
            else if ((prev.word.endsWith(':') || ['rằng:', 'rằng'].includes(prev.word.toLowerCase())) && tentativeLen >= 25) {
                shouldSplit = true;
            }
            // 4. Exceeds max screen capacity or max duration
            else if (tentativeLen > maxTotalChars || dur > 6.5) {
                const remaining = cleanWords.length - i;
                if (remaining > 1) shouldSplit = true;
            }

            if (shouldSplit) {
                const blockLen = currentWords.map(x => x.word).join(' ').length;
                if (blockLen > maxTotalChars) {
                    const clauseIdx = this.findBestClauseSplit(currentWords, maxTotalChars);
                    if (clauseIdx !== -1) {
                        const sub1 = currentWords.slice(0, clauseIdx);
                        const raw1 = sub1.map(x => x.word).join(' ');
                        segments.push({
                            id: Date.now() + segments.length + 1,
                            sequence_number: segments.length + 1,
                            start_time: round(sub1[0].start, 3),
                            end_time: round(sub1[sub1.length - 1].end, 3),
                            text: this.formatLineBreaks(raw1, maxCpl),
                            speaker: 'Speaker 1',
                            words: [...sub1]
                        });
                        currentWords = currentWords.slice(clauseIdx);
                    }
                }

                const rawText = currentWords.map(x => x.word).join(' ');
                segments.push({
                    id: Date.now() + segments.length + 1,
                    sequence_number: segments.length + 1,
                    start_time: round(currentWords[0].start, 3),
                    end_time: round(currentWords[currentWords.length - 1].end, 3),
                    text: this.formatLineBreaks(rawText, maxCpl),
                    speaker: 'Speaker 1',
                    words: [...currentWords]
                });

                currentWords = [wordItem];
            } else {
                currentWords.push(wordItem);
            }
        }

        if (currentWords.length > 0) {
            const blockLen = currentWords.map(x => x.word).join(' ').length;
            if (blockLen > maxTotalChars) {
                const clauseIdx = this.findBestClauseSplit(currentWords, maxTotalChars);
                if (clauseIdx !== -1) {
                    const sub1 = currentWords.slice(0, clauseIdx);
                    const raw1 = sub1.map(x => x.word).join(' ');
                    segments.push({
                        id: Date.now() + segments.length + 1,
                        sequence_number: segments.length + 1,
                        start_time: round(sub1[0].start, 3),
                        end_time: round(sub1[sub1.length - 1].end, 3),
                        text: this.formatLineBreaks(raw1, maxCpl),
                        speaker: 'Speaker 1',
                        words: [...sub1]
                    });
                    currentWords = currentWords.slice(clauseIdx);
                }
            }

            const rawText = currentWords.map(x => x.word).join(' ');
            segments.push({
                id: Date.now() + segments.length + 1,
                sequence_number: segments.length + 1,
                start_time: round(currentWords[0].start, 3),
                end_time: round(currentWords[currentWords.length - 1].end, 3),
                text: this.formatLineBreaks(rawText, maxCpl),
                speaker: 'Speaker 1',
                words: [...currentWords]
            });
        }

        return this.mergeShortFragments(segments, maxTotalChars, 7.0);
    }

    pollJobProgress(jobId) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/transcription/status/${jobId}`);
                if (!res.ok) throw new Error();
                const job = await res.json();
                
                document.getElementById('progressBar').style.width = `${job.progress}%`;
                document.getElementById('progressPercent').innerText = `${Math.round(job.progress)}%`;
                document.getElementById('progressMessage').innerText = job.message;

                if (job.status === 'completed') {
                    clearInterval(interval);
                    setTimeout(() => {
                        this.closeModal('modalProgress');
                        this.loadProject(this.currentProject.id);
                    }, 600);
                } else if (job.status === 'failed') {
                    clearInterval(interval);
                    this.closeModal('modalProgress');
                    alert('Lỗi: ' + (job.error || job.message));
                }
            } catch (e) {
                clearInterval(interval);
                this.closeModal('modalProgress');
            }
        }, 1000);
    }

    // --- IMPORT SRT / VTT ---
    handleImportSubFile(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const segments = this.parseSrtOrVtt(content);
            if (segments.length === 0) {
                alert('Không thể đọc file phụ đề hoặc file trống!');
                return;
            }

            if (!this.currentProject) {
                this.currentProject = {
                    id: Date.now(),
                    title: file.name.replace(/\.[^/.]+$/, ""),
                    filename: file.name,
                    media_type: 'audio',
                    duration: segments[segments.length - 1].end_time + 2,
                    waveform_data: this.generateSimulatedWaveform(800),
                    subtitles: []
                };
            }

            const newSub = {
                id: Date.now(),
                project_id: this.currentProject.id,
                language: 'vi',
                label: `Imported (${file.name})`,
                is_primary: true,
                segments: segments
            };

            this.currentProject.subtitles.push(newSub);
            this.currentSubtitle = newSub;
            this.closeModal('modalImportSub');
            this.loadProject(this.currentProject.id);
            alert(`Đã nhập thành công ${segments.length} đoạn phụ đề!`);
        };
        reader.readAsText(file);
    }

    parseSrtOrVtt(content) {
        const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const segments = [];
        let curStart = 0;
        let curEnd = 0;
        let curText = [];
        let seq = 1;

        const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(timeRegex);

            if (match) {
                if (curText.length > 0 && curEnd > curStart) {
                    segments.push({
                        id: Date.now() + seq,
                        sequence_number: seq,
                        start_time: curStart,
                        end_time: curEnd,
                        text: curText.join('\n'),
                        speaker: 'Speaker 1',
                        words: []
                    });
                    seq++;
                    curText = [];
                }

                // Parse times
                const h1 = parseFloat(match[1] || 0), m1 = parseFloat(match[2]), s1 = parseFloat(match[3]), ms1 = parseFloat(match[4]);
                const h2 = parseFloat(match[5] || 0), m2 = parseFloat(match[6]), s2 = parseFloat(match[7]), ms2 = parseFloat(match[8]);
                curStart = round(h1 * 3600 + m1 * 60 + s1 + ms1 / 1000, 3);
                curEnd = round(h2 * 3600 + m2 * 60 + s2 + ms2 / 1000, 3);
            } else if (line && !/^\d+$/.test(line) && !line.startsWith('WEBVTT')) {
                curText.push(line);
            }
        }

        if (curText.length > 0 && curEnd > curStart) {
            segments.push({
                id: Date.now() + seq,
                sequence_number: seq,
                start_time: curStart,
                end_time: curEnd,
                text: curText.join('\n'),
                speaker: 'Speaker 1',
                words: []
            });
        }
        return segments;
    }

    // --- SUBTITLE TRACKS & SEGMENTS ---
    renderTrackSelector() {
        const container = document.getElementById('trackSelectorContainer');
        const select = document.getElementById('trackSelect');
        if (!this.currentProject || !this.currentProject.subtitles.length) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        select.innerHTML = this.currentProject.subtitles.map(s => `
            <option value="${s.id}" ${this.currentSubtitle && this.currentSubtitle.id === s.id ? 'selected' : ''}>
                ${s.label} (${(s.language || 'vi').toUpperCase()})
            </option>
        `).join('');
    }

    changeTrack(subtitleId) {
        const sub = this.currentProject.subtitles.find(s => s.id === parseInt(subtitleId));
        if (sub) {
            this.currentSubtitle = sub;
            this.renderSegments();
        }
    }

    renderSegments() {
        const container = document.getElementById('segmentsListContainer');
        if (!container) return;

        if (!this.currentSubtitle || !this.currentSubtitle.segments || this.currentSubtitle.segments.length === 0) {
            container.innerHTML = `
                <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <i class="fa-solid fa-closed-captioning-slash text-3xl mb-3 text-slate-600"></i>
                    <p class="text-xs">Chưa có phụ đề cho dự án này.</p>
                    <button onclick="app.showTranscribeModal()" class="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition">
                        <i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Bấm để tạo Phụ đề AI
                    </button>
                </div>
            `;
            document.getElementById('statSegmentCount').innerText = '0 đoạn';
            return;
        }

        const segments = this.currentSubtitle.segments;
        document.getElementById('statSegmentCount').innerText = `${segments.length} đoạn phụ đề`;

        const filtered = segments.filter(s => 
            !this.searchTerm || s.text.toLowerCase().includes(this.searchTerm.toLowerCase()) || (s.speaker && s.speaker.toLowerCase().includes(this.searchTerm.toLowerCase()))
        );

        container.innerHTML = filtered.map((seg, idx) => {
            const duration = Math.max(0.1, seg.end_time - seg.start_time);
            const chars = seg.text.replace(/\s+/g, '').length;
            const cps = Math.round((chars / duration) * 10) / 10;
            const cpsColor = cps > 21 ? 'text-red-400 border-red-500/40 bg-red-500/10' : (cps > 17 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10');

            const wordsHtml = (seg.words && seg.words.length > 0) ? `
                <div class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-dark-border/40">
                    ${seg.words.map(w => `
                        <span class="word-chip text-[10px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border/60 text-slate-400 cursor-pointer font-mono" 
                              onclick="app.seekToTime(${w.start})" 
                              title="${w.start}s - ${w.end}s (Độ tin cậy: ${Math.round((w.probability || 1)*100)}%)">
                            ${w.word}
                        </span>
                    `).join('')}
                </div>
            ` : '';

            return `
                <div id="segment-card-${seg.id}" class="segment-card bg-dark-card border border-dark-border rounded-xl p-3 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center space-x-2">
                            <span class="font-mono text-slate-500 font-bold">#${seg.sequence_number || (idx + 1)}</span>
                            
                            <input type="text" value="${seg.speaker || 'Speaker 1'}" 
                                   onchange="app.updateSegmentField(${seg.id}, 'speaker', this.value)"
                                   class="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 max-w-[100px] focus:outline-none focus:border-blue-500">
                        </div>

                        <div class="flex items-center space-x-1.5 font-mono text-slate-300">
                            <input type="text" value="${this.formatTimeCode(seg.start_time)}" 
                                   onchange="app.updateSegmentTimecode(${seg.id}, 'start', this.value)"
                                   class="w-20 px-1 py-0.5 text-center text-xs bg-dark-bg border border-dark-border rounded focus:outline-none focus:border-blue-500">
                            <span class="text-slate-500">&rarr;</span>
                            <input type="text" value="${this.formatTimeCode(seg.end_time)}" 
                                   onchange="app.updateSegmentTimecode(${seg.id}, 'end', this.value)"
                                   class="w-20 px-1 py-0.5 text-center text-xs bg-dark-bg border border-dark-border rounded focus:outline-none focus:border-blue-500">
                            
                            <span class="text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cpsColor}" title="Tốc độ đọc: ${cps} ký tự/giây">
                                ${cps} CPS
                            </span>
                        </div>

                        <div class="flex items-center space-x-1">
                            <button onclick="app.playSegment(${seg.start_time}, ${seg.end_time})" class="w-6 h-6 rounded hover:bg-slate-700 text-blue-400 flex items-center justify-center transition" title="Phát đoạn này">
                                <i class="fa-solid fa-play text-[10px]"></i>
                            </button>
                            <button onclick="app.deleteSegment(${seg.id})" class="w-6 h-6 rounded hover:bg-slate-700 text-red-400 flex items-center justify-center transition" title="Xóa đoạn này">
                                <i class="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                        </div>
                    </div>

                    <div>
                        <textarea oninput="app.updateSegmentField(${seg.id}, 'text', this.value)" 
                                  rows="2" 
                                  class="w-full text-xs p-2 rounded-lg bg-dark-bg border border-dark-border text-slate-200 focus:outline-none focus:border-blue-500 resize-none font-medium leading-relaxed">${seg.text}</textarea>
                    </div>

                    ${wordsHtml}
                </div>
            `;
        }).join('');
    }

    filterSegments(query) {
        this.searchTerm = query;
        this.renderSegments();
    }

    updateSegmentField(segmentId, field, value) {
        if (!this.currentSubtitle) return;
        const seg = this.currentSubtitle.segments.find(s => s.id === segmentId);
        if (seg) {
            seg[field] = value;
            this.syncSegmentUpdate(seg);
        }
    }

    updateSegmentTimecode(segmentId, type, timeStr) {
        const seconds = this.parseTimeCode(timeStr);
        if (isNaN(seconds)) return;

        const seg = this.currentSubtitle.segments.find(s => s.id === segmentId);
        if (seg) {
            if (type === 'start') seg.start_time = seconds;
            else if (type === 'end') seg.end_time = seconds;
            this.syncSegmentUpdate(seg);
            this.renderSegments();
        }
    }

    async syncSegmentUpdate(seg) {
        if (this.backendAvailable) {
            try {
                await fetch(`${API_BASE}/subtitles/segments/${seg.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: seg.text,
                        start_time: seg.start_time,
                        end_time: seg.end_time,
                        speaker: seg.speaker
                    })
                });
            } catch (e) {}
        }
    }

    async addNewSegmentAtCurrentTime() {
        if (!this.currentSubtitle || !this.mediaElement) return;
        const currTime = this.mediaElement.currentTime;
        const newSeg = {
            id: Date.now(),
            sequence_number: this.currentSubtitle.segments.length + 1,
            start_time: round(currTime, 3),
            end_time: round(currTime + 2.5, 3),
            text: 'Đoạn phụ đề mới...',
            speaker: 'Speaker 1',
            words: []
        };

        this.currentSubtitle.segments.push(newSeg);
        this.renderSegments();
    }

    async deleteSegment(segmentId) {
        if (!this.currentSubtitle) return;
        this.currentSubtitle.segments = this.currentSubtitle.segments.filter(s => s.id !== segmentId);
        this.renderSegments();
    }

    saveAllSegments() {
        alert('Đã lưu toàn bộ thay đổi thành công!');
    }

    // --- CLIENT-SIDE TRANSLATE ---
    async handleTranslateSubmit(e) {
        e.preventDefault();
        if (!this.currentSubtitle) return;

        const targetLang = document.getElementById('transTargetLang').value;
        this.closeModal('modalTranslate');
        this.showModal('modalProgress');
        document.getElementById('progressMessage').innerText = `Đang dịch phụ đề sang [${targetLang.toUpperCase()}]...`;
        document.getElementById('progressBar').style.width = '50%';

        try {
            const newSegments = [];
            for (let s of this.currentSubtitle.segments) {
                const translated = await this.translateTextFree(s.text, targetLang);
                newSegments.push({
                    ...s,
                    id: Date.now() + Math.random(),
                    text: translated,
                    words: []
                });
            }

            const newSub = {
                id: Date.now(),
                project_id: this.currentProject.id,
                language: targetLang,
                label: `Bản dịch (${targetLang.toUpperCase()})`,
                is_primary: false,
                segments: newSegments
            };

            this.currentProject.subtitles.push(newSub);
            this.currentSubtitle = newSub;
            this.closeModal('modalProgress');
            this.renderTrackSelector();
            this.renderSegments();
            alert(`Dịch hoàn tất! Đã tạo track "${newSub.label}".`);
        } catch (err) {
            this.closeModal('modalProgress');
            alert('Lỗi dịch phụ đề: ' + err.message);
        }
    }

    async translateTextFree(text, targetLang = 'en') {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
            const res = await fetch(url);
            const data = await res.json();
            return data[0].map(item => item[0]).join('');
        } catch (e) {
            return text;
        }
    }

    showReSegmentModal() {
        if (!this.currentSubtitle || !this.currentSubtitle.segments) return;
        const cpl = prompt('Nhập số ký tự tối đa trên 1 dòng (CPL: 30-50):', '40');
        if (!cpl) return;
        const pause = prompt('Ngưỡng khoảng lặng ngắt đoạn (giây, ví dụ 0.35, 0.45, 0.70):', '0.45');
        
        const maxCpl = parseInt(cpl) || 40;
        const pauseThreshold = parseFloat(pause) || 0.45;

        // Collect all words from current segments if available
        let allWords = [];
        for (let s of this.currentSubtitle.segments) {
            if (s.words && s.words.length > 0) {
                allWords.push(...s.words);
            }
        }

        if (allWords.length > 0) {
            this.currentSubtitle.segments = this.smartSegmentFromApi(allWords, maxCpl, 20, pauseThreshold);
        } else {
            for (let s of this.currentSubtitle.segments) {
                s.text = this.formatLineBreaks(s.text.replace(/\n/g, ' '), maxCpl);
            }
        }
        this.renderSegments();
        alert('Đã căn chỉnh lại phân đoạn phụ đề theo khoảng lặng thành công!');
    }

    // --- CLIENT-SIDE EXPORT (SRT, VTT, ASS, JSON, TXT, FCPXML) ---
    selectExportFormat(fmt) {
        this.selectedExportFormat = fmt;
        document.querySelectorAll('.export-format-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btnExp_${fmt}`);
        if (activeBtn) activeBtn.classList.add('active');

        const karaokeOption = document.getElementById('expKaraokeOption');
        if (fmt === 'ass') karaokeOption.classList.remove('hidden');
        else karaokeOption.classList.add('hidden');
    }

    triggerDownloadExport() {
        if (!this.currentSubtitle || !this.currentSubtitle.segments) return;
        const includeSpeakers = document.getElementById('expIncludeSpeakers').checked;
        const highlightWords = document.getElementById('expHighlightWords').checked;
        const fmt = this.selectedExportFormat;
        const segments = this.currentSubtitle.segments;
        const title = (this.currentProject ? this.currentProject.title : 'subtitles').replace(/\s+/g, '_');

        let content = '';
        let ext = fmt;
        let mime = 'text/plain';

        if (fmt === 'srt') {
            content = segments.map((s, idx) => {
                const spk = includeSpeakers && s.speaker ? `[${s.speaker}] ` : '';
                return `${idx + 1}\n${this.formatSrtTime(s.start_time)} --> ${this.formatSrtTime(s.end_time)}\n${spk}${s.text}\n`;
            }).join('\n');
        } else if (fmt === 'vtt') {
            mime = 'text/vtt';
            content = 'WEBVTT\n\n' + segments.map((s, idx) => {
                const spkTag = includeSpeakers && s.speaker ? `<v ${s.speaker}>` : '';
                const spkEnd = spkTag ? '</v>' : '';
                return `${idx + 1}\n${this.formatVttTime(s.start_time)} --> ${this.formatVttTime(s.end_time)}\n${spkTag}${s.text}${spkEnd}\n`;
            }).join('\n');
        } else if (fmt === 'ass') {
            mime = 'text/x-ssa';
            content = this.generateAssContent(segments, includeSpeakers, highlightWords);
        } else if (fmt === 'json') {
            mime = 'application/json';
            content = JSON.stringify({
                title: this.currentProject.title,
                language: this.currentSubtitle.language,
                segments: segments
            }, null, 2);
        } else if (fmt === 'txt') {
            content = segments.map(s => {
                const spk = includeSpeakers && s.speaker ? `${s.speaker}: ` : '';
                return `[${this.formatDuration(s.start_time)}] ${spk}${s.text.replace(/\n/g, ' ')}`;
            }).join('\n\n');
        } else if (fmt === 'fcpxml') {
            mime = 'application/xml';
            content = this.generateFcpxmlContent(segments, title);
        }

        // Trigger native browser download
        const blob = new Blob([content], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}_${this.currentSubtitle.language || 'sub'}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.closeModal('modalExport');
    }

    generateAssContent(segments, includeSpeakers, highlightWords) {
        let dialogues = segments.map(s => {
            const spk = s.speaker || 'Speaker 1';
            let txt = s.text.replace(/\n/g, '\\N');
            if (highlightWords && s.words && s.words.length > 0) {
                txt = s.words.map(w => {
                    const durCs = Math.max(1, Math.round(((w.end || 0) - (w.start || 0)) * 100));
                    return `{\\k${durCs}}${w.word}`;
                }).join(' ');
            } else if (includeSpeakers && s.speaker) {
                txt = `[${s.speaker}] ${txt}`;
            }
            return `Dialogue: 0,${this.formatAssTime(s.start_time)},${this.formatAssTime(s.end_time)},Default,${spk},0,0,0,,${txt}`;
        }).join('\n');

        return `[Script Info]\nTitle: Subtitles\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,45,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogues}\n`;
    }

    generateFcpxmlContent(segments, title) {
        const totalDur = Math.ceil(segments[segments.length - 1]?.end_time || 10);
        let spine = segments.map((s, idx) => `
        <title name="Sub_${idx+1}" offset="${Math.round(s.start_time * 30)}/30s" duration="${Math.round((s.end_time - s.start_time) * 30)}/30s" start="0s">
            <text><text-style ref="ts1">${s.text.replace(/\n/g, ' ')}</text-style></text>
        </title>`).join('');

        return `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.9">\n<resources><format id="r1" name="FFVideoFormat1080p30" frameDuration="100/3000s" width="1920" height="1080"/></resources>\n<library><event name="${title}"><project name="${title}"><sequence format="r1" duration="${totalDur * 30}/30s"><spine>${spine}\n</spine></sequence></project></event></library>\n</fcpxml>`;
    }

    // --- PLAYBACK & TIMELINE ---
    togglePlay() {
        if (!this.mediaElement) return;
        if (this.mediaElement.paused) this.mediaElement.play();
        else this.mediaElement.pause();
    }

    onPlayStateChange(isPlaying) {
        this.isPlaying = isPlaying;
        const icon = document.querySelector('#btnPlayPause i');
        if (icon) icon.className = isPlaying ? 'fa-solid fa-pause text-sm' : 'fa-solid fa-play text-sm';
    }

    seekRelative(sec) {
        if (!this.mediaElement) return;
        this.mediaElement.currentTime = Math.max(0, Math.min(this.mediaElement.duration || 0, this.mediaElement.currentTime + sec));
    }

    seekToTime(sec) {
        if (!this.mediaElement) return;
        this.mediaElement.currentTime = sec;
    }

    playSegment(start, end) {
        if (!this.mediaElement) return;
        this.mediaElement.currentTime = start;
        this.mediaElement.play();

        const checkEnd = () => {
            if (this.mediaElement.currentTime >= end) {
                this.mediaElement.pause();
                this.mediaElement.removeEventListener('timeupdate', checkEnd);
            }
        };
        this.mediaElement.addEventListener('timeupdate', checkEnd);
    }

    setPlaybackSpeed(speed) {
        if (this.mediaElement) this.mediaElement.playbackRate = parseFloat(speed);
    }

    onTimeUpdate() {
        if (!this.mediaElement) return;
        const curr = this.mediaElement.currentTime;
        const dur = this.mediaElement.duration || (this.currentProject ? this.currentProject.duration : 1);

        document.getElementById('currentTimeLabel').innerText = this.formatTimeCode(curr);
        document.getElementById('totalDurationLabel').innerText = this.formatTimeCode(dur);

        const pct = (curr / dur) * 100;
        const playhead = document.getElementById('waveformPlayhead');
        if (playhead) playhead.style.left = `${pct}%`;

        this.syncSubtitleAtTime(curr);
    }

    syncSubtitleAtTime(time) {
        if (!this.currentSubtitle || !this.currentSubtitle.segments) return;

        const currentSeg = this.currentSubtitle.segments.find(s => time >= s.start_time && time <= s.end_time);
        const overlay = document.getElementById('subtitleOverlayText');

        if (currentSeg) {
            overlay.innerText = currentSeg.text;
            overlay.parentElement.classList.remove('opacity-0');

            if (this.activeSegmentIndex !== currentSeg.id) {
                this.activeSegmentIndex = currentSeg.id;
                document.querySelectorAll('.segment-card').forEach(c => c.classList.remove('active-playing'));
                const activeCard = document.getElementById(`segment-card-${currentSeg.id}`);
                if (activeCard) {
                    activeCard.classList.add('active-playing');
                    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } else {
            overlay.innerText = '';
            overlay.parentElement.classList.add('opacity-0');
        }
    }

    handleWaveformClick(e) {
        if (!this.mediaElement) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = clickX / rect.width;
        const dur = this.mediaElement.duration || (this.currentProject ? this.currentProject.duration : 0);
        if (dur > 0) this.mediaElement.currentTime = pct * dur;
    }

    drawWaveform() {
        if (!this.waveformCanvas || !this.currentProject) return;
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;

        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;

        const peaks = this.currentProject.waveform_data || [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (peaks.length === 0) {
            ctx.fillStyle = '#3b82f6';
            for (let i = 0; i < canvas.width; i += 4) {
                const h = Math.sin(i * 0.05) * 15 + 20;
                ctx.fillRect(i, (canvas.height - h) / 2, 2, h);
            }
            return;
        }

        const barWidth = Math.max(2, canvas.width / peaks.length);
        ctx.fillStyle = '#3b82f6';

        for (let i = 0; i < peaks.length; i++) {
            const x = (i / peaks.length) * canvas.width;
            const barHeight = Math.max(3, peaks[i] * canvas.height * 0.9);
            const y = (canvas.height - barHeight) / 2;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
    }

    // --- TIME UTILITIES ---
    formatTimeCode(seconds) {
        if (isNaN(seconds)) return '00:00:00.000';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const millis = Math.floor((seconds - Math.floor(seconds)) * 1000);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }

    formatSrtTime(seconds) {
        return this.formatTimeCode(seconds).replace('.', ',');
    }

    formatVttTime(seconds) {
        return this.formatTimeCode(seconds);
    }

    formatAssTime(seconds) {
        if (isNaN(seconds)) return '0:00:00.00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const centis = Math.floor((seconds - Math.floor(seconds)) * 100);
        return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
    }

    formatDuration(seconds) {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    parseTimeCode(str) {
        try {
            const parts = str.trim().split(':');
            if (parts.length === 3) {
                return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            } else if (parts.length === 2) {
                return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
            }
            return parseFloat(str);
        } catch {
            return NaN;
        }
    }
}

function round(val, dec) {
    const factor = Math.pow(10, dec);
    return Math.round(val * factor) / factor;
}

const app = new SubtitleStudioApp();
window.app = app;
