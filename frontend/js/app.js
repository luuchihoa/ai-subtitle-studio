/**
 * AI Subtitle Studio - Interactive Client App
 */
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const DEFAULT_API_BASE = isLocal && window.location.port === '8000' ? '/api' : 'http://localhost:8000/api';
const API_BASE = localStorage.getItem('API_BASE_URL') || DEFAULT_API_BASE;

class SubtitleStudioApp {
    constructor() {
        this.currentProject = null;
        this.currentSubtitle = null;
        this.selectedFile = null;
        this.selectedExportFormat = 'srt';
        this.activeSegmentIndex = -1;
        this.searchTerm = '';

        // Media elements
        this.mediaElement = null;
        this.isPlaying = false;
        
        // Canvas waveform
        this.waveformCanvas = null;
        this.waveformCtx = null;

        this.init();
    }

    init() {
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
            // Ignore if active in input/textarea
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                return;
            }
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

        // Load project list on boot
        this.loadProjectList();
    }

    // --- MODAL UTILS ---
    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    showUploadModal() { this.showModal('modalUpload'); }
    showTranscribeModal() { this.showModal('modalTranscribe'); }
    showTranslateModal() { this.showModal('modalTranslate'); }
    showExportModal() { this.showModal('modalExport'); }
    showProjectListModal() { 
        this.loadProjectList();
        this.showModal('modalProjectList'); 
    }

    // --- API CLIENT ---
    async fetchAPI(endpoint, options = {}) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, options);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Lỗi xử lý yêu cầu');
            }
            return await res.json();
        } catch (error) {
            console.error(`API Error on ${endpoint}:`, error);
            throw error;
        }
    }

    // --- PROJECT MANAGEMENT ---
    async loadProjectList() {
        try {
            const projects = await this.fetchAPI('/projects');
            const container = document.getElementById('projectListContainer');
            if (!container) return;

            if (projects.length === 0) {
                container.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">Chưa có dự án nào. Hãy tải lên file đầu tiên!</div>';
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
                                <span><i class="fa-solid fa-closed-captioning mr-1"></i>${p.subtitle_count} track</span>
                            </p>
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); app.deleteProject(${p.id})" class="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition" title="Xóa dự án">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            `).join('');

            // Auto load latest project if none loaded
            if (!this.currentProject && projects.length > 0) {
                this.loadProject(projects[0].id);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async loadProject(projectId) {
        this.closeModal('modalProjectList');
        try {
            const project = await this.fetchAPI(`/projects/${projectId}`);
            this.currentProject = project;

            // Update UI State
            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('currentProjectTitle').innerText = project.title;

            // Buttons
            document.getElementById('btnAiTranscribe').classList.remove('hidden');
            document.getElementById('btnExport').classList.remove('hidden');

            // Setup Media
            const video = document.getElementById('videoPlayer');
            const audio = document.getElementById('audioPlayer');
            const mediaUrl = `${API_BASE}/projects/${project.id}/media`;

            if (project.media_type === 'video') {
                video.src = mediaUrl;
                video.classList.remove('hidden');
                document.getElementById('audioVisualizerPlaceholder').classList.add('hidden');
                this.mediaElement = video;
            } else {
                audio.src = mediaUrl;
                video.classList.add('hidden');
                document.getElementById('audioVisualizerPlaceholder').classList.remove('hidden');
                document.getElementById('audioTrackName').innerText = project.filename;
                this.mediaElement = audio;
            }

            // Render Tracks
            this.renderTrackSelector();

            // Set Primary Subtitle
            const primarySub = project.subtitles.find(s => s.is_primary) || project.subtitles[0];
            if (primarySub) {
                this.currentSubtitle = primarySub;
                document.getElementById('btnTranslate').classList.remove('hidden');
                document.getElementById('btnReSegment').classList.remove('hidden');
            } else {
                this.currentSubtitle = null;
                document.getElementById('btnTranslate').classList.add('hidden');
                document.getElementById('btnReSegment').classList.add('hidden');
            }

            // Render Subtitles
            this.renderSegments();

            // Draw Waveform
            setTimeout(() => this.drawWaveform(), 100);

        } catch (e) {
            alert('Không thể tải dự án: ' + e.message);
        }
    }

    async deleteProject(projectId) {
        if (!confirm('Bạn có chắc chắn muốn xóa dự án này?')) return;
        try {
            await this.fetchAPI(`/projects/${projectId}`, { method: 'DELETE' });
            if (this.currentProject && this.currentProject.id === projectId) {
                this.currentProject = null;
                document.getElementById('workspace').classList.add('hidden');
                document.getElementById('emptyState').classList.remove('hidden');
                document.getElementById('currentProjectTitle').innerText = 'Chưa chọn dự án';
            }
            this.loadProjectList();
        } catch (e) {
            alert('Lỗi xóa dự án: ' + e.message);
        }
    }

    handleFileSelect(input) {
        if (input.files && input.files[0]) {
            this.selectedFile = input.files[0];
            document.getElementById('selectedFileName').innerText = this.selectedFile.name;
        }
    }

    async handleUploadSubmit(e) {
        e.preventDefault();
        if (!this.selectedFile) {
            alert('Vui lòng chọn file âm thanh hoặc video!');
            return;
        }

        const btn = document.getElementById('btnSubmitUpload');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên & xử lý...';

        const formData = new FormData();
        formData.append('file', this.selectedFile);
        const title = document.getElementById('uploadTitle').value.trim();
        if (title) formData.append('title', title);

        try {
            const project = await this.fetchAPI('/projects', {
                method: 'POST',
                body: formData
            });

            this.closeModal('modalUpload');
            this.selectedFile = null;
            document.getElementById('uploadForm').reset();
            document.getElementById('selectedFileName').innerText = 'Nhấp để chọn file hoặc kéo thả vào đây';

            await this.loadProject(project.id);
            // Prompt to create subtitle
            this.showTranscribeModal();
        } catch (err) {
            alert('Lỗi tải file: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-upload"></i> Tải lên & Khởi tạo';
        }
    }

    // --- AI TRANSCRIPTION ---
    async handleTranscribeSubmit(e) {
        e.preventDefault();
        if (!this.currentProject) return;

        const options = {
            model_size: document.getElementById('cfgModelSize').value,
            language: document.getElementById('cfgLanguage').value,
            enable_vad: document.getElementById('cfgEnableVad').checked,
            enable_word_timestamps: true,
            enable_diarization: document.getElementById('cfgEnableDiarization').checked,
            filter_hallucinations: document.getElementById('cfgFilterHallucinations').checked,
            remove_fillers: document.getElementById('cfgRemoveFillers').checked,
            max_cpl: parseInt(document.getElementById('cfgMaxCpl').value) || 40,
            max_cps: parseFloat(document.getElementById('cfgMaxCps').value) || 20.0,
            max_lines: 2,
            min_duration: 1.0,
            max_duration: 7.0
        };

        this.closeModal('modalTranscribe');
        this.showModal('modalProgress');

        try {
            const res = await this.fetchAPI(`/transcription/${this.currentProject.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options)
            });

            this.pollJobProgress(res.job_id);
        } catch (err) {
            this.closeModal('modalProgress');
            alert('Lỗi khởi chạy AI: ' + err.message);
        }
    }

    pollJobProgress(jobId) {
        const interval = setInterval(async () => {
            try {
                const job = await this.fetchAPI(`/transcription/status/${jobId}`);
                
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
                    alert('Tạo phụ đề thất bại: ' + (job.error || job.message));
                }
            } catch (e) {
                clearInterval(interval);
                this.closeModal('modalProgress');
            }
        }, 1000);
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
                ${s.label} (${s.language.toUpperCase()})
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

            // Render words tags if available
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
                            
                            <!-- Speaker tag -->
                            <input type="text" value="${seg.speaker || 'Speaker 1'}" 
                                   onchange="app.updateSegmentField(${seg.id}, 'speaker', this.value)"
                                   class="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 max-w-[100px] focus:outline-none focus:border-blue-500">
                        </div>

                        <!-- Timecodes -->
                        <div class="flex items-center space-x-1.5 font-mono text-slate-300">
                            <input type="text" value="${this.formatTimeCode(seg.start_time)}" 
                                   onchange="app.updateSegmentTimecode(${seg.id}, 'start', this.value)"
                                   class="w-20 px-1 py-0.5 text-center text-xs bg-dark-bg border border-dark-border rounded focus:outline-none focus:border-blue-500">
                            <span class="text-slate-500">&rarr;</span>
                            <input type="text" value="${this.formatTimeCode(seg.end_time)}" 
                                   onchange="app.updateSegmentTimecode(${seg.id}, 'end', this.value)"
                                   class="w-20 px-1 py-0.5 text-center text-xs bg-dark-bg border border-dark-border rounded focus:outline-none focus:border-blue-500">
                            
                            <!-- CPS Badge -->
                            <span class="text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cpsColor}" title="Tốc độ đọc: ${cps} ký tự/giây">
                                ${cps} CPS
                            </span>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center space-x-1">
                            <button onclick="app.playSegment(${seg.start_time}, ${seg.end_time})" class="w-6 h-6 rounded hover:bg-slate-700 text-blue-400 flex items-center justify-center transition" title="Phát đoạn này">
                                <i class="fa-solid fa-play text-[10px]"></i>
                            </button>
                            <button onclick="app.deleteSegment(${seg.id})" class="w-6 h-6 rounded hover:bg-slate-700 text-red-400 flex items-center justify-center transition" title="Xóa đoạn này">
                                <i class="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Text Area -->
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

    // --- SEGMENT EDITING ---
    updateSegmentField(segmentId, field, value) {
        if (!this.currentSubtitle) return;
        const seg = this.currentSubtitle.segments.find(s => s.id === segmentId);
        if (seg) {
            seg[field] = value;
            // Debounced API sync
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
        try {
            await this.fetchAPI(`/subtitles/segments/${seg.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: seg.text,
                    start_time: seg.start_time,
                    end_time: seg.end_time,
                    speaker: seg.speaker
                })
            });
        } catch (e) {
            console.error('Failed to sync segment:', e);
        }
    }

    async addNewSegmentAtCurrentTime() {
        if (!this.currentSubtitle || !this.mediaElement) return;
        const currTime = this.mediaElement.currentTime;
        const newSeg = {
            sequence_number: this.currentSubtitle.segments.length + 1,
            start_time: round(currTime, 3),
            end_time: round(currTime + 2.5, 3),
            text: 'Đoạn phụ đề mới...',
            speaker: 'Speaker 1'
        };

        try {
            const created = await this.fetchAPI(`/subtitles/${this.currentSubtitle.id}/segments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSeg)
            });
            this.currentSubtitle.segments.push(created);
            this.renderSegments();
        } catch (e) {
            alert('Lỗi tạo đoạn: ' + e.message);
        }
    }

    async deleteSegment(segmentId) {
        try {
            await this.fetchAPI(`/subtitles/segments/${segmentId}`, { method: 'DELETE' });
            this.currentSubtitle.segments = this.currentSubtitle.segments.filter(s => s.id !== segmentId);
            this.renderSegments();
        } catch (e) {
            alert('Lỗi xóa đoạn: ' + e.message);
        }
    }

    async saveAllSegments() {
        if (!this.currentSubtitle) return;
        try {
            await this.fetchAPI(`/subtitles/batch-update/${this.currentSubtitle.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segments: this.currentSubtitle.segments
                })
            });
            alert('Đã lưu toàn bộ thay đổi thành công!');
        } catch (e) {
            alert('Lỗi lưu: ' + e.message);
        }
    }

    // --- TRANSLATE & RESEGMENT ---
    async handleTranslateSubmit(e) {
        e.preventDefault();
        if (!this.currentSubtitle) return;

        const targetLang = document.getElementById('transTargetLang').value;
        this.closeModal('modalTranslate');
        this.showModal('modalProgress');
        document.getElementById('progressMessage').innerText = `Đang dịch phụ đề sang [${targetLang.toUpperCase()}]...`;
        document.getElementById('progressBar').style.width = '50%';

        try {
            const newSub = await this.fetchAPI(`/subtitles/${this.currentSubtitle.id}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_language: targetLang,
                    preserve_timestamps: true
                })
            });

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

    showReSegmentModal() {
        const cpl = prompt('Nhập số ký tự tối đa trên 1 dòng (CPL: 30-50):', '40');
        if (!cpl) return;
        this.reSegmentTrack(parseInt(cpl));
    }

    async reSegmentTrack(maxCpl) {
        if (!this.currentSubtitle) return;
        try {
            const updatedSub = await this.fetchAPI(`/subtitles/${this.currentSubtitle.id}/resegment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    max_cpl: maxCpl || 40,
                    max_lines: 2,
                    min_duration: 1.0,
                    max_duration: 7.0,
                    max_cps: 20.0
                })
            });

            this.currentSubtitle = updatedSub;
            this.renderSegments();
            alert('Đã căn chỉnh lại phân đoạn phụ đề chuẩn xác!');
        } catch (e) {
            alert('Lỗi căn chỉnh: ' + e.message);
        }
    }

    // --- EXPORT MODAL ---
    selectExportFormat(fmt) {
        this.selectedExportFormat = fmt;
        document.querySelectorAll('.export-format-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btnExp_${fmt}`);
        if (activeBtn) activeBtn.classList.add('active');

        // Show/hide Karaoke option
        const karaokeOption = document.getElementById('expKaraokeOption');
        if (fmt === 'ass') {
            karaokeOption.classList.remove('hidden');
        } else {
            karaokeOption.classList.add('hidden');
        }
    }

    triggerDownloadExport() {
        if (!this.currentSubtitle) return;
        const includeSpeakers = document.getElementById('expIncludeSpeakers').checked;
        const highlightWords = document.getElementById('expHighlightWords').checked;

        const url = `${API_BASE}/export/${this.currentSubtitle.id}?format=${this.selectedExportFormat}&include_speakers=${includeSpeakers}&highlight_words=${highlightWords}`;
        window.open(url, '_blank');
        this.closeModal('modalExport');
    }

    // --- PLAYBACK & TIMELINE ---
    togglePlay() {
        if (!this.mediaElement) return;
        if (this.mediaElement.paused) {
            this.mediaElement.play();
        } else {
            this.mediaElement.pause();
        }
    }

    onPlayStateChange(isPlaying) {
        this.isPlaying = isPlaying;
        const icon = document.querySelector('#btnPlayPause i');
        if (icon) {
            icon.className = isPlaying ? 'fa-solid fa-pause text-sm' : 'fa-solid fa-play text-sm';
        }
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
        if (this.mediaElement) {
            this.mediaElement.playbackRate = parseFloat(speed);
        }
    }

    onTimeUpdate() {
        if (!this.mediaElement) return;
        const curr = this.mediaElement.currentTime;
        const dur = this.mediaElement.duration || this.currentProject.duration || 1;

        // Labels
        document.getElementById('currentTimeLabel').innerText = this.formatTimeCode(curr);
        document.getElementById('totalDurationLabel').innerText = this.formatTimeCode(dur);

        // Update Playhead on Waveform
        const pct = (curr / dur) * 100;
        const playhead = document.getElementById('waveformPlayhead');
        if (playhead) playhead.style.left = `${pct}%`;

        // Sync Subtitle Overlay & Active Card
        this.syncSubtitleAtTime(curr);
    }

    syncSubtitleAtTime(time) {
        if (!this.currentSubtitle || !this.currentSubtitle.segments) return;

        const currentSeg = this.currentSubtitle.segments.find(s => time >= s.start_time && time <= s.end_time);
        const overlay = document.getElementById('subtitleOverlayText');

        if (currentSeg) {
            overlay.innerText = currentSeg.text;
            overlay.parentElement.classList.remove('opacity-0');

            // Highlight card
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
        if (dur > 0) {
            this.mediaElement.currentTime = pct * dur;
        }
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
            // Draw placeholder wave
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
                const hrs = parseFloat(parts[0]);
                const mins = parseFloat(parts[1]);
                const secs = parseFloat(parts[2]);
                return hrs * 3600 + mins * 60 + secs;
            } else if (parts.length === 2) {
                const mins = parseFloat(parts[0]);
                const secs = parseFloat(parts[1]);
                return mins * 60 + secs;
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

// Instantiate App
const app = new SubtitleStudioApp();
window.app = app;
